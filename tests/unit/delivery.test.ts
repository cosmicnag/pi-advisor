import { describe, expect, it } from "vitest";

import { selectAdviceDispatch, type AdviceDispatchState } from "../../src/index.js";

const idleMemory: AdviceDispatchState = {
	forceDeferred: false,
	aborted: false,
	idle: true,
	newerInstructionInput: false,
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

	it("follows up for a stale idle Memory suggestion without newer instruction input", () => {
		const chronologicallyStale = { ...idleMemory, stale: true };
		expect(selectAdviceDispatch(chronologicallyStale)).toBe("followUp");
	});

	it("defers an idle Memory suggestion after newer instruction input", () => {
		expect(selectAdviceDispatch({ ...idleMemory, newerInstructionInput: true })).toBe("deferred");
	});

	it("never follows up for ordinary idle advice or unavailable capability", () => {
		expect(selectAdviceDispatch({ ...idleMemory, memorySuggestion: false })).toBe("deferred");
		expect(selectAdviceDispatch({ ...idleMemory, memoryCapabilityAvailable: false })).toBe(
			"deferred",
		);
	});

	it("preserves forced and aborted deferral boundaries", () => {
		expect(selectAdviceDispatch({ ...idleMemory, forceDeferred: true })).toBe("deferred");
		expect(selectAdviceDispatch({ ...idleMemory, aborted: true })).toBe("deferred");
		expect(
			selectAdviceDispatch({
				...idleMemory,
				forceDeferred: true,
				aborted: true,
			}),
		).toBe("deferred");
	});
});
