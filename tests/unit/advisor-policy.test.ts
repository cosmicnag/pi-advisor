import type { AssistantMessage } from "@earendil-works/pi-ai";
import { SessionManager, type TurnEndEvent } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import {
	adviceDedupeKey,
	boundAdvice,
	BoundedAdviceDedupe,
	BoundedKeyedByteFifo,
	DEFAULT_ADVISOR_CONFIG,
	estimateTokens,
	formatAdviceForDelivery,
	formatAdvisorEnableStatus,
	HARD_LIMITS,
	isContentFreeAdvice,
	isMeaningfulExecutorTurn,
	MAX_DEFERRED_DELIVERY_BYTES,
	normalizeAdviceForDedupe,
	normalizeAdvisorConfig,
	PROPOSED_ADVISOR_CONFIG,
	redactSecrets,
	renderAdvisorDelta,
	takeRenderedPrefix,
	type AdviceDedupeIdentity,
	type AdvisorRuntimeStatus,
} from "../../src/index.js";

function dedupeIdentity(
	note: string,
	severity: AdviceDedupeIdentity["severity"] = "concern",
): AdviceDedupeIdentity {
	return { note, severity };
}

function assistant(
	content: AssistantMessage["content"],
	stopReason: AssistantMessage["stopReason"] = "stop",
): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "pi-advisor-test",
		provider: "test",
		model: "test",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason,
		timestamp: Date.now(),
	};
}

function runtimeStatus(): AdvisorRuntimeStatus {
	return {
		enabled: true,
		active: true,
		paused: false,
		effort: "high",
		backlog: false,
		pendingTranscriptBytes: 0,
		maxPendingTranscriptBytesObserved: 0,
		contextEstimateTokens: 0,
		contextLimitTokens: 10_000,
		usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0, costUsd: 0 },
		reviewsCompleted: 0,
		silentReviews: 0,
		failedReviews: 0,
		notesDelivered: 0,
		activeNotesPending: 0,
		deferredNotesPending: 0,
		notesSuppressed: 0,
		redactions: 0,
		consecutiveFailures: 0,
		branchResets: 0,
		warnings: 0,
		epoch: 0,
		nestedActiveTools: [],
	};
}

