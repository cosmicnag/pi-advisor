import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type {
	SessionEntry,
	SessionMessageEntry,
	TurnEndEvent,
} from "@earendil-works/pi-coding-agent";

import { normalizeMemoryTextForDedupe } from "./advice.js";
import { redactSecrets, truncateUtf8TailBytes } from "./redaction.js";

export const ADVISOR_CUSTOM_TYPE = "pi-advisor-note";
const UPDATE_TRUNCATION_MARKER = "[Older Advisor update content truncated to configured limit]\n";

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

export function cursorMatches(branch: SessionEntry[], cursor: AdvisorCursor): boolean {
	if (cursor.expectedIndex === 0) return cursor.lastEntryId === undefined;
	if (branch.length < cursor.expectedIndex) return false;
	return branch[cursor.expectedIndex - 1]?.id === cursor.lastEntryId;
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

export function successfulMemoryToolTexts(entries: SessionEntry[]): Set<string> {
	const calls = new Map<string, string>();
	const successful = new Set<string>();
	for (const entry of entries) {
		if (!isMessageEntry(entry)) continue;
		const message = entry.message;
		if (message.role === "assistant") {
			for (const content of message.content) {
				if (
					content.type !== "toolCall" ||
					(content.name !== "memory_save" && content.name !== "memory_suggest")
				) {
					continue;
				}
				const text = (content.arguments as Record<string, unknown>).text;
				if (typeof text === "string" && text.trim().length > 0) {
					calls.set(content.id, normalizeMemoryTextForDedupe(text));
				}
			}
			continue;
		}
		if (message.role !== "toolResult" || message.isError) continue;
		const text = calls.get(message.toolCallId);
		if (text !== undefined) successful.add(text);
	}
	return successful;
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
