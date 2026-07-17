import {
	defineTool,
	type CustomMessageEntry,
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
	createAdvisorProvider,
	createPrimaryProvider,
	type ScriptedProvider,
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
	onWarning?: (message: string) => void,
): InlineExtension {
	return {
		name: "pi-advisor-safety-test",
		factory: createPiAdvisorExtension({
			config,
			hooks: {
				onRuntime,
				...(onWarning === undefined ? {} : { onWarning }),
			},
		}),
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

function acceptedAdvice(
	note: string,
	id = "advise-1",
	severity: "nit" | "concern" | "blocker" = "concern",
) {
	return {
		content: [
			{
				type: "toolCall" as const,
				id,
				name: "advise",
				arguments: { note, severity, intent: "review" },
			},
		],
		stopReason: "toolUse" as const,
	};
}

describe.sequential("Advisor delivery and safety behavior through Slice 2 Batch A", () => {
	it("delivers a normal accepted note once through active steer and skips the resulting Advisor-generated turn", async () => {
		const primary = createPrimaryProvider([
			{
				content: [{ type: "toolCall", id: "hold-1", name: "hold", arguments: {} }],
				stopReason: "toolUse",
			},
			{ delayMs: 150, content: [{ type: "text", text: "Executor continued original work" }] },
			{ content: [{ type: "text", text: "Executor weighed peer guidance" }] },
		]);
		const advisor = createAdvisorProvider([
			acceptedAdvice("Verify the migration rollback before completion."),
			{ content: [] },
		]);
		const hold = defineTool({
			name: "hold",
			label: "hold",
			description: "Create a deterministic active Executor boundary.",
			parameters: Type.Object({}),
			execute: () =>
				Promise.resolve({ content: [{ type: "text" as const, text: "held" }], details: {} }),
		});
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [extensionFor(configFor(advisor), (value) => (runtime = value))],
			customTools: [hold],
			tools: ["hold"],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("start active delivery");
			await waitFor(
				() => primary.requests.length === 3 && runtime?.getStatus().notesDelivered === 1,
			);
			expect(JSON.stringify(primary.requests[2]?.context)).toContain(
				"Verify the migration rollback before completion.",
			);
			expect(advisor.requests).toHaveLength(2);
			expect(runtime?.getStatus()).toMatchObject({ notesDelivered: 1, reviewsCompleted: 2 });
		} finally {
			await harness.dispose();
		}
	});

	it("queues a normal accepted note with nextTurn while idle without triggering a completion", async () => {
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "terminal answer" }] },
			{ content: [{ type: "text", text: "next user answer" }] },
		]);
		const advisor = createAdvisorProvider([
			{ ...acceptedAdvice("Check the final artifact checksum."), delayMs: 100 },
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
			await harness.session.prompt("finish first turn");
			await waitFor(() => runtime?.getStatus().deferredNotesPending === 1);
			expect(primary.requests).toHaveLength(1);
			await harness.session.prompt("begin next user turn");
			expect(primary.requests).toHaveLength(2);
			expect(JSON.stringify(primary.requests[1]?.context)).toContain(
				"Check the final artifact checksum.",
			);
			await waitFor(() => runtime?.getStatus().reviewsCompleted === 2);
			expect(advisor.requests).toHaveLength(2);
		} finally {
			await harness.dispose();
		}
	});

	it("acknowledges valid content-free advice neutrally and records a silent suppression", async () => {
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "ordinary answer" }] },
		]);
		const advisor = createAdvisorProvider([acceptedAdvice("Looks good")]);
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [extensionFor(configFor(advisor), (value) => (runtime = value))],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("review for noise");
			await waitFor(() => runtime?.getStatus().reviewsCompleted === 1);
			expect(runtime?.getStatus()).toMatchObject({
				notesDelivered: 0,
				notesSuppressed: 1,
				silentReviews: 1,
			});
			expect(JSON.stringify(runtime?.getNestedMessages())).toContain("Recorded.");
			expect(JSON.stringify(harness.sessionManager.getEntries())).not.toContain("Looks good");
		} finally {
			await harness.dispose();
		}
	});

	it("delivers one bounded oversized note with metadata and no discarded primary content", async () => {
		const discarded = "DISCARDED-OVERSIZED-SENTINEL";
		const longNote = `${"Important verification detail. ".repeat(20)}${discarded}`;
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "answer before oversized advice" }] },
			{ content: [{ type: "text", text: "answer after oversized advice" }] },
		]);
		const advisor = createAdvisorProvider([acceptedAdvice(longNote)]);
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [
				extensionFor(
					configFor(advisor, (config) => {
						config.limits.maxAdviceCharacters = 120;
						config.limits.maxAdviceTokens = 30;
					}),
					(value) => (runtime = value),
				),
			],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("produce oversized advice");
			await waitFor(() => runtime?.getStatus().deferredNotesPending === 1);
			if (primary.requests.length === 1) {
				await harness.session.prompt("materialize deferred oversized advice");
			}
			const notes = harness.sessionManager
				.getEntries()
				.filter(
					(entry): entry is CustomMessageEntry =>
						entry.type === "custom_message" && entry.customType === "pi-advisor-note",
				);
			expect(notes).toHaveLength(1);
			const note = notes[0];
			if (note === undefined) throw new Error("Expected one Advisory note");
			expect(note.content).toContain("[Advisory note truncated to configured limit]");
			const details = note.details as Record<string, unknown>;
			expect(details.truncated).toBe(true);
			expect(details.originalCharacters).toBe(longNote.length);
			expect(JSON.stringify(notes)).not.toContain(discarded);
			expect(JSON.stringify(primary.requests[1]?.context)).not.toContain(discarded);
		} finally {
			await harness.dispose();
		}
	});

	it("invalidates an in-flight review when the user disables Advisor", async () => {
		const primary = createPrimaryProvider([{ content: [{ type: "text", text: "answer" }] }]);
		const advisor = createAdvisorProvider([
			{ ...acceptedAdvice("This result must be invalidated."), delayMs: 150 },
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
			await harness.session.prompt("start delayed review");
			await waitFor(() => advisor.activeRequests === 1);
			await harness.session.prompt("/advisor off");
			await waitFor(() => advisor.activeRequests === 0);
			expect(runtime?.getStatus()).toMatchObject({
				enabled: false,
				active: false,
				notesDelivered: 0,
			});
			expect(JSON.stringify(harness.sessionManager.getEntries())).not.toContain(
				"This result must be invalidated.",
			);
		} finally {
			await harness.dispose();
		}
	});

	it("counts and drops a provider failure without retry", async () => {
		const primary = createPrimaryProvider([{ content: [{ type: "text", text: "answer" }] }]);
		const advisor = createAdvisorProvider([{ errorMessage: "scripted provider failed" }]);
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [extensionFor(configFor(advisor), (value) => (runtime = value))],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("trigger provider failure");
			await waitFor(() => runtime?.getStatus().failedReviews === 1);
			expect(advisor.requests).toHaveLength(1);
			expect(runtime?.getNestedMessageCount()).toBe(0);
			expect(runtime?.getStatus()).toMatchObject({
				reviewsCompleted: 0,
				silentReviews: 0,
				failedReviews: 1,
				lastFailure: "scripted provider failed",
			});
		} finally {
			await harness.dispose();
		}
	});

	it("treats a well-formed read of a missing file as ordinary tool feedback", async () => {
		const primary = createPrimaryProvider([{ content: [{ type: "text", text: "answer" }] }]);
		const advisor = createAdvisorProvider([
			{
				content: [
					{
						type: "toolCall",
						id: "missing-read",
						name: "read",
						arguments: { path: "does-not-exist.txt" },
					},
				],
				stopReason: "toolUse",
			},
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
			await harness.session.prompt("allow ordinary read miss");
			await waitFor(() => runtime?.getStatus().reviewsCompleted === 1);
			expect(runtime?.getStatus()).toMatchObject({
				failedReviews: 0,
				silentReviews: 1,
				consecutiveFailures: 0,
			});
			expect(advisor.requests).toHaveLength(2);
		} finally {
			await harness.dispose();
		}
	});

	it("preserves the newest Executor delta when trusted project context is oversized", async () => {
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "NEWEST-EXECUTOR-CONTENT" }] },
		]);
		const advisor = createAdvisorProvider([{ content: [] }]);
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [
				extensionFor(
					configFor(advisor, (config) => {
						config.context.maxUpdateTokens = 100;
					}),
					(value) => (runtime = value),
				),
			],
			tools: [],
			mode: "rpc",
		});
		try {
			runtime?.captureContextFiles([{ path: "AGENTS.md", content: "P".repeat(2_000) }]);
			await harness.session.prompt("newest user content");
			await waitFor(() => advisor.requests.length === 1);
			const request = JSON.stringify(advisor.requests[0]?.context);
			expect(request).toContain("NEWEST-EXECUTOR-CONTENT");
			expect(request).toContain("Project instructions truncated");
		} finally {
			await harness.dispose();
		}
	});

	it("counts a malformed advise call as a failed update", async () => {
		const primary = createPrimaryProvider([{ content: [{ type: "text", text: "answer" }] }]);
		const advisor = createAdvisorProvider([
			{
				content: [
					{
						type: "toolCall",
						id: "malformed-advise",
						name: "advise",
						arguments: { severity: "concern" },
					},
				],
				stopReason: "toolUse",
			},
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
			await harness.session.prompt("trigger malformed advise");
			await waitFor(() => runtime?.getStatus().failedReviews === 1);
			expect(runtime?.getStatus().lastFailure).toContain("advise");
			expect(runtime?.getNestedMessageCount()).toBe(0);
			expect(runtime?.getStatus().notesDelivered).toBe(0);
		} finally {
			await harness.dispose();
		}
	});

	it("pauses after three consecutive failed updates and warns once", async () => {
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "answer 1" }] },
			{ content: [{ type: "text", text: "answer 2" }] },
			{ content: [{ type: "text", text: "answer 3" }] },
			{ content: [{ type: "text", text: "answer 4" }] },
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
					(warning) => warnings.push(warning),
				),
			],
			tools: [],
			mode: "rpc",
		});
		try {
			for (let index = 1; index <= 3; index++) {
				await harness.session.prompt(`failure turn ${String(index)}`);
				await waitFor(() => runtime?.getStatus().failedReviews === index);
			}
			expect(runtime?.getStatus()).toMatchObject({
				paused: true,
				consecutiveFailures: 3,
				failedReviews: 3,
				warnings: 1,
			});
			expect(warnings).toHaveLength(1);
			await harness.session.prompt("turn after pause");
			expect(advisor.requests).toHaveLength(3);
		} finally {
			await harness.dispose();
		}
	});

	it("crossing the token soft cap pauses review and warns once", async () => {
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "answer 1" }] },
			{ content: [{ type: "text", text: "answer 2" }] },
		]);
		const advisor = createAdvisorProvider([{ content: [], usage: { input: 3, output: 2 } }]);
		const warnings: string[] = [];
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [
				extensionFor(
					configFor(advisor, (config) => {
						config.limits.sessionTokenSoftCap = 5;
					}),
					(value) => (runtime = value),
					(warning) => warnings.push(warning),
				),
			],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("cross token cap");
			await waitFor(() => runtime?.getStatus().paused === true);
			expect(runtime?.getStatus()).toMatchObject({
				pauseReason: "Advisor session token soft cap reached",
				warnings: 1,
			});
			expect(runtime?.getStatus().usage.total).toBe(5);
			expect(warnings).toHaveLength(1);
			await harness.session.prompt("after token cap");
			expect(advisor.requests).toHaveLength(1);
		} finally {
			await harness.dispose();
		}
	});

	it("preserves an exhausted soft cap across branch invalidation and enable without reset", async () => {
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "first answer" }] },
			{ content: [{ type: "text", text: "second answer" }] },
		]);
		const advisor = createAdvisorProvider([
			{ delayMs: 100, content: [], usage: { input: 3, output: 2 } },
		]);
		let runtime: AdvisorRuntime | undefined;
		let hostContext: ExtensionContext | undefined;
		const contextCapture: InlineExtension = {
			name: "capture-extension-context",
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
						config.limits.sessionTokenSoftCap = 5;
					}),
					(value) => (runtime = value),
				),
			],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("cross cap before branch mismatch");
			await waitFor(() => advisor.activeRequests === 1);
			const firstEntry = harness.sessionManager.getBranch()[0];
			if (firstEntry === undefined) throw new Error("Expected a primary branch entry");
			harness.sessionManager.branch(firstEntry.id);
			await waitFor(
				() => runtime?.getStatus().paused === true && runtime.getStatus().branchResets === 1,
			);
			const exhausted = runtime?.getStatus();
			expect(exhausted?.pauseReason).toBe("Advisor session token soft cap reached");
			expect(exhausted?.usage.total).toBe(5);
			if (hostContext === undefined) throw new Error("Expected captured extension context");
			await runtime?.enable(hostContext, "session-command", false);
			const preserved = runtime?.getStatus();
			expect(preserved?.paused).toBe(true);
			expect(preserved?.usage.total).toBe(5);
			await harness.session.prompt("no paid review while exhausted");
			expect(advisor.requests).toHaveLength(1);
		} finally {
			await harness.dispose();
		}
	});

	it("enforces the per-update tool governor", async () => {
		const primary = createPrimaryProvider([{ content: [{ type: "text", text: "answer" }] }]);
		const advisor = createAdvisorProvider([
			{
				content: [
					{
						type: "toolCall",
						id: "read-over-limit",
						name: "read",
						arguments: { path: "README.md" },
					},
				],
				stopReason: "toolUse",
			},
		]);
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [
				extensionFor(
					configFor(advisor, (config) => {
						config.limits.maxToolCallsPerUpdate = 0;
					}),
					(value) => (runtime = value),
				),
			],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("start governed review");
			await waitFor(() => (runtime?.getStatus().failedReviews ?? 0) >= 1);
			expect(runtime?.getStatus().lastFailure).toBe("Advisor tool-call limit reached");
		} finally {
			await harness.dispose();
		}
	});

	it("bounds coalesced pending transcript bytes", async () => {
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "first answer" }] },
			{ content: [{ type: "text", text: "x".repeat(500) }] },
		]);
		const advisor = createAdvisorProvider([{ delayMs: 100, content: [] }, { content: [] }]);
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [
				extensionFor(
					configFor(advisor, (config) => {
						config.limits.maxPendingTranscriptBytes = 80;
					}),
					(value) => (runtime = value),
				),
			],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("start delayed review");
			await waitFor(() => advisor.activeRequests === 1);
			await harness.session.prompt("coalesce a large update");
			await waitFor(() => runtime?.getStatus().reviewsCompleted === 2);
			expect(runtime?.getStatus().maxPendingTranscriptBytesObserved).toBeLessThanOrEqual(80);
			expect(JSON.stringify(advisor.requests[1]?.context)).toContain("xxxxx");
		} finally {
			await harness.dispose();
		}
	});

	it("enforces the per-update turn governor", async () => {
		const primary = createPrimaryProvider([{ content: [{ type: "text", text: "answer" }] }]);
		const advisor = createAdvisorProvider([
			{
				content: [
					{ type: "toolCall", id: "ls-at-turn-limit", name: "ls", arguments: { path: "." } },
				],
				stopReason: "toolUse",
			},
		]);
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [
				extensionFor(
					configFor(advisor, (config) => {
						config.limits.maxAdvisorTurnsPerUpdate = 1;
					}),
					(value) => (runtime = value),
				),
			],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("start turn-governed review");
			await waitFor(() => runtime?.getStatus().failedReviews === 1);
			expect(runtime?.getStatus().lastFailure).toBe("Advisor turn limit reached");
			expect(advisor.requests).toHaveLength(1);
		} finally {
			await harness.dispose();
		}
	});

	it("pauses before submission when the configured context fraction and reserve are exhausted", async () => {
		const primary = createPrimaryProvider([{ content: [{ type: "text", text: "answer" }] }]);
		const advisor = createAdvisorProvider([]);
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [
				extensionFor(
					configFor(advisor, (config) => {
						config.context.maxFraction = 0.01;
						config.context.reserveTokens = advisor.model.contextWindow;
					}),
					(value) => (runtime = value),
				),
			],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("exhaust context policy");
			await waitFor(() => runtime?.getStatus().paused === true);
			expect(runtime?.getStatus().pauseReason).toBe(
				"Advisor context fraction or response reserve reached",
			);
			expect(advisor.requests).toHaveLength(0);
		} finally {
			await harness.dispose();
		}
	});

	it("crossing the cost soft cap pauses review when cost is reported", async () => {
		const primary = createPrimaryProvider([{ content: [{ type: "text", text: "answer" }] }]);
		const advisor = createAdvisorProvider([
			{ content: [], usage: { input: 1, output: 1, costUsd: 0.75 } },
		]);
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [
				extensionFor(
					configFor(advisor, (config) => {
						config.limits.sessionCostSoftCapUsd = 0.5;
					}),
					(value) => (runtime = value),
				),
			],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("cross cost cap");
			await waitFor(() => runtime?.getStatus().paused === true);
			expect(runtime?.getStatus()).toMatchObject({
				pauseReason: "Advisor session cost soft cap reached",
				warnings: 1,
			});
			expect(runtime?.getStatus().usage.costUsd).toBe(0.75);
		} finally {
			await harness.dispose();
		}
	});

	it("accepts at most one note from multiple valid advise calls in one update", async () => {
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "answer" }] },
			{ content: [{ type: "text", text: "Executor response to one note" }] },
		]);
		const advisor = createAdvisorProvider([
			{
				content: [
					{
						type: "toolCall",
						id: "first-advice",
						name: "advise",
						arguments: { note: "First material note." },
					},
					{
						type: "toolCall",
						id: "second-advice",
						name: "advise",
						arguments: { note: "Second material note." },
					},
				],
				stopReason: "toolUse",
			},
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
			await harness.session.prompt("request one note maximum");
			await waitFor(() => runtime?.getStatus().deferredNotesPending === 1);
			expect(runtime?.getStatus()).toMatchObject({ notesDelivered: 0, notesSuppressed: 1 });
			if (primary.requests.length === 1) await harness.session.prompt("materialize one note");
			const primaryContext = JSON.stringify(primary.requests.at(-1)?.context);
			expect(primaryContext).toContain("First material note.");
			expect(primaryContext).not.toContain("Second material note.");
		} finally {
			await harness.dispose();
		}
	});

	it("treats an empty Advisor completion as successful silence without retry", async () => {
		const primary = createPrimaryProvider([{ content: [{ type: "text", text: "answer" }] }]);
		const advisor = createAdvisorProvider([{ content: [] }]);
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [extensionFor(configFor(advisor), (value) => (runtime = value))],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("allow empty silence");
			await waitFor(() => runtime?.getStatus().silentReviews === 1);
			expect(advisor.requests).toHaveLength(1);
			expect(runtime?.getStatus()).toMatchObject({ failedReviews: 0, notesDelivered: 0 });
		} finally {
			await harness.dispose();
		}
	});

	it("suppresses a normalized duplicate across Advisor updates", async () => {
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "first terminal answer" }] },
			{ content: [{ type: "text", text: "second terminal answer" }] },
			{ content: [{ type: "text", text: "third terminal answer" }] },
		]);
		const advisor = createAdvisorProvider([
			acceptedAdvice("Verify the rollback path!", "dedupe-1"),
			acceptedAdvice("  VERIFY the rollback path... ", "dedupe-2"),
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
			await harness.session.prompt("first reviewed turn");
			await waitFor(() => runtime?.getStatus().deferredNotesPending === 1);
			await harness.session.prompt("second reviewed turn");
			await waitFor(() => runtime?.getStatus().reviewsCompleted === 2);
			expect(runtime?.getStatus()).toMatchObject({
				notesDelivered: 1,
				notesSuppressed: 1,
			});
			await harness.session.prompt("inspect duplicate outcome");
			const context = JSON.stringify(primary.requests.at(-1)?.context);
			expect(context.match(/Verify the rollback path/giu)).toHaveLength(1);
			expect(context).not.toContain("VERIFY the rollback path");
		} finally {
			await harness.dispose();
		}
	});

	it("marks advice stale when the Executor advances beyond the reviewed window", async () => {
		const advisorBarrier = createBarrier();
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "first answer" }] },
			{ content: [{ type: "text", text: "newer answer" }] },
			{ content: [{ type: "text", text: "answer after stale advice" }] },
		]);
		const advisor = createAdvisorProvider([
			{ ...acceptedAdvice("Recheck the earlier assumption."), waitFor: advisorBarrier.promise },
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
			await harness.session.prompt("first turn starts review");
			await waitFor(() => advisor.activeRequests === 1);
			await harness.session.prompt("advance while review is running");
			expect(primary.requests).toHaveLength(2);
			advisorBarrier.release();
			await waitFor(() => runtime?.getStatus().deferredNotesPending === 1);
			await harness.session.prompt("materialize stale advice");
			const context = JSON.stringify(primary.requests.at(-1)?.context);
			expect(context).toContain("potentially stale");
			expect(context).toContain("verify this still applies");
			const note = harness.sessionManager
				.getEntries()
				.find(
					(entry): entry is CustomMessageEntry =>
						entry.type === "custom_message" && entry.customType === "pi-advisor-note",
				);
			expect(note?.details).toMatchObject({ stale: true, delivery: "deferred" });
		} finally {
			advisorBarrier.release();
			await harness.dispose();
		}
	});

	it("recomputes deferred staleness when the branch advances before materialization", async () => {
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "reviewed answer" }] },
			{ content: [{ type: "text", text: "answer after buffered activity" }] },
		]);
		const advisor = createAdvisorProvider([
			acceptedAdvice("Recheck this after buffered branch activity."),
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
			await harness.session.prompt("create current deferred advice");
			await waitFor(() => runtime?.getStatus().deferredNotesPending === 1);
			harness.sessionManager.appendMessage({
				role: "user",
				content: "buffered user shell activity",
				timestamp: Date.now(),
			});
			await harness.session.prompt("materialize after buffered activity");
			const context = JSON.stringify(primary.requests[1]?.context);
			expect(context).toContain("[Advisor concern - deferred - potentially stale]");
			expect(context).toContain("verify this still applies");
			const note = harness.sessionManager
				.getEntries()
				.find(
					(entry): entry is CustomMessageEntry =>
						entry.type === "custom_message" && entry.customType === "pi-advisor-note",
				);
			expect(note?.details).toMatchObject({ stale: true, delivery: "deferred" });
		} finally {
			await harness.dispose();
		}
	});

	it("injects multiple deferred notes once in one bounded next-turn message", async () => {
		const advisorBarrier = createBarrier();
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "first answer" }] },
			{ content: [{ type: "text", text: "second answer" }] },
			{ content: [{ type: "text", text: "answer after deferred batch" }] },
		]);
		const advisor = createAdvisorProvider([
			{
				...acceptedAdvice("First deferred issue.", "deferred-1"),
				waitFor: advisorBarrier.promise,
			},
			acceptedAdvice("Second deferred issue.", "deferred-2", "nit"),
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
			await harness.session.prompt("start first deferred review");
			await waitFor(() => advisor.activeRequests === 1);
			await harness.session.prompt("coalesce another reviewed turn");
			expect(primary.requests).toHaveLength(2);
			advisorBarrier.release();
			await waitFor(() => runtime?.getStatus().deferredNotesPending === 2);
			await harness.session.prompt("materialize deferred batch");
			const context = JSON.stringify(primary.requests.at(-1)?.context);
			expect(context).toContain("First deferred issue.");
			expect(context).toContain("Second deferred issue.");
			const notes = harness.sessionManager
				.getEntries()
				.filter(
					(entry): entry is CustomMessageEntry =>
						entry.type === "custom_message" && entry.customType === "pi-advisor-note",
				);
			expect(notes).toHaveLength(1);
			expect(notes[0]?.details).toMatchObject({
				notes: [{ note: "First deferred issue." }, { note: "Second deferred issue." }],
			});
			expect(runtime?.getStatus()).toMatchObject({
				notesDelivered: 2,
				deferredNotesPending: 0,
			});
		} finally {
			advisorBarrier.release();
			await harness.dispose();
		}
	});

	it("defers advice after any aborted Executor turn until the next user prompt", async () => {
		const advisorBarrier = createBarrier();
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "first answer" }] },
			{ delayMs: 10_000 },
			{ content: [{ type: "text", text: "answer after interruption" }] },
		]);
		const advisor = createAdvisorProvider([
			{
				...acceptedAdvice("Inspect the interrupted work before continuing."),
				waitFor: advisorBarrier.promise,
			},
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
			await harness.session.prompt("start review before interruption");
			await waitFor(() => advisor.activeRequests === 1);
			const interrupted = harness.session.prompt("interrupt this Executor turn");
			await waitFor(() => primary.activeRequests === 1);
			await harness.session.abort();
			await interrupted;
			advisorBarrier.release();
			await waitFor(() => runtime?.getStatus().deferredNotesPending === 1);
			expect(primary.requests).toHaveLength(2);
			expect(JSON.stringify(harness.sessionManager.getEntries())).not.toContain(
				"Inspect the interrupted work before continuing.",
			);
			await harness.session.prompt("resume after interruption");
			const resumedContext = JSON.stringify(primary.requests[2]?.context);
			expect(resumedContext).toContain("[Advisor concern - deferred - potentially stale]");
			expect(resumedContext).toContain("verify this still applies");
		} finally {
			advisorBarrier.release();
			await harness.dispose();
		}
	});

	it("defers advice after the abort signal before aborted turn_end handling", async () => {
		const advisorBarrier = createBarrier();
		const abortedTurnEndBarrier = createBarrier();
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "first answer" }] },
			{ delayMs: 10_000, waitAfterAbort: abortedTurnEndBarrier.promise },
			{ content: [{ type: "text", text: "answer after signal-first interruption" }] },
		]);
		const advisor = createAdvisorProvider([
			{
				...acceptedAdvice("Keep this signal-first interruption advice deferred."),
				waitFor: advisorBarrier.promise,
			},
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
			await harness.session.prompt("start review before signal-first interruption");
			await waitFor(() => advisor.activeRequests === 1);
			const interrupted = harness.session.prompt("abort before turn_end can run");
			await waitFor(() => primary.activeRequests === 1);
			const aborting = harness.session.abort();
			await waitFor(() => primary.requests[1]?.options?.signal?.aborted === true);
			advisorBarrier.release();
			await waitFor(() => runtime?.getStatus().deferredNotesPending === 1);
			expect(primary.activeRequests).toBe(1);
			expect(runtime?.getStatus()).toMatchObject({ notesDelivered: 0 });
			expect(JSON.stringify(harness.sessionManager.getEntries())).not.toContain(
				"Keep this signal-first interruption advice deferred.",
			);
			abortedTurnEndBarrier.release();
			await Promise.all([aborting, interrupted]);
			await harness.session.prompt("resume after signal-first interruption");
			const context = JSON.stringify(primary.requests[2]?.context);
			expect(context.match(/Keep this signal-first interruption advice deferred\./gu)).toHaveLength(
				1,
			);
			expect(runtime?.getStatus()).toMatchObject({
				notesDelivered: 1,
				deferredNotesPending: 0,
			});
		} finally {
			advisorBarrier.release();
			abortedTurnEndBarrier.release();
			await harness.dispose();
		}
	});

	it("keeps an aborted turn's in-flight review deferred when the next turn starts first", async () => {
		const advisorBarrier = createBarrier();
		const nextTurnBarrier = createBarrier();
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "first answer" }] },
			{ delayMs: 10_000 },
			{
				waitFor: nextTurnBarrier.promise,
				content: [{ type: "text", text: "answer before late review" }],
			},
			{ content: [{ type: "text", text: "answer after deferred review" }] },
		]);
		const advisor = createAdvisorProvider([
			{
				...acceptedAdvice("Preserve this interrupted review."),
				waitFor: advisorBarrier.promise,
			},
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
			await harness.session.prompt("start review before interruption");
			await waitFor(() => advisor.activeRequests === 1);
			const interrupted = harness.session.prompt("interrupt this Executor turn");
			await waitFor(() => primary.activeRequests === 1);
			await harness.session.abort();
			await interrupted;
			expect(advisor.activeRequests).toBe(1);
			const nextTurn = harness.session.prompt("start next turn before review finishes");
			await waitFor(() => primary.activeRequests === 1);
			expect(primary.requests).toHaveLength(3);
			advisorBarrier.release();
			await waitFor(() => runtime?.getStatus().deferredNotesPending === 1);
			expect(JSON.stringify(primary.requests[2]?.context)).not.toContain(
				"Preserve this interrupted review.",
			);
			nextTurnBarrier.release();
			await nextTurn;
			await harness.session.prompt("materialize interrupted review");
			expect(JSON.stringify(primary.requests[3]?.context)).toContain(
				"Preserve this interrupted review.",
			);
		} finally {
			advisorBarrier.release();
			nextTurnBarrier.release();
			await harness.dispose();
		}
	});

	it("clears deferred advice when the active branch changes", async () => {
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "branch answer" }] },
			{ content: [{ type: "text", text: "alternate branch answer" }] },
		]);
		const advisor = createAdvisorProvider([
			acceptedAdvice("Advice for the abandoned branch only."),
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
			await harness.session.prompt("create advice on original branch");
			await waitFor(() => runtime?.getStatus().deferredNotesPending === 1);
			const firstEntry = harness.sessionManager.getBranch()[0];
			if (firstEntry === undefined) throw new Error("Expected original branch entry");
			await harness.session.navigateTree(firstEntry.id, { summarize: false });
			expect(runtime?.getStatus()).toMatchObject({
				branchResets: 1,
				deferredNotesPending: 0,
				notesDelivered: 0,
			});
			await harness.session.prompt("continue alternate branch");
			expect(JSON.stringify(primary.requests.at(-1)?.context)).not.toContain(
				"Advice for the abandoned branch only.",
			);
		} finally {
			await harness.dispose();
		}
	});

	it("invalidates branch-local state when navigation returns to the observation cursor", async () => {
		const branchAdvice = "Do not leak this across explicit navigation.";
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "reviewed answer" }] },
			{ content: [{ type: "text", text: "answer after navigation" }] },
		]);
		const advisor = createAdvisorProvider([
			acceptedAdvice(branchAdvice, "cursor-matching-advice"),
			acceptedAdvice(branchAdvice, "advice-after-navigation"),
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
			await harness.session.prompt("create branch-local advice");
			await waitFor(() => runtime?.getStatus().deferredNotesPending === 1);
			const observedLeaf = harness.sessionManager.getBranch().at(-1);
			if (observedLeaf === undefined) throw new Error("Expected observed branch leaf");
			harness.sessionManager.appendMessage({
				role: "user",
				content: "temporary descendant",
				timestamp: Date.now(),
			});
			await harness.session.navigateTree(observedLeaf.id, { summarize: false });
			expect(runtime?.getStatus()).toMatchObject({
				branchResets: 1,
				deferredNotesPending: 0,
				notesDelivered: 0,
			});
			await harness.session.prompt("continue after explicit navigation");
			expect(JSON.stringify(primary.requests[1]?.context)).not.toContain(branchAdvice);
			await waitFor(() => runtime?.getStatus().deferredNotesPending === 1);
			expect(runtime?.getStatus().notesSuppressed).toBe(0);
		} finally {
			await harness.dispose();
		}
	});

	it("invalidates deferred advice and dedupe on explicit forward navigation", async () => {
		const branchAdvice = "Revalidate the branch-local migration.";
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "original descendant answer" }] },
			{ content: [{ type: "text", text: "alternate descendant answer" }] },
			{ content: [{ type: "text", text: "continued original descendant" }] },
		]);
		const advisor = createAdvisorProvider([
			{ content: [] },
			acceptedAdvice(branchAdvice, "alternate-branch-advice"),
			acceptedAdvice(branchAdvice, "original-branch-advice"),
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
			await harness.session.prompt("create original descendant");
			await waitFor(() => runtime?.getStatus().reviewsCompleted === 1);
			const originalBranch = harness.sessionManager.getBranch();
			const ancestor = originalBranch[0];
			const originalLeaf = originalBranch.at(-1);
			if (ancestor === undefined || originalLeaf === undefined) {
				throw new Error("Expected original branch entries");
			}
			await harness.session.navigateTree(ancestor.id, { summarize: false });
			await harness.session.prompt("create alternate descendant advice");
			await waitFor(() => runtime?.getStatus().deferredNotesPending === 1);

			await harness.session.navigateTree(originalLeaf.id, { summarize: false });
			expect(runtime?.getStatus()).toMatchObject({
				branchResets: 2,
				deferredNotesPending: 0,
				notesDelivered: 0,
			});
			await harness.session.prompt("continue original descendant");
			expect(JSON.stringify(primary.requests[2]?.context)).not.toContain(branchAdvice);
			await waitFor(() => runtime?.getStatus().deferredNotesPending === 1);
			expect(runtime?.getStatus().notesSuppressed).toBe(0);
		} finally {
			await harness.dispose();
		}
	});

	it.each(["nit", "blocker"] as const)(
		"delivers an active %s at the same steering boundary",
		async (severity) => {
			const executorBarrier = createBarrier();
			const primary = createPrimaryProvider([
				{
					content: [{ type: "toolCall", id: `hold-${severity}`, name: "hold", arguments: {} }],
					stopReason: "toolUse",
				},
				{
					waitFor: executorBarrier.promise,
					content: [{ type: "text", text: "Executor continued" }],
				},
				{ content: [{ type: "text", text: "Executor weighed guidance" }] },
			]);
			const advisor = createAdvisorProvider([
				acceptedAdvice(`Active ${severity} guidance.`, `active-${severity}`, severity),
				{ content: [] },
			]);
			const hold = defineTool({
				name: "hold",
				label: "hold",
				description: "Create a deterministic active Executor boundary.",
				parameters: Type.Object({}),
				execute: () =>
					Promise.resolve({ content: [{ type: "text" as const, text: "held" }], details: {} }),
			});
			let runtime: AdvisorRuntime | undefined;
			const harness = await createSessionHarness({
				provider: primary,
				advisorProvider: advisor,
				extensions: [extensionFor(configFor(advisor), (value) => (runtime = value))],
				customTools: [hold],
				tools: ["hold"],
				mode: "rpc",
			});
			try {
				const prompt = harness.session.prompt(`start active ${severity}`);
				await waitFor(
					() => primary.requests.length === 2 && runtime?.getStatus().notesDelivered === 1,
				);
				executorBarrier.release();
				await prompt;
				expect(primary.requests).toHaveLength(3);
				expect(JSON.stringify(primary.requests[2]?.context)).toContain(
					`[Advisor ${severity} - active]`,
				);
			} finally {
				executorBarrier.release();
				await harness.dispose();
			}
		},
	);

	it("delivers a deferred blocker without triggering a completion", async () => {
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "terminal answer" }] },
			{ content: [{ type: "text", text: "next user answer" }] },
		]);
		const advisor = createAdvisorProvider([
			acceptedAdvice("Do not ship the invalid migration.", "late-blocker", "blocker"),
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
			await harness.session.prompt("finish terminal answer");
			await waitFor(() => runtime?.getStatus().deferredNotesPending === 1);
			expect(primary.requests).toHaveLength(1);
			await harness.session.prompt("next user-driven turn");
			expect(JSON.stringify(primary.requests[1]?.context)).toContain(
				"[Advisor blocker - deferred]",
			);
		} finally {
			await harness.dispose();
		}
	});

	it("disposes nested resources on shutdown", async () => {
		const primary = createPrimaryProvider([]);
		const advisor = createAdvisorProvider([]);
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [extensionFor(configFor(advisor), (value) => (runtime = value))],
			tools: [],
			mode: "rpc",
		});
		try {
			expect(runtime?.getNestedMessageCount()).toBe(0);
			await runtime?.shutdown();
			expect(runtime?.getStatus()).toMatchObject({ enabled: false, active: false });
			expect(runtime?.getNestedMessageCount()).toBe(0);
		} finally {
			await harness.dispose();
		}
	});
});
