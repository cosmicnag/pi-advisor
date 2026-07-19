import {
	getAgentDir,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionFactory,
} from "@earendil-works/pi-coding-agent";

import {
	DEFAULT_ADVISOR_CONFIG,
	normalizeAdvisorConfig,
	READ_ONLY_TOOL_NAMES,
	type AdvisorConfig,
	type ReadOnlyToolName,
} from "./config.js";
import {
	loadAdvisorConfiguration,
	saveUserConfigurationAtomic,
	type ConfigurationWarning,
} from "./configuration.js";
import {
	ADVISOR_LATE_ENTRY_TYPE,
	renderAdviceMessage,
	renderLateAdviceEntry,
} from "./presentation.js";
import { AdvisorModelPicker, advisorModelOptions } from "./model-picker.js";
import { ADVISOR_CUSTOM_TYPE } from "./transcript.js";
import {
	AdvisorRuntime,
	formatAdvisorEnableStatus,
	formatAdvisorFooterStatus,
	formatAdvisorStatus,
	type AdvisorRuntimeHooks,
} from "./runtime.js";

export interface PiAdvisorExtensionOptions {
	config?: AdvisorConfig;
	hooks?: AdvisorRuntimeHooks & {
		onRuntime?(runtime: AdvisorRuntime): void;
	};
}

function publishConfigurationWarnings(
	ctx: ExtensionCommandContext | Parameters<AdvisorRuntime["startSession"]>[0],
	warnings: ConfigurationWarning[],
): void {
	if (!ctx.hasUI) return;
	for (const warning of warnings) ctx.ui.notify(warning.message, "warning");
}

export const CONFIGURATION_REFERENCE =
	"docs/configuration.md (https://github.com/ribbons-digital/pi-advisor/blob/main/docs/configuration.md)";

export async function pickAdvisorModelAndEffort(
	ctx: Pick<ExtensionCommandContext, "mode" | "modelRegistry" | "ui">,
	current?: Pick<AdvisorConfig, "model" | "effort">,
): Promise<{ model: string; effort: AdvisorConfig["effort"] } | undefined> {
	const models = advisorModelOptions(ctx.modelRegistry.getAvailable(), current?.model);
	if (models.length === 0) {
		ctx.ui.notify(
			"No authenticated Advisor models are available. Configure provider credentials, then retry.",
			"warning",
		);
		return undefined;
	}
	const model =
		ctx.mode === "tui"
			? await ctx.ui.custom<string | undefined>(
					(tui, theme, keybindings, done) =>
						new AdvisorModelPicker(models, tui, theme, done, keybindings),
				)
			: await ctx.ui.select(
					"Select Advisor model",
					models.map((candidate) => candidate.reference),
				);
	if (model === undefined) return undefined;
	const effortOptions: AdvisorConfig["effort"][] = [
		"off",
		"minimal",
		"low",
		"medium",
		"high",
		"xhigh",
		"max",
	];
	if (current !== undefined) {
		const index = effortOptions.indexOf(current.effort);
		if (index > 0) effortOptions.unshift(...effortOptions.splice(index, 1));
	}
	const effort = await ctx.ui.select("Select Advisor reasoning level", effortOptions);
	if (effort === undefined) return undefined;
	return { model, effort: effort as AdvisorConfig["effort"] };
}

const TOOL_DESCRIPTIONS: Record<ReadOnlyToolName, string> = {
	read: "read files",
	grep: "search file contents",
	find: "find files by pattern",
	ls: "list directories",
};

export async function pickAdvisorTools(
	ctx: Pick<ExtensionCommandContext, "ui">,
	currentTools: readonly ReadOnlyToolName[],
): Promise<ReadOnlyToolName[] | undefined> {
	const selected = new Set(currentTools);
	for (;;) {
		const choices = [
			...READ_ONLY_TOOL_NAMES.map(
				(name) => `${selected.has(name) ? "[x]" : "[ ]"} ${name} - ${TOOL_DESCRIPTIONS[name]}`,
			),
			`Done - use ${String(selected.size)} read-only tool${selected.size === 1 ? "" : "s"}`,
		];
		const choice = await ctx.ui.select(
			"Select Advisor tools (toggle an approved read-only tool, then choose Done)",
			choices,
		);
		if (choice === undefined) return undefined;
		if (choice.startsWith("Done -")) {
			return READ_ONLY_TOOL_NAMES.filter((name) => selected.has(name));
		}
		const tool = READ_ONLY_TOOL_NAMES.find((name) => choice.includes(` ${name} - `));
		if (tool === undefined) continue;
		if (selected.has(tool)) selected.delete(tool);
		else selected.add(tool);
	}
}

