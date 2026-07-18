# Slice 4 Verification and Closure Evidence

## Scope

This closure compares the merged Slice 4 implementation from issues #16 and #17 with the full token-aware context specification in issue #15 and the verification gate in issue #18.
No Slice 5 implementation is included.

## Acceptance comparison

| Acceptance area                   | Result | Evidence                                                                                                                                                                                                                                                               |
| --------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Long-session context policy       | Pass   | Scripted small-window sessions trigger public nested compaction and repeated bounded re-prime while every submitted review remains within the configured context policy.                                                                                               |
| Compaction continuity             | Pass   | A planted `MUST-RUN-LONG-CONTEXT-CHECK` requirement survives nested compaction and supports a later accepted concern when the Executor violates it.                                                                                                                    |
| Bounded re-prime fallback         | Pass   | Failed compaction falls back to a redacted current-branch snapshot bounded by `maxReprimeTokens`, clears only private Advisor context, and preserves current task continuity across repeated maintenance.                                                              |
| Unsafe snapshot pause             | Pass   | A snapshot that cannot fit pauses only Advisor before submission, records the failure, and emits exactly one warning while later Executor turns continue.                                                                                                              |
| Primary-context isolation         | Pass   | Primary request inspection contains accepted advice but excludes private Advisor responses, compaction summaries, transcript records, and Advisor or Executor reasoning.                                                                                               |
| Persistence default and isolation | Pass   | `persistence.transcript` remains false by default, enabled records use validated Pi custom entries outside model context, and branch-invalidated attempts do not persist records onto the replacement branch.                                                          |
| Persistence privacy and bounds    | Pass   | Enabled update and tool-result records are redacted and bounded, accepted advice and exact public usage are inspectable, and Executor reasoning, Advisor reasoning, internal `advise` calls, unsafe suggestions, provider payloads, and unbounded output are excluded. |
| Persistence documentation         | Pass   | The README, behavior contract, and Slice 4B evidence list stored and excluded fields, Pi session JSONL or in-memory location, append-only disk behavior, inspection limits, disablement, retention, and deletion.                                                      |
| Complete status accounting        | Pass   | Status exposes context estimates and limits, compaction and re-prime outcomes, input, output, cache and total tokens, reported cost, review outcomes, deliveries, suppression, persistence, retry, pause, and bounded failure state.                                   |

## Specification comparison

All nine Slice 4 in-scope areas are implemented through merged PRs #32 and #33.
The implementation remains within the documented boundaries and does not add context-model promotion, OMP snapcompact behavior, or Agent Hub integration.
No unresolved Slice 4 implementation todo was moved into Slice 5.

The configured 0.65 context fraction, 8,192 response-token reserve, 24,000 update-token bound, 200,000 pending-byte bound, and 32,000 re-prime-token bound remain unchanged from the Slice 0 measured proposal.
Deterministic small-window fixtures scale the model window and reserve to trigger maintenance without paid credentials.

## Review and merge record

- Slice 4A merged through PR #32 as `4f579dd` after implementation review, CodeRabbit findings, focused fixes, follow-up review, and CI completed.
- Slice 4B merged through PR #33 as `ff62c2e` after implementation review, CodeRabbit lifecycle and persistence findings, focused fixes, follow-up review, and CI completed.
- The user explicitly prohibited skills, subagents, and Claude reviews for issue #18.
- No new Claude closure review was performed, and the issue's Claude review checkbox is recorded as a user-directed gate deviation rather than falsely marked complete.
- Issue #18 closure PR, CI, CodeRabbit, merge, and cleanup evidence is recorded in the final issue update after those gates complete.

## Verification commands

- `pnpm verify` - passed typecheck, lint, formatting, and 167 unit, contract, and integration tests across 18 files.
- `pnpm exec vitest run tests/unit/advisor-policy.test.ts tests/integration/context-policy.test.ts tests/integration/advisor-safety.test.ts tests/integration/retry-resilience.test.ts tests/integration/transcript-persistence.test.ts --reporter=dot` - passed 96 focused policy, context, re-prime, unsafe-pause, retry-accounting, isolation, and persistence tests across 5 files.
- `for run in 1 2 3; do pnpm exec vitest run tests/integration/context-policy.test.ts -t 'compacts through AgentSession|falls back to bounded re-prime' --reporter=dot || exit 1; done` - passed both long-context maintenance tests in all 3 repetitions.
- `pnpm test:e2e` - passed the packed Pi 0.80.7 installation and inactive-default startup scenario.
- `pnpm pack:validate` - passed package-content validation with 31 package files after adding this closure evidence.
- `git diff --check` - passed with no whitespace errors.

## Deviations and unresolved risks

- The issue #18 Claude closure-review requirement was waived by the user's explicit instruction not to invoke Claude reviews for this work.
- Pi 0.80.7 does not expose nested compaction request usage or cost through the public `AgentSession.compact()` result or public events.
  Review-request usage and reported cost remain exact, while status separately counts compaction operations whose usage is unavailable.
- One public compaction operation may perform multiple provider summarization requests, so the unavailable count is operation-level rather than a guessed provider-request total.
- Redaction reduces secret exposure but cannot detect every sensitive value, and allowed read-only Advisor tools may still expose content to the configured provider.
- Optional transcript records are append-only Pi custom entries.
  Disabling persistence stops future writes but does not delete prior records, and no transcript-specific time retention or deletion command exists.
- File-backed transcript and lifecycle records remain until the owning Pi session is deleted or its session JSONL is removed.
- The packed E2E gate validates installation and inactive startup because the release default has no configured provider.
  Context, compaction, re-prime, status, and persistence behavior use real Pi `AgentSession` and `SessionManager` integration fixtures with scripted providers.

Slice 5 remains stopped behind separate explicit user approval.
