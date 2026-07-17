import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { registerApiProvider, unregisterApiProviders } from "@earendil-works/pi-ai/compat";
import {
	AuthStorage,
	createAgentSession,
	DefaultResourceLoader,
	ModelRegistry,
	SessionManager,
	SettingsManager,
	type AgentSession,
	type InlineExtension,
	type ToolDefinition,
} from "@earendil-works/pi-coding-agent";

import { SCRIPTED_API, type ScriptedProvider } from "./scripted-provider.js";

export interface SessionHarnessOptions {
	provider: ScriptedProvider;
	advisorProvider?: ScriptedProvider;
	extensions?: InlineExtension[];
	customTools?: ToolDefinition[];
	sessionManager?: SessionManager;
	tools?: string[];
	mode?: "tui" | "rpc" | "json" | "print";
	setup?(cwd: string, agentDir: string): Promise<void>;
}

export interface SessionHarness {
	session: AgentSession;
	sessionManager: SessionManager;
	cwd: string;
	agentDir: string;
	dispose(): Promise<void>;
}

let harnessId = 0;

export async function createSessionHarness(
	options: SessionHarnessOptions,
): Promise<SessionHarness> {
	const root = await mkdtemp(join(tmpdir(), "pi-advisor-slice0-"));
	const cwd = join(root, "project");
	const agentDir = join(root, "agent");
	const sourceId = `pi-advisor-scripted-${String(harnessId++)}`;
	let providerRegistered = false;
	let advisorRegistered = false;
	let modelRegistry: ModelRegistry | undefined;
	let session: AgentSession | undefined;

	try {
		await mkdir(cwd, { recursive: true });
		await mkdir(agentDir, { recursive: true });
		await options.setup?.(cwd, agentDir);

		const authStorage = AuthStorage.inMemory();
		authStorage.setRuntimeApiKey(options.provider.model.provider, "scripted-key");
		modelRegistry = ModelRegistry.inMemory(authStorage);
		registerApiProvider(
			{
				api: SCRIPTED_API,
				stream: options.provider.streamSimple,
				streamSimple: options.provider.streamSimple,
			},
			sourceId,
		);
		providerRegistered = true;
		if (options.advisorProvider !== undefined) {
			const advisor = options.advisorProvider;
			authStorage.setRuntimeApiKey(advisor.model.provider, "scripted-advisor-key");
			modelRegistry.registerProvider(advisor.model.provider, {
				baseUrl: advisor.model.baseUrl,
				api: advisor.model.api,
				apiKey: "scripted-advisor-key",
				streamSimple: advisor.streamSimple,
				models: [
					{
						id: advisor.model.id,
						name: advisor.model.name,
						api: advisor.model.api,
						baseUrl: advisor.model.baseUrl,
						reasoning: advisor.model.reasoning,
						input: advisor.model.input,
						cost: advisor.model.cost,
						contextWindow: advisor.model.contextWindow,
						maxTokens: advisor.model.maxTokens,
					},
				],
			});
			advisorRegistered = true;
		}
		const settingsManager = SettingsManager.inMemory({
			compaction: { enabled: false },
			retry: { enabled: false },
		});
		const resourceLoader = new DefaultResourceLoader({
			cwd,
			agentDir,
			settingsManager,
			...(options.extensions === undefined ? {} : { extensionFactories: options.extensions }),
			noSkills: true,
			noPromptTemplates: true,
			noThemes: true,
			noContextFiles: true,
			systemPromptOverride: () => "Scripted Pi Slice 0 test session.",
			appendSystemPromptOverride: () => [],
		});
		await resourceLoader.reload();

		const sessionManager = options.sessionManager ?? SessionManager.inMemory(cwd);
		({ session } = await createAgentSession({
			cwd,
			agentDir,
			authStorage,
			modelRegistry,
			model: options.provider.model,
			thinkingLevel: "off",
			resourceLoader,
			sessionManager,
			settingsManager,
			...(options.customTools === undefined ? {} : { customTools: options.customTools }),
			...(options.tools === undefined ? {} : { tools: options.tools }),
		}));
		await session.bindExtensions({ mode: options.mode ?? "json" });

		let disposed = false;
		return {
			session,
			sessionManager,
			cwd,
			agentDir,
			async dispose() {
				if (disposed) return;
				disposed = true;
				session?.dispose();
				if (advisorRegistered && options.advisorProvider !== undefined) {
					modelRegistry?.unregisterProvider(options.advisorProvider.model.provider);
				}
				unregisterApiProviders(sourceId);
				await rm(root, { recursive: true, force: true });
			},
		};
	} catch (error) {
		session?.dispose();
		if (advisorRegistered && options.advisorProvider !== undefined) {
			modelRegistry?.unregisterProvider(options.advisorProvider.model.provider);
		}
		if (providerRegistered) unregisterApiProviders(sourceId);
		await rm(root, { recursive: true, force: true });
		throw error;
	}
}
