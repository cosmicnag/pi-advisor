export const ADVISOR_CONFIG_VERSION = 1 as const;

export const READ_ONLY_TOOL_NAMES = ["read", "grep", "find", "ls"] as const;
export type ReadOnlyToolName = (typeof READ_ONLY_TOOL_NAMES)[number];

export interface AdvisorContextConfig {
	maxFraction: number;
	reserveTokens: number;
	maxUpdateTokens: number;
}

export interface AdvisorLimitConfig {
	maxAdviceCharacters: number;
	maxAdviceTokens: number;
	maxAdvisorTurnsPerUpdate: number;
	maxToolCallsPerUpdate: number;
	maxPendingTranscriptBytes: number;
	maxReprimeTokens: number;
	minTurnsBetweenReviews: number;
	minIntervalMs: number;
	deferredAdviceRetentionHours: number;
	sessionTokenSoftCap: number;
	sessionCostSoftCapUsd: number;
}

export interface MemorySuggestionConfig {
	enabled: boolean;
	minTurnsBetweenSuggestions: number;
	minIntervalMs: number;
	sessionSuggestionCap: number;
	maxProposedMemoryCharacters: number;
	maxProposedMemoryTokens: number;
}

export interface AdvisorConfig {
	version: typeof ADVISOR_CONFIG_VERSION;
	defaultEnabled: boolean;
	model?: string;
	effort: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
	tools: ReadOnlyToolName[];
	instructions: string;
	context: AdvisorContextConfig;
	limits: AdvisorLimitConfig;
	security: {
		additionalProtectedPaths: string[];
		protectedPathExceptions: string[];
	};
	memorySuggestions: MemorySuggestionConfig;
	persistence: {
		transcript: boolean;
	};
}

/**
 * Slice 0 measurement proposal.
 *
 * These values remain subject to explicit user approval before Slice 1.
 */
export const PROPOSED_ADVISOR_CONFIG: AdvisorConfig = {
	version: ADVISOR_CONFIG_VERSION,
	defaultEnabled: false,
	effort: "high",
	tools: [...READ_ONLY_TOOL_NAMES],
	instructions: "",
	context: {
		maxFraction: 0.65,
		reserveTokens: 8_192,
		maxUpdateTokens: 24_000,
	},
	limits: {
		maxAdviceCharacters: 2_000,
		maxAdviceTokens: 512,
		maxAdvisorTurnsPerUpdate: 4,
		maxToolCallsPerUpdate: 8,
		maxPendingTranscriptBytes: 200_000,
		maxReprimeTokens: 32_000,
		minTurnsBetweenReviews: 1,
		minIntervalMs: 0,
		deferredAdviceRetentionHours: 24,
		sessionTokenSoftCap: 1_000_000,
		sessionCostSoftCapUsd: 10,
	},
	security: {
		additionalProtectedPaths: [],
		protectedPathExceptions: [],
	},
	memorySuggestions: {
		enabled: true,
		minTurnsBetweenSuggestions: 8,
		minIntervalMs: 600_000,
		sessionSuggestionCap: 5,
		maxProposedMemoryCharacters: 1_000,
		maxProposedMemoryTokens: 256,
	},
	persistence: {
		transcript: false,
	},
};

export const HARD_LIMITS = {
	maxAdviceCharacters: 8_000,
	maxAdviceTokens: 2_048,
	maxProposedMemoryCharacters: 4_000,
	maxProposedMemoryTokens: 1_024,
	maxAdvisorTurnsPerUpdate: 12,
	maxToolCallsPerUpdate: 32,
	maxPendingTranscriptBytes: 1_000_000,
	maxReprimeTokens: 128_000,
} as const;

export interface ConfigValidationStrategy {
	format: "yaml";
	schema: "typebox-compiled";
	unknownFields: "warn";
	malformedUserConfig: "inactive";
	malformedProjectConfig: "ignore-with-warning";
	projectMerge: "narrow-only";
	apply: "atomic-epoch-rebuild";
}

export const CONFIG_VALIDATION_STRATEGY: ConfigValidationStrategy = {
	format: "yaml",
	schema: "typebox-compiled",
	unknownFields: "warn",
	malformedUserConfig: "inactive",
	malformedProjectConfig: "ignore-with-warning",
	projectMerge: "narrow-only",
	apply: "atomic-epoch-rebuild",
};
