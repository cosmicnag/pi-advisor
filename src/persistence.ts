import type { SessionEntry } from "@earendil-works/pi-coding-agent";

import { adviceDedupeKey, type AcceptedAdvice, type AdviceSeverity } from "./advice.js";
import { HARD_LIMITS } from "./config.js";
import { MAX_PENDING_ADVICE_ITEMS } from "./delivery.js";
import { isMemorySuggestionBasis, isMemorySuggestionCategory } from "./memory-suggestions.js";
import { redactSecrets } from "./redaction.js";
import { cursorMatches, type AdvisorCursor } from "./transcript.js";

export const ADVISOR_RUNTIME_STATE_ENTRY_TYPE = "pi-advisor-runtime-state";
export const ADVISOR_RUNTIME_STATE_VERSION = 2 as const;
export const ADVISOR_TRANSCRIPT_ENTRY_TYPE = "pi-advisor-transcript-record";
export const ADVISOR_TRANSCRIPT_LEGACY_RECORD_VERSION = 1 as const;
export const ADVISOR_TRANSCRIPT_RECORD_VERSION = 2 as const;
export const MAX_PERSISTED_DEDUPE_HASHES = 128;
export const MAX_PERSISTED_RUNTIME_STATE_BYTES = 4 * 1_024 * 1_024;
export const MAX_PERSISTED_TRANSCRIPT_RECORD_BYTES = 256 * 1_024;
export const MAX_INSPECTED_TRANSCRIPT_RECORDS = 256;
export const MAX_PERSISTED_ACTIVITY_TARGET_BYTES = 4 * 1_024;

interface PersistedAdvisorTranscriptRecordBase<Version extends 1 | 2> {
	version: Version;
	sessionId: string;
	savedAt: number;
}

export type PersistedAdvisorTranscriptRecordV1 = PersistedAdvisorTranscriptRecordBase<
	typeof ADVISOR_TRANSCRIPT_LEGACY_RECORD_VERSION
> &
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
		| {
				kind: "governor-exhaustion";
				outcome: "Advisor tool-call limit reached";
				stopReason: "tool-call-limit";
		  }
		| {
				kind: "governor-exhaustion";
				outcome: "Advisor turn limit reached";
				stopReason: "turn-limit";
		  }
	);

interface PersistedAdvisorActivityBase extends PersistedAdvisorTranscriptRecordBase<
	typeof ADVISOR_TRANSCRIPT_RECORD_VERSION
> {
	reviewId: string;
}

export interface PersistedAdvisorReviewStart extends PersistedAdvisorActivityBase {
	kind: "review-start";
	entryCount: number;
	truncated: boolean;
}

export interface PersistedAdvisorToolAttempt extends PersistedAdvisorActivityBase {
	kind: "tool-attempt";
	ordinal: number;
	toolName: string;
	internal: boolean;
	path?: string;
	pattern?: string;
	completed: boolean;
	isError: boolean;
	outputBytes: number;
	outputLines: number;
}

interface PersistedAdvisorReviewOutcomeBase extends PersistedAdvisorActivityBase {
	kind: "review-outcome";
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	total: number;
	costUsd: number;
	stopReason: string;
}

export type PersistedAdvisorReviewOutcome = PersistedAdvisorReviewOutcomeBase &
	(
		| { outcome: "silent" }
		| { outcome: "accepted"; delivery: "active" | "deferred"; stale: boolean }
		| { outcome: "governor-skipped"; reason: string }
		| { outcome: "failed"; reason: string }
	);

export type PersistedAdvisorTranscriptRecordV2 =
	| PersistedAdvisorReviewStart
	| PersistedAdvisorToolAttempt
	| PersistedAdvisorReviewOutcome;

export type PersistedAdvisorTranscriptRecord =
	| PersistedAdvisorTranscriptRecordV1
	| PersistedAdvisorTranscriptRecordV2;

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

