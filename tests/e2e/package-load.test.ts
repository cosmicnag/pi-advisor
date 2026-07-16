import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

interface PackResult {
	filename: string;
	files: { path: string }[];
}

function runPi(args: string[], env: NodeJS.ProcessEnv, input?: string) {
	return spawnSync("pnpm", ["exec", "pi", ...args], {
		cwd: process.cwd(),
		env,
		encoding: "utf8",
		input,
	});
}

describe("packed Pi package", () => {
	it("installs through Pi and starts with no automatic Advisor runtime", () => {
		const root = mkdtempSync(join(tmpdir(), "pi-advisor-packed-e2e-"));
		const unpacked = join(root, "unpacked");
		const agentDir = join(root, "agent");
		mkdirSync(unpacked, { recursive: true });
		mkdirSync(agentDir, { recursive: true });
		const env = {
			...process.env,
			PI_CODING_AGENT_DIR: agentDir,
			PI_OFFLINE: "1",
		};

		try {
			const pack = JSON.parse(
				execFileSync("pnpm", ["pack", "--json"], { cwd: process.cwd(), encoding: "utf8" }),
			) as PackResult;
			const paths = pack.files.map((file) => file.path);
			expect(paths).toContain("src/index.ts");
			expect(paths.some((path) => path === "CONTEXT.md" || path.startsWith("docs/internal/"))).toBe(
				false,
			);

			const archive = resolve(pack.filename);
			execFileSync("tar", ["-xzf", archive, "-C", unpacked]);
			const packageDir = join(unpacked, "package");
			const install = runPi(["install", packageDir, "--approve"], env);
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
			expect(JSON.stringify(commands?.data)).not.toMatch(/"name":"advisor(?::\d+)?"/);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
