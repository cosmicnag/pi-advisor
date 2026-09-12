import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineConfig } from "vitest/config";

const testAgentDir = mkdtempSync(join(tmpdir(), "pi-advisor-vitest-agent-"));
process.env.PI_ADVISOR_VITEST_AGENT_DIR = testAgentDir;

export default defineConfig({
	test: {
		// The harness repoints PI_CODING_AGENT_DIR per session; serialize files
		// so one file's harness never observes another file's agent dir.
		fileParallelism: false,
		env: {
			PI_CODING_AGENT_DIR: testAgentDir,
		},
		globalSetup: ["./tests/global-setup.ts"],
		coverage: {
			enabled: false,
			provider: "v8",
			reporter: ["text", "json", "html"],
		},
		include: ["tests/**/*.test.ts"],
		testTimeout: 30_000,
	},
});
