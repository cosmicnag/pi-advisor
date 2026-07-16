import { SessionManager } from "@earendil-works/pi-coding-agent";

export interface SessionMeasurement {
	scenario: "small" | "medium" | "tool-heavy";
	turns: number;
	entries: number;
	messages: number;
	serializedBytes: number;
	estimatedTokens: number;
	largestMessageBytes: number;
}

function usage(input: number, output: number) {
	return {
		input,
		output,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: input + output,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
	};
}

function measure(
	scenario: SessionMeasurement["scenario"],
	turns: number,
	manager: SessionManager,
): SessionMeasurement {
	const context = manager.buildSessionContext().messages;
	const serialized = JSON.stringify(context);
	const messageSizes = context.map((message) => Buffer.byteLength(JSON.stringify(message), "utf8"));
	return {
		scenario,
		turns,
		entries: manager.getEntries().length,
		messages: context.length,
		serializedBytes: Buffer.byteLength(serialized, "utf8"),
		estimatedTokens: Math.ceil(serialized.length / 4),
		largestMessageBytes: Math.max(0, ...messageSizes),
	};
}

export function measureRepresentativeSessions(): SessionMeasurement[] {
	const small = SessionManager.inMemory();
	for (let turn = 0; turn < 4; turn++) {
		small.appendMessage({
			role: "user",
			content: `small-${String(turn)}-${"u".repeat(80)}`,
			timestamp: turn * 2,
		});
		small.appendMessage({
			role: "assistant",
			content: [{ type: "text", text: `answer-${String(turn)}-${"a".repeat(120)}` }],
			api: "pi-advisor-scripted",
			provider: "fixture",
			model: "fixture",
			usage: usage(100, 40),
			stopReason: "stop",
			timestamp: turn * 2 + 1,
		});
	}

	const medium = SessionManager.inMemory();
	for (let turn = 0; turn < 24; turn++) {
		medium.appendMessage({
			role: "user",
			content: `medium-${String(turn)}-${"u".repeat(300)}`,
			timestamp: turn * 2,
		});
		medium.appendMessage({
			role: "assistant",
			content: [
				{ type: "thinking", thinking: `reasoning-${String(turn)}-${"r".repeat(150)}` },
				{ type: "text", text: `answer-${String(turn)}-${"a".repeat(500)}` },
			],
			api: "pi-advisor-scripted",
			provider: "fixture",
			model: "fixture",
			usage: usage(400, 180),
			stopReason: "stop",
			timestamp: turn * 2 + 1,
		});
	}

	const toolHeavy = SessionManager.inMemory();
	for (let turn = 0; turn < 12; turn++) {
		const callId = `call-${String(turn)}`;
		toolHeavy.appendMessage({
			role: "user",
			content: `tool-heavy-${String(turn)}-${"u".repeat(100)}`,
			timestamp: turn * 4,
		});
		toolHeavy.appendMessage({
			role: "assistant",
			content: [
				{
					type: "toolCall",
					id: callId,
					name: "read",
					arguments: { path: `fixture-${String(turn)}.txt` },
				},
			],
			api: "pi-advisor-scripted",
			provider: "fixture",
			model: "fixture",
			usage: usage(300, 40),
			stopReason: "toolUse",
			timestamp: turn * 4 + 1,
		});
		toolHeavy.appendMessage({
			role: "toolResult",
			toolCallId: callId,
			toolName: "read",
			content: [{ type: "text", text: `result-${String(turn)}\n${"x".repeat(12_000)}` }],
			isError: false,
			timestamp: turn * 4 + 2,
		});
		toolHeavy.appendMessage({
			role: "assistant",
			content: [{ type: "text", text: `observed-${String(turn)}-${"a".repeat(200)}` }],
			api: "pi-advisor-scripted",
			provider: "fixture",
			model: "fixture",
			usage: usage(3_500, 100),
			stopReason: "stop",
			timestamp: turn * 4 + 3,
		});
	}

	return [
		measure("small", 4, small),
		measure("medium", 24, medium),
		measure("tool-heavy", 12, toolHeavy),
	];
}
