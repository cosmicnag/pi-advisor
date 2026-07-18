import type { CustomEntry, MessageRenderer, Theme } from "@earendil-works/pi-coding-agent";
import { Box, Container, Spacer, Text, type Component } from "@earendil-works/pi-tui";

import type { AdviceDelivery, AdviceSeverity } from "./advice.js";

export const ADVISOR_LATE_ENTRY_TYPE = "pi-advisor-late-note";

export interface AdvicePresentationNote {
	intent: "review";
	note: string;
	severity: AdviceSeverity;
	delivery: AdviceDelivery;
	stale?: boolean;
	truncated: boolean;
	originalCharacters: number;
	originalEstimatedTokens: number;
	createdAt: number;
	deliveryId?: string;
	displayedInEntry?: boolean;
}

export interface AdviceMessageDetails extends Partial<AdvicePresentationNote> {
	notes: AdvicePresentationNote[];
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

function parsePresentationNote(value: unknown): AdvicePresentationNote | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const note = value as Record<string, unknown>;
	if (
		note.intent !== "review" ||
		typeof note.note !== "string" ||
		!isAdviceSeverity(note.severity) ||
		!isAdviceDelivery(note.delivery) ||
		typeof note.truncated !== "boolean" ||
		!isFiniteNonNegative(note.originalCharacters) ||
		!isFiniteNonNegative(note.originalEstimatedTokens) ||
		!isRenderableTimestamp(note.createdAt)
	) {
		return undefined;
	}
	return {
		intent: "review",
		note: note.note,
		severity: note.severity,
		delivery: note.delivery,
		...(note.stale === true ? { stale: true } : {}),
		truncated: note.truncated,
		originalCharacters: note.originalCharacters,
		originalEstimatedTokens: note.originalEstimatedTokens,
		createdAt: note.createdAt,
		...(typeof note.deliveryId === "string" ? { deliveryId: note.deliveryId } : {}),
		...(note.displayedInEntry === true ? { displayedInEntry: true } : {}),
	};
}

export function adviceNotesFromDetails(details: unknown): AdvicePresentationNote[] {
	if (typeof details !== "object" || details === null) return [];
	const values = (details as Record<string, unknown>).notes;
	if (!Array.isArray(values)) return [];
	return values
		.map((value) => parsePresentationNote(value))
		.filter((value): value is AdvicePresentationNote => value !== undefined);
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

export function renderAdviceCards(
	notes: readonly AdvicePresentationNote[],
	expanded: boolean,
	theme: Theme,
	now = Date.now(),
): Component {
	const container = new Container();
	for (const [index, note] of notes.entries()) {
		if (index > 0) container.addChild(new Spacer(1));
		const color = severityColor(note.severity);
		const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
		const heading = `${theme.fg(color, theme.bold("Advisor"))} ${theme.fg(
			color,
			note.severity.toUpperCase(),
		)}`;
		box.addChild(new Text(heading, 0, 0));
		box.addChild(new Spacer(1));
		box.addChild(new Text(theme.fg("customMessageText", sanitizeTerminalText(note.note)), 0, 0));
		const metadata = [
			formatDeliveryLabel(note.delivery),
			formatAge(note.createdAt, now),
			...(note.stale ? ["potentially stale"] : []),
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
		container.addChild(box);
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
