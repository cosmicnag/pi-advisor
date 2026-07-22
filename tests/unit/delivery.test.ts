import { describe, expect, it } from "vitest";

import { selectAdviceDispatch, type AdviceDispatchState } from "../../src/index.js";

const idleMemory: AdviceDispatchState = {
	forceDeferred: false,
	aborted: false,
	idle: true,
	stale: false,
	memorySuggestion: true,
	memoryCapabilityAvailable: true,
};

describe("Advisor delivery selection", () => {
	it("steers any accepted advice while the Executor is running", () => {
		expect(selectAdviceDispatch({ ...idleMemory, idle: false })).toBe("steer");
		expect(
			selectAdviceDispatch({
				...idleMemory,
				idle: false,
				memoryCapabilityAvailable: false,
			}),
		).toBe("steer");
	});

	it("triggers a follow-up only for a current idle Memory suggestion with capability", () => {
		expect(selectAdviceDispatch(idleMemory)).toBe("followUp");
		expect(selectAdviceDispatch({ ...idleMemory, memoryCapabilityAvailable: false })).toBe(
			"deferred",
		);
		expect(selectAdviceDispatch({ ...idleMemory, stale: true })).toBe("deferred");
		expect(selectAdviceDispatch({ ...idleMemory, memorySuggestion: false })).toBe("deferred");
	});

	it("preserves forced and aborted deferral boundaries", () => {
		expect(selectAdviceDispatch({ ...idleMemory, forceDeferred: true })).toBe("deferred");
		expect(selectAdviceDispatch({ ...idleMemory, aborted: true })).toBe("deferred");
	});
});
