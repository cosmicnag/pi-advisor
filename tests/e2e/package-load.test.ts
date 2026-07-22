import { execFileSync, spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

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
			expect(pack).toMatchObject({ name: "@ribbons-digital/pi-advisor", version: "0.2.1" });
			expect(paths).toContain("src/index.ts");
			expect(paths).toContain("docs/configuration.md");
			expect(paths).toContain("docs/assets/advisor-in-action.png");
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
			execFileSync("pnpm", ["install", "--ignore-workspace", "--config.auto-install-peers=false"], {
				cwd: installDir,
				encoding: "utf8",
			});
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

			const userYaml = join(agentDir, "WATCHDOG.yml");
			const scriptedExtension = join(root, "packed-scripted-provider.ts");
			const requestMarker = join(root, "packed-scripted-requests.txt");
			const piAiEntry = pathToFileURL(
				realpathSync(
					join(projectRoot, "node_modules", "@earendil-works", "pi-ai", "dist", "index.js"),
				),
			).href;
			writeFileSync(
				scriptedExtension,
				`import { appendFileSync } from "node:fs";
import { createAssistantMessageEventStream } from ${JSON.stringify(piAiEntry)};

let advisorCalls = 0;
const usage = {
  input: 1,
  output: 1,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 2,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function emit(model, content, stopReason) {
  const stream = createAssistantMessageEventStream();
  const message = {
    role: "assistant",
    content,
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage,
    stopReason,
    timestamp: Date.now(),
  };
  queueMicrotask(() => {
    stream.push({ type: "start", partial: message });
    for (let index = 0; index < content.length; index++) {
      const part = content[index];
      if (part.type === "text") {
        stream.push({ type: "text_start", contentIndex: index, partial: message });
        stream.push({ type: "text_delta", contentIndex: index, delta: part.text, partial: message });
        stream.push({ type: "text_end", contentIndex: index, content: part.text, partial: message });
      } else {
        stream.push({ type: "toolcall_start", contentIndex: index, partial: message });
        stream.push({ type: "toolcall_delta", contentIndex: index, delta: JSON.stringify(part.arguments), partial: message });
        stream.push({ type: "toolcall_end", contentIndex: index, toolCall: part, partial: message });
      }
    }
    stream.push({ type: "done", reason: stopReason, message });
    stream.end();
  });
  return stream;
}

export default function(pi) {
  pi.registerProvider("packed-scripted", {
    name: "Packed scripted provider",
    baseUrl: "https://packed-scripted.invalid",
    apiKey: "packed-scripted-key",
    api: "packed-scripted-api",
    streamSimple(model) {
      appendFileSync(${JSON.stringify(requestMarker)}, model.id + "\\n");
      if (model.id === "advisor") {
        advisorCalls++;
        return advisorCalls === 1
          ? emit(model, [{
              type: "toolCall",
              id: "packed-advice",
              name: "advise",
              arguments: {
                note: "Packed nested review completed through the scripted provider.",
                severity: "concern",
                intent: "review",
                findingKey: "packed-e2e-review",
              },
            }], "toolUse")
          : emit(model, [], "stop");
      }
      return emit(model, [{ type: "text", text: "Packed primary response." }], "stop");
    },
    models: [
      {
        id: "primary",
        name: "Packed primary",
        api: "packed-scripted-api",
        baseUrl: "https://packed-scripted.invalid",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 32000,
        maxTokens: 2000,
      },
      {
        id: "advisor",
        name: "Packed advisor",
        api: "packed-scripted-api",
        baseUrl: "https://packed-scripted.invalid",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 32000,
        maxTokens: 2000,
      },
    ],
  });
}
`,
			);
			writeFileSync(
				userYaml,
				"version: 1\ndefaultEnabled: true\nmodel: packed-scripted/advisor\neffort: off\ntools: []\n",
			);
			const activeReview = runPi(
				[
					"--mode",
					"rpc",
					"--no-session",
					"--no-context-files",
					"--no-skills",
					"--no-prompt-templates",
					"--no-themes",
					"--no-tools",
					"--extension",
					scriptedExtension,
					"--model",
					"packed-scripted/primary",
					"--thinking",
					"off",
				],
				root,
				env,
				`${JSON.stringify({ id: "review", type: "prompt", message: "Run one review." })}\n`,
			);
			expect(activeReview.status, activeReview.stderr).toBe(0);
			expect(activeReview.stdout).toContain('"statusText":"Advisor active"');
			expect(activeReview.stdout).toContain('"kind":"review-outcome"');
			expect(activeReview.stdout).toContain('"outcome":"accepted"');
			expect(activeReview.stdout).toContain(
				"Packed nested review completed through the scripted provider.",
			);
			expect(readFileSync(requestMarker, "utf8")).toContain("advisor");

			const defaultRecordingConfig =
				"version: 1\ndefaultEnabled: true\nmodel: missing/provider\neffort: low\n";
			writeFileSync(userYaml, defaultRecordingConfig);
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
			expect(persistedRpc.stdout).toContain("Local redacted activity record: enabled");
			expect(readFileSync(userYaml, "utf8")).toBe(defaultRecordingConfig);
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

			writeFileSync(
				userYaml,
				"version: 1\ndefaultEnabled: true\nmodel: missing/provider\npersistence:\n  transcript: false\n",
			);
			const optedOut = runPi(
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
				`${JSON.stringify({ id: "opted-out-status", type: "prompt", message: "/advisor status" })}\n`,
			);
			expect(optedOut.status, optedOut.stderr).toBe(0);
			expect(optedOut.stdout).toContain("Local redacted activity record: disabled");

			writeFileSync(userYaml, "version: [malformed\n");
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
			expect(malformed.stdout).toContain("Local redacted activity record: disabled");
			expect(malformed.stdout).not.toContain("No fallback was selected");

			rmSync(userYaml);
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

			// The package is unpublished and this E2E is intentionally offline, so the local
			// package source exercises Pi's update and removal lifecycle. The release-surface
			// contract separately pins the documented unversioned npm source and commands.
			const update = runPi(["update", "--extensions"], root, env);
			expect(update.status, update.stderr).toBe(0);

			const remove = runPi(["remove", installedPackageDir], root, env);
			expect(remove.status, remove.stderr).toBe(0);

			const removedRpc = runPi(
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
				`${JSON.stringify({ id: "removed-commands", type: "get_commands" })}\n`,
			);
			expect(removedRpc.status, removedRpc.stderr).toBe(0);
			const removedRecords = removedRpc.stdout
				.trim()
				.split("\n")
				.filter(Boolean)
				.map((line) => JSON.parse(line) as { id?: string; data?: { commands?: unknown[] } });
			const removedCommands = removedRecords.find((record) => record.id === "removed-commands")
				?.data?.commands;
			expect(Array.isArray(removedCommands)).toBe(true);
			expect(
				removedCommands?.some(
					(command) =>
						typeof command === "object" &&
						command !== null &&
						(command as Record<string, unknown>).name === "advisor",
				),
			).toBe(false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