async function pickAdvisorInstructions(
	ctx: Pick<ExtensionCommandContext, "ui">,
	currentInstructions: string,
): Promise<string | undefined> {
	const hasCurrentInstructions = currentInstructions.trim().length > 0;
	const choices = hasCurrentInstructions
		? ["Keep current instructions", "Edit instructions", "Clear instructions"]
		: ["Continue without custom instructions", "Add custom instructions"];
	const choice = await ctx.ui.select(
		"Choose optional User Advisor instructions for this configuration",
		choices,
	);
	if (choice === undefined) return undefined;
	if (choice === "Keep current instructions") return currentInstructions;
	if (choice === "Clear instructions" || choice === "Continue without custom instructions") {
		return "";
	}
	if (choice !== "Add custom instructions" && choice !== "Edit instructions") return undefined;
	return ctx.ui.editor(
		`Configuration step: ${choice === "Add custom instructions" ? "add" : "edit"} User Advisor instructions (fixed safety policy always remains authoritative)`,
		choice === "Add custom instructions" ? "" : currentInstructions,
	);
}

export async function pickAdvisorInteractiveConfiguration(
	ctx: Pick<ExtensionCommandContext, "mode" | "modelRegistry" | "ui">,
	current: AdvisorConfig,
): Promise<AdvisorConfig | undefined> {
	const modelAndEffort = await pickAdvisorModelAndEffort(ctx, current);
	if (modelAndEffort === undefined) return undefined;
	const tools = await pickAdvisorTools(ctx, current.tools);
	if (tools === undefined) return undefined;
	const instructions = await pickAdvisorInstructions(ctx, current.instructions);
	if (instructions === undefined) return undefined;
	return normalizeAdvisorConfig({
		...structuredClone(current),
		...modelAndEffort,
		tools,
		instructions,
	});
}

export async function configureAdvisor(
	ctx: ExtensionCommandContext,
	runtime: AdvisorRuntime,
	fallbackUserConfig: AdvisorConfig,
): Promise<void> {
	if (!ctx.hasUI) {
		ctx.ui.notify(
			`/advisor configure requires a dialog-capable TUI or RPC client. See ${CONFIGURATION_REFERENCE}.`,
			"info",
		);
		return;
	}
	const loaded = await loadAdvisorConfiguration({
		agentDir: getAgentDir(),
		cwd: ctx.cwd,
		projectTrusted: ctx.isProjectTrusted(),
		fallbackUserConfig,
	});
	publishConfigurationWarnings(ctx, loaded.warnings);
	const nextUserConfig = await pickAdvisorInteractiveConfiguration(ctx, loaded.userConfig);
	if (nextUserConfig === undefined) return;
	const selectedModel = nextUserConfig.model;
	if (selectedModel === undefined) return;
	const confirmed = await ctx.ui.confirm(
		"Apply Advisor configuration?",
		[
			`Model: ${selectedModel}`,
			`Reasoning: ${nextUserConfig.effort}`,
			`Read-only tools: ${nextUserConfig.tools.join(", ") || "none"}`,
			`Instructions: ${nextUserConfig.instructions.trim().length === 0 ? "none" : "set"}`,
			"",
			`Save atomically to ${loaded.paths.userYaml} and rebuild this session now?`,
			`Reference: ${CONFIGURATION_REFERENCE}`,
		].join("\n"),
	);
	if (!confirmed) return;
	try {
		await saveUserConfigurationAtomic(loaded.paths.userYaml, nextUserConfig);
	} catch {
		ctx.ui.notify(
			`Advisor configuration could not be saved to ${loaded.paths.userYaml}. The prior configuration remains active.`,
			"error",
		);
		return;
	}
	const applied = await loadAdvisorConfiguration({
		agentDir: getAgentDir(),
		cwd: ctx.cwd,
		projectTrusted: ctx.isProjectTrusted(),
		fallbackUserConfig,
	});
	publishConfigurationWarnings(ctx, applied.warnings);
	await runtime.applyConfiguration(applied.effectiveConfig, ctx, applied.projectInstructions);
	ctx.ui.notify(
		`Advisor configuration saved and applied. Model: ${selectedModel}; reasoning: ${nextUserConfig.effort}; tools: ${nextUserConfig.tools.join(", ") || "none"}. External WATCHDOG edits require /reload or another /advisor configure apply. Reference: ${CONFIGURATION_REFERENCE}.`,
		"info",
	);
}

export function hasAdvisorCommandCollision(commands: readonly { name: string }[]): boolean {
	return (
		commands.filter((command) => command.name === "advisor" || /^advisor:\d+$/u.test(command.name))
			.length > 1
	);
}

