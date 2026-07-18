# Slice 3B Retry and Recovery Evidence

## Scope

This batch implements only GitHub issue #13 under parent #11.
It covers failed-turn rollback, one bounded provider retry, retry integration with the existing three-failure pause and recovery state, backlog and failure status, and stale nested queued-message extraction during reset.
It preserves Slice 3A branch, compaction, session replacement, compatible-resume, delivery, and Memory suggestion behavior.
It does not implement full Advisor transcript persistence, primary execution blocking for Advisor catch-up, provider credential rotation, Advisor context compaction, branch re-prime, Slice 3 verification, or Slice 4.

## Behavior comparison

| Deliverable                    | Result | Evidence                                                                                                                                                                                                                                                                                                                        |
| ------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Failed-turn rollback           | Pass   | Before each nested attempt, the runtime clones the valid private Advisor messages. A provider or thrown prompt failure restores that exact snapshot and clears nested steering and follow-up queues before any retry. The retry request contains the bounded update once and excludes failed assistant or tool context.         |
| Bounded retry delay            | Pass   | Provider and thrown nested-prompt failures receive at most one automatic retry after the exported fixed `ADVISOR_RETRY_DELAY_MS` delay of 250 milliseconds. Malformed internal tool, governor, and delivery failures remain single-shot.                                                                                        |
| Pause and recovery integration | Pass   | Every failed attempt increments total and consecutive failures. A successful retry increments completed review state and resets consecutive failures. Three repeated failed attempts pause automatic review and emit only the existing single warning.                                                                          |
| Backlog and failure status     | Pass   | Programmatic status and `/advisor status` expose retry pending state, current retry delay, started retry-attempt count, queued transcript bytes, total and consecutive failures, last bounded reason, branch resets, and stale nested queued-message discard count. Retry wait and coalesced Executor work remain non-blocking. |
| Reset queue extraction         | Pass   | Branch, compaction, tree, disablement, session replacement, and shutdown epochs invalidate retry continuations. Branch reset uses Pi's public `AgentSession.clearQueue()` and retains only the number of discarded stale steering and follow-up messages, never their content.                                                  |

## Public retry policy

Pi Advisor performs one package-owned retry only for a provider-reported failure or an exception thrown by the nested prompt.
Pi's nested-session auto-retry remains disabled, so one layer owns the retry and failure counters.
The retry resubmits the same already bounded Advisor update after restoring the exact pre-attempt private message snapshot.
The fixed delay is 250 milliseconds and is not user-configurable in Slice 3B.
The delay is long enough to prevent a synchronous tight loop and is strictly bounded to keep background catch-up responsive.
An epoch change during either the provider await or retry-delay await prevents another provider request and prevents delivery from that continuation.

A failed attempt counts immediately toward `failedReviews` and `consecutiveFailures`.
A provider retry that succeeds also counts one completed review, then resets `consecutiveFailures` to zero.
The prior bounded `lastFailure` remains available for diagnosis after recovery.
If the third consecutive failure occurs on an initial attempt, no retry is scheduled because Advisor is already paused.
If it occurs on a retry attempt, the retry ends paused.
Both paths preserve one pause warning.

## Queue extraction and privacy

Failed-attempt rollback and branch reset call Pi's public nested `clearQueue()` API after abort settlement where applicable.
This extracts stale nested steering and follow-up messages before private messages are restored or reset.
Only `staleQueuedMessagesDiscarded` is retained.
The discarded strings are not added to status, diagnostics, persistence, Executor context, or a later Advisor request.
Delivery queues owned by Pi Advisor continue to follow Slice 3A branch and session isolation rules.

## End-to-end reproduction

Before implementation, the new packed-runtime-aligned AgentSession integration scenario ran:

- `pnpm exec vitest run tests/integration/retry-resilience.test.ts -t 'rolls back a failed provider turn' --reporter=verbose` - failed after 5.03 seconds because the current runtime made no retry and never completed the review.

The final regression uses real primary and nested Pi `AgentSession` instances with scripted providers.
It proves the second provider request occurs after the fixed delay, sees no failed-turn context, and leaves one valid copy of the update in private messages.
Additional fixtures prove successful recovery, repeated-failure pause, non-blocking coalesced backlog, reset during retry delay, and public nested queue extraction.

## Verification

Final validation commands and results:

- `pnpm typecheck` - pass.
- `pnpm lint` - pass.
- `pnpm format:check` - pass.
- `pnpm test` - pass; 148 tests across 16 unit, contract, and integration files.
- `pnpm exec vitest run tests/integration/retry-resilience.test.ts tests/integration/advisor-safety.test.ts tests/integration/lifecycle-resilience.test.ts tests/unit/advisor-policy.test.ts tests/unit/presentation.test.ts --reporter=dot` - pass; 98 focused tests across 5 files.
- `pnpm test:e2e` - pass; packed Pi 0.80.7 installation and startup.
- `pnpm pack:validate` - pass; 27 package files validated and generated validation artifacts removed.
- `git diff --check` - pass.

## Deviations and residual risks

- The packed E2E gate validates installation and startup with the release default disabled and no configured provider. It cannot trigger provider retry through the installed default. The retry lifecycle itself is covered by the narrow real Pi `AgentSession` integration scenario using the same public session and provider APIs.
- Retry delay and retry count are fixed protocol policy in Slice 3B rather than new user configuration. Durable configuration remains later scope.
- Retry applies only to provider-reported and thrown nested-prompt failures. Malformed internal tool, governor, and delivery failures remain single-shot to avoid repeating tool effects or delivery attempts.
- Retry reuses the same bounded update and valid private Advisor history. It does not perform a current-branch re-prime, which remains later scope.
- Pi 0.80.7 nested queued-message extraction reports strings without provenance. The runtime therefore discards all nested steering and follow-up messages on failed-attempt rollback or branch reset and exposes only an aggregate count.
