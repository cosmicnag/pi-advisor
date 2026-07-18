# Slice 3 Verification and Closure Evidence

## Scope

This closure compares the merged Slice 3 implementation from issues #12 and #13 with the full lifecycle and resilience specification in issue #11 and the verification gate in issue #14.
No Slice 4 implementation is included.

## Acceptance comparison

| Acceptance area                                | Result | Evidence                                                                                                                                                                                    |
| ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Equal-length branch isolation                  | Pass   | Entry-ID cursor ancestry validation rejects an equal-length replacement while the Advisor is awaiting, invalidates the old epoch, and prevents old-branch delivery.                         |
| Compaction isolation                           | Pass   | Eager pre-compaction invalidation aborts old nested work, clears private Advisor context, and reseeds the cursor to the compacted branch before the next review.                            |
| Session replacement isolation                  | Pass   | Replacement fixtures dispose the old runtime and prove its queued advice cannot enter the new Pi session.                                                                                   |
| Reset await invalidation                       | Pass   | Branch, compaction, tree, disable, replacement, shutdown, nested-construction, provider, and retry-delay boundaries verify epoch and runtime state before continuing.                       |
| Failed-turn rollback                           | Pass   | Each retryable attempt restores the exact pre-attempt private message snapshot and clears nested steering and follow-up queues before retry.                                                |
| Retry recovery and pause                       | Pass   | One retry follows a fixed 250 millisecond delay, success resets consecutive failures, and the third consecutive failed attempt pauses automatic review with one warning.                    |
| Restored dedupe                                | Pass   | Compatible resume restores at most the newest 128 eligible delivered-note hashes and suppresses an immediate normalized duplicate.                                                          |
| Memory lifecycle restore                       | Pass   | Compatible resume restores meaningful-turn cadence, admission time and turn, admitted and delivered counts, and cap state, while a new Pi session ID rejects copied state and starts fresh. |
| Backlog and failure visibility                 | Pass   | Programmatic and command status expose coalesced transcript bytes, retry state, total and consecutive failures, bounded last failure, branch resets, and stale nested queue discards.       |
| Pending-update ordering after delivery failure | Pass   | The PR #30 follow-up contains delivery exceptions within `runUpdate` and proves older pending work continues before newer updates after both ordinary and governor-failure delivery paths.  |

## Specification comparison

All ten Slice 3 in-scope areas are implemented through merged PRs #29 and #30.
The implementation remains within the documented boundaries: it does not persist the full private Advisor transcript, block primary execution for catch-up, or rotate provider credentials.
No unresolved Slice 3 implementation todo was moved silently into Slice 4.

The proposed 512-hash persisted dedupe bound was revised from a measured 34,574 bytes to a 128-hash bound measured at 8,846 bytes.
That measured deviation reduces repeated append-only snapshot overhead by approximately 75 percent while retaining more than five representative 24-turn medium sessions of delivered-note history.

## Review and merge record

- Slice 3A merged through PR #29 as `4f6bd56` after its implementation review reached consensus and its CodeRabbit findings were fixed or declined with documented rationale.
- Slice 3B merged through PR #30 as `e6bb991` after an Opus 4.8 high-effort implementation review returned no required findings.
- CodeRabbit identified one later delivery-failure ordering defect on PR #30.
  The defect was reproduced, fixed in `7ee261f`, regression-tested, and accepted by the final CodeRabbit and CI checks before merge.
- The user explicitly prohibited skills, subagents, and Claude reviews for issue #14.
  Therefore no new Fable 5 closure review was performed, and that issue checkbox is recorded as a user-directed review-gate deviation rather than falsely marked complete.

## Verification commands

- `pnpm verify` - passed typecheck, lint, formatting, and 148 unit, contract, and integration tests across 16 files.
- `pnpm exec vitest run tests/unit/lifecycle-state.test.ts tests/integration/lifecycle-spikes.test.ts tests/integration/lifecycle-resilience.test.ts tests/integration/session-replacement-spike.test.ts tests/integration/retry-resilience.test.ts tests/integration/advisor-safety.test.ts tests/integration/memory-suggestions.test.ts --reporter=dot` - passed 96 focused lifecycle, branch, compaction, replacement, resume, dedupe, retry, failure, queue, delivery, and Memory tests across 7 files.
- `for run in 1 2 3; do pnpm exec vitest run tests/integration/lifecycle-resilience.test.ts -t 'equal-length branch switch|compaction reset|tree navigation reset' --reporter=dot; done` - passed all 3 lifecycle barrier tests in each of 3 repetitions.
- `pnpm test:e2e` - passed the packed Pi 0.80.7 installation and inactive-default startup scenario.
- `pnpm pack:validate` - passed package-content validation for 28 files after adding this closure evidence.
- The first `pnpm exec tsx /tmp/pi-advisor-slice-3-manual-smoke.mts` invocation failed because the temporary fixture used obsolete `lastDeliveredTurn` and `lastDeliveredAt` property names that the strict persistence schema correctly rejected.
  No product code or repository test failed.
- The corrected `pnpm exec tsx /tmp/pi-advisor-slice-3-manual-smoke.mts` invocation used `lastAdmittedTurn` and `lastAdmittedAt`, passed a manual public `SessionManager` tree-navigation and compatible file-backed persisted-resume smoke, preserved lifecycle counters, printed `PASS Slice 3 manual tree-navigation and compatible persisted-resume smoke`, and removed its temporary file.
- `git diff --check` - passed after closure edits.

## Deviations and unresolved risks

- The issue #14 Fable 5 closure-review requirement was waived by the user's explicit instruction not to invoke Claude reviews for this work.
  Prior Slice 3A and Slice 3B implementation reviews remain recorded, but no claim is made that the skipped Fable 5 closure review occurred.
- Primary compaction clears private Advisor conversation state rather than re-priming it from the current branch.
  Bounded re-prime and nested Advisor context compaction remain Slice 4.
- `deferredAdviceRetentionHours` is evaluated during compatible restoration and does not expire a live in-memory deferred queue.
- Lifecycle snapshots use Pi's append-only custom-entry model.
  The 128-hash cap reduces amplification, but historical superseded snapshots remain until the owning file-backed Pi session is deleted.
- The packed E2E gate validates install and inactive startup because the release default has no configured provider.
  Lifecycle and retry behavior use real Pi `AgentSession` and `SessionManager` integration fixtures with scripted providers.
- Pi 0.80.7 exposes neither a public abort cause nor queued-message provenance.
  The implementation therefore uses conservative interruption handling and discards all nested steering and follow-up messages during rollback or reset while retaining only an aggregate count.

Slice 4 remains stopped behind separate explicit user approval.
