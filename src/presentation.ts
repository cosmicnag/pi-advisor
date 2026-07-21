import type { CustomEntry, MessageRenderer, Theme } from "@earendil-works/pi-coding-agent";
import {
	Box,
	Container,
	Spacer,
	Text,
	truncateToWidth,
	type Component,
} from "@earendil-works/pi-tui";

import type { AdviceDelivery, AdviceSeverity, MemorySuggestionQueueState } from "./advice.js";
import { HARD_LIMITS } from "./config.js";
import {
	isMemorySuggestionBasis,
	isMemorySuggestionCategory,
	type MemorySuggestionBasis,
	type MemorySuggestionCategory,
} from "./memory-suggestions.js";
import { MAX_DEFERRED_DELIVERY_BYTES, MAX_PENDING_ADVICE_ITEMS } from "./delivery.js";

export const ADVISOR_LATE_ENTRY_TYPE = "pi-advisor-late-note";

interface AdvicePresentationBase {
	note: string;
	delivery: AdviceDelivery;
	stale?: boolean;
	truncated: boolean;
	originalCharacters: number;
	originalEstimatedTokens: number;
	createdAt: number;
	deliveryId?: string;
	reviewId?: string;
	displayedInEntry?: boolean;
	restoredAfterResume?: boolean;
}

export interface ReviewAdvicePresentationNote extends AdvicePresentationBase {
	intent: "review";
	severity: AdviceSeverity;
}

export interface MemorySuggestionPresentationNote extends AdvicePresentationBase {
	intent: "memory-suggestion";
	memory: {
		text: string;
		category: MemorySuggestionCategory;
		basis: MemorySuggestionBasis;
	};
	queueState?: MemorySuggestionQueueState;
}

export type AdvicePresentationNote =
	| ReviewAdvicePresentationNote
	| MemorySuggestionPresentationNote;

export interface AdviceMessageDetails {
	notes: AdvicePresentationNote[];
	[key: string]: unknown;
}

export interface LateAdviceEntryData {
	note: AdvicePresentationNote;
	displayedAt: number;
}

function sanitizeXmlCharacters(input: string): string {
	let output = "";
	for (const character of input) {
		const codePoint = character.codePointAt(0) ?? 0;
		const valid =
			codePoint === 0x9 ||
			codePoint === 0xa ||
			codePoint === 0xd ||
			(codePoint >= 0x20 && codePoint <= 0xd7ff) ||
			(codePoint >= 0xe000 && codePoint <= 0xfffd) ||
			(codePoint >= 0x10000 && codePoint <= 0x10ffff);
		output += valid ? character : "\uFFFD";
	}
	return output;
}

