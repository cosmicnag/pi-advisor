import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	configureAdvisor,
	DEFAULT_ADVISOR_CONFIG,
	hasAdvisorCommandCollision,
	loadAdvisorConfiguration,
	MAX_WATCHDOG_MARKDOWN_BYTES,
	mergeProjectConfiguration,
	pickAdvisorInteractiveConfiguration,
	pickAdvisorModelAndEffort,
	pickAdvisorTools,
	saveUserConfigurationAtomic,
} from "../../src/index.js";

const roots: string[] = [];

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), "pi-advisor-watchdog-"));
	roots.push(root);
	const agentDir = join(root, "agent");
	const cwd = join(root, "project");
	await mkdir(agentDir, { recursive: true });
	await mkdir(join(cwd, ".pi"), { recursive: true });
	return { root, agentDir, cwd };
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("WATCHDOG configuration", () => {
	it("detects Pi-assigned coexistence command suffixes without false positives", () => {
		expect(hasAdvisorCommandCollision([{ name: "advisor:1" }, { name: "advisor:2" }])).toBe(true);
		expect(hasAdvisorCommandCollision([{ name: "advisor" }, { name: "other" }])).toBe(false);
	});

	it("offers only available registry models and approved reasoning levels", async () => {
		const select = vi
			.fn<ExtensionCommandContext["ui"]["select"]>()
			.mockResolvedValueOnce("alpha/model-a")
			.mockResolvedValueOnce("xhigh");
		const result = await pickAdvisorModelAndEffort({
			modelRegistry: {
				getAvailable: () => [
					{ provider: "zeta", id: "model-z" },
					{ provider: "alpha", id: "model-a" },
				],
			} as ExtensionCommandContext["modelRegistry"],
			ui: { select, notify: vi.fn() } as unknown as ExtensionCommandContext["ui"],
		});
		expect(result).toEqual({ model: "alpha/model-a", effort: "xhigh" });
		expect(select.mock.calls[0]?.[1]).toEqual(["alpha/model-a", "zeta/model-z"]);
		expect(select.mock.calls[1]?.[1]).toEqual([
			"off",
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh",
			"max",
		]);
	});

	it("selects only approved read-only tools and edits instructions", async () => {
		const select = vi
			.fn<ExtensionCommandContext["ui"]["select"]>()
			.mockResolvedValueOnce("[x] grep - search file contents")
			.mockResolvedValueOnce("[ ] ls - list directories")
			.mockResolvedValueOnce("Done - use 3 read-only tools");
		const tools = await pickAdvisorTools(
			{ ui: { select } as unknown as ExtensionCommandContext["ui"] },
			["read", "grep", "find"],
		);
		expect(tools).toEqual(["read", "find", "ls"]);
		expect(
			select.mock.calls.flatMap((call) => call[1]).some((choice) => choice.includes("bash")),
		).toBe(false);

		const configureSelect = vi
			.fn<ExtensionCommandContext["ui"]["select"]>()
			.mockResolvedValueOnce("fixture/advisor")
			.mockResolvedValueOnce("high")
			.mockResolvedValueOnce("Done - use 4 read-only tools");
		const editor = vi.fn().mockResolvedValue("Focus on migration safety.");
		const configured = await pickAdvisorInteractiveConfiguration(
			{
				modelRegistry: {
					getAvailable: () => [{ provider: "fixture", id: "advisor" }],
				} as ExtensionCommandContext["modelRegistry"],
				ui: {
					select: configureSelect,
					editor,
					notify: vi.fn(),
				} as unknown as ExtensionCommandContext["ui"],
			},
			structuredClone(DEFAULT_ADVISOR_CONFIG),
		);
		expect(configured).toMatchObject({
			model: "fixture/advisor",
			effort: "high",
			tools: ["read", "grep", "find", "ls"],
			instructions: "Focus on migration safety.",
		});
		expect(editor).toHaveBeenCalledWith(expect.stringContaining("fixed safety policy"), "");
	});

	it("completes configuration and atomic apply without a live nested Advisor runtime", async () => {
		const { agentDir, cwd } = await fixture();
		const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
		process.env.PI_CODING_AGENT_DIR = agentDir;
		const select = vi
			.fn<ExtensionCommandContext["ui"]["select"]>()
			.mockResolvedValueOnce("fixture/advisor")
			.mockResolvedValueOnce("low")
			.mockResolvedValueOnce("[x] ls - list directories")
			.mockResolvedValueOnce("Done - use 3 read-only tools");
		const notify = vi.fn();
		const applyConfiguration = vi.fn().mockResolvedValue(undefined);
		const ctx = {
			hasUI: true,
			cwd,
			isProjectTrusted: () => false,
			modelRegistry: {
				getAvailable: () => [{ provider: "fixture", id: "advisor" }],
			},
			ui: {
				select,
				editor: vi.fn().mockResolvedValue("Review public API compatibility."),
				confirm: vi.fn().mockResolvedValue(true),
				notify,
			},
		} as unknown as ExtensionCommandContext;
		try {
			await configureAdvisor(
				ctx,
				{ applyConfiguration } as unknown as Parameters<typeof configureAdvisor>[1],
				structuredClone(DEFAULT_ADVISOR_CONFIG),
			);
			const saved = await readFile(join(agentDir, "WATCHDOG.yml"), "utf8");
			expect(saved).toContain("model: fixture/advisor");
			expect(saved).toContain("effort: low");
			expect(saved).toContain("Review public API compatibility.");
			expect(saved).not.toContain("  - ls");
			expect(applyConfiguration).toHaveBeenCalledOnce();
			expect(applyConfiguration.mock.calls[0]?.[0]).toMatchObject({
				model: "fixture/advisor",
				effort: "low",
				tools: ["read", "grep", "find"],
				instructions: "Review public API compatibility.",
			});
			expect(notify).toHaveBeenLastCalledWith(
				expect.stringContaining("docs/configuration.md"),
				"info",
			);
		} finally {
			if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
		}
	});

	it("loads a versioned partial User schema over approved defaults", async () => {
		const { agentDir, cwd } = await fixture();
		await writeFile(
			join(agentDir, "WATCHDOG.yml"),
			[
				"version: 1",
				"defaultEnabled: true",
				"model: fixture/advisor",
				"effort: low",
				"tools: [read, grep]",
				"limits:",
				"  sessionCostSoftCapUsd: 2",
			].join("\n"),
		);

		const loaded = await loadAdvisorConfiguration({ agentDir, cwd, projectTrusted: false });
		expect(loaded.warnings).toEqual([]);
		expect(loaded.userConfig).toMatchObject({
			version: 1,
			defaultEnabled: true,
			model: "fixture/advisor",
			effort: "low",
			tools: ["read", "grep"],
		});
		expect(loaded.userConfig.limits).toMatchObject({
			sessionCostSoftCapUsd: 2,
			maxAdviceCharacters: DEFAULT_ADVISOR_CONFIG.limits.maxAdviceCharacters,
		});
	});

	it("loads and serializes default-off cumulative caps", async () => {
		const { agentDir, cwd } = await fixture();
		await writeFile(
			join(agentDir, "WATCHDOG.yml"),
			["version: 1", "limits:", "  sessionTokenSoftCap: off", "  sessionCostSoftCapUsd: off"].join(
				"\n",
			),
		);
		const loaded = await loadAdvisorConfiguration({ agentDir, cwd, projectTrusted: false });
		expect(loaded.warnings).toEqual([]);
		expect(loaded.userConfig.limits).toMatchObject({
			sessionTokenSoftCap: "off",
			sessionCostSoftCapUsd: "off",
		});

		const savedPath = join(agentDir, "saved.yml");
		await saveUserConfigurationAtomic(savedPath, loaded.userConfig);
		const saved = await readFile(savedPath, "utf8");
		expect(saved).toContain("sessionTokenSoftCap: off");
		expect(saved).toContain("sessionCostSoftCapUsd: off");
		expect(saved).not.toMatch(/(?:Infinity|NaN)/u);
	});

	it("merges cumulative caps with off treated as unbounded only for comparison", () => {
		const userOff = structuredClone(DEFAULT_ADVISOR_CONFIG);
		const projectFinite = mergeProjectConfiguration(userOff, {
			limits: { sessionTokenSoftCap: 100, sessionCostSoftCapUsd: 2 },
		});
		expect(projectFinite.limits).toMatchObject({
			sessionTokenSoftCap: 100,
			sessionCostSoftCapUsd: 2,
		});

		const userFinite = structuredClone(DEFAULT_ADVISOR_CONFIG);
		userFinite.limits.sessionTokenSoftCap = 100;
		userFinite.limits.sessionCostSoftCapUsd = 2;
		expect(
			mergeProjectConfiguration(userFinite, {
				limits: { sessionTokenSoftCap: "off", sessionCostSoftCapUsd: "off" },
			}).limits,
		).toMatchObject({ sessionTokenSoftCap: 100, sessionCostSoftCapUsd: 2 });
		expect(
			mergeProjectConfiguration(userFinite, {
				limits: { sessionTokenSoftCap: 200, sessionCostSoftCapUsd: 1 },
			}).limits,
		).toMatchObject({ sessionTokenSoftCap: 100, sessionCostSoftCapUsd: 1 });
	});

	it("rejects non-positive cumulative caps with path-specific value-free warnings", async () => {
		const { agentDir, cwd } = await fixture();
		await writeFile(
			join(agentDir, "WATCHDOG.yml"),
			["version: 1", "limits:", "  sessionTokenSoftCap: 0", "  sessionCostSoftCapUsd: 0"].join(
				"\n",
			),
		);
		const loaded = await loadAdvisorConfiguration({ agentDir, cwd, projectTrusted: false });
		expect(loaded.warnings.map((warning) => warning.path)).toEqual(
			expect.arrayContaining(["limits.sessionTokenSoftCap", "limits.sessionCostSoftCapUsd"]),
		);
		for (const warning of loaded.warnings) {
			expect(warning.message).not.toContain("configured value");
		}
		expect(loaded.effectiveConfig.limits).toMatchObject({
			sessionTokenSoftCap: "off",
			sessionCostSoftCapUsd: "off",
		});
	});

	it("uses release defaults for fields omitted from a durable User file", async () => {
		const { agentDir, cwd } = await fixture();
		await writeFile(join(agentDir, "WATCHDOG.yml"), "version: 1\nmodel: fixture/advisor\n");
		const fallback = structuredClone(DEFAULT_ADVISOR_CONFIG);
		fallback.defaultEnabled = true;
		fallback.effort = "max";
		fallback.tools = ["ls"];
		fallback.limits.sessionCostSoftCapUsd = 99;

		const loaded = await loadAdvisorConfiguration({
			agentDir,
			cwd,
			projectTrusted: false,
			fallbackUserConfig: fallback,
		});
		expect(loaded.userConfig).toMatchObject({
			model: "fixture/advisor",
			defaultEnabled: DEFAULT_ADVISOR_CONFIG.defaultEnabled,
			effort: DEFAULT_ADVISOR_CONFIG.effort,
			tools: DEFAULT_ADVISOR_CONFIG.tools,
			limits: {
				sessionCostSoftCapUsd: DEFAULT_ADVISOR_CONFIG.limits.sessionCostSoftCapUsd,
			},
		});
	});

	it("fails malformed or mutating User configuration safely inactive", async () => {
		const { agentDir, cwd } = await fixture();
		await writeFile(
			join(agentDir, "WATCHDOG.yml"),
			"version: 1\ndefaultEnabled: true\nmodel: fixture/advisor\ntools: [read, bash]\n",
		);
		const loaded = await loadAdvisorConfiguration({ agentDir, cwd, projectTrusted: false });
		expect(loaded.effectiveConfig.defaultEnabled).toBe(false);
		expect(loaded.effectiveConfig.model).toBeUndefined();
		expect(loaded.warnings.some((warning) => warning.path.includes("tools"))).toBe(true);

		await writeFile(join(agentDir, "WATCHDOG.yml"), "version: [broken\n");
		const malformed = await loadAdvisorConfiguration({ agentDir, cwd, projectTrusted: false });
		expect(malformed.effectiveConfig.defaultEnabled).toBe(false);
		expect(malformed.warnings[0]?.message).toContain("malformed YAML");
	});

	it("ignores Project files when trust is inactive", async () => {
		const { agentDir, cwd } = await fixture();
		await writeFile(join(agentDir, "WATCHDOG.yml"), "version: 1\nmodel: fixture/advisor\n");
		await writeFile(
			join(cwd, ".pi", "WATCHDOG.yml"),
			"version: 1\ntools: [read]\ninstructions: Project focus\n",
		);
		await writeFile(join(cwd, ".pi", "WATCHDOG.md"), "PROJECT-MARKDOWN-SENTINEL");
		const loaded = await loadAdvisorConfiguration({ agentDir, cwd, projectTrusted: false });
		expect(loaded.effectiveConfig.tools).toEqual(DEFAULT_ADVISOR_CONFIG.tools);
		expect(loaded.projectInstructions).toBe("");
		expect(loaded.warnings).toEqual([]);
	});

	it("merges trusted Project configuration only toward narrower policy", async () => {
		const { agentDir, cwd } = await fixture();
		await writeFile(
			join(agentDir, "WATCHDOG.yml"),
			[
				"version: 1",
				"defaultEnabled: true",
				"model: fixture/advisor",
				"effort: high",
				"tools: [read, grep, find]",
				"limits:",
				"  maxToolCallsPerUpdate: 8",
				"  minTurnsBetweenReviews: 2",
				"security:",
				"  protectedPathExceptions: [allowed.txt]",
				"memorySuggestions:",
				"  enabled: false",
			].join("\n"),
		);
		await writeFile(
			join(cwd, ".pi", "WATCHDOG.yml"),
			[
				"version: 1",
				"defaultEnabled: true",
				"model: attacker/model",
				"effort: max",
				"tools: [grep, ls]",
				"instructions: Focus on project invariants.",
				"context:",
				"  maxFraction: 0.5",
				"  reserveTokens: 12000",
				"limits:",
				"  maxToolCallsPerUpdate: 4",
				"  minTurnsBetweenReviews: 5",
				"security:",
				"  additionalProtectedPaths: [private]",
				"  protectedPathExceptions: [stolen.txt]",
				"persistence:",
				"  transcript: true",
				"memorySuggestions:",
				"  enabled: true",
			].join("\n"),
		);
		await writeFile(join(cwd, ".pi", "WATCHDOG.md"), "Also inspect migration ordering.");

		const loaded = await loadAdvisorConfiguration({ agentDir, cwd, projectTrusted: true });
		expect(loaded.effectiveConfig).toMatchObject({
			defaultEnabled: true,
			model: "fixture/advisor",
			effort: "high",
			tools: ["grep"],
			context: { maxFraction: 0.5, reserveTokens: 12_000 },
			limits: { maxToolCallsPerUpdate: 4, minTurnsBetweenReviews: 5 },
			security: {
				additionalProtectedPaths: ["private"],
				protectedPathExceptions: ["allowed.txt"],
			},
			memorySuggestions: { enabled: false },
			persistence: { transcript: false },
		});
		expect(loaded.projectInstructions).toContain("Focus on project invariants.");
		expect(loaded.projectInstructions).toContain("Also inspect migration ordering.");
		expect(loaded.warnings.map((warning) => warning.path)).toEqual(
			expect.arrayContaining([
				"defaultEnabled",
				"model",
				"effort",
				"security.protectedPathExceptions",
				"persistence",
			]),
		);
	});

	it.each(['"true"', "null"])(
		"warns when Project memorySuggestions.enabled is a non-false value (%s)",
		async (enabled) => {
			const { agentDir, cwd } = await fixture();
			await writeFile(join(agentDir, "WATCHDOG.yml"), "version: 1\n");
			await writeFile(
				join(cwd, ".pi", "WATCHDOG.yml"),
				`version: 1\nmemorySuggestions:\n  enabled: ${enabled}\n`,
			);

			const loaded = await loadAdvisorConfiguration({ agentDir, cwd, projectTrusted: true });
			expect(loaded.warnings).toContainEqual({
				source: "project",
				path: "memorySuggestions.enabled",
				message:
					"Project field memorySuggestions.enabled cannot re-enable User-disabled behavior and was ignored.",
			});
			expect(loaded.effectiveConfig.memorySuggestions.enabled).toBe(
				DEFAULT_ADVISOR_CONFIG.memorySuggestions.enabled,
			);
		},
	);

	it("adds User and trusted Project protected paths while preserving User-only exact exceptions", async () => {
		const { agentDir, cwd } = await fixture();
		await writeFile(
			join(agentDir, "WATCHDOG.yml"),
			[
				"version: 1",
				"security:",
				"  additionalProtectedPaths: [user-private]",
				"  protectedPathExceptions: [user-private/allowed.txt]",
			].join("\n"),
		);
		await writeFile(
			join(cwd, ".pi", "WATCHDOG.yml"),
			[
				"version: 1",
				"security:",
				"  additionalProtectedPaths: [project-private]",
				"  protectedPathExceptions: [project-private/stolen.txt]",
			].join("\n"),
		);

		const loaded = await loadAdvisorConfiguration({ agentDir, cwd, projectTrusted: true });
		expect(loaded.effectiveConfig.security).toEqual({
			additionalProtectedPaths: ["user-private", "project-private"],
			protectedPathExceptions: ["user-private/allowed.txt"],
		});
		expect(loaded.warnings.map((warning) => warning.path)).toContain(
			"security.protectedPathExceptions",
		);
	});

	it("redacts and bounds WATCHDOG markdown before use", async () => {
		const { agentDir, cwd } = await fixture();
		await writeFile(join(agentDir, "WATCHDOG.yml"), "version: 1\n");
		await writeFile(
			join(agentDir, "WATCHDOG.md"),
			`API_KEY=super-secret-value\n${"x".repeat(MAX_WATCHDOG_MARKDOWN_BYTES + 100)}`,
		);
		const loaded = await loadAdvisorConfiguration({ agentDir, cwd, projectTrusted: false });
		expect(loaded.effectiveConfig.instructions).toContain("[REDACTED]");
		expect(loaded.effectiveConfig.instructions).not.toContain("super-secret-value");
		expect(Buffer.byteLength(loaded.effectiveConfig.instructions, "utf8")).toBeLessThanOrEqual(
			MAX_WATCHDOG_MARKDOWN_BYTES,
		);
		expect(loaded.warnings.some((warning) => warning.message.includes("truncated"))).toBe(true);
	});

	it("atomically replaces valid configuration without leaving temporary files", async () => {
		const { agentDir } = await fixture();
		const path = join(agentDir, "WATCHDOG.yml");
		await writeFile(path, "version: 1\nmodel: old/model\n");
		const config = structuredClone(DEFAULT_ADVISOR_CONFIG);
		config.model = "new/model";
		await saveUserConfigurationAtomic(path, config);
		expect(await readFile(path, "utf8")).toContain("model: new/model");
		expect((await readdir(agentDir)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
	});

	it("preserves the prior valid file when an atomic save cannot create its temporary file", async () => {
		if (process.platform === "win32") return;
		const { agentDir } = await fixture();
		const path = join(agentDir, "WATCHDOG.yml");
		const prior = "version: 1\nmodel: old/model\n";
		await writeFile(path, prior);
		await chmod(agentDir, 0o500);
		const config = structuredClone(DEFAULT_ADVISOR_CONFIG);
		config.model = "new/model";
		try {
			await expect(saveUserConfigurationAtomic(path, config)).rejects.toThrow();
			expect(await readFile(path, "utf8")).toBe(prior);
		} finally {
			await chmod(agentDir, 0o700);
		}
	});
});
