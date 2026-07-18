import {
	getAgentDir,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionFactory,
} from "@earendil-works/pi-coding-agent";

import { DEFAULT_ADVISOR_CONFIG, normalizeAdvisorConfig, type AdvisorConfig } from "./config.js";
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
import { ADVISOR_CUSTOM_TYPE } from "./transcript.js";
import {
	AdvisorRuntime,
	formatAdvisorEnableStatus,
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

export async function pickAdvisorModelAndEffort(
	ctx: Pick<ExtensionCommandContext, "modelRegistry" | "ui">,
): Promise<{ model: string; effort: AdvisorConfig["effort"] } | undefined> {
	const models = [
		...new Set(
			ctx.modelRegistry
				.getAvailable()
				.map((model) => `${model.provider}/${model.id}`)
				.sort((left, right) => left.localeCompare(right, "en-US")),
		),
	];
	if (models.length === 0) {
		ctx.ui.notify(
			"No authenticated Advisor models are available. Configure provider credentials, then retry.",
			"warning",
		);
		return undefined;
	}
	const model = await ctx.ui.select("Select Advisor model", models);
	if (model === undefined) return undefined;
	const effort = await ctx.ui.select("Select Advisor reasoning level", [
		"off",
		"minimal",
		"low",
		"medium",
		"high",
		"xhigh",
		"max",
	]);
	if (effort === undefined) return undefined;
	return { model, effort: effort as AdvisorConfig["effort"] };
}

async function configureAdvisor(
	ctx: ExtensionCommandContext,
	runtime: AdvisorRuntime,
	fallbackUserConfig: AdvisorConfig,
): Promise<void> {
	if (!ctx.hasUI) {
		ctx.ui.notify(
			"/advisor configure requires a dialog-capable TUI or RPC client. See README.md for WATCHDOG configuration paths.",
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
	const selection = await pickAdvisorModelAndEffort(ctx);
	if (selection === undefined) return;
	const confirmed = await ctx.ui.confirm(
		"Apply Advisor configuration?",
		`Model: ${selection.model}\nReasoning: ${selection.effort}\n\nSave atomically to ${loaded.paths.userYaml} and rebuild this session now?`,
	);
	if (!confirmed) return;

	const nextUserConfig = normalizeAdvisorConfig({
		...loaded.userConfig,
		model: selection.model,
		effort: selection.effort,
	});
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
		`Advisor configuration saved and applied. Model: ${selection.model}; reasoning: ${selection.effort}. External WATCHDOG edits require /reload or another /advisor configure apply.`,
		"info",
	);
}

function installPiAdvisor(pi: ExtensionAPI, options: PiAdvisorExtensionOptions): void {
	const fallbackUserConfig = normalizeAdvisorConfig(
		structuredClone(options.config ?? DEFAULT_ADVISOR_CONFIG),
	);
	const runtime = new AdvisorRuntime(pi, fallbackUserConfig, options.hooks);
	options.hooks?.onRuntime?.(runtime);

	pi.registerFlag("advisor", {
		description: "Enable Advisor for this session",
		type: "boolean",
		default: false,
	});

	pi.registerMessageRenderer(ADVISOR_CUSTOM_TYPE, renderAdviceMessage);
	pi.registerEntryRenderer(ADVISOR_LATE_ENTRY_TYPE, renderLateAdviceEntry);

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
	pi.on("session_shutdown", async () => {
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
export * from "./persistence.js";
export * from "./presentation.js";
export * from "./redaction.js";
export * from "./runtime.js";
export * from "./security.js";
export * from "./transcript.js";
