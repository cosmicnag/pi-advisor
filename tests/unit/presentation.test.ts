import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { describe, expect, it } from "vitest";

import {
	DEFAULT_ADVISOR_CONFIG,
	escapeXmlAttribute,
	escapeXmlText,
	formatAdviceForDelivery,
	formatAdvisorDiagnosticsDump,
	MAX_ADVISOR_DUMP_BYTES,
	renderAdviceCards,
	renderAdviceMessage,
	type AdvicePresentationNote,
	type AdvisorRuntimeStatus,
} from "../../src/index.js";

function fixtureTheme(ansi: boolean): Theme {
	const style = (open: string, text: string): string =>
		ansi ? `\u001B[${open}m${text}\u001B[0m` : text;
	return {
		fg: (_color: string, text: string) => style("33", text),
		bg: (_color: string, text: string) => style("40", text),
		bold: (text: string) => style("1", text),
		italic: (text: string) => text,
		underline: (text: string) => text,
		inverse: (text: string) => text,
		strikethrough: (text: string) => text,
	} as Theme;
}

function presentationNote(overrides: Partial<AdvicePresentationNote> = {}): AdvicePresentationNote {
	return {
		intent: "review",
		note: "Verify the narrow and wide rendering path before shipping this longer advisory note.",
		severity: "concern",
		delivery: "deferred",
		stale: true,
		truncated: false,
		originalCharacters: 84,
		originalEstimatedTokens: 21,
		createdAt: 1_700_000_000_000,
		...overrides,
	};
}

function runtimeStatus(): AdvisorRuntimeStatus {
	return {
		enabled: true,
		active: true,
		paused: false,
		activationSource: "session-command",
		model: "fixture/model",
		effort: "high",
		backlog: false,
		pendingTranscriptBytes: 0,
		maxPendingTranscriptBytesObserved: 0,
		contextEstimateTokens: 20,
		contextLimitTokens: 100,
		usage: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10, costUsd: 0.01 },
		reviewsCompleted: 1,
		silentReviews: 0,
		failedReviews: 0,
		deliveryFailures: 0,
		notesDelivered: 1,
		activeNotesPending: 0,
		deferredNotesPending: 0,
		notesSuppressed: 0,
		redactions: 0,
		consecutiveFailures: 0,
		branchResets: 0,
		warnings: 0,
		epoch: 1,
		nestedExtensionCount: 0,
		nestedActiveTools: ["read", "advise"],
	};
}

describe("Slice 2 Batch B presentation and diagnostics", () => {
	it("escapes XML text, attributes, and invalid XML control characters", () => {
		expect(escapeXmlText(`A & B < C > D\u0000 "quoted"`)).toBe(
			`A &amp; B &lt; C &gt; D\uFFFD "quoted"`,
		);
		expect(escapeXmlAttribute(`A & B < C > D "quoted" 'single'`)).toBe(
			"A &amp; B &lt; C &gt; D &quot;quoted&quot; &apos;single&apos;",
		);
		const rendered = formatAdviceForDelivery(
			presentationNote({ note: `Compare <old> & "new" before 'ship'.` }),
			"active",
			false,
		);
		expect(rendered).toContain("<note>Compare &lt;old&gt; &amp; \"new\" before 'ship'.</note>");
		expect(rendered).not.toContain("<old>");
	});

	it("neutralizes carriage returns in terminal-rendered note text", () => {
		const lines = renderAdviceCards(
			[presentationNote({ note: "safe text\roverwrite attempt" })],
			false,
			fixtureTheme(false),
			1_700_000_000_000,
		).render(80);
		const rendered = lines.join("\n");
		expect(rendered).not.toContain("\r");
		expect(rendered).toContain("safe text\uFFFDoverwrite attempt");
	});

	it.each([
		{ width: 24, expanded: false },
		{ width: 100, expanded: true },
	])("keeps $width-column advice cards within terminal width", ({ width, expanded }) => {
		for (const theme of [fixtureTheme(false), fixtureTheme(true)]) {
			const component = renderAdviceCards(
				[presentationNote(), presentationNote({ severity: "blocker", note: "Second note." })],
				expanded,
				theme,
				1_700_000_065_000,
			);
			const lines = component.render(width);
			expect(lines.length).toBeGreaterThan(0);
			for (const line of lines) expect(visibleWidth(line)).toBeLessThanOrEqual(width);
		}
	});

	it("falls back to Pi rendering when message details are missing or malformed", () => {
		expect(
			renderAdviceMessage(
				{
					role: "custom",
					customType: "pi-advisor-note",
					content: "legacy advice",
					display: true,
					details: { notes: [{ invalid: true }] },
					timestamp: 1_700_000_000_000,
				},
				{ expanded: false },
				fixtureTheme(false),
			),
		).toBeUndefined();
		expect(
			renderAdviceMessage(
				{
					role: "custom",
					customType: "pi-advisor-note",
					content: "invalid timestamp advice",
					display: true,
					details: {
						notes: [presentationNote({ createdAt: 8_640_000_000_000_001 })],
					},
					timestamp: 1_700_000_000_000,
				},
				{ expanded: false },
				fixtureTheme(false),
			),
		).toBeUndefined();
	});

	it("creates a bounded redacted dump without transcripts, notes, instructions, or paths", () => {
		const status = runtimeStatus();
		status.lastFailure = "Bearer dump-secret-token-value";
		status.lastDeliveryFailure = "TOKEN=dump-delivery-secret-value";
		const config = structuredClone(DEFAULT_ADVISOR_CONFIG);
		config.model = "provider/sk-test-abcdefghijklmnop";
		config.instructions = "private review instruction";
		config.security.additionalProtectedPaths = ["private/project/path"];
		const dump = formatAdvisorDiagnosticsDump(status, config, 1_700_000_000_000);

		expect(Buffer.byteLength(dump, "utf8")).toBeLessThanOrEqual(MAX_ADVISOR_DUMP_BYTES);
		expect(dump).toContain("Advisor diagnostics (redacted)");
		expect(dump).toContain("[REDACTED]");
		expect(dump).not.toContain("dump-secret-token-value");
		expect(dump).not.toContain("dump-delivery-secret-value");
		expect(dump).not.toContain("private review instruction");
		expect(dump).not.toContain("private/project/path");
		expect(dump).toContain('"executorTranscriptIncluded": false');
		expect(dump).toContain('"noteContentIncluded": false');
		expect(() => {
			JSON.parse(dump.slice(dump.indexOf("\n") + 1));
		}).not.toThrow();

		status.nestedActiveTools = Array.from(
			{ length: 5_000 },
			(_, index) => `oversized-tool-${String(index)}`,
		);
		const fallbackDump = formatAdvisorDiagnosticsDump(status, config, 1_700_000_000_000);
		const fallback: unknown = JSON.parse(fallbackDump.slice(fallbackDump.indexOf("\n") + 1));
		expect(Buffer.byteLength(fallbackDump, "utf8")).toBeLessThanOrEqual(MAX_ADVISOR_DUMP_BYTES);
		expect(fallback).toMatchObject({ truncated: true });
	});
});
