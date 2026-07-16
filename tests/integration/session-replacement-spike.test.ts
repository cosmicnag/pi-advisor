import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { registerApiProvider, unregisterApiProviders } from "@earendil-works/pi-ai/compat";
import {
	AuthStorage,
	createAgentSessionFromServices,
	createAgentSessionRuntime,
	createAgentSessionServices,
	ModelRegistry,
	SessionManager,
	SettingsManager,
	type CreateAgentSessionRuntimeFactory,
	type InlineExtension,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import { SCRIPTED_API, createPrimaryProvider } from "../fixtures/scripted-provider.js";

describe("Pi 0.80.7 session replacement spike", () => {
	it("shuts down the old extension instance before rebinding a replacement session", async () => {
		const root = await mkdtemp(join(tmpdir(), "pi-advisor-runtime-"));
		const cwd = join(root, "project");
		const agentDir = join(root, "agent");
		await mkdir(cwd, { recursive: true });
		await mkdir(agentDir, { recursive: true });

		const lifecycle: string[] = [];
		let instanceCount = 0;
		const extension: InlineExtension = {
			name: "replacement-spike",
			factory: (pi) => {
				const instance = ++instanceCount;
				pi.on("session_start", (event) => {
					lifecycle.push(`start:${String(instance)}:${event.reason}`);
				});
				pi.on("session_shutdown", (event) => {
					lifecycle.push(`shutdown:${String(instance)}:${event.reason}`);
				});
			},
		};
		const provider = createPrimaryProvider([
			{ content: [{ type: "text", text: "old session" }] },
			{ content: [{ type: "text", text: "new session" }] },
		]);
		const sourceId = "pi-advisor-session-replacement-spike";
		const authStorage = AuthStorage.inMemory();
		authStorage.setRuntimeApiKey(provider.model.provider, "scripted-key");
		const modelRegistry = ModelRegistry.inMemory(authStorage);
		registerApiProvider(
			{
				api: SCRIPTED_API,
				stream: provider.streamSimple,
				streamSimple: provider.streamSimple,
			},
			sourceId,
		);
		const settingsManager = SettingsManager.inMemory({
			compaction: { enabled: false },
			retry: { enabled: false },
		});
		const createRuntime: CreateAgentSessionRuntimeFactory = async ({
			cwd: runtimeCwd,
			sessionManager,
			sessionStartEvent,
		}) => {
			const services = await createAgentSessionServices({
				cwd: runtimeCwd,
				agentDir,
				authStorage,
				modelRegistry,
				settingsManager,
				resourceLoaderOptions: {
					extensionFactories: [extension],
					noSkills: true,
					noPromptTemplates: true,
					noThemes: true,
					noContextFiles: true,
					systemPromptOverride: () => "Replacement spike.",
					appendSystemPromptOverride: () => [],
				},
			});
			return {
				...(await createAgentSessionFromServices({
					services,
					sessionManager,
					...(sessionStartEvent === undefined ? {} : { sessionStartEvent }),
					model: provider.model,
					thinkingLevel: "off",
					tools: [],
				})),
				services,
				diagnostics: services.diagnostics,
			};
		};

		const runtime = await createAgentSessionRuntime(createRuntime, {
			cwd,
			agentDir,
			sessionManager: SessionManager.inMemory(cwd),
		});
		runtime.setRebindSession((session) => session.bindExtensions({ mode: "json" }));
		await runtime.session.bindExtensions({ mode: "json" });

		try {
			const oldSession = runtime.session;
			const oldSessionId = oldSession.sessionId;
			await oldSession.prompt("old prompt");

			let replacementSessionId = "";
			const replacement = await runtime.newSession({
				withSession: async (ctx) => {
					replacementSessionId = ctx.sessionManager.getSessionId();
					await ctx.sendUserMessage("new prompt");
				},
			});

			expect(replacement.cancelled).toBe(false);
			expect(replacementSessionId).not.toBe(oldSessionId);
			expect(runtime.session.sessionId).toBe(replacementSessionId);
			expect(lifecycle.slice(0, 3)).toEqual(["start:1:startup", "shutdown:1:new", "start:2:new"]);
			expect(runtime.session).not.toBe(oldSession);
			expect(
				runtime.session.messages.some((message) => JSON.stringify(message).includes("old prompt")),
			).toBe(false);
		} finally {
			await runtime.dispose();
			unregisterApiProviders(sourceId);
			await rm(root, { recursive: true, force: true });
		}

		expect(lifecycle).toEqual([
			"start:1:startup",
			"shutdown:1:new",
			"start:2:new",
			"shutdown:2:quit",
		]);
	});
});
