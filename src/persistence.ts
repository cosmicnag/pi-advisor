import type { SessionEntry } from "@earendil-works/pi-coding-agent";

import { adviceDedupeKey, type AcceptedAdvice, type AdviceSeverity } from "./advice.js";
import { HARD_LIMITS } from "./config.js";
import { MAX_PENDING_ADVICE_ITEMS } from "./delivery.js";
import { isMemorySuggestionBasis, isMemorySuggestionCategory } from "./memory-suggestions.js";
import { redactSecrets } from "./redaction.js";
import { cursorMatches, type AdvisorCursor } from "./transcript.js";

export const ADVISOR_RUNTIME_STATE_ENTRY_TYPE = "pi-advisor-runtime-state";
export const ADVISOR_RUNTIME_STATE_VERSION = 1 as const;
export const ADVISOR_TRANSCRIPT_ENTRY_TYPE = "pi-advisor-transcript-record";
export const ADVISOR_TRANSCRIPT_RECORD_VERSION = 1 as const;
export const MAX_PERSISTED_DEDUPE_HASHES = 128;
export const MAX_PERSISTED_RUNTIME_STATE_BYTES = 4 * 1_024 * 1_024;
export const MAX_PERSISTED_TRANSCRIPT_RECORD_BYTES = 256 * 1_024;
export const MAX_INSPECTED_TRANSCRIPT_RECORDS = 256;

interface PersistedAdvisorTranscriptRecordBase {
	version: typeof ADVISOR_TRANSCRIPT_RECORD_VERSION;
	sessionId: string;
	savedAt: number;
}

export type PersistedAdvisorTranscriptRecord = PersistedAdvisorTranscriptRecordBase &
	(
		| { kind: "update"; text: string; entryCount: number; truncated: boolean }
		| { kind: "advisor-tool-call"; toolName: string; arguments: string }
		| { kind: "advisor-tool-result"; toolName: string; isError: boolean; text: string }
		| {
				kind: "usage";
				input: number;
				output: number;
				cacheRead: number;
				cacheWrite: number;
				total: number;
				costUsd: number;
				stopReason: string;
		  }
		| {
				kind: "accepted-advice";
				advice: AcceptedAdvice;
				delivery: "active" | "deferred";
				stale: boolean;
		  }
		| { kind: "failure"; reason: string; stopReason: string }
	);

export interface PersistedDeferredAdvice {
	advice: AcceptedAdvice;
	stale: boolean;
	branchWindow: AdvisorCursor;
	displayedInEntry: boolean;
	restoredAfterResume?: boolean;
}

export interface PersistedMemorySuggestionState {
	meaningfulTurnCount: number;
	admittedCount: number;
	deliveredCount: number;
	lastAdmittedTurn?: number;
	lastAdmittedAt?: number;
	sessionCapReached: boolean;
}

export interface PersistedAdvisorRuntimeState {
	version: typeof ADVISOR_RUNTIME_STATE_VERSION;
	sessionId: string;
	savedAt: number;
	cursor: AdvisorCursor;
	deferredAdvice: PersistedDeferredAdvice[];
	dedupeHashes: string[];
	memorySuggestions: PersistedMemorySuggestionState;
	notesDelivered: number;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
	const allowed = new Set(keys);
	return Object.keys(value).every((key) => allowed.has(key));
}

function isFiniteInteger(value: unknown, minimum = 0): value is number {
	return Number.isSafeInteger(value) && (value as number) >= minimum;
}

function isTimestamp(value: unknown): value is number {
	return isFiniteInteger(value) && value <= 8_640_000_000_000_000;
}

function isFiniteNonNegative(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isSafePersistedText(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.length <= MAX_PERSISTED_TRANSCRIPT_RECORD_BYTES * 2 &&
		redactSecrets(value).text === value
	);
}

