import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type {
	SessionEntry,
	SessionMessageEntry,
	TurnEndEvent,
} from "@earendil-works/pi-coding-agent";

import { normalizeMemoryTextForDedupe } from "./advice.js";
import { HARD_LIMITS } from "./config.js";
import { redactSecrets, truncateUtf8TailBytes } from "./redaction.js";

export const ADVISOR_CUSTOM_TYPE = "pi-advisor-note";
const UPDATE_TRUNCATION_MARKER = "[Older Advisor update content truncated to configured limit]\n";
const MAX_MEMORY_TOOL_CANDIDATE_ITEMS = 4_096;
const MAX_MEMORY_TOOL_CANDIDATE_BYTES = HARD_LIMITS.maxPendingTranscriptBytes;
const MAX_MEMORY_TOOL_TEXT_INPUT_UTF16_UNITS = HARD_LIMITS.maxProposedMemoryCharacters * 2;

export interface AdvisorCursor {
	lastEntryId?: string;
	expectedIndex: number;
}

export interface RenderedAdvisorDelta {
	text: string;
	redactions: number;
	entryCount: number;
	truncated: boolean;
}

export function cursorAtTail(branch: SessionEntry[]): AdvisorCursor {
	const lastEntryId = branch.at(-1)?.id;
	return {
		...(lastEntryId === undefined ? {} : { lastEntryId }),
		expectedIndex: branch.length,
	};
}

export type AdvisorCursorValidation = "valid" | "transcript-shrunk" | "ancestry-mismatch";

export function validateCursor(
	branch: SessionEntry[],
	cursor: AdvisorCursor,
): AdvisorCursorValidation {
	if (branch.length < cursor.expectedIndex) return "transcript-shrunk";
	if (cursor.expectedIndex === 0) {
		return cursor.lastEntryId === undefined ? "valid" : "ancestry-mismatch";
	}
	return branch[cursor.expectedIndex - 1]?.id === cursor.lastEntryId
		? "valid"
		: "ancestry-mismatch";
}

export function cursorMatches(branch: SessionEntry[], cursor: AdvisorCursor): boolean {
	return validateCursor(branch, cursor) === "valid";
}

function stringValue(value: unknown, fallback = ""): string {
	return typeof value === "string" ? value : fallback;
}

function contentText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return (content as unknown[])
		.map((part) => {
			if (!part || typeof part !== "object") return "";
			const record = part as Record<string, unknown>;
			if (record.type === "text") return stringValue(record.text);
			if (record.type === "thinking") {
				return `[reasoning]\n${stringValue(record.thinking)}`;
			}
			if (record.type === "toolCall") {
				return `[tool call ${stringValue(record.name, "unknown")}] ${JSON.stringify(record.arguments ?? {})}`;
			}
			if (record.type === "image") return "[image omitted]";
			return "";
		})
		.filter(Boolean)
		.join("\n");
}

function serializeMessage(message: AgentMessage): string | undefined {
	switch (message.role) {
		case "user":
			return `[Executor user]\n${contentText(message.content)}`;
		case "assistant":
			return `[Executor assistant]\n${contentText(message.content)}`;
		case "toolResult":
			return `[Executor tool result ${message.toolName}${message.isError ? " error" : ""}]\n${contentText(message.content)}`;
		case "custom":
			if (message.customType === ADVISOR_CUSTOM_TYPE) return undefined;
			return `[Executor extension context ${message.customType}]\n${contentText(message.content)}`;
		case "bashExecution":
			if (message.excludeFromContext) return undefined;
			return `[Executor user bash]\n$ ${message.command}\n${message.output}`;
		case "branchSummary":
			return `[Executor branch summary]\n${message.summary}`;
		case "compactionSummary":
			return `[Executor compaction summary]\n${message.summary}`;
	}
}

function isMessageEntry(entry: SessionEntry): entry is SessionMessageEntry {
	return entry.type === "message";
}

function serializeEntry(entry: SessionEntry): string | undefined {
	if (isMessageEntry(entry)) return serializeMessage(entry.message);
	if (entry.type === "custom_message") {
		if (entry.customType === ADVISOR_CUSTOM_TYPE) return undefined;
		return `[Executor extension context ${entry.customType}]\n${contentText(entry.content)}`;
	}
	if (entry.type === "compaction") return `[Executor compaction summary]\n${entry.summary}`;
	if (entry.type === "branch_summary") return `[Executor branch summary]\n${entry.summary}`;
	return undefined;
}

