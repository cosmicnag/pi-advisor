# Slice 0 Limit Proposal

## Measurement method

The deterministic measurement harness serializes Pi's rebuilt active model context for three synthetic profiles and estimates trailing tokens at four characters per token.
The heuristic is conservative enough for policy planning but is not a provider tokenizer.
Production accounting should prefer exact provider usage and use the heuristic only for unreported trailing content.

Run:

```sh
pnpm exec tsx scripts/measure-sessions.ts
```

## Profiles

The small profile contains four ordinary user and assistant turns.
The medium profile contains 24 turns with bounded reasoning and answer text.
The tool-heavy profile contains 12 turns with 12,000-character tool results and follow-up assistant messages.
Exact output is recorded in the internal Slice 0 evidence log.

## Proposed release defaults

The session profiles directly support the update, pending-byte, re-prime, and Memory suggestion cadence proposals.
The remaining values are conservative engineering judgment defaults inherited from the approved specification and require user approval plus later production validation.

- Maximum update tokens: 24,000.
- Maximum pending transcript bytes: 200,000.
- Maximum re-prime tokens: 32,000.
- Maximum context fraction: 0.65.
- Reserved response tokens: 8,192.
- Advisor turns per update: 4.
- Advisor tool calls per update: 8.
- Advisory note bound: 2,000 characters and 512 estimated tokens.
- Session token soft cap: 1,000,000.
- Session cost soft cap: USD 10 when pricing is available.
- Deferred advice retention: 24 hours.

The 200,000-byte pending bound contains the complete representative tool-heavy profile, while the 24,000-token update bound requires large accumulated contexts to be split, truncated, compacted, or re-primed rather than copied into one update.
The 32,000-token re-prime bound is larger than one update but remains bounded.
The session token and cost caps are judgment-based safety stops rather than measured spending targets.
The four-turn, eight-tool-call, and Advisory note bounds are also judgment defaults intended to constrain loops and context while production evidence is unavailable.

## Memory suggestion proposal

- Minimum eight Executor turns between delivered suggestions.
- Minimum ten minutes between delivered suggestions.
- Maximum five delivered suggestions per primary Pi session.
- Proposed memory bound of 1,000 characters and 256 estimated tokens.
- Hard maximum of 4,000 characters and 1,024 estimated tokens.

Eight turns permits at most three cadence-eligible points in the representative 24-turn medium session before elapsed-time gating.
The ten-minute condition prevents rapid tool loops from producing repeated durable-memory proposals.
The five-item session cap prevents long sessions from creating an unbounded review queue.
The proposed text bound is half the ordinary note bound and is suppress-only rather than truncating.

## Hard maxima

The initial hard maxima are 8,000 characters and 2,048 estimated tokens for an Advisory note, 4,000 characters and 1,024 estimated tokens for proposed memory, 12 Advisor turns, 32 Advisor tool calls, 1,000,000 pending bytes, and 128,000 re-prime tokens.
Project configuration may only lower user limits.
These values require user approval before Slice 1 and remain subject to later long-context validation.