function isAcceptedAdvice(value: unknown, allowFindingKeyHash: boolean): value is AcceptedAdvice {
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
				...(allowFindingKeyHash ? ["findingKeyHash"] : []),
				"truncated",
				"originalCharacters",
				"originalEstimatedTokens",
				"createdAt",
			]) &&
			isAdviceSeverity(advice.severity) &&
			(!allowFindingKeyHash ||
				advice.findingKeyHash === undefined ||
				(typeof advice.findingKeyHash === "string" &&
					/^[a-f0-9]{64}$/u.test(advice.findingKeyHash)))
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

function isPersistedDeferredAdvice(
	value: unknown,
	allowFindingKeyHash: boolean,
): value is PersistedDeferredAdvice {
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
		isAcceptedAdvice(pending.advice, allowFindingKeyHash) &&
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
	const version = state.version;
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
		(version !== 1 && version !== ADVISOR_RUNTIME_STATE_VERSION) ||
		state.sessionId !== expectedSessionId ||
		typeof state.sessionId !== "string" ||
		state.sessionId.length === 0 ||
		state.sessionId.length > 128 ||
		!isTimestamp(state.savedAt) ||
		!isCursor(state.cursor) ||
		!cursorMatches(branch, state.cursor) ||
		!Array.isArray(state.deferredAdvice) ||
		state.deferredAdvice.length > MAX_PENDING_ADVICE_ITEMS ||
		!state.deferredAdvice.every((pending) =>
			isPersistedDeferredAdvice(pending, version === ADVISOR_RUNTIME_STATE_VERSION),
		) ||
		!Array.isArray(state.dedupeHashes) ||
		state.dedupeHashes.length > MAX_PERSISTED_DEDUPE_HASHES ||
		!state.dedupeHashes.every((hash) => typeof hash === "string" && /^[a-f0-9]{64}$/u.test(hash)) ||
		new Set(state.dedupeHashes).size !== state.dedupeHashes.length ||
		!isMemoryState(state.memorySuggestions) ||
		!isFiniteInteger(state.notesDelivered)
	) {
		return undefined;
	}
	const migrated = structuredClone(value) as Omit<PersistedAdvisorRuntimeState, "version"> & {
		version: 1 | typeof ADVISOR_RUNTIME_STATE_VERSION;
	};
	return {
		...migrated,
		version: ADVISOR_RUNTIME_STATE_VERSION,
		...(version === 1 ? { dedupeHashes: [] } : {}),
	};
}

function hasValidTranscriptBase(
	record: Record<string, unknown>,
	expectedSessionId: string,
): boolean {
	return (
		record.sessionId === expectedSessionId &&
		typeof record.sessionId === "string" &&
		record.sessionId.length > 0 &&
		record.sessionId.length <= 128 &&
		isTimestamp(record.savedAt)
	);
}

function isActivityTarget(value: unknown): value is string {
	return (
		typeof value === "string" &&
		Buffer.byteLength(value, "utf8") <= MAX_PERSISTED_ACTIVITY_TARGET_BYTES &&
		redactSecrets(value).text === value
	);
}

function hasValidToolTargets(record: Record<string, unknown>): boolean {
	const path = record.path;
	const pattern = record.pattern;
	if (record.internal === true) {
		return record.toolName === "advise" && path === undefined && pattern === undefined;
	}
	if (record.toolName === "advise") return false;
	switch (record.toolName) {
		case "read":
		case "ls":
			return isActivityTarget(path) && pattern === undefined;
		case "find":
		case "grep":
			return isActivityTarget(path) && isActivityTarget(pattern);
		default:
			return path === undefined && pattern === undefined;
	}
}

function parseLegacyTranscriptRecord(
	value: unknown,
	record: Record<string, unknown>,
): PersistedAdvisorTranscriptRecordV1 | undefined {
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
				isAcceptedAdvice(record.advice, false) &&
				(record.delivery === "active" || record.delivery === "deferred") &&
				typeof record.stale === "boolean";
			break;
		case "failure":
			valid =
				hasOnlyKeys(record, ["version", "sessionId", "savedAt", "kind", "reason", "stopReason"]) &&
				isSafePersistedText(record.reason) &&
				isSafePersistedText(record.stopReason);
			break;
		case "governor-exhaustion":
			valid =
				hasOnlyKeys(record, ["version", "sessionId", "savedAt", "kind", "outcome", "stopReason"]) &&
				((record.outcome === "Advisor tool-call limit reached" &&
					record.stopReason === "tool-call-limit") ||
					(record.outcome === "Advisor turn limit reached" && record.stopReason === "turn-limit"));
			break;
	}
	return valid ? (structuredClone(value) as PersistedAdvisorTranscriptRecordV1) : undefined;
}

