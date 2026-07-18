import {
	defineTool,
	type ExtensionContext,
	type InlineExtension,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { describe, expect, it } from "vitest";

import {
	createPiAdvisorExtension,
	DEFAULT_ADVISOR_CONFIG,
	type AdvisorConfig,
	type AdvisorRuntime,
} from "../../src/index.js";
import { createSessionHarness } from "../fixtures/session-harness.js";
import {
	ADVISOR_SCRIPTED_API,
	createPrimaryProvider,
	ScriptedProvider,
	type ScriptedResponse,
} from "../fixtures/scripted-provider.js";

function configFor(
	provider: ScriptedProvider,
	mutate?: (config: AdvisorConfig) => void,
): AdvisorConfig {
	const config = structuredClone(DEFAULT_ADVISOR_CONFIG);
	config.defaultEnabled = true;
	config.model = `${provider.model.provider}/${provider.model.id}`;
	mutate?.(config);
	return config;
}

function extensionFor(
	config: AdvisorConfig,
	onRuntime: (runtime: AdvisorRuntime) => void,
): InlineExtension {
	return {
		name: "pi-advisor-context-policy-test",
		factory: createPiAdvisorExtension({ config, hooks: { onRuntime } }),
	};
}

async function waitFor(predicate: () => boolean): Promise<void> {
	await expect.poll(predicate, { timeout: 5_000, interval: 10 }).toBe(true);
}

function acceptedAdvice(note: string): ScriptedResponse {
	return {
		content: [
			{
				type: "toolCall",
				id: "context-policy-advice",
				name: "advise",
				arguments: { note, severity: "concern", intent: "review" },
			},
		],
		stopReason: "toolUse",
	};
}

describe.sequential("Slice 4A token-aware Advisor context", () => {
	it("coalesces skipped turns until the configured ordinary review turn cadence is eligible", async () => {
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "EXECUTOR-ONE" }] },
			{ content: [{ type: "text", text: "EXECUTOR-TWO" }] },
			{ content: [{ type: "text", text: "EXECUTOR-THREE" }] },
			{ content: [{ type: "text", text: "EXECUTOR-FOUR" }] },
		]);
		const advisor = new ScriptedProvider({
			providerId: "pi-advisor-fixture-advisor",
			modelId: "advisor-scripted",
			api: ADVISOR_SCRIPTED_API,
			responses: [{ content: [] }, { content: [] }],
		});
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [
				extensionFor(
					configFor(advisor, (config) => {
						config.limits.minTurnsBetweenReviews = 3;
					}),
					(value) => (runtime = value),
				),
			],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("turn one");
			await waitFor(() => runtime?.getStatus().reviewsCompleted === 1);
			await harness.session.prompt("turn two");
			await harness.session.prompt("turn three");
			expect(advisor.requests).toHaveLength(1);
			expect(runtime?.getStatus().backlog).toBe(true);

			await harness.session.prompt("turn four");
			await waitFor(() => runtime?.getStatus().reviewsCompleted === 2);
			const coalesced = JSON.stringify(advisor.requests[1]?.context.messages);
			expect(coalesced).toContain("EXECUTOR-TWO");
			expect(coalesced).toContain("EXECUTOR-THREE");
			expect(coalesced).toContain("EXECUTOR-FOUR");
			expect(runtime?.getStatus().pendingTranscriptBytes).toBe(0);
		} finally {
			await harness.dispose();
		}
	});

	it("redacts and per-result bounds a large Executor tool result before Advisor submission", async () => {
		const primary = createPrimaryProvider([
			{
				content: [{ type: "toolCall", id: "large-output", name: "large_output", arguments: {} }],
				stopReason: "toolUse",
			},
			{ content: [{ type: "text", text: "Executor handled the large result." }] },
		]);
		const advisor = new ScriptedProvider({
			providerId: "pi-advisor-fixture-advisor",
			modelId: "advisor-scripted",
			api: ADVISOR_SCRIPTED_API,
			responses: [{ content: [] }],
		});
		const largeOutput = defineTool({
			name: "large_output",
			label: "large output",
			description: "Return deterministic oversized output.",
			parameters: Type.Object({}),
			execute: () =>
				Promise.resolve({
					content: [
						{
							type: "text" as const,
							text: `API_KEY=large-tool-secret\n${Array.from(
								{ length: 2_100 },
								(_, index) => `tool-line-${String(index)}-${"x".repeat(30)}`,
							).join("\n")}`,
						},
					],
					details: {},
				}),
		});
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [extensionFor(configFor(advisor), (value) => (runtime = value))],
			customTools: [largeOutput],
			tools: ["large_output"],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("produce a large tool result");
			await waitFor(() => runtime?.getStatus().reviewsCompleted === 1);
			const submitted = JSON.stringify(advisor.requests[0]?.context.messages);
			expect(submitted).toContain("[Tool result truncated to per-result limit]");
			expect(submitted).toContain("[REDACTED]");
			expect(submitted).not.toContain("large-tool-secret");
			expect(Buffer.byteLength(submitted, "utf8")).toBeLessThan(100_000);
		} finally {
			await harness.dispose();
		}
	});

	it("flushes the final bounded update when elapsed-time cadence becomes eligible", async () => {
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "INTERVAL-ONE" }] },
			{ content: [{ type: "text", text: "INTERVAL-TWO" }] },
		]);
		const advisor = new ScriptedProvider({
			providerId: "pi-advisor-fixture-advisor",
			modelId: "advisor-scripted",
			api: ADVISOR_SCRIPTED_API,
			responses: [{ content: [] }, { content: [] }],
		});
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [
				extensionFor(
					configFor(advisor, (config) => {
						config.limits.minIntervalMs = 500;
					}),
					(value) => (runtime = value),
				),
			],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("interval one");
			await waitFor(() => runtime?.getStatus().reviewsCompleted === 1);
			await harness.session.prompt("interval two");
			expect(advisor.requests).toHaveLength(1);
			expect(runtime?.getStatus().backlog).toBe(true);

			await waitFor(() => runtime?.getStatus().reviewsCompleted === 2);
			const finalReview = JSON.stringify(advisor.requests[1]?.context.messages);
			expect(finalReview).toContain("INTERVAL-TWO");
			expect(runtime?.getStatus().pendingTranscriptBytes).toBe(0);
		} finally {
			await harness.dispose();
		}
	});

	it("re-evaluates a held elapsed-time update after an explicit budget reset", async () => {
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "RESET-INTERVAL-ONE" }] },
			{ content: [{ type: "text", text: "RESET-INTERVAL-TWO" }] },
		]);
		const advisor = new ScriptedProvider({
			providerId: "pi-advisor-fixture-advisor",
			modelId: "advisor-scripted",
			api: ADVISOR_SCRIPTED_API,
			responses: [{ content: [] }, { content: [] }],
		});
		let runtime: AdvisorRuntime | undefined;
		let hostContext: ExtensionContext | undefined;
		const contextCapture: InlineExtension = {
			name: "capture-context-for-budget-reset",
			factory: (pi) => {
				pi.on("session_start", (_event, ctx) => {
					hostContext = ctx;
				});
			},
		};
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [
				contextCapture,
				extensionFor(
					configFor(advisor, (config) => {
						config.limits.minIntervalMs = 500;
					}),
					(value) => (runtime = value),
				),
			],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("interval before budget reset");
			await waitFor(() => runtime?.getStatus().reviewsCompleted === 1);
			await harness.session.prompt("held interval before budget reset");
			expect(advisor.requests).toHaveLength(1);
			expect(runtime?.getStatus().backlog).toBe(true);
			if (runtime === undefined || hostContext === undefined) {
				throw new Error("Expected Advisor runtime and captured extension context");
			}

			await runtime.enable(hostContext, "session-command", true);
			await expect
				.poll(() => runtime?.getStatus().reviewsCompleted, { timeout: 250, interval: 10 })
				.toBe(2);
			const resetReview = JSON.stringify(advisor.requests[1]?.context.messages);
			expect(resetReview).toContain("RESET-INTERVAL-TWO");
			expect(runtime.getStatus().pendingTranscriptBytes).toBe(0);

			await new Promise<void>((resolve) => setTimeout(resolve, 600));
			expect(advisor.requests).toHaveLength(2);
		} finally {
			await harness.dispose();
		}
	});

	it("cancels an elapsed-time cadence flush when Advisor is disabled", async () => {
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "CANCEL-INTERVAL-ONE" }] },
			{ content: [{ type: "text", text: "CANCEL-INTERVAL-TWO" }] },
		]);
		const advisor = new ScriptedProvider({
			providerId: "pi-advisor-fixture-advisor",
			modelId: "advisor-scripted",
			api: ADVISOR_SCRIPTED_API,
			responses: [{ content: [] }, { content: [] }],
		});
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [
				extensionFor(
					configFor(advisor, (config) => {
						config.limits.minIntervalMs = 500;
					}),
					(value) => (runtime = value),
				),
			],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("interval one");
			await waitFor(() => runtime?.getStatus().reviewsCompleted === 1);
			await harness.session.prompt("interval two");
			expect(runtime?.getStatus().backlog).toBe(true);
			await runtime?.disable();
			await new Promise<void>((resolve) => setTimeout(resolve, 600));
			expect(advisor.requests).toHaveLength(1);
			expect(runtime?.getStatus()).toMatchObject({ active: false, backlog: false });
		} finally {
			await harness.dispose();
		}
	});

	it("compacts through AgentSession and preserves a planted requirement for later review", async () => {
		const violationAdvice = "The Executor violated MUST-RUN-LONG-CONTEXT-CHECK.";
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "Establish MUST-RUN-LONG-CONTEXT-CHECK." }] },
			{ content: [{ type: "text", text: "Continue while preserving the requirement." }] },
			{ content: [{ type: "text", text: "VIOLATION: skipped the required long-context check." }] },
			{ content: [{ type: "text", text: "Executor weighs the compacted-context finding." }] },
		]);
		const advisor = new ScriptedProvider({
			providerId: "pi-advisor-fixture-advisor",
			modelId: "advisor-scripted-small-context",
			api: ADVISOR_SCRIPTED_API,
			contextWindow: 4_000,
			maxTokens: 512,
			responses: [
				{ content: [{ type: "text", text: `private-one-${"a".repeat(5_000)}` }] },
				{ content: [{ type: "text", text: `private-two-${"b".repeat(5_000)}` }] },
				{
					content: [
						{
							type: "text",
							text: "## Context for Suffix\n- Preserve MUST-RUN-LONG-CONTEXT-CHECK before completion.",
						},
					],
				},
				{
					content: [
						{
							type: "text",
							text: "## Constraints & Preferences\n- Preserve MUST-RUN-LONG-CONTEXT-CHECK before completion.",
						},
					],
				},
				acceptedAdvice(violationAdvice),
				{ content: [] },
			],
		});
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [
				extensionFor(
					configFor(advisor, (config) => {
						config.context.maxFraction = 0.65;
						config.context.reserveTokens = 300;
					}),
					(value) => (runtime = value),
				),
			],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("establish requirement");
			await waitFor(() => runtime?.getStatus().reviewsCompleted === 1);
			await harness.session.prompt("continue task");
			await waitFor(() => runtime?.getStatus().reviewsCompleted === 2);
			await harness.session.prompt("violate requirement");
			await waitFor(
				() =>
					runtime?.getStatus().reviewsCompleted === 3 &&
					runtime.getStatus().compactionsCompleted === 1,
			);

			const reviewRequests = advisor.requests.filter((request) =>
				request.context.systemPrompt?.includes("You are Advisor"),
			);
			expect(reviewRequests).toHaveLength(3);
			const compactedReview = JSON.stringify(reviewRequests[2]?.context.messages);
			expect(compactedReview).toContain("MUST-RUN-LONG-CONTEXT-CHECK");
			expect(compactedReview).toContain("VIOLATION: skipped the required long-context check");
			expect(runtime?.getStatus()).toMatchObject({
				paused: false,
				contextEstimateSource: "estimate-only",
				contextUsageTokens: 0,
				compactionsCompleted: 1,
				compactionFailures: 0,
			});
			expect(runtime?.getStatus().contextEstimateTokens).toBeLessThanOrEqual(
				runtime?.getStatus().contextLimitTokens ?? 0,
			);

			await harness.session.prompt("weigh finding");
			await waitFor(() => runtime?.getStatus().reviewsCompleted === 4);
			const primaryAfterAdvice = JSON.stringify(primary.requests[3]?.context.messages);
			expect(primaryAfterAdvice).toContain(violationAdvice);
			expect(primaryAfterAdvice).not.toContain("private-one-");
			expect(primaryAfterAdvice).not.toContain("private-two-");
			expect(primaryAfterAdvice).not.toContain("## Constraints & Preferences");
		} finally {
			await harness.dispose();
		}
	});
});
