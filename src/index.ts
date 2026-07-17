import type { ExtensionAPI, ExtensionFactory } from "@earendil-works/pi-coding-agent";

import { DEFAULT_ADVISOR_CONFIG, normalizeAdvisorConfig, type AdvisorConfig } from "./config.js";
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

function installPiAdvisor(pi: ExtensionAPI, options: PiAdvisorExtensionOptions): void {
	const config = normalizeAdvisorConfig(structuredClone(options.config ?? DEFAULT_ADVISOR_CONFIG));
	const runtime = new AdvisorRuntime(pi, config, options.hooks);
	options.hooks?.onRuntime?.(runtime);

	pi.registerFlag("advisor", {
		description: "Enable Advisor for this session",
		type: "boolean",
		default: false,
	});

	pi.registerCommand("advisor", {
		description: "Control automatic Advisor review: on, off, status",
		handler: async (args, ctx) => {
			const command = args.trim().toLocaleLowerCase("en-US");
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
			ctx.ui.notify("Usage: /advisor on | /advisor off | /advisor status", "info");
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		const cliEnabled = pi.getFlag("advisor") === true;
		const defaultEnabled = config.defaultEnabled && (ctx.mode === "tui" || ctx.mode === "rpc");
		if (cliEnabled) await runtime.enable(ctx, "cli-flag");
		else if (defaultEnabled) await runtime.enable(ctx, "user-default");
	});

	pi.on("before_agent_start", (event, ctx) => {
		const contextFiles = event.systemPromptOptions.contextFiles ?? [];
		runtime.captureContextFiles(contextFiles);
		const message = runtime.takeDeferredAdvice(ctx);
		return message === undefined ? undefined : { message };
	});

	pi.on("turn_end", (event, ctx) => {
		void runtime.observeTurn(event, ctx);
	});

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
export * from "./redaction.js";
export * from "./runtime.js";
export * from "./security.js";
export * from "./transcript.js";
