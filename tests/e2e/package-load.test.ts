import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

interface PackResult {
	name: string;
	version: string;
	filename: string;
	files: { path: string }[];
}

const projectRoot = process.cwd();
const piExecutable = join(projectRoot, "node_modules", ".bin", "pi");

function runPi(args: string[], cwd: string, env: NodeJS.ProcessEnv, input?: string) {
	return spawnSync(piExecutable, args, {
		cwd,
		env,
		encoding: "utf8",
		input,
	});
}

describe("packed Pi package", () => {
	it("installs through Pi and applies WATCHDOG activation only in approved run modes", () => {
		const root = mkdtempSync(join(tmpdir(), "pi-advisor-packed-e2e-"));
		const unpacked = join(root, "unpacked");
		const installDir = join(root, "install");
		const agentDir = join(root, "agent");
		const archive = join(root, "pi-advisor-package.tgz");
		mkdirSync(unpacked, { recursive: true });
		mkdirSync(installDir, { recursive: true });
		mkdirSync(agentDir, { recursive: true });
		const env = {
			...process.env,
			PI_CODING_AGENT_DIR: agentDir,
			PI_OFFLINE: "1",
		};

		try {
			const pack = JSON.parse(
				execFileSync("pnpm", ["pack", "--out", archive, "--json"], {
					cwd: projectRoot,
					encoding: "utf8",
				}),
			) as PackResult;
			const paths = pack.files.map((file) => file.path);
			expect(pack).toMatchObject({ name: "@ribbons-digital/pi-advisor", version: "0.0.0" });
			expect(paths).toContain("src/index.ts");
			expect(paths).toContain("docs/configuration.md");
			expect(paths).toContain("LICENSE");
			expect(paths).toContain("THIRD_PARTY_NOTICES.md");
			expect(paths.some((path) => path === "CONTEXT.md" || path.startsWith("docs/internal/"))).toBe(
				false,
			);

			expect(resolve(pack.filename)).toBe(resolve(archive));
			execFileSync("tar", ["-xzf", archive, "-C", unpacked]);
			const packedPackageDir = join(unpacked, "package");
			const packedManifest = JSON.parse(
				execFileSync(
					"node",
					[
						"-e",
						"process.stdout.write(JSON.stringify(require(process.argv[1])))",
						join(packedPackageDir, "package.json"),
					],
					{
						encoding: "utf8",
					},
				),
			) as {
				private?: boolean;
				dependencies?: Record<string, string>;
				pi?: { extensions?: string[] };
				publishConfig?: object;
			};
			expect(packedManifest.private).not.toBe(true);
			expect(packedManifest.dependencies).toMatchObject({ typebox: "1.1.38", yaml: "^2.9.0" });
			expect(packedManifest.pi?.extensions).toEqual(["./src/index.ts"]);
			expect(packedManifest.publishConfig).toMatchObject({ access: "public", provenance: true });

			writeFileSync(
				join(installDir, "package.json"),
				`${JSON.stringify(
					{
						private: true,
						packageManager: "pnpm@10.0.0",
						dependencies: { "@ribbons-digital/pi-advisor": `file:${archive}` },
					},
					null,
					2,
				)}\n`,
			);
			execFileSync(
				"pnpm",
				["install", "--offline", "--ignore-workspace", "--config.auto-install-peers=false"],
				{ cwd: installDir, encoding: "utf8" },
			);
			const installedPackageDir = join(
				installDir,
				"node_modules",
				"@ribbons-digital",
				"pi-advisor",
			);
			const installedRequire = createRequire(
				join(realpathSync(installedPackageDir), "package.json"),
			);
			for (const dependency of ["typebox", "yaml"]) {
				const dependencyEntry = installedRequire.resolve(dependency);
				expect(existsSync(dependencyEntry)).toBe(true);
				expect(dependencyEntry).not.toContain(projectRoot);
			}

			const install = runPi(["install", installedPackageDir, "--approve"], root, env);
			expect(install.status, install.stderr).toBe(0);

			const rpc = runPi(
				[
					"--mode",
					"rpc",
					"--no-session",
					"--no-context-files",
					"--no-skills",
					"--no-prompt-templates",
					"--no-themes",
					"--no-tools",
				],
				root,
				env,
				`${JSON.stringify({ id: "state", type: "get_state" })}\n${JSON.stringify({ id: "commands", type: "get_commands" })}\n`,
			);
			expect(rpc.status, rpc.stderr).toBe(0);
			const records = rpc.stdout
				.trim()
				.split("\n")
				.filter(Boolean)
				.map((line) => JSON.parse(line) as unknown) as {
				id?: string;
				success?: boolean;
				data?: Record<string, unknown>;
			}[];
			const state = records.find((record) => record.id === "state");
			const commands = records.find((record) => record.id === "commands");
			expect(state?.success).toBe(true);
			expect(state?.data).toMatchObject({
				isStreaming: false,
				messageCount: 0,
				pendingMessageCount: 0,
			});
			expect(commands?.success).toBe(true);
			const commandList = commands?.data?.commands;
			expect(Array.isArray(commandList)).toBe(true);
			const commandRecords: unknown[] = Array.isArray(commandList) ? commandList : [];
			expect(
				commandRecords.some((command) => {
					if (typeof command !== "object" || command === null) return false;
					const record = command as Record<string, unknown>;
					return record.name === "advisor" && record.source === "extension";
				}),
			).toBe(true);

			writeFileSync(
				join(agentDir, "WATCHDOG.yml"),
				"version: 1\ndefaultEnabled: true\nmodel: missing/provider\neffort: low\n",
			);
			const persistedRpc = runPi(
				[
					"--mode",
					"rpc",
					"--no-session",
					"--no-context-files",
					"--no-skills",
					"--no-prompt-templates",
					"--no-themes",
					"--no-tools",
				],
				root,
				env,
				`${JSON.stringify({ id: "persisted-status", type: "prompt", message: "/advisor status" })}\n`,
			);
			expect(persistedRpc.status, persistedRpc.stderr).toBe(0);
			expect(persistedRpc.stdout).toContain("Effort: low");
			expect(persistedRpc.stdout).toContain(
				"Configured Advisor model missing/provider is unavailable. No fallback was selected.",
			);

			const persistedJson = runPi(
				[
					"--mode",
					"json",
					"--no-session",
					"--no-context-files",
					"--no-skills",
					"--no-prompt-templates",
					"--no-themes",
					"--no-tools",
					"-p",
					"/advisor status",
				],
				root,
				env,
			);
			expect(persistedJson.status, persistedJson.stderr).toBe(0);
			expect(persistedJson.stdout).not.toContain("No fallback was selected");

			writeFileSync(join(agentDir, "WATCHDOG.yml"), "version: [malformed\n");
			const malformed = runPi(
				[
					"--mode",
					"rpc",
					"--no-session",
					"--no-context-files",
					"--no-skills",
					"--no-prompt-templates",
					"--no-themes",
					"--no-tools",
				],
				root,
				env,
				`${JSON.stringify({ id: "malformed-status", type: "prompt", message: "/advisor status" })}\n`,
			);
			expect(malformed.status, malformed.stderr).toBe(0);
			expect(malformed.stdout).toContain("contains malformed YAML and was ignored");
			expect(malformed.stdout).not.toContain("No fallback was selected");

			rmSync(join(agentDir, "WATCHDOG.yml"));
			const explicit = runPi(
				[
					"--mode",
					"rpc",
					"--advisor",
					"--no-session",
					"--no-context-files",
					"--no-skills",
					"--no-prompt-templates",
					"--no-themes",
					"--no-tools",
				],
				root,
				env,
				`${JSON.stringify({ id: "explicit-state", type: "get_state" })}\n`,
			);
			expect(explicit.status, explicit.stderr).toBe(0);
			expect(explicit.stdout).toContain('"id":"explicit-state"');
			expect(explicit.stdout).toContain('"messageCount":0');
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
