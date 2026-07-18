import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	DEFAULT_ADVISOR_CONFIG,
	loadAdvisorConfiguration,
	MAX_WATCHDOG_MARKDOWN_BYTES,
	pickAdvisorModelAndEffort,
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
