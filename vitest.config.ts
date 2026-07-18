import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		env: {
			PI_CODING_AGENT_DIR: mkdtempSync(join(tmpdir(), "pi-advisor-vitest-agent-")),
		},
		coverage: {
			enabled: false,
			provider: "v8",
			reporter: ["text", "json", "html"],
		},
		include: ["tests/**/*.test.ts"],
		testTimeout: 30_000,
	},
});
