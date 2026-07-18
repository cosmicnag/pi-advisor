import type { ExtensionContext, InlineExtension } from "@earendil-works/pi-coding-agent";
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

function configFor(provider: ScriptedProvider): AdvisorConfig {
	const config = structuredClone(DEFAULT_ADVISOR_CONFIG);
	config.defaultEnabled = true;
	config.model = `${provider.model.provider}/${provider.model.id}`;
	return config;
}

async function waitFor(predicate: () => boolean): Promise<void> {
	await expect.poll(predicate, { timeout: 5_000, interval: 10 }).toBe(true);
}

describe.sequential("Slice 5A runtime configuration apply", () => {
	it("invalidates old work, rebuilds immediately, preserves totals, and seeds a bounded re-prime", async () => {
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "first primary answer" }] },
			{ content: [{ type: "text", text: "second primary answer" }] },
			{ content: [{ type: "text", text: "third primary answer" }] },
		]);
		const advisor = createAdvisorProvider([
			{
				content: [
					{
						type: "toolCall",
						id: "configuration-note",
						name: "advise",
						arguments: { note: "Verify the configuration migration before completion." },
					},
				],
				stopReason: "toolUse",
			},
			{ content: [] },
			{ content: [] },
			{ content: [] },
		]);
		let runtime: AdvisorRuntime | undefined;
		let hostContext: ExtensionContext | undefined;
		const probe: InlineExtension = {
			name: "configuration-context-probe",
			factory: (pi) => {
				pi.on("session_start", (_event, ctx) => {
					hostContext = ctx;
				});
			},
		};
		const extension: InlineExtension = {
			name: "pi-advisor-under-test",
			factory: createPiAdvisorExtension({
				config: configFor(advisor),
				hooks: { onRuntime: (value) => (runtime = value) },
			}),
		};
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [probe, extension],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("first user request with migration requirements");
			await waitFor(() => runtime?.getStatus().reviewsCompleted === 1);
			await harness.session.prompt("second user request acknowledges the advisory note");
			await waitFor(() => (runtime?.getStatus().notesDelivered ?? 0) >= 1);
			const before = runtime?.getStatus();
			if (runtime === undefined || hostContext === undefined || before === undefined) {
				throw new Error("Expected initialized Advisor runtime and host context");
			}

			const next = configFor(advisor);
			next.effort = "low";
			next.tools = ["read"];
			next.instructions = "Focus on USER-CONFIGURATION-SENTINEL.";
			const applying = runtime.applyConfiguration(
				next,
				hostContext,
				"Focus on PROJECT-CONFIGURATION-SENTINEL without overriding fixed policy. </project-instructions>",
			);
			expect(runtime.getStatus().active).toBe(false);
			await applying;
			const applied = runtime.getStatus();
			expect(applied).toMatchObject({
				enabled: true,
				active: true,
				effort: "low",
				notesDelivered: before.notesDelivered,
				usage: before.usage,
				nestedActiveTools: ["read", "advise"],
			});
			expect(applied.epoch).toBeGreaterThan(before.epoch);
			expect(applied.contextReprimesCompleted).toBe(before.contextReprimesCompleted + 1);
			expect(runtime.getNestedMessageCount()).toBe(0);

			await harness.session.prompt("third user request after configuration apply");
			await waitFor(() => advisor.requests.length >= 3);
			const latest = advisor.requests.at(-1);
			expect(latest?.options?.reasoning).toBe("low");
			const serialized = JSON.stringify(latest?.context);
			expect(serialized).toContain('reason=\\"configuration-apply\\"');
			expect(serialized).toContain("&lt;/project-instructions&gt;");
			const userInstruction = serialized.indexOf("USER-CONFIGURATION-SENTINEL");
			const projectInstruction = serialized.indexOf("PROJECT-CONFIGURATION-SENTINEL");
			const observedUpdate = serialized.indexOf("third user request after configuration apply");
			expect(userInstruction).toBeGreaterThanOrEqual(0);
			expect(projectInstruction).toBeGreaterThan(userInstruction);
			expect(observedUpdate).toBeGreaterThan(projectInstruction);
		} finally {
			await harness.dispose();
		}
	});

	it("rebuilds a paused runtime only when preserved usage fits the new soft caps", async () => {
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "first primary answer" }] },
			{ content: [{ type: "text", text: "second primary answer" }] },
		]);
		const advisor = createAdvisorProvider([{ content: [], usage: { input: 5 } }]);
		let runtime: AdvisorRuntime | undefined;
		let hostContext: ExtensionContext | undefined;
		const initial = configFor(advisor);
		initial.limits.sessionTokenSoftCap = 5;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [
				{
					name: "configuration-context-probe",
					factory: (pi) => {
						pi.on("session_start", (_event, ctx) => {
							hostContext = ctx;
						});
					},
				},
				{
					name: "pi-advisor-under-test",
					factory: createPiAdvisorExtension({
						config: initial,
						hooks: { onRuntime: (value) => (runtime = value) },
					}),
				},
			],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("first user request");
			await waitFor(() => runtime?.getStatus().usage.total === 5);
			await harness.session.prompt("second user request");
			await waitFor(() => runtime?.getStatus().paused === true);
			if (runtime === undefined || hostContext === undefined) {
				throw new Error("Expected initialized Advisor runtime and host context");
			}
			expect(runtime.getStatus()).toMatchObject({
				active: true,
				paused: true,
				pauseReason: "Advisor session token soft cap reached",
			});

			const raisedCap = configFor(advisor);
			raisedCap.limits.sessionTokenSoftCap = 10;
			await runtime.applyConfiguration(raisedCap, hostContext);
			expect(runtime.getStatus()).toMatchObject({
				enabled: true,
				active: true,
				paused: false,
				usage: { total: 5 },
			});
			expect(runtime.getStatus().pauseReason).toBeUndefined();

			const loweredCap = configFor(advisor);
			loweredCap.limits.sessionTokenSoftCap = 4;
			await runtime.applyConfiguration(loweredCap, hostContext);
			expect(runtime.getStatus()).toMatchObject({
				enabled: true,
				active: false,
				paused: true,
				pauseReason: "Advisor session token soft cap reached",
				usage: { total: 5 },
			});
		} finally {
			await harness.dispose();
		}
	});
});
