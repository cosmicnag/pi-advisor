# Slice 0 Limit Proposal and Approved Slice 1 Defaults

## Measurement method

The deterministic measurement harness serializes Pi's rebuilt active model context for three synthetic profiles and estimates trailing tokens at four UTF-16 code units per token.
The heuristic is conservative enough for policy planning but is not a provider tokenizer.
Slice 1 uses it for context and Advisory note estimates, enforces the configured update limit as four UTF-8 bytes per token, and uses exact provider usage when it is reported.

Run:

```sh
pnpm exec tsx scripts/measure-sessions.ts
```

## Profiles

The small profile contains four ordinary user and assistant turns.
The medium profile contains 24 turns with bounded reasoning and answer text.
The tool-heavy profile contains 12 turns with 12,000-character tool results and follow-up assistant messages.
Exact output is recorded in the internal Slice 0 evidence log.

## Active Slice 1 defaults

The user approved these active Slice 1 defaults:

- Maximum update tokens: 24,000 estimated tokens.
- Maximum pending transcript bytes: 200,000 UTF-8 bytes.
- Maximum context fraction: 0.65 of the selected model context window.
- Reserved response tokens: 8,192.
- Advisor turns per update: 4.
- Advisor tool calls per update: 8.
- Advisory note bound: 2,000 Unicode characters and 512 estimated tokens.
- Session token soft cap: 1,000,000 reported tokens.
- Session cost soft cap: USD 10 when nonzero pricing is reported.

The 200,000-byte pending bound contains the complete representative tool-heavy profile.
The 24,000-token update bound keeps the newest redacted delta and marks discarded older content rather than splitting or compacting it.
When Pi-supplied project context is present, it receives at most one third of the update budget and the newest Executor delta retains at least one byte of capacity.
The context governor pauses before provider submission when the estimated nested transcript plus update exceeds `floor(contextWindow * maxFraction) - reserveTokens`.
The session token and reported-cost caps pause Advisor without interrupting Executor.
The four-turn, eight-tool-call, and Advisory note bounds are conservative judgment defaults intended to constrain loops and context while production evidence is unavailable.

## Active hard maxima

Slice 1 clamps these caller-configurable active fields to package hard maxima:

- Advisory note: 8,000 Unicode characters and 2,048 estimated tokens.
- Advisor turns per update: 12.
- Advisor tool calls per update: 32.
- Pending transcript: 1,000,000 UTF-8 bytes.

Project configuration is not loaded or merged in Slice 1.
The trusted programmatic caller may lower or raise an active default only within the normalization rules and hard maxima implemented for that field.
`maxUpdateTokens`, context fraction and reserve, review cadence fields, and session soft caps do not have additional package hard maxima beyond their normalization minima and the context fraction ceiling of 1.

## Programmatic normalization

`normalizeAdvisorConfig` assumes a complete trusted object and is not the reserved YAML schema-validation pipeline.
It removes duplicate or unsupported tool names and fixes the config version at 1.
It constrains context fraction to 0.01 through 1, reserve tokens to at least 0, and update tokens to at least 1.
It constrains note characters, note tokens, Advisor turns, pending bytes, and reserved re-prime tokens to at least 1 and their listed hard maxima.
It constrains tool calls to 0 through 32, turns between reviews and the session token cap to at least 1, and interval, deferred retention, and the reported-cost cap to at least 0.
Non-finite numeric values in these normalized fields fall back to their release defaults.
Memory suggestion fields and transcript persistence are copied without active runtime validation because those features are reserved.

## Reserved defaults

These approved contract values remain present in `AdvisorConfig` but have no runtime effect through Slice 2 Batch A:

- Maximum re-prime tokens: 32,000, with a reserved hard maximum of 128,000.
- Review cadence: at least one Executor turn and zero milliseconds between reviews.
- Deferred advice retention: 24 hours.
- Memory suggestions: the reserved `enabled` field defaults to true but has no runtime effect through Slice 2 Batch A.
- Memory suggestion cadence: at least eight Executor turns and ten minutes.
- Memory suggestion session cap: five.
- Proposed memory bound: 1,000 characters and 256 estimated tokens, with reserved hard maxima of 4,000 characters and 1,024 estimated tokens.
- Transcript persistence: disabled.

The runtime through Slice 2 Batch A reviews every meaningful completed Executor turn without consulting the reserved cadence fields.
It does not re-prime, expire in-memory deferred advice, compact Advisor context, emit Memory suggestions, or persist a transcript.
Later slices must validate and implement these values before they can govern runtime behavior.
