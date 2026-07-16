import { describe, expect, it } from "vitest";

import { HARD_LIMITS, PROPOSED_ADVISOR_CONFIG } from "../../src/config.js";
import { measureRepresentativeSessions } from "../fixtures/session-measurements.js";

describe("Slice 0 representative session measurements", () => {
	it("supports bounded update and pending-byte proposals", () => {
		const [small, medium, toolHeavy] = measureRepresentativeSessions();
		if (small === undefined || medium === undefined || toolHeavy === undefined) {
			throw new Error("Expected all representative measurements");
		}
		expect(small).toMatchObject({ scenario: "small", turns: 4, entries: 8, messages: 8 });
		expect(medium).toMatchObject({ scenario: "medium", turns: 24, entries: 48, messages: 48 });
		expect(toolHeavy).toMatchObject({
			scenario: "tool-heavy",
			turns: 12,
			entries: 48,
			messages: 48,
		});
		expect(toolHeavy.serializedBytes).toBeLessThan(
			PROPOSED_ADVISOR_CONFIG.limits.maxPendingTranscriptBytes,
		);
		expect(toolHeavy.estimatedTokens).toBeGreaterThan(
			PROPOSED_ADVISOR_CONFIG.context.maxUpdateTokens,
		);
		expect(HARD_LIMITS.maxPendingTranscriptBytes).toBeGreaterThan(
			PROPOSED_ADVISOR_CONFIG.limits.maxPendingTranscriptBytes,
		);
	});
});
