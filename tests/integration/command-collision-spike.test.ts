import { describe, expect, it } from "vitest";

import type { InlineExtension, SlashCommandInfo } from "@earendil-works/pi-coding-agent";

import { createSessionHarness } from "../fixtures/session-harness.js";
import { createPrimaryProvider } from "../fixtures/scripted-provider.js";

function commandNames(commands: SlashCommandInfo[]): string[] {
	return commands
		.filter((command) => command.source === "extension")
		.map((command) => command.name);
}

describe("Pi 0.80.7 duplicate command spike", () => {
	it("assigns numeric suffixes before session_start and supports one warning per extension instance", async () => {
		const observed: { phase: string; names: string[] }[] = [];
		let warnings = 0;
		let warned = false;

		const first: InlineExtension = {
			name: "advisor-command-first",
			factory: (pi) => {
				pi.registerCommand("advisor", {
					description: "First",
					handler: async () => {
						await Promise.resolve();
					},
				});
			},
		};
		const second: InlineExtension = {
			name: "advisor-command-second",
			factory: (pi) => {
				pi.registerCommand("advisor", {
					description: "Second",
					handler: async () => {
						await Promise.resolve();
					},
				});
			},
		};
		const detector: InlineExtension = {
			name: "advisor-command-detector",
			factory: (pi) => {
				const detect = (phase: string) => {
					const names = commandNames(pi.getCommands());
					observed.push({ phase, names });
					if (!warned && names.filter((name) => /^advisor(?::\d+)?$/.test(name)).length > 1) {
						warned = true;
						warnings++;
					}
				};
				pi.on("session_start", () => detect("session_start"));
				pi.on("resources_discover", () => detect("resources_discover"));
			},
		};
		const harness = await createSessionHarness({
			provider: createPrimaryProvider([]),
			extensions: [first, second, detector],
			tools: [],
		});

		try {
			expect(observed).toEqual([
				{ phase: "session_start", names: ["advisor:1", "advisor:2"] },
				{ phase: "resources_discover", names: ["advisor:1", "advisor:2"] },
			]);
			expect(warnings).toBe(1);
		} finally {
			await harness.dispose();
		}
	});
});