export function escapeXmlText(input: string): string {
	return sanitizeXmlCharacters(input)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

export function escapeXmlAttribute(input: string): string {
	return escapeXmlText(input).replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function sanitizeTerminalText(input: string): string {
	let output = "";
	for (const character of input) {
		const codePoint = character.codePointAt(0) ?? 0;
		const allowedWhitespace = codePoint === 0x9 || codePoint === 0xa;
		const control = codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f);
		output += allowedWhitespace || !control ? character : "\uFFFD";
	}
	return output;
}

function isAdviceSeverity(value: unknown): value is AdviceSeverity {
	return value === "nit" || value === "concern" || value === "blocker";
}

function isAdviceDelivery(value: unknown): value is AdviceDelivery {
	return value === "active" || value === "deferred";
}

function isFiniteNonNegative(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isRenderableTimestamp(value: unknown): value is number {
	return isFiniteNonNegative(value) && value <= 8_640_000_000_000_000;
}

function textFitsBound(value: unknown, maximumCharacters: number): value is string {
	if (typeof value !== "string" || value.length > maximumCharacters * 2) return false;
	return Array.from(value).length <= maximumCharacters;
}

function parsePresentationBase(note: Record<string, unknown>): AdvicePresentationBase | undefined {
	if (
		!textFitsBound(note.note, HARD_LIMITS.maxAdviceCharacters) ||
		!isAdviceDelivery(note.delivery) ||
		typeof note.truncated !== "boolean" ||
		!isFiniteNonNegative(note.originalCharacters) ||
		!isFiniteNonNegative(note.originalEstimatedTokens) ||
		!isRenderableTimestamp(note.createdAt)
	) {
		return undefined;
	}
	return {
		note: note.note,
		delivery: note.delivery,
		...(note.stale === true ? { stale: true } : {}),
		truncated: note.truncated,
		originalCharacters: note.originalCharacters,
		originalEstimatedTokens: note.originalEstimatedTokens,
		createdAt: note.createdAt,
		...(typeof note.deliveryId === "string" && note.deliveryId.length <= 512
			? { deliveryId: note.deliveryId }
			: {}),
		...(typeof note.reviewId === "string" && note.reviewId.length <= 128
			? { reviewId: note.reviewId }
			: {}),
		...(note.displayedInEntry === true ? { displayedInEntry: true } : {}),
		...(note.restoredAfterResume === true ? { restoredAfterResume: true } : {}),
	};
}

function parsePresentationNote(value: unknown): AdvicePresentationNote | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const note = value as Record<string, unknown>;
	const base = parsePresentationBase(note);
	if (base === undefined) return undefined;
	if (note.intent === "review" && isAdviceSeverity(note.severity)) {
		return { ...base, intent: "review", severity: note.severity };
	}
	if (
		note.intent !== "memory-suggestion" ||
		typeof note.memory !== "object" ||
		note.memory === null
	) {
		return undefined;
	}
	const memory = note.memory as Record<string, unknown>;
	if (
		!textFitsBound(memory.text, HARD_LIMITS.maxProposedMemoryCharacters) ||
		!isMemorySuggestionCategory(memory.category) ||
		!isMemorySuggestionBasis(memory.basis) ||
		(note.queueState !== undefined && note.queueState !== "could-not-queue")
	) {
		return undefined;
	}
	return {
		...base,
		intent: "memory-suggestion",
		memory: { text: memory.text, category: memory.category, basis: memory.basis },
		...(note.queueState === "could-not-queue" ? { queueState: note.queueState } : {}),
	};
}

export function adviceNotesFromDetails(details: unknown): AdvicePresentationNote[] {
	if (typeof details !== "object" || details === null) return [];
	const values = (details as Record<string, unknown>).notes;
	if (!Array.isArray(values) || values.length > MAX_PENDING_ADVICE_ITEMS) return [];
	const notes: AdvicePresentationNote[] = [];
	let retainedBytes = Buffer.byteLength("[]", "utf8");
	for (const value of values) {
		const note = parsePresentationNote(value);
		if (note === undefined) return [];
		const separatorBytes = notes.length === 0 ? 0 : Buffer.byteLength(",", "utf8");
		retainedBytes += separatorBytes + Buffer.byteLength(JSON.stringify(note), "utf8");
		if (retainedBytes > MAX_DEFERRED_DELIVERY_BYTES) return [];
		notes.push(note);
	}
	return notes;
}

function formatAge(createdAt: number, now: number): string {
	const seconds = Math.max(0, Math.floor((now - createdAt) / 1_000));
	if (seconds < 5) return "just now";
	if (seconds < 60) return `${String(seconds)}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${String(minutes)}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${String(hours)}h ago`;
	return `${String(Math.floor(hours / 24))}d ago`;
}

function severityColor(severity: AdviceSeverity): "accent" | "warning" | "error" {
	if (severity === "blocker") return "error";
	if (severity === "concern") return "warning";
	return "accent";
}

function formatDeliveryLabel(delivery: AdviceDelivery): string {
	return delivery === "active" ? "active guidance" : "next-turn guidance";
}

class AdvisorCardBorder implements Component {
	constructor(
		private readonly child: Component,
		private readonly theme: Theme,
		private readonly color: "accent" | "warning" | "error",
	) {}

	invalidate(): void {
		this.child.invalidate();
	}

	render(width: number): string[] {
		const availableWidth = Math.max(1, width);
		const prefix = `${this.theme.fg(this.color, "│")} `;
		return this.child
			.render(Math.max(1, availableWidth - 2))
			.map((line) => truncateToWidth(`${prefix}${line}`, availableWidth));
	}
}

export function renderAdviceCards(
	notes: readonly AdvicePresentationNote[],
	expanded: boolean,
	theme: Theme,
	now = Date.now(),
): Component {
	const container = new Container();
	for (const [index, note] of notes.entries()) {
		if (index > 0) container.addChild(new Spacer(1));
		const color = note.intent === "review" ? severityColor(note.severity) : "accent";
		const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
		const label =
			note.intent === "review"
				? note.severity.toUpperCase()
				: note.queueState === "could-not-queue"
					? "MEMORY SUGGESTION - COULD NOT QUEUE"
					: "MEMORY SUGGESTION";
		const heading = `${theme.fg(color, theme.bold("Advisor"))} ${theme.fg(color, label)}`;
		box.addChild(new Text(heading, 0, 0));
		box.addChild(new Spacer(1));
		box.addChild(new Text(theme.fg("customMessageText", sanitizeTerminalText(note.note)), 0, 0));
		if (note.intent === "memory-suggestion") {
			box.addChild(new Spacer(1));
			box.addChild(new Text(theme.fg("muted", "Proposed memory"), 0, 0));
			box.addChild(
				new Text(theme.fg("customMessageText", sanitizeTerminalText(note.memory.text)), 0, 0),
			);
		}
		const metadata = [
			formatDeliveryLabel(note.delivery),
			formatAge(note.createdAt, now),
			...(note.intent === "memory-suggestion" ? [note.memory.category, note.memory.basis] : []),
			...(note.stale ? ["potentially stale"] : []),
			...(note.restoredAfterResume ? ["restored after resume"] : []),
		];
		box.addChild(new Spacer(1));
		box.addChild(new Text(theme.fg(note.stale ? "warning" : "muted", metadata.join(" · ")), 0, 0));
		if (expanded) {
			const details = [
				`created ${new Date(note.createdAt).toISOString()}`,
				`${String(note.originalCharacters)} characters`,
				`~${String(note.originalEstimatedTokens)} tokens`,
				...(note.truncated ? ["note truncated"] : []),
			];
			box.addChild(new Text(theme.fg("dim", details.join(" · ")), 0, 0));
		}
		container.addChild(new AdvisorCardBorder(box, theme, color));
	}
	return container;
}

export function renderAdviceMessage(
	message: Parameters<MessageRenderer>[0],
	options: { expanded: boolean },
	theme: Theme,
): Component | undefined {
	const notes = adviceNotesFromDetails(message.details).filter(
		(note) => note.displayedInEntry !== true,
	);
	return notes.length === 0 ? undefined : renderAdviceCards(notes, options.expanded, theme);
}

export function renderLateAdviceEntry(
	entry: CustomEntry<LateAdviceEntryData>,
	options: { expanded: boolean },
	theme: Theme,
): Component | undefined {
	const note = parsePresentationNote(entry.data?.note);
	return note === undefined ? undefined : renderAdviceCards([note], options.expanded, theme);
}
