import { createHash } from "node:crypto";

import { StringEnum } from "@earendil-works/pi-ai";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { HARD_LIMITS, type AdvisorConfig } from "./config.js";
import {
	MEMORY_SUGGESTION_BASES,
	MEMORY_SUGGESTION_CATEGORIES,
	type MemorySuggestionBasis,
	type MemorySuggestionCategory,
} from "./memory-suggestions.js";
import { escapeXmlAttribute, escapeXmlText } from "./presentation.js";
import { estimateTokens, redactSecrets } from "./redaction.js";

export {
	MEMORY_SUGGESTION_BASES,
	MEMORY_SUGGESTION_CATEGORIES,
	type MemorySuggestionBasis,
	type MemorySuggestionCategory,
} from "./memory-suggestions.js";

export type AdviceSeverity = "nit" | "concern" | "blocker";

interface AcceptedAdviceBase {
	note: string;
	truncated: boolean;
	originalCharacters: number;
	originalEstimatedTokens: number;
	createdAt: number;
}

export interface AcceptedReviewAdvice extends AcceptedAdviceBase {
	intent: "review";
	severity: AdviceSeverity;
}

export interface AcceptedMemorySuggestion extends AcceptedAdviceBase {
	intent: "memory-suggestion";
	memory: {
		text: string;
		category: MemorySuggestionCategory;
		basis: MemorySuggestionBasis;
	};
}

export type AcceptedAdvice = AcceptedReviewAdvice | AcceptedMemorySuggestion;

export interface MemorySuggestionPolicyContext {
	enabled: boolean;
	capabilityAvailable: boolean;
	turnNumber: number;
	now: number;
	admittedCount: number;
	lastDeliveredTurn?: number;
	lastDeliveredAt?: number;
	successfulMemoryTexts: ReadonlySet<string>;
}

export interface AdviceCollector {
	accepted?: AcceptedAdvice;
	validCalls: number;
	suppressedCalls: number;
	memoryPolicySuppressedCalls: number;
	memoryLimitSuppressedCalls: number;
	memoryPolicy?: MemorySuggestionPolicyContext;
}

const CONTENT_FREE = new Set([
	"stop",
	"done",
	"complete",
	"ok",
	"lgtm",
	"looks good",
	"all good",
	"no issue",
	"no issues",
	"no concerns",
	"nothing to add",
	"nothing to report",
	"continue",
	"on track",
]);
const TRUNCATION_MARKER = "\n[Advisory note truncated to configured limit]";

