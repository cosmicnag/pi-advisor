import type { ExtensionContext, InlineExtension } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import {
	ADVISOR_RETRY_DELAY_MS,
	createPiAdvisorExtension,
	DEFAULT_ADVISOR_CONFIG,
	formatAdvisorStatus,
	type AdvisorConfig,
	type AdvisorRuntime,
} from "../../src/index.js";
import { createSessionHarness } from "../fixtures/session-harness.js";
import {
	createAdvisorProvider,
	createPrimaryProvider,
	type ScriptedProvider,
} from "../fixtures/scripted-provider.js";

function configFor(provider: ScriptedProvider): AdvisorConfig {
	const config = structuredClone(DEFAULT_ADVISOR_CONFIG);
	config.defaultEnabled = true;
	config.model = `${provider.model.provider}/${provider.model.id}`;
	return config;
}

function extensionFor(
	config: AdvisorConfig,
	onRuntime: (runtime: AdvisorRuntime) => void,
	onWarning?: (message: string) => void,
): InlineExtension {
	return {
		name: "pi-advisor-retry-resilience-test",
		factory: createPiAdvisorExtension({
			config,
			hooks: {
				onRuntime,
				...(onWarning === undefined ? {} : { onWarning }),
			},
		}),
	};
}

function acceptedAdvice(note: string, id = "retry-advice") {
	return {
		content: [
			{
				type: "toolCall" as const,
				id,
				name: "advise",
				arguments: { note, severity: "concern", intent: "review" },
			},
		],
		stopReason: "toolUse" as const,
	};
}

async function waitFor(predicate: () => boolean): Promise<void> {
	await expect.poll(predicate, { timeout: 5_000, interval: 10 }).toBe(true);
}

function createBarrier(): { promise: Promise<void>; release: () => void } {
	let release: () => void = () => undefined;
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { promise, release };
}

