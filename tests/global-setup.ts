import { rmSync } from "node:fs";

export default function setup(): () => void {
	const testAgentDir = process.env.PI_ADVISOR_VITEST_AGENT_DIR;
	return () => {
		if (testAgentDir !== undefined) rmSync(testAgentDir, { recursive: true, force: true });
		delete process.env.PI_ADVISOR_VITEST_AGENT_DIR;
	};
}