export function isMeaningfulExecutorTurn(event: TurnEndEvent, entries: SessionEntry[]): boolean {
	if (event.message.role !== "assistant") return false;
	if (event.message.stopReason === "aborted") return false;
	const hasAdvisorNote = entries.some(
		(entry) => entry.type === "custom_message" && entry.customType === ADVISOR_CUSTOM_TYPE,
	);
	const hasExecutorUserMessage = entries.some(
		(entry) => entry.type === "message" && entry.message.role === "user",
	);
	if (hasAdvisorNote && !hasExecutorUserMessage) return false;
	const assistantContent = contentText(event.message.content).trim();
	return assistantContent.length > 0 || event.toolResults.length > 0;
}

export function successfulMemoryToolTexts(
	entries: SessionEntry[],
	maxItems: number,
	maxBytes: number,
): Set<string> {
	if (!Number.isInteger(maxItems) || maxItems < 0) {
		throw new RangeError("Successful Memory text item budget must be a non-negative integer");
	}
	if (!Number.isInteger(maxBytes) || maxBytes < 0) {
		throw new RangeError("Successful Memory text byte budget must be a non-negative integer");
	}
	interface Candidate {
		text: string;
		bytes: number;
		toolName: "memory_save" | "memory_suggest";
		entryIndex: number;
	}
	const calls = new Map<string, Candidate>();
	let candidateBytes = 0;
	for (const [entryIndex, entry] of entries.entries()) {
		if (!isMessageEntry(entry) || entry.message.role !== "assistant") continue;
		for (const content of entry.message.content) {
			if (
				content.type !== "toolCall" ||
				(content.name !== "memory_save" && content.name !== "memory_suggest")
			) {
				continue;
			}
			const text = (content.arguments as Record<string, unknown>).text;
			if (
				typeof text !== "string" ||
				text.length > MAX_MEMORY_TOOL_TEXT_INPUT_UTF16_UNITS ||
				text.trim().length === 0
			) {
				continue;
			}
			const normalized = normalizeMemoryTextForDedupe(text);
			const normalizedBytes = Buffer.byteLength(normalized, "utf8");
			if (normalized.length === 0 || normalizedBytes > MAX_MEMORY_TOOL_CANDIDATE_BYTES) {
				continue;
			}
			const replaced = calls.get(content.id);
			if (replaced !== undefined) {
				calls.delete(content.id);
				candidateBytes -= replaced.bytes;
			}
			while (
				calls.size >= MAX_MEMORY_TOOL_CANDIDATE_ITEMS ||
				candidateBytes + normalizedBytes > MAX_MEMORY_TOOL_CANDIDATE_BYTES
			) {
				const oldestId = calls.keys().next().value;
				if (oldestId === undefined) break;
				const oldest = calls.get(oldestId);
				calls.delete(oldestId);
				if (oldest !== undefined) candidateBytes -= oldest.bytes;
			}
			calls.set(content.id, {
				text: normalized,
				bytes: normalizedBytes,
				toolName: content.name,
				entryIndex,
			});
			candidateBytes += normalizedBytes;
		}
	}

	const resolved = new Set<string>();
	const successfulIds = new Set<string>();
	for (const [entryIndex, entry] of entries.entries()) {
		if (!isMessageEntry(entry) || entry.message.role !== "toolResult") continue;
		const message = entry.message;
		const candidate = calls.get(message.toolCallId);
		if (
			candidate === undefined ||
			resolved.has(message.toolCallId) ||
			entryIndex <= candidate.entryIndex
		) {
			continue;
		}
		resolved.add(message.toolCallId);
		if (!message.isError && message.toolName === candidate.toolName) {
			successfulIds.add(message.toolCallId);
		}
	}

	const newestFirst: string[] = [];
	const seenTexts = new Set<string>();
	let retainedBytes = 0;
	const candidates = [...calls.entries()];
	for (let index = candidates.length - 1; index >= 0; index--) {
		const candidateEntry = candidates[index];
		if (candidateEntry === undefined) continue;
		const [id, candidate] = candidateEntry;
		if (!successfulIds.has(id) || seenTexts.has(candidate.text)) continue;
		seenTexts.add(candidate.text);
		if (newestFirst.length >= maxItems) break;
		if (retainedBytes + candidate.bytes > maxBytes) continue;
		newestFirst.push(candidate.text);
		retainedBytes += candidate.bytes;
	}
	return new Set(newestFirst.reverse());
}

export function renderAdvisorDelta(
	entries: SessionEntry[],
	maxUpdateTokens: number,
): RenderedAdvisorDelta {
	const serialized = entries
		.map(serializeEntry)
		.filter((value): value is string => value !== undefined);
	const redacted = redactSecrets(serialized.join("\n\n"));
	const maxBytes = Math.max(1, maxUpdateTokens * 4);
	const text = truncateUtf8TailBytes(redacted.text, maxBytes, UPDATE_TRUNCATION_MARKER);
	return {
		text,
		redactions: redacted.redactions,
		entryCount: entries.length,
		truncated: text !== redacted.text,
	};
}
