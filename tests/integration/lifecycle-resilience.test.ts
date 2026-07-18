import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { StringEnum } from "@earendil-works/pi-ai";
import { defineTool, SessionManager, type InlineExtension } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { describe, expect, it } from "vitest";

import {
	ADVISOR_RUNTIME_STATE_ENTRY_TYPE,
	ADVISOR_RUNTIME_STATE_VERSION,
	adviceDedupeKey,
	createPiAdvisorExtension,
	cursorAtTail,
	DEFAULT_ADVISOR_CONFIG,
	formatAdvisorStatus,
	MAX_PERSISTED_DEDUPE_HASHES,
	type AcceptedAdvice,
	type AdvisorConfig,
	type AdvisorRuntime,
	type PersistedAdvisorRuntimeState,
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
	config.memorySuggestions.minTurnsBetweenSuggestions = 0;
	config.memorySuggestions.minIntervalMs = 0;
	mutate?.(config);
	return config;
}

function extensionFor(
	config: AdvisorConfig,
	onRuntime: (runtime: AdvisorRuntime) => void,
): InlineExtension {
	return {
		name: "pi-advisor-lifecycle-resilience-test",
		factory: createPiAdvisorExtension({ config, hooks: { onRuntime } }),
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

function acceptedAdvice(note: string, id = "lifecycle-advice") {
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

function memorySuggestion(text: string, id = "lifecycle-memory") {
	return {
		content: [
			{
				type: "toolCall" as const,
				id,
				name: "advise",
				arguments: {
					note: "This verified project constraint remains useful in future sessions.",
					intent: "memory-suggestion",
					memory: { text, category: "project", basis: "project-constraint" },
				},
			},
		],
		stopReason: "toolUse" as const,
	};
}

function compatibleMemoryTool() {
	return defineTool({
		name: "memory_suggest",
		label: "memory_suggest",
		description: "Queue a pending memory suggestion.",
		parameters: Type.Object({
			text: Type.String(),
			category: Type.Optional(StringEnum(["preference", "project"] as const)),
			status: Type.Optional(StringEnum(["pending"] as const)),
		}),
		execute: () =>
			Promise.resolve({ content: [{ type: "text" as const, text: "Queued." }], details: {} }),
	});
}

function reviewAdvice(note: string, createdAt = Date.now()): AcceptedAdvice {
	return {
		intent: "review",
		note,
		severity: "concern",
		truncated: false,
		originalCharacters: Array.from(note).length,
		originalEstimatedTokens: Math.ceil(note.length / 4),
		createdAt,
	};
}

function persistedState(
	manager: SessionManager,
	overrides: Partial<PersistedAdvisorRuntimeState> = {},
): PersistedAdvisorRuntimeState {
	return {
		version: ADVISOR_RUNTIME_STATE_VERSION,
		sessionId: manager.getSessionId(),
		savedAt: Date.now(),
		cursor: cursorAtTail(manager.getBranch()),
		deferredAdvice: [],
		dedupeHashes: [],
		memorySuggestions: {
			meaningfulTurnCount: 0,
			admittedCount: 0,
			deliveredCount: 0,
			sessionCapReached: false,
		},
		notesDelivered: 0,
		...overrides,
	};
}

function appendState(manager: SessionManager, state: PersistedAdvisorRuntimeState): void {
	manager.appendCustomEntry(ADVISOR_RUNTIME_STATE_ENTRY_TYPE, state);
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

describe.sequential("Slice 3A branch, compaction, and persistence lifecycle", () => {
	it("invalidates old advice after an equal-length branch switch without relying on a tree hint", async () => {
		const barrier = createBarrier();
		const oldNote = "This old-branch advice must never cross onto the alternate branch.";
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "original branch answer" }] },
		]);
		const advisor = createAdvisorProvider([
			{ ...acceptedAdvice(oldNote), waitFor: barrier.promise },
		]);
		let runtime: AdvisorRuntime | undefined;
		const manager = SessionManager.inMemory();
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			sessionManager: manager,
			extensions: [extensionFor(configFor(advisor), (value) => (runtime = value))],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("create the original branch");
			await waitFor(() => advisor.activeRequests === 1);
			const originalBranch = manager.getBranch();
			const userEntry = originalBranch.find(
				(entry) => entry.type === "message" && entry.message.role === "user",
			);
			if (userEntry === undefined) throw new Error("Expected original user entry");
			manager.branch(userEntry.id);
			manager.appendMessage(scriptedAssistant("equal-length alternate branch answer"));
			expect(manager.getBranch()).toHaveLength(originalBranch.length);

			barrier.release();
			await waitFor(() => runtime?.getStatus().branchResets === 1);
			expect(runtime?.getStatus()).toMatchObject({ notesDelivered: 0, deferredNotesPending: 0 });
			expect(JSON.stringify(manager.buildSessionContext())).not.toContain(oldNote);
		} finally {
			barrier.release();
			await harness.dispose();
		}
	});

	it("eager compaction reset aborts an Advisor await and keeps the next review free of old context", async () => {
		const barrier = createBarrier();
		const invalidated = "Compaction must invalidate this old transcript result.";
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "OLD-TRANSCRIPT-VIEW" }] },
			{ content: [{ type: "text", text: "bounded compaction summary" }] },
			{ content: [{ type: "text", text: "NEW-TRANSCRIPT-VIEW" }] },
		]);
		const advisor = createAdvisorProvider([
			{ ...acceptedAdvice(invalidated), waitFor: barrier.promise },
			{ content: [] },
		]);
		let runtime: AdvisorRuntime | undefined;
		const manager = SessionManager.inMemory();
		for (let turn = 0; turn < 24; turn++) {
			manager.appendMessage({
				role: "user",
				content: `compaction-history-${String(turn)}-${"x".repeat(5_000)}`,
				timestamp: turn * 2,
			});
			manager.appendMessage(scriptedAssistant(`history-answer-${String(turn)}`));
		}
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			sessionManager: manager,
			extensions: [extensionFor(configFor(advisor), (value) => (runtime = value))],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("create context before compaction");
			await waitFor(() => advisor.activeRequests === 1);
			await harness.session.compact("use the scripted compacted view");
			await waitFor(() => runtime?.getStatus().branchResets === 1);
			barrier.release();
			await harness.session.prompt("continue only from the compacted branch");
			await waitFor(() => advisor.requests.length === 2);
			const nextAdvisorContext = JSON.stringify(advisor.requests[1]?.context.messages);
			expect(nextAdvisorContext).toContain("NEW-TRANSCRIPT-VIEW");
			expect(nextAdvisorContext).not.toContain("OLD-TRANSCRIPT-VIEW");
			expect(nextAdvisorContext).not.toContain(invalidated);
			expect(runtime?.getStatus().notesDelivered).toBe(0);
		} finally {
			barrier.release();
			await harness.dispose();
		}
	});

	it("eager tree navigation reset invalidates an Advisor await", async () => {
		const barrier = createBarrier();
		const invalidated = "Tree navigation must invalidate this result.";
		const primary = createPrimaryProvider([{ content: [{ type: "text", text: "first answer" }] }]);
		const advisor = createAdvisorProvider([
			{ ...acceptedAdvice(invalidated), waitFor: barrier.promise },
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
			await harness.session.prompt("start a review before tree navigation");
			await waitFor(() => advisor.activeRequests === 1);
			const target = harness.sessionManager
				.getBranch()
				.find((entry) => entry.type === "message" && entry.message.role === "user");
			if (target === undefined) throw new Error("Expected tree target");
			await harness.session.navigateTree(target.id, { summarize: false });
			await waitFor(() => runtime?.getStatus().branchResets === 1);
			barrier.release();
			expect(runtime?.getStatus()).toMatchObject({ notesDelivered: 0, deferredNotesPending: 0 });
			expect(JSON.stringify(harness.sessionManager.buildSessionContext())).not.toContain(
				invalidated,
			);
		} finally {
			barrier.release();
			await harness.dispose();
		}
	});

	it("restores compatible deferred advice with age and a stale-after-resume warning", async () => {
		const note = "Restore this deferred review after the next user prompt.";
		const createdAt = Date.now() - 2 * 60 * 60 * 1_000;
		const advice = reviewAdvice(note, createdAt);
		const manager = SessionManager.inMemory();
		const window = cursorAtTail(manager.getBranch());
		appendState(
			manager,
			persistedState(manager, {
				deferredAdvice: [
					{
						advice,
						stale: false,
						branchWindow: window,
						displayedInEntry: false,
					},
				],
			}),
		);
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "handled restored advice" }] },
		]);
		const advisor = createAdvisorProvider([{ content: [] }]);
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			sessionManager: manager,
			extensions: [extensionFor(configFor(advisor), (value) => (runtime = value))],
			tools: [],
			mode: "rpc",
		});
		try {
			if (runtime === undefined) throw new Error("Expected restored Advisor runtime");
			expect(runtime.getStatus()).toMatchObject({
				deferredNotesPending: 1,
				restoredDeferredNotesPending: 1,
			});
			expect(runtime.getStatus().oldestDeferredAdviceAgeMs).toBeGreaterThanOrEqual(
				2 * 60 * 60 * 1_000,
			);
			expect(formatAdvisorStatus(runtime.getStatus())).toContain("oldest deferred age");

			await harness.session.prompt("resume and weigh retained advice");
			const context = JSON.stringify(primary.requests[0]?.context);
			expect(context).toContain(note);
			expect(context).toContain('restored-after-resume=\\"true\\"');
			expect(context).toContain("restored after resume and may be stale");
			const delivered = manager
				.getEntries()
				.find((entry) => entry.type === "custom_message" && entry.customType === "pi-advisor-note");
			expect(delivered?.type === "custom_message" ? delivered.details : undefined).toMatchObject({
				restoredAfterResume: true,
				createdAt,
				stale: true,
			});
			expect(runtime.getStatus()).toMatchObject({
				deferredNotesPending: 0,
				restoredDeferredNotesPending: 0,
				notesDelivered: 1,
			});
			const latestState = [...manager.getBranch()]
				.reverse()
				.find(
					(entry) =>
						entry.type === "custom" && entry.customType === ADVISOR_RUNTIME_STATE_ENTRY_TYPE,
				);
			expect(
				latestState?.type === "custom"
					? (latestState.data as PersistedAdvisorRuntimeState).deferredAdvice
					: undefined,
			).toEqual([]);
		} finally {
			await harness.dispose();
		}
	});

	it("restores lifecycle-only state after reopening a persisted Pi session", async () => {
		const root = await mkdtemp(join(tmpdir(), "pi-advisor-resume-"));
		const project = join(root, "project");
		const sessions = join(root, "sessions");
		await mkdir(project, { recursive: true });
		await mkdir(sessions, { recursive: true });
		const note = "Restore this note from the reopened Pi session JSONL.";
		let firstHarness: Awaited<ReturnType<typeof createSessionHarness>> | undefined;
		let secondHarness: Awaited<ReturnType<typeof createSessionHarness>> | undefined;
		try {
			const firstManager = SessionManager.create(project, sessions);
			const firstPrimary = createPrimaryProvider([
				{ content: [{ type: "text", text: "answer before exit" }] },
			]);
			const firstAdvisor = createAdvisorProvider([
				{ ...acceptedAdvice(note, "persisted-resume-note"), delayMs: 25 },
			]);
			let firstRuntime: AdvisorRuntime | undefined;
			firstHarness = await createSessionHarness({
				provider: firstPrimary,
				advisorProvider: firstAdvisor,
				sessionManager: firstManager,
				extensions: [extensionFor(configFor(firstAdvisor), (value) => (firstRuntime = value))],
				tools: [],
				mode: "rpc",
			});
			await firstHarness.session.prompt("queue advice before process exit");
			await waitFor(() => firstRuntime?.getStatus().deferredNotesPending === 1);
			if (firstRuntime === undefined) throw new Error("Expected first persisted runtime");
			await firstRuntime.shutdown();
			const sessionFile = firstManager.getSessionFile();
			if (sessionFile === undefined) throw new Error("Expected persisted Pi session file");
			await firstHarness.dispose();
			firstHarness = undefined;

			const resumedManager = SessionManager.open(sessionFile, sessions, project);
			const resumedPrimary = createPrimaryProvider([
				{ content: [{ type: "text", text: "answer after resume" }] },
			]);
			const resumedAdvisor = createAdvisorProvider([{ content: [] }]);
			let resumedRuntime: AdvisorRuntime | undefined;
			secondHarness = await createSessionHarness({
				provider: resumedPrimary,
				advisorProvider: resumedAdvisor,
				sessionManager: resumedManager,
				extensions: [extensionFor(configFor(resumedAdvisor), (value) => (resumedRuntime = value))],
				tools: [],
				mode: "rpc",
			});
			expect(resumedRuntime?.getStatus()).toMatchObject({
				deferredNotesPending: 1,
				restoredDeferredNotesPending: 1,
			});
			await secondHarness.session.prompt("materialize advice after reopening the session");
			expect(JSON.stringify(resumedPrimary.requests[0]?.context)).toContain(note);
			expect(resumedRuntime?.getStatus()).toMatchObject({
				deferredNotesPending: 0,
				notesDelivered: 1,
			});
		} finally {
			await firstHarness?.dispose();
			await secondHarness?.dispose();
			await rm(root, { recursive: true, force: true });
		}
	});

	it("writes no deferred note content to lifecycle snapshots when retention is zero", async () => {
		const note = "Do not retain this note across exit when retention is zero.";
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "answer before zero-retention exit" }] },
		]);
		const advisor = createAdvisorProvider([
			{ ...acceptedAdvice(note, "zero-retention-note"), delayMs: 25 },
		]);
		let runtime: AdvisorRuntime | undefined;
		const manager = SessionManager.inMemory();
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			sessionManager: manager,
			extensions: [
				extensionFor(
					configFor(advisor, (config) => {
						config.limits.deferredAdviceRetentionHours = 0;
					}),
					(value) => (runtime = value),
				),
			],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("queue zero-retention advice");
			await waitFor(() => runtime?.getStatus().deferredNotesPending === 1);
			if (runtime === undefined) throw new Error("Expected zero-retention runtime");
			await runtime.shutdown();
			const latestState = [...manager.getBranch()]
				.reverse()
				.find(
					(entry) =>
						entry.type === "custom" && entry.customType === ADVISOR_RUNTIME_STATE_ENTRY_TYPE,
				);
			const data = latestState?.type === "custom" ? latestState.data : undefined;
			expect((data as PersistedAdvisorRuntimeState | undefined)?.deferredAdvice).toEqual([]);
			expect(JSON.stringify(data)).not.toContain(note);
		} finally {
			await harness.dispose();
		}
	});

	it("retention zero, expiry, and incompatible branch windows discard deferred notes", async () => {
		const cases = [
			{
				label: "retention zero",
				retentionHours: 0,
				createdAt: Date.now(),
				window: undefined,
			},
			{
				label: "expired",
				retentionHours: 1,
				createdAt: Date.now() - 2 * 60 * 60 * 1_000,
				window: undefined,
			},
			{
				label: "branch incompatible",
				retentionHours: 24,
				createdAt: Date.now(),
				window: { lastEntryId: "missing-entry", expectedIndex: 1 },
			},
		];
		for (const scenario of cases) {
			const note = `Discard ${scenario.label} deferred advice.`;
			const advice = reviewAdvice(note, scenario.createdAt);
			const manager = SessionManager.inMemory();
			const window = scenario.window ?? cursorAtTail(manager.getBranch());
			appendState(
				manager,
				persistedState(manager, {
					deferredAdvice: [
						{
							advice,
							stale: false,
							branchWindow: window,
							displayedInEntry: false,
						},
					],
					dedupeHashes: [adviceDedupeKey(advice)],
				}),
			);
			const primary = createPrimaryProvider([
				{ content: [{ type: "text", text: "continued without discarded advice" }] },
			]);
			const advisor = createAdvisorProvider([{ content: [] }]);
			let runtime: AdvisorRuntime | undefined;
			const harness = await createSessionHarness({
				provider: primary,
				advisorProvider: advisor,
				sessionManager: manager,
				extensions: [
					extensionFor(
						configFor(advisor, (config) => {
							config.limits.deferredAdviceRetentionHours = scenario.retentionHours;
						}),
						(value) => (runtime = value),
					),
				],
				tools: [],
				mode: "rpc",
			});
			try {
				expect(runtime?.getStatus().deferredNotesPending).toBe(0);
				await harness.session.prompt(`continue after ${scenario.label}`);
				expect(JSON.stringify(primary.requests[0]?.context)).not.toContain(note);
			} finally {
				await harness.dispose();
			}
		}
	});

	it("restored dedupe suppresses an immediate duplicate after revising the measured 512-hash proposal", async () => {
		const duplicate = "Do not repeat this already delivered review note.";
		const advice = reviewAdvice(duplicate);
		const manager = SessionManager.inMemory();
		const proposedHashes = Array.from({ length: 512 }, (_, index) =>
			index.toString(16).padStart(64, "0"),
		);
		const proposedState = persistedState(manager, { dedupeHashes: proposedHashes });
		expect(Buffer.byteLength(JSON.stringify(proposedState), "utf8")).toBeGreaterThan(33 * 1_024);
		const hashes = Array.from({ length: MAX_PERSISTED_DEDUPE_HASHES }, (_, index) =>
			index === 0 ? adviceDedupeKey(advice) : index.toString(16).padStart(64, "0"),
		);
		const state = persistedState(manager, { dedupeHashes: hashes });
		appendState(manager, state);
		expect(Buffer.byteLength(JSON.stringify(state), "utf8")).toBeLessThan(9 * 1_024);

		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "answer that triggers duplicate review" }] },
		]);
		const advisor = createAdvisorProvider([acceptedAdvice(duplicate)]);
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			sessionManager: manager,
			extensions: [extensionFor(configFor(advisor), (value) => (runtime = value))],
			tools: [],
			mode: "rpc",
		});
		try {
			await harness.session.prompt("produce the same review immediately after resume");
			await waitFor(() => runtime?.getStatus().reviewsCompleted === 1);
			expect(runtime?.getStatus()).toMatchObject({
				notesSuppressed: 1,
				deferredNotesPending: 0,
				notesDelivered: 0,
			});
		} finally {
			await harness.dispose();
		}
	});

	it("does not restore an old branch cursor or deferred state on another branch", async () => {
		const manager = SessionManager.inMemory();
		const rootId = manager.appendMessage({
			role: "user",
			content: "shared root",
			timestamp: Date.now(),
		});
		const oldAssistantId = manager.appendMessage(scriptedAssistant("old branch"));
		const oldAdvice = reviewAdvice("Old branch only advice.");
		appendState(
			manager,
			persistedState(manager, {
				cursor: cursorAtTail(manager.getBranch()),
				deferredAdvice: [
					{
						advice: oldAdvice,
						stale: false,
						branchWindow: cursorAtTail(manager.getBranch()),
						displayedInEntry: false,
					},
				],
			}),
		);
		manager.branch(rootId);
		manager.appendMessage(scriptedAssistant("new equal-length branch"));
		expect(manager.getBranch().some((entry) => entry.id === oldAssistantId)).toBe(false);

		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "new branch continued" }] },
		]);
		const advisor = createAdvisorProvider([{ content: [] }]);
		let runtime: AdvisorRuntime | undefined;
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			sessionManager: manager,
			extensions: [extensionFor(configFor(advisor), (value) => (runtime = value))],
			tools: [],
			mode: "rpc",
		});
		try {
			expect(runtime?.getStatus().deferredNotesPending).toBe(0);
			await harness.session.prompt("continue the new branch");
			expect(JSON.stringify(primary.requests[0]?.context)).not.toContain(oldAdvice.note);
			expect(runtime?.getStatus().branchResets).toBe(0);
		} finally {
			await harness.dispose();
		}
	});

	it("restores Memory cadence and cap state only for the same Pi session", async () => {
		const proposed = "Use the verified release checklist before publishing this project.";
		const manager = SessionManager.inMemory();
		appendState(
			manager,
			persistedState(manager, {
				memorySuggestions: {
					meaningfulTurnCount: 12,
					admittedCount: 1,
					deliveredCount: 1,
					lastAdmittedTurn: 12,
					lastAdmittedAt: Date.now() - 1_000,
					sessionCapReached: true,
				},
			}),
		);
		const primary = createPrimaryProvider([
			{ content: [{ type: "text", text: "same session answer" }] },
		]);
		const advisor = createAdvisorProvider([memorySuggestion(proposed)]);
		let runtime: AdvisorRuntime | undefined;
		const capConfig = configFor(advisor, (config) => {
			config.memorySuggestions.sessionSuggestionCap = 1;
		});
		const harness = await createSessionHarness({
			provider: primary,
			advisorProvider: advisor,
			sessionManager: manager,
			extensions: [extensionFor(capConfig, (value) => (runtime = value))],
			customTools: [compatibleMemoryTool()],
			tools: ["memory_suggest"],
			mode: "rpc",
		});
		try {
			expect(runtime?.getStatus()).toMatchObject({
				memorySuggestionsDelivered: 1,
				memorySuggestionsRemaining: 0,
				memorySuggestionNextEligibleTurn: 12,
			});
			await harness.session.prompt("same session must retain its cap");
			await waitFor(() => runtime?.getStatus().reviewsCompleted === 1);
			expect(runtime?.getStatus()).toMatchObject({
				memorySuggestionsLimitSuppressed: 1,
				deferredNotesPending: 0,
			});
		} finally {
			await harness.dispose();
		}

		const newManager = SessionManager.inMemory();
		const copiedState = persistedState(newManager, {
			sessionId: manager.getSessionId(),
			memorySuggestions: {
				meaningfulTurnCount: 12,
				admittedCount: 1,
				deliveredCount: 1,
				lastAdmittedTurn: 12,
				lastAdmittedAt: Date.now(),
				sessionCapReached: true,
			},
		});
		appendState(newManager, copiedState);
		const newPrimary = createPrimaryProvider([
			{ content: [{ type: "text", text: "genuinely new session answer" }] },
		]);
		const newAdvisor = createAdvisorProvider([memorySuggestion(proposed, "new-session-memory")]);
		let newRuntime: AdvisorRuntime | undefined;
		const newHarness = await createSessionHarness({
			provider: newPrimary,
			advisorProvider: newAdvisor,
			sessionManager: newManager,
			extensions: [
				extensionFor(
					configFor(newAdvisor, (config) => {
						config.memorySuggestions.sessionSuggestionCap = 1;
					}),
					(value) => (newRuntime = value),
				),
			],
			customTools: [compatibleMemoryTool()],
			tools: ["memory_suggest"],
			mode: "rpc",
		});
		try {
			expect(newRuntime?.getStatus()).toMatchObject({
				memorySuggestionsDelivered: 0,
				memorySuggestionsRemaining: 1,
			});
			await newHarness.session.prompt("new session gets a fresh Memory allowance");
			await waitFor(() => newRuntime?.getStatus().deferredNotesPending === 1);
			expect(newRuntime?.getStatus()).toMatchObject({
				memorySuggestionsRemaining: 0,
				memorySuggestionsLimitSuppressed: 0,
			});
		} finally {
			await newHarness.dispose();
		}
	});
});
