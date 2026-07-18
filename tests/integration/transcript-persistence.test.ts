import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { SessionManager, type InlineExtension } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import {
	ADVISOR_TRANSCRIPT_ENTRY_TYPE,
	createPiAdvisorExtension,
	DEFAULT_ADVISOR_CONFIG,
	MAX_PERSISTED_TRANSCRIPT_RECORD_BYTES,
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

function createBarrier(): { promise: Promise<void>; release: () => void } {
	let release: () => void = () => undefined;
	const promise = new Promise<void>((resolve) => {
		release = resolve;
	});
	return { promise, release };
}

function scriptedAssistant(text: string) {
	return {
		role: "assistant" as const,
		content: [{ type: "text" as const, text }],
		api: "pi-advisor-scripted",
		provider: "fixture",
		model: "fixture",
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop" as const,
		timestamp: Date.now(),
	};
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

	it("keeps invalidated attempt records off the replacement branch", async () => {
		const advisorBarrier = createBarrier();
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "original branch answer" }] },
		]);
		const advisor = createAdvisorProvider([
			{
				content: [
					{
						type: "toolCall",
						id: "invalidated-attempt-read",
						name: "read",
						arguments: { path: "does-not-exist.txt" },
					},
				],
				stopReason: "toolUse",
				usage: { input: 10, output: 2, costUsd: 0.01 },
				waitFor: advisorBarrier.promise,
			},
			{ content: [], usage: { input: 20, output: 3, costUsd: 0.02 } },
		]);
		const manager = SessionManager.inMemory();
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			sessionManager: manager,
			extensions: [extensionFor(configFor(advisor, true), (value) => (runtime = value))],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("create an attempt to invalidate");
			await waitFor(() => advisor.activeRequests === 1);
			const originalUser = manager
				.getBranch()
				.find((entry) => entry.type === "message" && entry.message.role === "user");
			if (originalUser === undefined) throw new Error("Expected original user entry");
			manager.branch(originalUser.id);
			manager.appendMessage(scriptedAssistant("replacement branch answer"));

			advisorBarrier.release();
			await waitFor(() => runtime?.getStatus().branchResets === 1);
			await waitFor(() => advisor.activeRequests === 0);

			const activeRecordKinds = manager
				.getBranch()
				.filter(
					(entry) => entry.type === "custom" && entry.customType === ADVISOR_TRANSCRIPT_ENTRY_TYPE,
				)
				.map((entry) => {
					if (entry.type !== "custom" || typeof entry.data !== "object" || entry.data === null) {
						return undefined;
					}
					return (entry.data as Record<string, unknown>).kind;
				});
			expect(activeRecordKinds).not.toContain("advisor-tool-call");
			expect(activeRecordKinds).not.toContain("advisor-tool-result");
			expect(activeRecordKinds).not.toContain("usage");
			expect(runtime?.getStatus()).toMatchObject({
				reviewRequests: 1,
				reviewsCompleted: 0,
				usage: { input: 30, output: 5, total: 35, costUsd: 0.03 },
			});
		} finally {
			advisorBarrier.release();
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
						arguments: { path: "large-persisted-result.txt" },
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
			setup: async (cwd) => {
				await writeFile(
					join(cwd, "large-persisted-result.txt"),
					`API_KEY=persisted-tool-secret-value\n${"large tool result line\n".repeat(8_000)}`,
				);
			},
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
			const persistedToolResult = records.find((record) => record?.kind === "advisor-tool-result");
			expect(persistedToolResult?.kind).toBe("advisor-tool-result");
			if (persistedToolResult?.kind !== "advisor-tool-result") {
				throw new Error("Expected persisted Advisor tool result");
			}
			expect(persistedToolResult.text).toContain("[REDACTED]");
			expect(persistedToolResult.text).not.toContain("persisted-tool-secret-value");
			expect(Buffer.byteLength(JSON.stringify(persistedToolResult), "utf8")).toBeLessThanOrEqual(
				MAX_PERSISTED_TRANSCRIPT_RECORD_BYTES,
			);
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