function installPiAdvisor(pi: ExtensionAPI, options: PiAdvisorExtensionOptions): void {
	const fallbackUserConfig = normalizeAdvisorConfig(
		structuredClone(options.config ?? DEFAULT_ADVISOR_CONFIG),
	);
	let statusContext: Parameters<AdvisorRuntime["startSession"]>[0] | undefined;
	const runtime = new AdvisorRuntime(pi, fallbackUserConfig, {
		...options.hooks,
		onStatus: (status) => {
			if (statusContext?.hasUI) {
				try {
					statusContext.ui.setStatus("pi-advisor", formatAdvisorFooterStatus(status));
				} catch {
					// Keep runtime status publication independent from optional TUI rendering.
				}
			}
			options.hooks?.onStatus?.(status);
		},
	});
	options.hooks?.onRuntime?.(runtime);

	pi.registerFlag("advisor", {
		description: "Enable Advisor for this session",
		type: "boolean",
		default: false,
	});

	pi.registerMessageRenderer(ADVISOR_CUSTOM_TYPE, renderAdviceMessage);
	pi.registerEntryRenderer(ADVISOR_LATE_ENTRY_TYPE, renderLateAdviceEntry);

	let coexistenceWarningPublished = false;
	pi.registerCommand("advisor", {
		description: "Control automatic Advisor review: configure, on, off, status, dump",
		handler: async (args, ctx) => {
			const command = args.trim().toLocaleLowerCase("en-US");
			if (command.length === 0 || command === "configure") {
				await configureAdvisor(ctx, runtime, fallbackUserConfig);
				return;
			}
			if (command === "on") {
				const previous = runtime.getStatus();
				const resetBudget = previous.paused;
				await runtime.enable(ctx, "session-command", resetBudget);
				ctx.ui.notify(
					formatAdvisorEnableStatus(previous, runtime.getStatus(), resetBudget),
					"info",
				);
				return;
			}
			if (command === "off") {
				await runtime.disable();
				ctx.ui.notify("Advisor is off for this session.", "info");
				return;
			}
			if (command === "status") {
				ctx.ui.notify(formatAdvisorStatus(runtime.getStatus()), "info");
				return;
			}
			if (command === "dump") {
				ctx.ui.notify(runtime.formatDiagnosticsDump(), "info");
				return;
			}
			ctx.ui.notify(
				"Usage: /advisor configure | /advisor on | /advisor off | /advisor status | /advisor dump",
				"info",
			);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		statusContext = ctx;
		if (!coexistenceWarningPublished && ctx.hasUI && hasAdvisorCommandCollision(pi.getCommands())) {
			coexistenceWarningPublished = true;
			ctx.ui.notify(
				"Multiple /advisor commands are installed. Pi assigned suffixed names such as /advisor:1 and /advisor:2. Pi Advisor will coexist without changing the other package; use the command list to choose one, or disable one package.",
				"warning",
			);
		}
		let configuredDefault = fallbackUserConfig.defaultEnabled;
		try {
			const loaded = await loadAdvisorConfiguration({
				agentDir: getAgentDir(),
				cwd: ctx.cwd,
				projectTrusted: ctx.isProjectTrusted(),
				fallbackUserConfig,
			});
			configuredDefault = loaded.effectiveConfig.defaultEnabled;
			runtime.setConfigurationBeforeSession(loaded.effectiveConfig, loaded.projectInstructions);
			publishConfigurationWarnings(ctx, loaded.warnings);
		} catch {
			configuredDefault = false;
			runtime.setConfigurationBeforeSession(DEFAULT_ADVISOR_CONFIG);
			if (ctx.hasUI) {
				ctx.ui.notify(
					"Advisor WATCHDOG configuration could not be loaded. Advisor remains inactive with safe defaults.",
					"warning",
				);
			}
		}
		await runtime.startSession(ctx);
		const cliEnabled = pi.getFlag("advisor") === true;
		const defaultEnabled = configuredDefault && (ctx.mode === "tui" || ctx.mode === "rpc");
		if (cliEnabled) await runtime.enable(ctx, "cli-flag");
		else if (defaultEnabled) await runtime.enable(ctx, "user-default");
	});

	pi.on("before_agent_start", (event, ctx) => {
		const contextFiles = event.systemPromptOptions.contextFiles ?? [];
		runtime.captureContextFiles(contextFiles);
		const message = runtime.takeDeferredAdvice(ctx, { hasNewerExecutorInput: true });
		return message === undefined ? undefined : { message };
	});

	pi.on("turn_end", (event, ctx) => {
		void runtime.observeTurn(event, ctx);
	});

	pi.on("message_end", (event) => {
		runtime.observeExecutorMessage(event.message);
	});

	pi.on("agent_settled", (_event, ctx) => runtime.settleActiveAdvice(ctx));
	pi.on("session_before_compact", (_event, ctx) => runtime.handleLifecycleHint(ctx));
	pi.on("session_compact", (_event, ctx) => runtime.handleBranchChange(ctx));
	pi.on("session_before_tree", (_event, ctx) => runtime.handleLifecycleHint(ctx));
	pi.on("session_tree", (_event, ctx) => runtime.handleBranchChange(ctx));
	pi.on("session_shutdown", async (_event, ctx) => {
		if (ctx.hasUI) ctx.ui.setStatus("pi-advisor", undefined);
		statusContext = undefined;
		await runtime.shutdown();
	});
}

export function createPiAdvisorExtension(
	options: PiAdvisorExtensionOptions = {},
): ExtensionFactory {
	return (pi) => {
		installPiAdvisor(pi, options);
	};
}

export default function piAdvisor(pi: ExtensionAPI): void {
	installPiAdvisor(pi, {});
}

export * from "./advice.js";
export * from "./config.js";
export * from "./configuration.js";
export * from "./delivery.js";
export * from "./model-picker.js";
export * from "./persistence.js";
export * from "./presentation.js";
export * from "./redaction.js";
export * from "./runtime.js";
export * from "./security.js";
export * from "./transcript.js";
