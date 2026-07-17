import { createHash } from "node:crypto";

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

export function normalizeContentFreeAdvice(input: string): string {
	return input
		.normalize("NFKC")
		.toLocaleLowerCase("en-US")
		.replace(/[\p{P}\p{S}]+/gu, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function foldProseCaseOutsideCodeSpans(input: string): string | undefined {
	let output = "";
	let cursor = 0;
	while (cursor < input.length) {
		const openingStart = input.indexOf("`", cursor);
		if (openingStart === -1) {
			return `${output}${input.slice(cursor).toLocaleLowerCase("en-US")}`;
		}
		output += input.slice(cursor, openingStart).toLocaleLowerCase("en-US");
		let openingEnd = openingStart;
		while (input[openingEnd] === "`") openingEnd++;
		const delimiterLength = openingEnd - openingStart;
		let search = openingEnd;
		let closingStart = -1;
		let closingEnd = -1;
		while (search < input.length) {
			const candidateStart = input.indexOf("`", search);
			if (candidateStart === -1) break;
			let candidateEnd = candidateStart;
			while (input[candidateEnd] === "`") candidateEnd++;
			if (candidateEnd - candidateStart === delimiterLength) {
				closingStart = candidateStart;
				closingEnd = candidateEnd;
				break;
			}
			search = candidateEnd;
		}
		if (closingStart === -1) return undefined;
		output += input.slice(openingStart, closingEnd);
		cursor = closingEnd;
	}
	return output;
}

export function normalizeAdviceForDedupe(input: string): string {
	const normalized = input.normalize("NFKC");
	const caseFolded = foldProseCaseOutsideCodeSpans(normalized);
	if (caseFolded === undefined) return normalized.replace(/\s+/g, " ").trim();
	return caseFolded
		.replace(/\s+/g, " ")
		.trim()
		.replace(/(?<=\S)[.,;:?!…]+$/gu, "")
		.trim();
}

export type AdviceDedupeIdentity = Pick<AcceptedAdvice, "note" | "severity">;

export function adviceDedupeKey(advice: AdviceDedupeIdentity): string {
	const identity = JSON.stringify([
		"review",
		advice.severity,
		normalizeAdviceForDedupe(advice.note),
	]);
	return createHash("sha256").update(identity).digest("hex");
}

export class BoundedAdviceDedupe {
	private readonly keys = new Set<string>();

	constructor(readonly capacity = 4_096) {
		if (!Number.isInteger(capacity) || capacity < 1) {
			throw new RangeError("Advice dedupe capacity must be a positive integer");
		}
	}

	has(advice: AdviceDedupeIdentity): boolean {
		return this.keys.has(adviceDedupeKey(advice));
	}

	add(advice: AdviceDedupeIdentity): boolean {
		const key = adviceDedupeKey(advice);
		if (this.keys.has(key)) return false;
		this.keys.add(key);
		if (this.keys.size > this.capacity) {
			const oldest = this.keys.values().next().value;
			if (oldest !== undefined) this.keys.delete(oldest);
		}
		return true;
	}

	delete(advice: AdviceDedupeIdentity): boolean {
		return this.keys.delete(adviceDedupeKey(advice));
	}

	clear(): void {
		this.keys.clear();
	}

	get size(): number {
		return this.keys.size;
	}
}

export function isContentFreeAdvice(note: string): boolean {
	return CONTENT_FREE.has(normalizeContentFreeAdvice(note));
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

export type AdviceDelivery = "active" | "deferred";

export function formatAdviceForDelivery(
	advice: AcceptedAdvice,
	delivery: AdviceDelivery,
	stale: boolean,
): string {
	const labels = [advice.severity, delivery, ...(stale ? ["potentially stale"] : [])];
	const guidance = stale
		? "Peer guidance: verify this still applies, then weigh it rather than obeying blindly."
		: "Peer guidance: weigh this rather than obeying blindly.";
	return `[Advisor ${labels.join(" - ")}]\n${advice.note}\n\n${guidance}`;
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
