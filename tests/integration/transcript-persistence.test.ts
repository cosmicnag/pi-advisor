import type { InlineExtension } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import {
	ADVISOR_TRANSCRIPT_ENTRY_TYPE,
	createPiAdvisorExtension,
	DEFAULT_ADVISOR_CONFIG,
	parsePersistedAdvisorTranscriptRecord,
	type AdvisorConfig,
	type AdvisorRuntime,
} from "../../src/index.js";
import { createSessionHarness } from "../fixtures/session-harness.js";
import {
	createAdvisorProvider,
	createPrimaryProvider,
	type ScriptedProvider,
} from "../fixtures/scripted-provider.js";

function configFor(provider: ScriptedProvider, transcript: boolean): AdvisorConfig {
	const config = structuredClone(DEFAULT_ADVISOR_CONFIG);
	config.defaultEnabled = true;
	config.model = `${provider.model.provider}/${provider.model.id}`;
	config.persistence.transcript = transcript;
	return config;
}

function extensionFor(
	config: AdvisorConfig,
	onRuntime: (runtime: AdvisorRuntime) => void,
): InlineExtension {
	return {
		name: "pi-advisor-transcript-persistence-test",
		factory: createPiAdvisorExtension({ config, hooks: { onRuntime } }),
	};
}

async function waitFor(predicate: () => boolean): Promise<void> {
	await expect.poll(predicate, { timeout: 5_000, interval: 10 }).toBe(true);
}

describe.sequential("Slice 4B optional transcript persistence", () => {
	it("does not append transcript records with the default-disabled policy", async () => {
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "ordinary answer" }] },
		]);
		const advisor = createAdvisorProvider([{ content: [] }]);
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [extensionFor(configFor(advisor, false), (value) => (runtime = value))],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("default persistence check");
			await waitFor(() => runtime?.getStatus().reviewsCompleted === 1);
			expect(
				harness.sessionManager
					.getBranch()
					.filter(
						(entry) =>
							entry.type === "custom" && entry.customType === ADVISOR_TRANSCRIPT_ENTRY_TYPE,
					),
			).toHaveLength(0);
			expect(runtime?.getStatus()).toMatchObject({
				transcriptPersistenceEnabled: false,
				transcriptRecordsPersisted: 0,
				transcriptPersistenceFailures: 0,
			});
		} finally {
			await harness.dispose();
		}
	});

	it("stores only bounded redacted records outside model context when explicitly enabled", async () => {
		const primary = createPrimaryProvider([
			{
				content: [
					{ type: "thinking", thinking: "EXECUTOR-PRIVATE-REASONING-SENTINEL" },
					{
						type: "text",
						text: "Visible result with API_KEY=persistence-secret-value",
					},
				],
			},
			{ content: [{ type: "text", text: "Primary context remained isolated." }] },
		]);
		const advisor = createAdvisorProvider([
			{
				content: [
					{ type: "thinking", thinking: "ADVISOR-PRIVATE-REASONING-SENTINEL" },
					{
						type: "toolCall",
						id: "persistence-read",
						name: "read",
						arguments: { path: "does-not-exist.txt" },
					},
				],
				stopReason: "toolUse",
				usage: { input: 10, output: 2, cacheRead: 3, cacheWrite: 4, costUsd: 0.01 },
			},
			{
				content: [
					{
						type: "toolCall",
						id: "persistence-advice",
						name: "advise",
						arguments: {
							note: "Verify the missing file before completion.",
							severity: "concern",
							intent: "review",
						},
					},
				],
				stopReason: "toolUse",
				usage: { input: 20, output: 3, costUsd: 0.02 },
			},
			{ content: [], usage: { input: 30, output: 4, costUsd: 0.03 } },
		]);
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			extensions: [extensionFor(configFor(advisor, true), (value) => (runtime = value))],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("persist a bounded review");
			await waitFor(() => runtime?.getStatus().reviewsCompleted === 1);
			const sessionId = harness.sessionManager.getSessionId();
			const entries = harness.sessionManager
				.getBranch()
				.filter(
					(entry) => entry.type === "custom" && entry.customType === ADVISOR_TRANSCRIPT_ENTRY_TYPE,
				);
			const records = entries.map((entry) => {
				if (entry.type !== "custom") throw new Error("Expected transcript custom entry");
				return parsePersistedAdvisorTranscriptRecord(entry.data, sessionId);
			});
			expect(records.every((record) => record !== undefined)).toBe(true);
			const serialized = JSON.stringify(records);
			expect(serialized).toContain('"kind":"update"');
			expect(serialized).toContain('"kind":"advisor-tool-call"');
			expect(serialized).toContain('"kind":"advisor-tool-result"');
			expect(serialized).toContain('"kind":"usage"');
			expect(serialized).toContain('"kind":"accepted-advice"');
			expect(serialized).toContain("[REDACTED]");
			expect(serialized).not.toContain("persistence-secret-value");
			expect(serialized).not.toContain("EXECUTOR-PRIVATE-REASONING-SENTINEL");
			expect(serialized).not.toContain("ADVISOR-PRIVATE-REASONING-SENTINEL");
			expect(serialized).not.toContain('"toolName":"advise"');
			expect(runtime?.getStatus()).toMatchObject({
				transcriptPersistenceEnabled: true,
				transcriptRecordsPersisted: entries.length,
				transcriptPersistenceFailures: 0,
				reviewRequests: 1,
				reviewsCompleted: 1,
				usage: {
					input: 30,
					output: 5,
					cacheRead: 3,
					cacheWrite: 4,
					total: 42,
					costUsd: 0.03,
				},
			});
			const dump = runtime?.formatDiagnosticsDump() ?? "";
			expect(dump).toContain("Verify the missing file before completion");
			expect(dump).toContain('"reasoningIncluded": false');
			expect(dump).not.toContain("EXECUTOR-PRIVATE-REASONING-SENTINEL");
			expect(dump).not.toContain("ADVISOR-PRIVATE-REASONING-SENTINEL");
			await runtime?.disable();
			await harness.session.prompt("inspect primary context after persisted records");
			const primaryContext = JSON.stringify(primary.requests[1]?.context.messages);
			expect(primaryContext).not.toContain(ADVISOR_TRANSCRIPT_ENTRY_TYPE);
			expect(primaryContext).not.toContain("Verify the missing file before completion");
			expect(primaryContext).not.toContain("ADVISOR-PRIVATE-REASONING-SENTINEL");
		} finally {
			await harness.dispose();
		}
	});
});