describe("Slice 1 configuration and emission policy", () => {
	it("keeps release defaults deeply immutable and normalization fallbacks canonical", () => {
		expect(Object.isFrozen(DEFAULT_ADVISOR_CONFIG)).toBe(true);
		expect(Object.isFrozen(DEFAULT_ADVISOR_CONFIG.limits)).toBe(true);
		expect(Reflect.set(DEFAULT_ADVISOR_CONFIG.limits, "maxAdviceCharacters", 1)).toBe(false);
		const input = structuredClone(DEFAULT_ADVISOR_CONFIG);
		input.limits.maxAdviceCharacters = Number.NaN;
		expect(normalizeAdvisorConfig(input).limits.maxAdviceCharacters).toBe(2_000);
	});

	it("keeps the deprecated proposed config export independent from release defaults", () => {
		// eslint-disable-next-line @typescript-eslint/no-deprecated
		const original = PROPOSED_ADVISOR_CONFIG.limits.maxAdviceCharacters;
		try {
			// eslint-disable-next-line @typescript-eslint/no-deprecated
			PROPOSED_ADVISOR_CONFIG.limits.maxAdviceCharacters = original - 1;
			expect(DEFAULT_ADVISOR_CONFIG.limits.maxAdviceCharacters).toBe(original);
		} finally {
			// eslint-disable-next-line @typescript-eslint/no-deprecated
			PROPOSED_ADVISOR_CONFIG.limits.maxAdviceCharacters = original;
		}
	});

	it("clamps every approved package hard maximum", () => {
		const config = structuredClone(DEFAULT_ADVISOR_CONFIG);
		config.limits.maxAdviceCharacters = Number.MAX_SAFE_INTEGER;
		config.limits.maxAdviceTokens = Number.MAX_SAFE_INTEGER;
		config.limits.maxAdvisorTurnsPerUpdate = Number.MAX_SAFE_INTEGER;
		config.limits.maxToolCallsPerUpdate = Number.MAX_SAFE_INTEGER;
		config.limits.maxPendingTranscriptBytes = Number.MAX_SAFE_INTEGER;
		config.limits.maxReprimeTokens = Number.MAX_SAFE_INTEGER;
		const normalized = normalizeAdvisorConfig(config);
		expect(normalized.limits).toMatchObject({
			maxAdviceCharacters: HARD_LIMITS.maxAdviceCharacters,
			maxAdviceTokens: HARD_LIMITS.maxAdviceTokens,
			maxAdvisorTurnsPerUpdate: HARD_LIMITS.maxAdvisorTurnsPerUpdate,
			maxToolCallsPerUpdate: HARD_LIMITS.maxToolCallsPerUpdate,
			maxPendingTranscriptBytes: HARD_LIMITS.maxPendingTranscriptBytes,
			maxReprimeTokens: HARD_LIMITS.maxReprimeTokens,
		});
	});

	it("reports prior token and cost totals before a paused budget reset", () => {
		const previous = runtimeStatus();
		previous.paused = true;
		previous.pauseReason = "Advisor session cost soft cap reached";
		previous.usage.total = 12_345;
		previous.usage.costUsd = 10.25;
		const current = runtimeStatus();
		const output = formatAdvisorEnableStatus(previous, current, true);
		expect(output).toContain("Previous Advisor budget before reset: 12345 tokens, $10.2500");
		expect(output).toContain("Advisor session cost soft cap reached");
		expect(output).toContain("Session tokens: 0");
	});

	it("keeps even extremely small configured note bounds within their limit", () => {
		const config = structuredClone(DEFAULT_ADVISOR_CONFIG);
		config.limits.maxAdviceCharacters = 3;
		config.limits.maxAdviceTokens = 1;
		const result = boundAdvice("A note that must be truncated", config);
		expect(result.truncated).toBe(true);
		expect(Array.from(result.note)).toHaveLength(3);
	});

	it("enforces the estimated-token bound for non-BMP notes", () => {
		const config = structuredClone(DEFAULT_ADVISOR_CONFIG);
		config.limits.maxAdviceCharacters = 100;
		config.limits.maxAdviceTokens = 10;
		const result = boundAdvice("😀".repeat(100), config);
		expect(result.truncated).toBe(true);
		expect(estimateTokens(result.note)).toBeLessThanOrEqual(10);
	});

	it("suppresses only normalized content-free phrases", () => {
		expect(isContentFreeAdvice("  LOOKS GOOD!!! ")).toBe(true);
		expect(isContentFreeAdvice("Stop: this migration deletes production rows.")).toBe(false);
	});

	it("redacts and safely truncates oversized notes with visible metadata", () => {
		const config = structuredClone(DEFAULT_ADVISOR_CONFIG);
		config.limits.maxAdviceCharacters = 80;
		config.limits.maxAdviceTokens = 20;
		const discarded = "DISCARDED-SENTINEL";
		const result = boundAdvice(
			`API_KEY=top-secret-value ${"useful detail ".repeat(20)}${discarded}`,
			config,
		);
		expect(result.truncated).toBe(true);
		expect(result.note).toContain("[Advisory note truncated to configured limit]");
		expect(result.note).toContain("[REDACTED]");
		expect(result.note).not.toContain("top-secret-value");
		expect(result.note).not.toContain(discarded);
		expect(Array.from(result.note).length).toBeLessThanOrEqual(80);
		expect(result.originalCharacters).toBeGreaterThan(Array.from(result.note).length);
	});
});