describe.sequential("Slice 3B retry lifecycle resilience", () => {
	it("rolls back a failed provider turn, retries after a bounded delay, and resets recovery state", async () => {
		const note = "Retry only from clean Advisor context.";
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "executor answer" }] },
		]);
		const advisor = createAdvisorProvider([
			{ errorMessage: "transient provider failure" },
			acceptedAdvice(note),
		]);
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [extensionFor(configFor(advisor), (value) => (runtime = value))],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("trigger a retry");
			await waitFor(() => runtime?.getStatus().reviewsCompleted === 1);

			expect(advisor.requests).toHaveLength(2);
			const firstRequest = advisor.requests[0];
			const retryRequest = advisor.requests[1];
			if (firstRequest === undefined || retryRequest === undefined) {
				throw new Error("Expected initial and retry requests");
			}
			expect(retryRequest.startedAt - firstRequest.startedAt).toBeGreaterThanOrEqual(
				ADVISOR_RETRY_DELAY_MS - 25,
			);
			const retryContext = JSON.stringify(advisor.requests[1]?.context.messages);
			expect(retryContext).not.toContain("transient provider failure");
			expect(retryContext.split("trigger a retry")).toHaveLength(2);
			expect(runtime?.getStatus()).toMatchObject({
				reviewsCompleted: 1,
				failedReviews: 1,
				consecutiveFailures: 0,
				retryAttempts: 1,
				retryPending: false,
				deferredNotesPending: 1,
			});
			expect(
				runtime?.getNestedMessages().filter((message) => message.role === "user"),
			).toHaveLength(1);
		} finally {
			await harness.dispose();
		}
	});

	it("counts suppression only from the successful resolved retry attempt", async () => {
		const firstAttempt = createBarrier();
		const resolvedAttempt = createBarrier();
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "executor answer" }] },
		]);
		const advisor = createAdvisorProvider([
			{ errorMessage: "failure after suppression", waitFor: firstAttempt.promise },
			{ content: [], waitFor: resolvedAttempt.promise },
		]);
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [extensionFor(configFor(advisor), (value) => (runtime = value))],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("retry after a suppressed call");
			await waitFor(() => advisor.requests.length === 1 && runtime !== undefined);
			if (runtime === undefined) throw new Error("Expected Advisor runtime");
			const activeRuntime = runtime;
			const collector = Reflect.get(activeRuntime, "collector") as {
				suppressedCalls: number;
			};
			collector.suppressedCalls = 1;
			firstAttempt.release();
			await waitFor(() => advisor.requests.length === 2);
			collector.suppressedCalls = 1;
			resolvedAttempt.release();
			await waitFor(() => activeRuntime.getStatus().reviewsCompleted === 1);

			expect(activeRuntime.getStatus()).toMatchObject({
				reviewRequests: 2,
				reviewsCompleted: 1,
				failedReviews: 1,
				retryAttempts: 1,
				notesSuppressed: 1,
			});
		} finally {
			firstAttempt.release();
			resolvedAttempt.release();
			await harness.dispose();
		}
	});

	it("does not count suppression from an update whose attempts all fail", async () => {
		const firstAttempt = createBarrier();
		const finalAttempt = createBarrier();
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "executor answer" }] },
		]);
		const advisor = createAdvisorProvider([
			{ errorMessage: "first failure after suppression", waitFor: firstAttempt.promise },
			{ errorMessage: "second failure after suppression", waitFor: finalAttempt.promise },
		]);
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [extensionFor(configFor(advisor), (value) => (runtime = value))],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("fail every suppressed review attempt");
			await waitFor(() => advisor.requests.length === 1 && runtime !== undefined);
			if (runtime === undefined) throw new Error("Expected Advisor runtime");
			const activeRuntime = runtime;
			const collector = Reflect.get(activeRuntime, "collector") as {
				suppressedCalls: number;
			};
			collector.suppressedCalls = 1;
			firstAttempt.release();
			await waitFor(() => advisor.requests.length === 2);
			collector.suppressedCalls = 1;
			finalAttempt.release();
			await waitFor(() => activeRuntime.getStatus().failedReviews === 2);

			expect(activeRuntime.getStatus()).toMatchObject({
				reviewRequests: 2,
				reviewsCompleted: 0,
				failedReviews: 2,
				retryAttempts: 1,
				notesSuppressed: 0,
			});
		} finally {
			firstAttempt.release();
			finalAttempt.release();
			await harness.dispose();
		}
	});

	it("counts repeated attempts toward the existing three-failure pause and warns once", async () => {
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "first answer" }] },
			{ content: [{ type: "text", text: "second answer" }] },
			{ content: [{ type: "text", text: "ignored after pause" }] },
		]);
		const advisor = createAdvisorProvider([
			{ errorMessage: "failure one" },
			{ errorMessage: "failure two" },
			{ errorMessage: "failure three" },
		]);
		const warnings: string[] = [];
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [
				extensionFor(
					configFor(advisor),
					(value) => (runtime = value),
					(message) => warnings.push(message),
				),
			],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("first repeatedly failing update");
			await waitFor(() => runtime?.getStatus().failedReviews === 2);
			await harness.session.prompt("second update reaches pause");
			await waitFor(() => runtime?.getStatus().paused === true);

			expect(runtime?.getStatus()).toMatchObject({
				paused: true,
				consecutiveFailures: 3,
				failedReviews: 3,
				retryAttempts: 1,
				warnings: 1,
			});
			expect(warnings).toHaveLength(1);
			await harness.session.prompt("turn after pause");
			expect(advisor.requests).toHaveLength(3);
		} finally {
			await harness.dispose();
		}
	});

	it("reports retry and queued transcript backlog while catch-up remains non-blocking", async () => {
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "first executor answer" }] },
			{ content: [{ type: "text", text: "SECOND-EXECUTOR-ANSWER" }] },
		]);
		const advisor = createAdvisorProvider([
			{ errorMessage: "retryable provider failure" },
			{ content: [] },
			{ content: [] },
		]);
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [extensionFor(configFor(advisor), (value) => (runtime = value))],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("first update enters retry delay");
			await waitFor(() => runtime?.getStatus().retryPending === true);
			await harness.session.prompt("queue a newer update without blocking Executor");

			const pending = runtime?.getStatus();
			if (pending === undefined) throw new Error("Expected Advisor status");
			expect(pending).toMatchObject({ backlog: true, retryPending: true });
			expect(pending.pendingTranscriptBytes).toBeGreaterThan(0);
			expect(formatAdvisorStatus(pending)).toContain("retry pending");
			expect(formatAdvisorStatus(pending)).toContain("1 consecutive");

			await waitFor(() => runtime?.getStatus().reviewsCompleted === 2);
			expect(JSON.stringify(advisor.requests[2]?.context.messages)).toContain(
				"SECOND-EXECUTOR-ANSWER",
			);
			expect(runtime?.getStatus()).toMatchObject({
				backlog: false,
				retryPending: false,
				pendingTranscriptBytes: 0,
			});
		} finally {
			await harness.dispose();
		}
	});

	it("extracts stale nested queued output on reset and invalidates retry-delay continuation", async () => {
		const providerBarrier = createBarrier();
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "executor answer" }] },
		]);
		const advisor = createAdvisorProvider([
			{ errorMessage: "enter retry delay" },
			{ ...acceptedAdvice("Never deliver after reset."), waitFor: providerBarrier.promise },
		]);
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [extensionFor(configFor(advisor), (value) => (runtime = value))],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("start reset-sensitive retry");
			await waitFor(() => runtime?.getStatus().retryPending === true);
			if (runtime === undefined) throw new Error("Expected Advisor runtime");
			const nested = Reflect.get(runtime, "session") as {
				steer(text: string): Promise<void>;
				pendingMessageCount: number;
			};
			await nested.steer("STALE-NESTED-QUEUED-OUTPUT");
			expect(nested.pendingMessageCount).toBe(1);
			const ctx = Reflect.get(runtime, "hostContext") as ExtensionContext;

			await runtime.handleBranchChange(ctx);
			await new Promise((resolve) => setTimeout(resolve, 350));

			expect(advisor.requests).toHaveLength(1);
			expect(nested.pendingMessageCount).toBe(0);
			expect(runtime.getStatus()).toMatchObject({
				retryPending: false,
				staleQueuedMessagesDiscarded: 1,
				notesDelivered: 0,
				deferredNotesPending: 0,
			});
		} finally {
			providerBarrier.release();
			await harness.dispose();
		}
	});
});