function isBoundedName(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function isCursor(value: unknown): value is AdvisorCursor {
	if (typeof value !== "object" || value === null) return false;
	const cursor = value as Record<string, unknown>;
	return (
		hasOnlyKeys(cursor, ["expectedIndex", "lastEntryId"]) &&
		isFiniteInteger(cursor.expectedIndex) &&
		(cursor.lastEntryId === undefined ||
			(typeof cursor.lastEntryId === "string" &&
				cursor.lastEntryId.length > 0 &&
				cursor.lastEntryId.length <= 128)) &&
		(cursor.expectedIndex === 0) === (cursor.lastEntryId === undefined)
	);
}

function isBoundedSafeText(value: unknown, maximumCharacters: number): value is string {
	if (typeof value !== "string" || value.length > maximumCharacters * 2) return false;
	if (Array.from(value).length > maximumCharacters) return false;
	return redactSecrets(value).text === value;
}

function isAdviceSeverity(value: unknown): value is AdviceSeverity {
	return value === "nit" || value === "concern" || value === "blocker";
}

function isAcceptedAdvice(value: unknown): value is AcceptedAdvice {
	if (typeof value !== "object" || value === null) return false;
	const advice = value as Record<string, unknown>;
	if (
		!isBoundedSafeText(advice.note, HARD_LIMITS.maxAdviceCharacters) ||
		typeof advice.truncated !== "boolean" ||
		!isFiniteInteger(advice.originalCharacters) ||
		!isFiniteInteger(advice.originalEstimatedTokens) ||
		!isTimestamp(advice.createdAt)
	) {
		return false;
	}
	if (advice.intent === "review") {
		return (
			hasOnlyKeys(advice, [
				"intent",
				"note",
				"severity",
				"truncated",
				"originalCharacters",
				"originalEstimatedTokens",
				"createdAt",
			]) && isAdviceSeverity(advice.severity)
		);
	}
	if (
		advice.intent !== "memory-suggestion" ||
		typeof advice.memory !== "object" ||
		advice.memory === null
	) {
		return false;
	}
	const memory = advice.memory as Record<string, unknown>;
	return (
		hasOnlyKeys(advice, [
			"intent",
			"note",
			"memory",
			"truncated",
			"originalCharacters",
			"originalEstimatedTokens",
			"createdAt",
		]) &&
		hasOnlyKeys(memory, ["text", "category", "basis"]) &&
		isBoundedSafeText(memory.text, HARD_LIMITS.maxProposedMemoryCharacters) &&
		isMemorySuggestionCategory(memory.category) &&
		isMemorySuggestionBasis(memory.basis)
	);
}

function isPersistedDeferredAdvice(value: unknown): value is PersistedDeferredAdvice {
	if (typeof value !== "object" || value === null) return false;
	const pending = value as Record<string, unknown>;
	return (
		hasOnlyKeys(pending, [
			"advice",
			"stale",
			"branchWindow",
			"displayedInEntry",
			"restoredAfterResume",
		]) &&
		isAcceptedAdvice(pending.advice) &&
		typeof pending.stale === "boolean" &&
		isCursor(pending.branchWindow) &&
		typeof pending.displayedInEntry === "boolean" &&
		(pending.restoredAfterResume === undefined || pending.restoredAfterResume === true)
	);
}

function isMemoryState(value: unknown): value is PersistedMemorySuggestionState {
	if (typeof value !== "object" || value === null) return false;
	const state = value as Record<string, unknown>;
	if (
		!hasOnlyKeys(state, [
			"meaningfulTurnCount",
			"admittedCount",
			"deliveredCount",
			"lastAdmittedTurn",
			"lastAdmittedAt",
			"sessionCapReached",
		]) ||
		!isFiniteInteger(state.meaningfulTurnCount) ||
		!isFiniteInteger(state.admittedCount) ||
		!isFiniteInteger(state.deliveredCount) ||
		(state.lastAdmittedTurn !== undefined && !isFiniteInteger(state.lastAdmittedTurn)) ||
		(state.lastAdmittedAt !== undefined && !isTimestamp(state.lastAdmittedAt)) ||
		typeof state.sessionCapReached !== "boolean"
	) {
		return false;
	}
	return (
		state.deliveredCount <= state.admittedCount &&
		state.admittedCount <= state.meaningfulTurnCount &&
		(state.lastAdmittedTurn === undefined) === (state.admittedCount === 0) &&
		(state.lastAdmittedAt === undefined) === (state.admittedCount === 0) &&
		(state.lastAdmittedTurn === undefined || state.lastAdmittedTurn <= state.meaningfulTurnCount)
	);
}

export function parsePersistedAdvisorRuntimeState(
	value: unknown,
	expectedSessionId: string,
	branch: SessionEntry[],
): PersistedAdvisorRuntimeState | undefined {
	let serialized: unknown;
	try {
		serialized = JSON.stringify(value);
	} catch {
		return undefined;
	}
	if (
		typeof serialized !== "string" ||
		Buffer.byteLength(serialized, "utf8") > MAX_PERSISTED_RUNTIME_STATE_BYTES ||
		typeof value !== "object" ||
		value === null
	) {
		return undefined;
	}
	const state = value as Record<string, unknown>;
	if (
		!hasOnlyKeys(state, [
			"version",
			"sessionId",
			"savedAt",
			"cursor",
			"deferredAdvice",
			"dedupeHashes",
			"memorySuggestions",
			"notesDelivered",
		]) ||
		state.version !== ADVISOR_RUNTIME_STATE_VERSION ||
		state.sessionId !== expectedSessionId ||
		typeof state.sessionId !== "string" ||
		state.sessionId.length === 0 ||
		state.sessionId.length > 128 ||
		!isTimestamp(state.savedAt) ||
		!isCursor(state.cursor) ||
		!cursorMatches(branch, state.cursor) ||
		!Array.isArray(state.deferredAdvice) ||
		state.deferredAdvice.length > MAX_PENDING_ADVICE_ITEMS ||
		!state.deferredAdvice.every(isPersistedDeferredAdvice) ||
		!Array.isArray(state.dedupeHashes) ||
		state.dedupeHashes.length > MAX_PERSISTED_DEDUPE_HASHES ||
		!state.dedupeHashes.every((hash) => typeof hash === "string" && /^[a-f0-9]{64}$/u.test(hash)) ||
		new Set(state.dedupeHashes).size !== state.dedupeHashes.length ||
		!isMemoryState(state.memorySuggestions) ||
		!isFiniteInteger(state.notesDelivered)
	) {
		return undefined;
	}
	return structuredClone(value) as PersistedAdvisorRuntimeState;
}

export function parsePersistedAdvisorTranscriptRecord(
	value: unknown,
	expectedSessionId: string,
): PersistedAdvisorTranscriptRecord | undefined {
	let serialized: unknown;
	try {
		serialized = JSON.stringify(value);
	} catch {
		return undefined;
	}
	if (
		typeof serialized !== "string" ||
		Buffer.byteLength(serialized, "utf8") > MAX_PERSISTED_TRANSCRIPT_RECORD_BYTES ||
		typeof value !== "object" ||
		value === null
	) {
		return undefined;
	}
	const record = value as Record<string, unknown>;
	if (
		record.version !== ADVISOR_TRANSCRIPT_RECORD_VERSION ||
		record.sessionId !== expectedSessionId ||
		typeof record.sessionId !== "string" ||
		record.sessionId.length === 0 ||
		record.sessionId.length > 128 ||
		!isTimestamp(record.savedAt)
	) {
		return undefined;
	}
	let valid = false;
	switch (record.kind) {
		case "update":
			valid =
				hasOnlyKeys(record, [
					"version",
					"sessionId",
					"savedAt",
					"kind",
					"text",
					"entryCount",
					"truncated",
				]) &&
				isSafePersistedText(record.text) &&
				isFiniteInteger(record.entryCount) &&
				typeof record.truncated === "boolean";
			break;
		case "advisor-tool-call":
			valid =
				hasOnlyKeys(record, ["version", "sessionId", "savedAt", "kind", "toolName", "arguments"]) &&
				isBoundedName(record.toolName) &&
				isSafePersistedText(record.arguments);
			break;
		case "advisor-tool-result":
			valid =
				hasOnlyKeys(record, [
					"version",
					"sessionId",
					"savedAt",
					"kind",
					"toolName",
					"isError",
					"text",
				]) &&
				isBoundedName(record.toolName) &&
				typeof record.isError === "boolean" &&
				isSafePersistedText(record.text);
			break;
		case "usage":
			valid =
				hasOnlyKeys(record, [
					"version",
					"sessionId",
					"savedAt",
					"kind",
					"input",
					"output",
					"cacheRead",
					"cacheWrite",
					"total",
					"costUsd",
					"stopReason",
				]) &&
				isFiniteNonNegative(record.input) &&
				isFiniteNonNegative(record.output) &&
				isFiniteNonNegative(record.cacheRead) &&
				isFiniteNonNegative(record.cacheWrite) &&
				isFiniteNonNegative(record.total) &&
				isFiniteNonNegative(record.costUsd) &&
				isSafePersistedText(record.stopReason);
			break;
		case "accepted-advice":
			valid =
				hasOnlyKeys(record, [
					"version",
					"sessionId",
					"savedAt",
					"kind",
					"advice",
					"delivery",
					"stale",
				]) &&
				isAcceptedAdvice(record.advice) &&
				(record.delivery === "active" || record.delivery === "deferred") &&
				typeof record.stale === "boolean";
			break;
		case "failure":
			valid =
				hasOnlyKeys(record, ["version", "sessionId", "savedAt", "kind", "reason", "stopReason"]) &&
				isSafePersistedText(record.reason) &&
				isSafePersistedText(record.stopReason);
			break;
	}
	return valid ? (structuredClone(value) as PersistedAdvisorTranscriptRecord) : undefined;
}

export function deferredAdviceIdentity(pending: PersistedDeferredAdvice): string {
	return adviceDedupeKey(pending.advice);
}