describe("Slice 1 transcript filtering and redaction", () => {
	it("redacts common secret forms before update budgeting, including reasoning", () => {
		const manager = SessionManager.inMemory();
		manager.appendMessage({ role: "user", content: "Bearer bearer-secret-123456", timestamp: 1 });
		manager.appendMessage(
			assistant([
				{ type: "thinking", thinking: "PASSWORD=reasoning-secret-value" },
				{ type: "text", text: "token near boundary sk-test-abcdefghijklmnop" },
			]),
		);
		const rendered = renderAdvisorDelta(manager.getBranch(), 30);
		expect(rendered.text).toContain("[REDACTED]");
		expect(rendered.text).not.toContain("bearer-secret-123456");
		expect(rendered.text).not.toContain("reasoning-secret-value");
		expect(rendered.text).not.toContain("sk-test-abcdefghijklmnop");
		expect(Buffer.byteLength(rendered.text, "utf8")).toBeLessThanOrEqual(120);
	});

	it("fully redacts quoted JSON and environment values containing spaces", () => {
		const redacted = redactSecrets(
			'"client_secret": "json secret value with spaces"\nMY_API_KEY=\'environment secret value with spaces\'\nSAFE=value',
		);
		expect(redacted.text).not.toContain("json secret value with spaces");
		expect(redacted.text).not.toContain("environment secret value with spaces");
		expect(redacted.text).toContain('"client_secret": [REDACTED]');
		expect(redacted.text).toContain("MY_API_KEY=[REDACTED]");
		expect(redacted.text).toContain("SAFE=value");
	});

	it("redacts private keys, credentials, and URL passwords", () => {
		const redacted = redactSecrets(
			'-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----\n"client_secret":"secret-json-value"\nhttps://user:url-password@example.com',
		);
		expect(redacted.redactions).toBeGreaterThanOrEqual(3);
		expect(redacted.text).not.toContain("abc123");
		expect(redacted.text).not.toContain("secret-json-value");
		expect(redacted.text).not.toContain("url-password");
	});

	it("formats every severity with delivery and staleness labels", () => {
		for (const severity of ["nit", "concern", "blocker"] as const) {
			const advice = {
				...boundAdvice("Check the rollback path.", DEFAULT_ADVISOR_CONFIG),
				severity,
			};
			expect(formatAdviceForDelivery(advice, "active", false)).toContain(
				`[Advisor ${severity} - active]`,
			);
			expect(formatAdviceForDelivery(advice, "deferred", true)).toContain(
				`[Advisor ${severity} - deferred - potentially stale]`,
			);
		}
	});

	it("deduplicates only conservative prose variants and preserves code identity", () => {
		expect(normalizeAdviceForDedupe("  VERIFY rollback punctuation... ")).toBe(
			"verify rollback punctuation",
		);
		const dedupe = new BoundedAdviceDedupe(20);
		expect(dedupe.add(dedupeIdentity("Verify rollback punctuation!"))).toBe(true);
		expect(dedupe.add(dedupeIdentity("  VERIFY rollback punctuation... "))).toBe(false);

		for (const [left, right] of [
			["change < to >", "change > to <"],
			["change x != y", "change x = y"],
			["Use x / y", "Use x y"],
			["Negate !flag", "Negate flag"],
			["Add the missing ;", "Add the missing"],
			["Change `User` to `user`.", "Change `user` to `User`."],
			["Change ``User`` now.", "Change ``user`` now."],
		] as const) {
			expect(dedupe.add(dedupeIdentity(left))).toBe(true);
			expect(dedupe.add(dedupeIdentity(right))).toBe(true);
		}

		expect(normalizeAdviceForDedupe("CHANGE `User` NOW!")).toBe("change `User` now");
		expect(adviceDedupeKey(dedupeIdentity("Use `a  b` here."))).not.toBe(
			adviceDedupeKey(dedupeIdentity("Use `a b` here.")),
		);
		expect(dedupe.add(dedupeIdentity("CHANGE `Account` NOW!"))).toBe(true);
		expect(dedupe.add(dedupeIdentity("change `Account` now..."))).toBe(false);
	});

	it("avoids case and trailing-punctuation suppression for unmatched backticks", () => {
		expect(normalizeAdviceForDedupe("  Review `User carefully... ")).toBe(
			"Review `User carefully...",
		);
		const dedupe = new BoundedAdviceDedupe(4);
		expect(dedupe.add(dedupeIdentity("Review `User carefully."))).toBe(true);
		expect(dedupe.add(dedupeIdentity("Review `User carefully..."))).toBe(true);
		expect(dedupe.add(dedupeIdentity("review `user carefully..."))).toBe(true);
	});

	it("includes severity in dedupe identity and retains FIFO insertion order", () => {
		const dedupe = new BoundedAdviceDedupe(2);
		expect(dedupe.add(dedupeIdentity("Verify rollback!", "nit"))).toBe(true);
		expect(dedupe.add(dedupeIdentity("Check migrations"))).toBe(true);
		expect(dedupe.add(dedupeIdentity("VERIFY rollback...", "nit"))).toBe(false);
		expect(dedupe.add(dedupeIdentity("Verify rollback!", "blocker"))).toBe(true);
		expect(dedupe.size).toBe(2);
		expect(dedupe.add(dedupeIdentity("Verify rollback!", "nit"))).toBe(true);
		expect(dedupe.delete(dedupeIdentity("Verify rollback!", "blocker"))).toBe(true);
	});

	it("bounds keyed FIFO admission by items and raw bytes without evicting older entries", () => {
		const queue = new BoundedKeyedByteFifo<string>(2, 5);
		expect(queue.enqueue("a", "one", 3)).toBe("accepted");
		expect(queue.enqueue("a", "duplicate", 1)).toBe("duplicate");
		expect(queue.enqueue("b", "two", 2)).toBe("accepted");
		expect(queue.enqueue("c", "three", 1)).toBe("capacity");
		expect(queue.values()).toEqual(["one", "two"]);
		expect(queue.totalBytes).toBe(5);
		expect(queue.shift()).toMatchObject({ key: "a", value: "one", bytes: 3 });
		expect(queue.totalBytes).toBe(2);
		expect(queue.enqueue("c", "three", 3)).toBe("accepted");
		expect(queue.remove("b")).toMatchObject({ key: "b", value: "two", bytes: 2 });
		expect(queue.values()).toEqual(["three"]);
		expect(queue.totalBytes).toBe(3);
	});

	it("keeps one hard-bounded note below the deferred delivery batch limit", () => {
		const config = structuredClone(DEFAULT_ADVISOR_CONFIG);
		config.limits.maxAdviceCharacters = HARD_LIMITS.maxAdviceCharacters;
		config.limits.maxAdviceTokens = HARD_LIMITS.maxAdviceTokens;
		const advice = boundAdvice("😀".repeat(HARD_LIMITS.maxAdviceCharacters), config);
		const formatted = formatAdviceForDelivery(advice, "deferred", true);
		expect(Buffer.byteLength(formatted, "utf8")).toBeLessThanOrEqual(MAX_DEFERRED_DELIVERY_BYTES);
	});

	it("takes byte-bounded rendered FIFO prefixes and retains the remainder", () => {
		const queue = new BoundedKeyedByteFifo<string>(4, 100);
		for (const value of ["aa", "bb", "cc"]) {
			expect(queue.enqueue(value, value, Buffer.byteLength(value, "utf8"))).toBe("accepted");
		}
		const first = takeRenderedPrefix(queue, 6, (value) => value);
		expect(first.map(({ value }) => value)).toEqual(["aa", "bb"]);
		expect(first.map(({ rendered }) => rendered).join("\n\n")).toBe("aa\n\nbb");
		expect(queue.values()).toEqual(["cc"]);
		const second = takeRenderedPrefix(queue, 6, (value) => value);
		expect(second.map(({ value }) => value)).toEqual(["cc"]);
		expect(queue.length).toBe(0);

		const oversized = new BoundedKeyedByteFifo<string>(1, 100);
		expect(oversized.enqueue("x", "1234567", 7)).toBe("accepted");
		expect(() => takeRenderedPrefix(oversized, 6, (value) => value)).toThrow(
			"exceeds the prefix byte bound",
		);
		expect(oversized.values()).toEqual(["1234567"]);
		expect(oversized.totalBytes).toBe(7);
		expect(oversized.has("x")).toBe(true);
	});

	it.each([
		{
			name: "renderer failure",
			render: (value: string) => {
				if (value === "bb") throw new Error("renderer failed");
				return value;
			},
			error: "renderer failed",
		},
		{
			name: "oversized later candidate",
			render: (value: string) => (value === "bb" ? "1234567" : value),
			error: "exceeds the prefix byte bound",
		},
	])("leaves FIFO state unchanged after $name", ({ render, error }) => {
		const queue = new BoundedKeyedByteFifo<string>(4, 100);
		for (const value of ["aa", "bb", "cc"]) {
			expect(queue.enqueue(value, value, Buffer.byteLength(value, "utf8"))).toBe("accepted");
		}

		expect(() => takeRenderedPrefix(queue, 6, render)).toThrow(error);
		expect(queue.values()).toEqual(["aa", "bb", "cc"]);
		expect(queue.length).toBe(3);
		expect(queue.totalBytes).toBe(6);
		for (const key of ["aa", "bb", "cc"]) {
			expect(queue.has(key)).toBe(true);
			expect(queue.enqueue(key, "duplicate", 1)).toBe("duplicate");
		}
	});

	it("skips aborted, empty, and Advisor-generated turns", () => {
		const aborted: TurnEndEvent = {
			type: "turn_end",
			turnIndex: 0,
			message: assistant([{ type: "text", text: "partial" }], "aborted"),
			toolResults: [],
		};
		const empty: TurnEndEvent = {
			...aborted,
			message: assistant([]),
		};
		const advisorGenerated: TurnEndEvent = {
			...aborted,
			message: assistant([{ type: "text", text: "weighed advisory" }]),
		};
		const manager = SessionManager.inMemory();
		manager.appendCustomMessageEntry("pi-advisor-note", "peer note", true);
		expect(isMeaningfulExecutorTurn(aborted, [])).toBe(false);
		expect(isMeaningfulExecutorTurn(empty, [])).toBe(false);
		expect(isMeaningfulExecutorTurn(advisorGenerated, manager.getBranch())).toBe(false);
		expect(
			isMeaningfulExecutorTurn(
				{ ...empty, message: assistant([{ type: "text", text: "ordinary answer" }]) },
				[],
			),
		).toBe(true);
	});
});
