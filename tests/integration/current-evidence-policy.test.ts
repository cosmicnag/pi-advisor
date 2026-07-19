import { defineTool, type InlineExtension } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { describe, expect, it } from "vitest";

import {
	ADVISOR_TRANSCRIPT_ENTRY_TYPE,
	ADVISOR_TRANSCRIPT_RECORD_VERSION,
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

function configFor(provider: ScriptedProvider): AdvisorConfig {
	const config = structuredClone(DEFAULT_ADVISOR_CONFIG);
	config.defaultEnabled = true;
	config.model = `${provider.model.provider}/${provider.model.id}`;
	return config;
}

function extensionFor(
	config: AdvisorConfig,
	onRuntime: (runtime: AdvisorRuntime) => void,
): InlineExtension {
	return {
		name: "pi-advisor-current-evidence-policy-test",
		factory: createPiAdvisorExtension({ config, hooks: { onRuntime } }),
	};
}

function advice(
	note: string,
	findingKey: string,
	id: string,
	severity: "nit" | "concern" | "blocker" = "concern",
) {
	return {
		content: [
			{
				type: "toolCall" as const,
				id,
				name: "advise",
				arguments: { note, findingKey, severity, intent: "review" },
			},
		],
		stopReason: "toolUse" as const,
	};
}

function createBarrier(): { promise: Promise<void>; release: () => void } {
	let release: () => void = () => undefined;
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { promise, release };
}

async function waitFor(predicate: () => boolean): Promise<void> {
	await expect.poll(predicate, { timeout: 5_000, interval: 10 }).toBe(true);
}

describe.sequential("current implementation evidence review policy", () => {
	it("actively steers a scripted concrete defect after current implementation evidence", async () => {
		const executorBarrier = createBarrier();
		const concreteDefect =
			"The cancel path writes configuration before confirmation, so cancel is not atomic.";
		const primary = createPrimaryProvider([
			{
				content: [
					{ type: "toolCall", id: "inspect-implementation", name: "inspect", arguments: {} },
				],
				stopReason: "toolUse",
			},
			{
				waitFor: executorBarrier.promise,
				content: [{ type: "text", text: "Continuing after the implementation inspection." }],
			},
			{ content: [{ type: "text", text: "Corrected the cancel path before completion." }] },
		]);
		const advisor = createAdvisorProvider([
			advice(
				concreteDefect,
				"cancel mutates configuration before confirmation",
				"concrete-defect",
				"blocker",
			),
			{ content: [] },
		]);
		const inspect = defineTool({
			name: "inspect",
			label: "inspect",
			description: "Return deterministic current implementation evidence.",
			parameters: Type.Object({}),
			execute: () =>
				Promise.resolve({
					content: [
						{
							type: "text" as const,
							text: "Observed implementation: cancel writes WATCHDOG.yml before the confirmation result is checked.",
						},
					],
					details: {},
				}),
		});
		const config = configFor(advisor);
		config.persistence.transcript = true;
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [extensionFor(config, (value) => (runtime = value))],
			customTools: [inspect],
			tools: ["inspect"],
			mode: "rpc",
		});
		try {
			const prompt = harness.session.prompt(
				"Current explicit workflow: implement this slice, run the requested review, repair findings, then create the PR. Historical recalled workflow: load the named Blaze skill and use its equivalent review gate. Inspect the current implementation for concrete defects.",
			);
			await waitFor(
				() => primary.requests.length === 2 && runtime?.getStatus().activeNotesPending === 1,
			);

			const request = advisor.requests[0];
			const context = JSON.stringify(request?.context);
			expect(context).toContain("Current explicit workflow");
			expect(context).toContain("Blaze skill");
			expect(context).toContain("cancel writes WATCHDOG.yml");
			expect(request?.context.systemPrompt).toContain(
				"Prioritize current code, UX, cancellation, atomicity, tests, safety, correctness, and scope evidence",
			);
			expect(request?.context.systemPrompt).toContain(
				"equivalent workflows need no remembered skill or process name",
			);
			expect(request?.context.systemPrompt).toContain(
				"The findingKey is authoritative for repeat suppression regardless of note wording or severity",
			);

			executorBarrier.release();
			await prompt;
			const steeredContext = JSON.stringify(primary.requests[2]?.context);
			expect(steeredContext).toContain(concreteDefect);
			expect(steeredContext).toContain(
				'severity=\\"blocker\\" delivery=\\"active\\" stale=\\"false\\"',
			);
			expect(runtime?.getStatus()).toMatchObject({ notesDelivered: 1, activeNotesPending: 0 });

			const acceptedRecord = harness.sessionManager
				.getBranch()
				.find(
					(entry) =>
						entry.type === "custom" &&
						entry.customType === ADVISOR_TRANSCRIPT_ENTRY_TYPE &&
						(entry.data as { kind?: unknown }).kind === "accepted-advice",
				);
			if (acceptedRecord?.type !== "custom") {
				throw new Error("Expected accepted advice transcript record");
			}
			expect(acceptedRecord.data).toMatchObject({
				version: ADVISOR_TRANSCRIPT_RECORD_VERSION,
				kind: "accepted-advice",
				advice: { note: concreteDefect, severity: "blocker" },
			});
			expect(JSON.stringify(acceptedRecord.data)).not.toContain("findingKeyHash");
		} finally {
			executorBarrier.release();
			await harness.dispose();
		}
	});

	it("defers scripted concrete advice and preserves observed review-before-PR chronology", async () => {
		const concreteDefect = "The new cancellation branch leaves the temporary file behind.";
		const primary = createPrimaryProvider([
			{
				content: [
					{
						type: "text",
						text: "Review result at 10:00: NO ISSUES. PR creation completed at 10:01. Current implementation evidence: cancellation leaves WATCHDOG.yml.tmp behind.",
					},
				],
			},
			{ content: [{ type: "text", text: "Removed the temporary file on cancellation." }] },
		]);
		const advisor = createAdvisorProvider([
			advice(concreteDefect, "cancellation leaks temporary configuration file", "deferred-defect"),
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
			await harness.session.prompt(
				"Follow this complete custom workflow: implement, obtain review, then create the PR. A recalled summary names the equivalent Blaze workflow, but this request does not invoke it.",
			);
			await waitFor(() => runtime?.getStatus().deferredNotesPending === 1);
			expect(primary.requests).toHaveLength(1);

			const observed = JSON.stringify(advisor.requests[0]?.context);
			expect(observed.indexOf("Review result at 10:00")).toBeLessThan(
				observed.indexOf("PR creation completed at 10:01"),
			);
			expect(advisor.requests[0]?.context.systemPrompt).toContain(
				"verify the latest User request and newest Executor actions, tool results, and review results",
			);

			await harness.session.prompt("Apply current concrete advice only.");
			const delivered = JSON.stringify(primary.requests[1]?.context);
			expect(delivered).toContain(concreteDefect);
			expect(delivered).toContain(
				'severity=\\"concern\\" delivery=\\"deferred\\" stale=\\"true\\"',
			);
		} finally {
			await harness.dispose();
		}
	});

	it("suppresses semantic paraphrases across consecutive updates", async () => {
		const first = "The historical Blaze workflow requires loading the Blaze skill by name.";
		const paraphrase = "Invoke the remembered Blaze skill explicitly to satisfy its process.";
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "first terminal answer" }] },
			{ content: [{ type: "text", text: "second terminal answer" }] },
			{ content: [{ type: "text", text: "third terminal answer" }] },
		]);
		const advisor = createAdvisorProvider([
			advice(first, "historical named workflow invocation", "workflow-one", "nit"),
			advice(paraphrase, "historical named workflow invocation", "workflow-two", "blocker"),
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
			await harness.session.prompt("first reviewed update");
			await waitFor(() => runtime?.getStatus().deferredNotesPending === 1);
			await harness.session.prompt("second reviewed update");
			await waitFor(() => runtime?.getStatus().reviewsCompleted === 2);
			expect(runtime?.getStatus()).toMatchObject({
				notesDelivered: 1,
				deferredNotesPending: 0,
				notesSuppressed: 1,
			});

			await harness.session.prompt("inspect coalesced outcome");
			const executorContext = JSON.stringify(primary.requests[2]?.context);
			expect(executorContext).toContain(first);
			expect(executorContext).not.toContain(paraphrase);
		} finally {
			await harness.dispose();
		}
	});
});
