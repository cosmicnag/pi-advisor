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
	extensions?: InlineExtension[];
	customTools?: ToolDefinition[];
	sessionManager?: SessionManager;
	tools?: string[];
}

export interface SessionHarness {
	session: AgentSession;
	sessionManager: SessionManager;
	dispose(): Promise<void>;
}

let harnessId = 0;

export async function createSessionHarness(
	options: SessionHarnessOptions,
): Promise<SessionHarness> {
	const root = await mkdtemp(join(tmpdir(), "pi-advisor-slice0-"));
	const cwd = join(root, "project");
	const agentDir = join(root, "agent");
	await mkdir(cwd, { recursive: true });
	await mkdir(agentDir, { recursive: true });
	const sourceId = `pi-advisor-scripted-${String(harnessId++)}`;

	const authStorage = AuthStorage.inMemory();
	authStorage.setRuntimeApiKey(options.provider.model.provider, "scripted-key");
	const modelRegistry = ModelRegistry.inMemory(authStorage);
	registerApiProvider(
		{
			api: SCRIPTED_API,
			stream: options.provider.streamSimple,
			streamSimple: options.provider.streamSimple,
		},
		sourceId,
	);
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
	const { session } = await createAgentSession({
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
	});
	await session.bindExtensions({ mode: "json" });

	return {
		session,
		sessionManager,
		async dispose() {
			session.dispose();
			unregisterApiProviders(sourceId);
			await rm(root, { recursive: true, force: true });
		},
	};
}
