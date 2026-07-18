# Slice 4A Token-Aware Advisor Context

## Scope

Issue #16 implements only the five approved Batch A deliverables.
It does not invoke bounded current-branch re-prime, implement unsafe-snapshot handling, persist an optional Advisor transcript, or begin issue #17.
Issues #15 and #16 remain open until the PR is merged.

## Behavior comparison

| Deliverable                                             | Result | Evidence                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Advisor usage and context estimation                    | Pass   | The next request uses the latest successful Advisor assistant usage as an exact anchor and Pi's public token estimator for trailing private messages plus the incoming bounded update. With no valid anchor, including immediately after compaction, the entire private message context and bounded system prompt are estimated. Status distinguishes reported usage from estimated trailing tokens. |
| Maximum context fraction, response reserve, and cadence | Pass   | The existing `context.maxFraction`, `context.reserveTokens`, `limits.minTurnsBetweenReviews`, and `limits.minIntervalMs` values actively govern submissions. Cadence-held turns are redacted, bounded, and coalesced rather than discarded.                                                                                                                                                          |
| Bounded serialization                                   | Pass   | Updates and pending transcript retain their configured bounds. Each tool result is redacted before independent 2,000-line, 64 KiB, configured update-token, and final update bounds. `renderAdvisorReprimeSnapshot()` establishes the same configured redacted snapshot boundary for Batch B without invoking re-prime early.                                                                        |
| Public nested compaction                                | Pass   | Over-policy context calls the nested public `AgentSession.compact()` API with continuity-focused instructions. Lifecycle invalidation aborts in-progress nested compaction through the public API.                                                                                                                                                                                                   |
| Post-compaction recalculation                           | Pass   | Old provider usage anchors are invalidated after compaction. The compacted private messages and pending update are re-estimated before submission, and a still-unsafe result pauses Advisor once instead of entering Batch B fallback behavior.                                                                                                                                                      |

## Long-context and defaults revalidation

The approved 0.65 context fraction and 8,192-token response reserve remain unchanged.
The 24,000-token update limit and 200,000-byte pending transcript limit remain unchanged.
The long-context fixture uses the same 0.65 fraction with a proportionally smaller deterministic model window and reserve so maintenance is triggered without paid credentials.
It proves the runtime remains under the computed policy after compaction, retains a planted `MUST-RUN-LONG-CONTEXT-CHECK` requirement in the compacted context, and accepts a later scripted concern when the Executor violates it.
The fixture also inspects the next primary request and confirms that accepted advice enters primary context while private Advisor responses and compaction summaries do not.
The representative Slice 0 tool-heavy result size remains below the new independent 64 KiB per-result byte cap, while a larger 2,100-line fixture proves line truncation, redaction-before-bounding, and bounded Advisor submission.
These checks revalidate the existing release defaults without changing them.

## Tests

- Exact usage anchoring plus trailing estimation, and estimate-only fallback.
- Redaction and independent line, byte, token-oriented, update, pending, and re-prime serialization bounds.
- Minimum-turn cadence with retained multi-turn coalescing.
- Minimum-elapsed-time cadence with retained coalescing.
- Public nested compaction with a planted pre-compaction requirement and later violation finding.
- Post-compaction estimate-only recalculation below policy.
- Primary-context isolation after accepted compacted-context advice.
- Safe pause when compaction cannot make progress, with bounded re-prime intentionally absent.

## Verification

- `pnpm typecheck` - passed.
- `pnpm lint` - passed.
- `pnpm format:check` - passed.
- `pnpm exec vitest run tests/unit/advisor-policy.test.ts tests/integration/context-policy.test.ts tests/integration/advisor-safety.test.ts --reporter=dot` - passed 79 focused policy, serialization, cadence, compaction, and safety tests across 3 files.
- `pnpm verify` - passed typecheck, lint, formatting, and 154 unit, contract, and integration tests across 17 files.
- `pnpm test:e2e` - passed the packed-package Pi install and inactive-default scenario.
- `pnpm pack:validate` - passed with 29 package files validated.
- `git diff --check` - passed.

## Deviations and residual risks

Pi 0.80.7's public `AgentSession.compact()` result and session events do not expose the summarization request's provider usage or cost.
Review-request usage remains exact in session totals, while context status accounts for compaction through post-compaction message estimation.
The public compaction implementation may make more than one summarization provider request when Pi splits a turn prefix; the deterministic fixture covers that behavior.
Bounded current-branch re-prime invocation and unsafe-snapshot handling remain issue #17.
Until Batch B, compaction failure or a still-over-policy recalculation pauses Advisor once and records a bounded failure reason.
Optional full Advisor transcript persistence remains disabled and unimplemented.
Context-model promotion, OMP snapcompact behavior, and Agent Hub integration remain out of scope.