function parseActivityTranscriptRecord(
	value: unknown,
	record: Record<string, unknown>,
): PersistedAdvisorTranscriptRecordV2 | undefined {
	if (!isBoundedName(record.reviewId) || record.reviewId.length > 128) return undefined;
	let valid = false;
	switch (record.kind) {
		case "review-start":
			valid =
				hasOnlyKeys(record, [
					"version",
					"sessionId",
					"savedAt",
					"reviewId",
					"kind",
					"entryCount",
					"truncated",
				]) &&
				isFiniteInteger(record.entryCount) &&
				typeof record.truncated === "boolean";
			break;
		case "tool-attempt": {
			valid =
				hasOnlyKeys(record, [
					"version",
					"sessionId",
					"savedAt",
					"reviewId",
					"kind",
					"ordinal",
					"toolName",
					"internal",
					"path",
					"pattern",
					"completed",
					"isError",
					"outputBytes",
					"outputLines",
				]) &&
				isFiniteInteger(record.ordinal, 1) &&
				isBoundedName(record.toolName) &&
				typeof record.internal === "boolean" &&
				typeof record.completed === "boolean" &&
				typeof record.isError === "boolean" &&
				isFiniteInteger(record.outputBytes) &&
				isFiniteInteger(record.outputLines) &&
				hasValidToolTargets(record);
			if (
				valid &&
				record.completed === false &&
				(record.isError !== false || record.outputBytes !== 0 || record.outputLines !== 0)
			) {
				valid = false;
			}
			break;
		}
		case "review-outcome": {
			const commonKeys = [
				"version",
				"sessionId",
				"savedAt",
				"reviewId",
				"kind",
				"outcome",
				"input",
				"output",
				"cacheRead",
				"cacheWrite",
				"total",
				"costUsd",
				"stopReason",
			] as const;
			const validUsage =
				isFiniteNonNegative(record.input) &&
				isFiniteNonNegative(record.output) &&
				isFiniteNonNegative(record.cacheRead) &&
				isFiniteNonNegative(record.cacheWrite) &&
				isFiniteNonNegative(record.total) &&
				isFiniteNonNegative(record.costUsd) &&
				isSafePersistedText(record.stopReason);
			if (record.outcome === "silent") {
				valid = hasOnlyKeys(record, commonKeys) && validUsage;
			} else if (record.outcome === "accepted") {
				valid =
					hasOnlyKeys(record, [...commonKeys, "delivery", "stale"]) &&
					validUsage &&
					(record.delivery === "active" || record.delivery === "deferred") &&
					typeof record.stale === "boolean";
			} else if (record.outcome === "governor-skipped" || record.outcome === "failed") {
				valid =
					hasOnlyKeys(record, [...commonKeys, "reason"]) &&
					validUsage &&
					isSafePersistedText(record.reason);
			}
			break;
		}
	}
	return valid ? (structuredClone(value) as PersistedAdvisorTranscriptRecordV2) : undefined;
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
	if (!hasValidTranscriptBase(record, expectedSessionId)) return undefined;
	if (record.version === ADVISOR_TRANSCRIPT_LEGACY_RECORD_VERSION) {
		return parseLegacyTranscriptRecord(value, record);
	}
	if (record.version === ADVISOR_TRANSCRIPT_RECORD_VERSION) {
		return parseActivityTranscriptRecord(value, record);
	}
	return undefined;
}

export function deferredAdviceIdentity(pending: PersistedDeferredAdvice): string {
	return adviceDedupeKey(pending.advice);
}
