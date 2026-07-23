import type { AssistantMessage } from "@earendil-works/pi-ai";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";

import {
	ADVISOR_CUSTOM_TYPE,
	branchHasNewerInstructionInput,
	cursorAtTail,
} from "../../src/index.js";

function assistant(content: AssistantMessage["content"]): AssistantMessage {
	return {
		role: "assistant",
		content,
		api: "transcript-test",
		provider: "test",
		model: "test",
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

type AppendEntry = (manager: SessionManager, rootId: string) => void;

const blockingEntries: { label: string; append: AppendEntry }[] = [
	{
		label: "user message",
		append: (manager) =>
			void manager.appendMessage({ role: "user", content: "new instruction", timestamp: 2 }),
	},
	{
		label: "visible bash execution",
		append: (manager) =>
			void manager.appendMessage({
				role: "bashExecution",
				command: "touch visible",
				output: "",
				exitCode: 0,
				cancelled: false,
				truncated: false,
				timestamp: 2,
			}),
	},
	{
		label: "context-excluded bash execution",
		append: (manager) =>
			void manager.appendMessage({
				role: "bashExecution",
				command: "touch hidden",
				output: "",
				exitCode: 0,
				cancelled: false,
				truncated: false,
				excludeFromContext: true,
				timestamp: 2,
			}),
	},
	{
		label: "non-Advisor custom message entry",
		append: (manager) =>
			void manager.appendCustomMessageEntry(
				"foreign-extension",
				"Apply this extension instruction.",
				false,
			),
	},
	{
		label: "non-Advisor custom-role instruction message",
		append: (manager) =>
			void manager.appendMessage({
				role: "custom",
				customType: "foreign-instruction",
				content: "Apply this custom instruction.",
				display: false,
				timestamp: 2,
			}),
	},
];

const nonBlockingEntries: { label: string; append: AppendEntry }[] = [
	{
		label: "Executor assistant text",
		append: (manager) => void manager.appendMessage(assistant([{ type: "text", text: "done" }])),
	},
	{
		label: "Executor assistant tool call",
		append: (manager) =>
			void manager.appendMessage(
				assistant([{ type: "toolCall", id: "read-1", name: "read", arguments: {} }]),
			),
	},
	{
		label: "tool result",
		append: (manager) =>
			void manager.appendMessage({
				role: "toolResult",
				toolCallId: "read-1",
				toolName: "read",
				content: [{ type: "text", text: "result" }],
				isError: false,
				timestamp: 2,
			}),
	},
	{
		label: "Advisor custom message entry",
		append: (manager) =>
			void manager.appendCustomMessageEntry(ADVISOR_CUSTOM_TYPE, "Advisor note", true),
	},
	{
		label: "Advisor custom-role message",
		append: (manager) =>
			void manager.appendMessage({
				role: "custom",
				customType: ADVISOR_CUSTOM_TYPE,
				content: "Advisor note",
				display: true,
				timestamp: 2,
			}),
	},
	{
		label: "non-content custom metadata",
		append: (manager) => void manager.appendCustomEntry("extension-state", { current: true }),
	},
	{
		label: "model metadata",
		append: (manager) => void manager.appendModelChange("test", "new-model"),
	},
	{
		label: "thinking-level metadata",
		append: (manager) => void manager.appendThinkingLevelChange("high"),
	},
	{
		label: "label metadata",
		append: (manager, rootId) => void manager.appendLabelChange(rootId, "checkpoint"),
	},
	{
		label: "session-info metadata",
		append: (manager) => void manager.appendSessionInfo("renamed session"),
	},
];

describe("post-window instruction input classification", () => {
	it.each(blockingEntries)("blocks after a $label", ({ append }) => {
		const manager = SessionManager.inMemory();
		const rootId = manager.appendMessage({ role: "user", content: "review this", timestamp: 1 });
		const window = cursorAtTail(manager.getBranch());
		append(manager, rootId);
		expect(branchHasNewerInstructionInput(manager.getBranch(), window)).toBe(true);
	});

	it.each(nonBlockingEntries)("ignores post-window $label", ({ append }) => {
		const manager = SessionManager.inMemory();
		const rootId = manager.appendMessage({ role: "user", content: "review this", timestamp: 1 });
		const window = cursorAtTail(manager.getBranch());
		append(manager, rootId);
		expect(branchHasNewerInstructionInput(manager.getBranch(), window)).toBe(false);
	});
});