export function normalizeContentFreeAdvice(input: string): string {
	return input
		.normalize("NFKC")
		.toLocaleLowerCase("en-US")
		.replace(/[\p{P}\p{S}]+/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function foldProseCaseOutsideCodeSpans(input: string): string | undefined {
	const foldProse = (value: string): string =>
		value.toLocaleLowerCase("en-US").replace(/\s+/g, " ");
	let output = "";
	let cursor = 0;
	while (cursor < input.length) {
		const openingStart = input.indexOf("`", cursor);
		if (openingStart === -1) {
			return `${output}${foldProse(input.slice(cursor))}`;
		}
		output += foldProse(input.slice(cursor, openingStart));
		let openingEnd = openingStart;
		while (input[openingEnd] === "`") openingEnd++;
		const delimiterLength = openingEnd - openingStart;
		let search = openingEnd;
		let closingStart = -1;
		let closingEnd = -1;
		while (search < input.length) {
			const candidateStart = input.indexOf("`", search);
			if (candidateStart === -1) break;
			let candidateEnd = candidateStart;
			while (input[candidateEnd] === "`") candidateEnd++;
			if (candidateEnd - candidateStart === delimiterLength) {
				closingStart = candidateStart;
				closingEnd = candidateEnd;
				break;
			}
			search = candidateEnd;
		}
		if (closingStart === -1) return undefined;
		output += input.slice(openingStart, closingEnd);
		cursor = closingEnd;
	}
	return output;
}

export function normalizeAdviceForDedupe(input: string): string {
	const normalized = input.normalize("NFKC");
	const caseFolded = foldProseCaseOutsideCodeSpans(normalized);
	if (caseFolded === undefined) return normalized.replace(/\s+/g, " ").trim();
	return caseFolded
		.trim()
		.replace(/(?<=\S)[.,;:?!…]+$/gu, "")
		.trim();
}

export function normalizeMemoryTextForDedupe(input: string): string {
	return normalizeAdviceForDedupe(input);
}

export type AdviceDedupeIdentity =
	| (Pick<AcceptedReviewAdvice, "note" | "severity"> & { intent?: "review" })
	| Pick<AcceptedMemorySuggestion, "intent" | "memory">;

export function adviceDedupeKey(advice: AdviceDedupeIdentity): string {
	const identity =
		advice.intent === "memory-suggestion"
			? JSON.stringify([
					"memory-suggestion",
					advice.memory.category,
					advice.memory.basis,
					normalizeMemoryTextForDedupe(advice.memory.text),
				])
			: JSON.stringify(["review", advice.severity, normalizeAdviceForDedupe(advice.note)]);
	return createHash("sha256").update(identity).digest("hex");
}

export class BoundedAdviceDedupe {
	private readonly keys = new Set<string>();

	constructor(readonly capacity = 4_096) {
		if (!Number.isInteger(capacity) || capacity < 1) {
			throw new RangeError("Advice dedupe capacity must be a positive integer");
		}
	}

	has(advice: AdviceDedupeIdentity): boolean {
		return this.keys.has(adviceDedupeKey(advice));
	}

	add(advice: AdviceDedupeIdentity): boolean {
		const key = adviceDedupeKey(advice);
		if (this.keys.has(key)) return false;
		this.keys.add(key);
		if (this.keys.size > this.capacity) {
			const oldest = this.keys.values().next().value;
			if (oldest !== undefined) this.keys.delete(oldest);
		}
		return true;
	}

	delete(advice: AdviceDedupeIdentity): boolean {
		return this.keys.delete(adviceDedupeKey(advice));
	}

	clear(): void {
		this.keys.clear();
	}

	exportNewestKeys(maximum: number): string[] {
		if (!Number.isInteger(maximum) || maximum < 0) {
			throw new RangeError("Advice dedupe export bound must be a non-negative integer");
		}
		return [...this.keys].slice(-maximum);
	}

	restoreKeys(keys: readonly string[]): void {
		for (const key of keys) {
			if (!/^[a-f0-9]{64}$/u.test(key) || this.keys.has(key)) continue;
			this.keys.add(key);
			if (this.keys.size > this.capacity) {
				const oldest = this.keys.values().next().value;
				if (oldest !== undefined) this.keys.delete(oldest);
			}
		}
	}

	get size(): number {
		return this.keys.size;
	}
}

export function isContentFreeAdvice(note: string): boolean {
	return CONTENT_FREE.has(normalizeContentFreeAdvice(note));
}

function truncateCharacters(
	input: string,
	maximumCharacters: number,
	maximumUtf16Units: number,
): string {
	const marker = Array.from(TRUNCATION_MARKER);
	while (marker.length > maximumCharacters || marker.join("").length > maximumUtf16Units) {
		marker.pop();
	}
	const markerText = marker.join("");
	const output: string[] = [];
	let utf16Units = 0;
	for (const character of input) {
		if (output.length + marker.length >= maximumCharacters) break;
		if (utf16Units + character.length + markerText.length > maximumUtf16Units) break;
		output.push(character);
		utf16Units += character.length;
	}
	return `${output.join("")}${markerText}`;
}

function boundNote(note: string, config: AdvisorConfig): AcceptedAdviceBase {
	const safeNote = redactSecrets(note).text;
	const originalCharacters = Array.from(safeNote).length;
	const originalEstimatedTokens = estimateTokens(safeNote);
	const maxCharacters = Math.min(
		config.limits.maxAdviceCharacters,
		HARD_LIMITS.maxAdviceCharacters,
	);
	const maxTokens = Math.min(config.limits.maxAdviceTokens, HARD_LIMITS.maxAdviceTokens);
	const truncated = originalCharacters > maxCharacters || originalEstimatedTokens > maxTokens;
	return {
		note: truncated ? truncateCharacters(safeNote, maxCharacters, maxTokens * 4) : safeNote,
		truncated,
		originalCharacters,
		originalEstimatedTokens,
		createdAt: Date.now(),
	};
}

export function boundAdvice(note: string, config: AdvisorConfig): AcceptedReviewAdvice {
	return { ...boundNote(note, config), intent: "review", severity: "concern" };
}

function suppressMemory(collector: AdviceCollector, kind: "policy" | "limit"): void {
	collector.suppressedCalls++;
	if (kind === "policy") collector.memoryPolicySuppressedCalls++;
	else collector.memoryLimitSuppressedCalls++;
}

function acceptMemorySuggestion(
	input: {
		note: string;
		memory: AcceptedMemorySuggestion["memory"];
	},
	config: AdvisorConfig,
	collector: AdviceCollector,
): AcceptedMemorySuggestion | undefined {
	const policy = collector.memoryPolicy;
	if (
		policy === undefined ||
		!policy.enabled ||
		!policy.capabilityAvailable ||
		input.note.trim().length === 0 ||
		input.memory.text.trim().length === 0 ||
		isContentFreeAdvice(input.note) ||
		isContentFreeAdvice(input.memory.text)
	) {
		suppressMemory(collector, "policy");
		return undefined;
	}

	const redactedNote = redactSecrets(input.note);
	const redactedMemory = redactSecrets(input.memory.text);
	if (redactedNote.redactions > 0 || redactedMemory.redactions > 0) {
		suppressMemory(collector, "policy");
		return undefined;
	}
	const proposedCharacters = Array.from(input.memory.text).length;
	const proposedTokens = estimateTokens(input.memory.text);
	const maximumCharacters = Math.min(
		config.memorySuggestions.maxProposedMemoryCharacters,
		HARD_LIMITS.maxProposedMemoryCharacters,
	);
	const maximumTokens = Math.min(
		config.memorySuggestions.maxProposedMemoryTokens,
		HARD_LIMITS.maxProposedMemoryTokens,
	);
	if (proposedCharacters > maximumCharacters || proposedTokens > maximumTokens) {
		suppressMemory(collector, "policy");
		return undefined;
	}
	const normalizedText = normalizeMemoryTextForDedupe(input.memory.text);
	if (policy.successfulMemoryTexts.has(normalizedText)) {
		suppressMemory(collector, "policy");
		return undefined;
	}
	if (
		policy.admittedCount >= config.memorySuggestions.sessionSuggestionCap ||
		(policy.lastDeliveredTurn !== undefined &&
			policy.turnNumber - policy.lastDeliveredTurn <
				config.memorySuggestions.minTurnsBetweenSuggestions) ||
		(policy.lastDeliveredAt !== undefined &&
			policy.now - policy.lastDeliveredAt < config.memorySuggestions.minIntervalMs)
	) {
		suppressMemory(collector, "limit");
		return undefined;
	}
	return {
		...boundNote(input.note, config),
		intent: "memory-suggestion",
		memory: { ...input.memory },
	};
}

export type AdviceDelivery = "active" | "deferred";
export type MemorySuggestionQueueState = "could-not-queue";

export function formatAdviceForDelivery(
	advice: AcceptedAdvice,
	delivery: AdviceDelivery,
	stale: boolean,
	queueState?: MemorySuggestionQueueState,
	restoredAfterResume = false,
): string {
	if (advice.intent === "memory-suggestion") {
		const attributes = [
			`intent="${escapeXmlAttribute(advice.intent)}"`,
			`category="${escapeXmlAttribute(advice.memory.category)}"`,
			`basis="${escapeXmlAttribute(advice.memory.basis)}"`,
			`delivery="${escapeXmlAttribute(delivery)}"`,
			`stale="${escapeXmlAttribute(String(stale))}"`,
			...(restoredAfterResume ? [`restored-after-resume="true"`] : []),
			...(queueState === undefined ? [] : [`queue-state="${escapeXmlAttribute(queueState)}"`]),
		];
		const resumeWarning = restoredAfterResume
			? "This deferred suggestion was restored after resume and may be stale. "
			: "";
		const guidance =
			queueState === "could-not-queue"
				? `${resumeWarning}The compatible memory_suggest capability is no longer available. Do not attempt this tool call. Briefly tell the user the proposal could not be queued.`
				: `${resumeWarning}${stale ? "First verify that this still applies. " : ""}Verify or revise the proposed durable memory, then call memory_suggest with the chosen text, category, and status "pending" without asking for another confirmation. If the proposal is unsuitable, briefly explain why to the user.`;
		return `<advisor-note ${attributes.join(" ")}>\n<rationale>${escapeXmlText(advice.note)}</rationale>\n<proposed-memory>${escapeXmlText(advice.memory.text)}</proposed-memory>\n<guidance>${escapeXmlText(guidance)}</guidance>\n</advisor-note>`;
	}
	const guidance = stale
		? "Verify this still applies, then weigh it rather than obeying blindly."
		: "Weigh this rather than obeying blindly.";
	const attributes = [
		`intent="${escapeXmlAttribute("review")}"`,
		`severity="${escapeXmlAttribute(advice.severity)}"`,
		`delivery="${escapeXmlAttribute(delivery)}"`,
		`stale="${escapeXmlAttribute(String(stale))}"`,
		...(restoredAfterResume ? [`restored-after-resume="true"`] : []),
	];
	const resumeWarning = restoredAfterResume
		? "This deferred advice was restored after resume and may be stale. "
		: "";
	return `<advisor-note ${attributes.join(" ")}>\n<note>${escapeXmlText(advice.note)}</note>\n<guidance>${escapeXmlText(`${resumeWarning}${guidance}`)}</guidance>\n</advisor-note>`;
}

export function createAdviseTool(
	config: AdvisorConfig,
	collector: AdviceCollector,
): ToolDefinition {
	return {
		name: "advise",
		label: "advise",
		description:
			"Record at most one concise material review note or eligible durable Memory suggestion. Do not call this tool when the Executor is on track.",
		parameters: Type.Union([
			Type.Object(
				{
					note: Type.String({ minLength: 1 }),
					severity: Type.Optional(StringEnum(["nit", "concern", "blocker"] as const)),
					intent: Type.Optional(StringEnum(["review"] as const)),
				},
				{ additionalProperties: false },
			),
			Type.Object(
				{
					note: Type.String({ minLength: 1 }),
					intent: StringEnum(["memory-suggestion"] as const),
					memory: Type.Object(
						{
							text: Type.String({ minLength: 1 }),
							category: StringEnum(MEMORY_SUGGESTION_CATEGORIES),
							basis: StringEnum(MEMORY_SUGGESTION_BASES),
						},
						{ additionalProperties: false },
					),
				},
				{ additionalProperties: false },
			),
		]),
		execute(_id, params) {
			collector.validCalls++;
			const input = params as
				| { note: string; severity?: AdviceSeverity; intent?: "review" }
				| {
						note: string;
						intent: "memory-suggestion";
						memory: AcceptedMemorySuggestion["memory"];
				  };
			if (input.intent === "memory-suggestion") {
				if (collector.accepted?.intent === "review") {
					suppressMemory(collector, "policy");
				} else if (collector.accepted !== undefined) {
					collector.suppressedCalls++;
				} else {
					const accepted = acceptMemorySuggestion(input, config, collector);
					if (accepted !== undefined) collector.accepted = accepted;
				}
			} else if (isContentFreeAdvice(input.note)) {
				collector.suppressedCalls++;
			} else if (collector.accepted?.intent === "review") {
				collector.suppressedCalls++;
			} else {
				if (collector.accepted?.intent === "memory-suggestion") {
					suppressMemory(collector, "policy");
				}
				collector.accepted = {
					...boundAdvice(input.note, config),
					severity: input.severity ?? "concern",
				};
			}
			return Promise.resolve({
				content: [{ type: "text" as const, text: "Recorded." }],
				details: {},
				terminate: true,
			});
		},
	};
}
