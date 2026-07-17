import { StringEnum } from "@earendil-works/pi-ai";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { HARD_LIMITS, type AdvisorConfig } from "./config.js";
import { estimateTokens, redactSecrets } from "./redaction.js";

export type AdviceSeverity = "nit" | "concern" | "blocker";

export interface AcceptedAdvice {
	note: string;
	severity: AdviceSeverity;
	truncated: boolean;
	originalCharacters: number;
	originalEstimatedTokens: number;
	createdAt: number;
}

export interface AdviceCollector {
	accepted?: AcceptedAdvice;
	validCalls: number;
	suppressedCalls: number;
}

const CONTENT_FREE = new Set([
	"stop",
	"done",
	"complete",
	"ok",
	"lgtm",
	"looks good",
	"all good",
	"no issue",
	"no issues",
	"no concerns",
	"nothing to add",
	"nothing to report",
	"continue",
	"on track",
]);
const TRUNCATION_MARKER = "\n[Advisory note truncated to configured limit]";

function normalizedContent(input: string): string {
	return input
		.normalize("NFKC")
		.toLocaleLowerCase("en-US")
		.replace(/[\p{P}\p{S}]+/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
}

export function isContentFreeAdvice(note: string): boolean {
	return CONTENT_FREE.has(normalizedContent(note));
}

function truncateCharacters(
	input: string,
	maximumCharacters: number,
	maximumUtf16Units: number,
): string {
	const marker = Array.from(TRUNCATION_MARKER);
	while (marker.length > maximumCharacters || marker.join("").length > maximumUtf16Units) {
		marker.pop();
	}
	const markerText = marker.join("");
	const output: string[] = [];
	let utf16Units = 0;
	for (const character of input) {
		if (output.length + marker.length >= maximumCharacters) break;
		if (utf16Units + character.length + markerText.length > maximumUtf16Units) break;
		output.push(character);
		utf16Units += character.length;
	}
	return `${output.join("")}${markerText}`;
}

export function boundAdvice(note: string, config: AdvisorConfig): AcceptedAdvice {
	const safeNote = redactSecrets(note).text;
	const originalCharacters = Array.from(safeNote).length;
	const originalEstimatedTokens = estimateTokens(safeNote);
	const maxCharacters = Math.min(
		config.limits.maxAdviceCharacters,
		HARD_LIMITS.maxAdviceCharacters,
	);
	const maxTokens = Math.min(config.limits.maxAdviceTokens, HARD_LIMITS.maxAdviceTokens);
	const truncated = originalCharacters > maxCharacters || originalEstimatedTokens > maxTokens;
	return {
		note: truncated ? truncateCharacters(safeNote, maxCharacters, maxTokens * 4) : safeNote,
		severity: "concern",
		truncated,
		originalCharacters,
		originalEstimatedTokens,
		createdAt: Date.now(),
	};
}

export function createAdviseTool(
	config: AdvisorConfig,
	collector: AdviceCollector,
): ToolDefinition {
	return {
		name: "advise",
		label: "advise",
		description:
			"Record at most one concise material review note. Do not call this tool when the Executor is on track.",
		parameters: Type.Object(
			{
				note: Type.String({ minLength: 1 }),
				severity: Type.Optional(StringEnum(["nit", "concern", "blocker"] as const)),
				intent: Type.Optional(StringEnum(["review"] as const)),
			},
			{ additionalProperties: false },
		),
		execute(_id, params) {
			collector.validCalls++;
			const input = params as { note: string; severity?: AdviceSeverity; intent?: "review" };
			if (collector.accepted !== undefined || isContentFreeAdvice(input.note)) {
				collector.suppressedCalls++;
			} else {
				collector.accepted = {
					...boundAdvice(input.note, config),
					severity: input.severity ?? "concern",
				};
			}
			return Promise.resolve({
				content: [{ type: "text" as const, text: "Recorded." }],
				details: {},
				terminate: true,
			});
		},
	};
}
