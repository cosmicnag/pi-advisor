import type { AssistantMessage } from "@earendil-works/pi-ai";
import { SessionManager, type TurnEndEvent } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import {
	boundAdvice,
	DEFAULT_ADVISOR_CONFIG,
	estimateTokens,
	formatAdvisorEnableStatus,
	HARD_LIMITS,
	isContentFreeAdvice,
	isMeaningfulExecutorTurn,
	normalizeAdvisorConfig,
	PROPOSED_ADVISOR_CONFIG,
	redactSecrets,
	renderAdvisorDelta,
	type AdvisorRuntimeStatus,
} from "../../src/index.js";

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
