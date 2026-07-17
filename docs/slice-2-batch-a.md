# Slice 2 Batch A Evidence

## Approved scope

GitHub issue #6 is the Slice 2 umbrella.
The user approved beginning only child issue #7.
Issues #8, #9, and #10 remain ordered later work.

## Behavior-gap matrix

| Issue #7 behavior                    | Slice 1 baseline                                          | Batch A change                                                                                                                                                                                                |
| ------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nit, concern, and blocker formatting | Severity existed only as message metadata                 | Plain model-visible labels now include severity and active or deferred delivery state                                                                                                                         |
| Active steer delivery                | Implemented with Pi `steer` timing                        | Preserved for every severity with the same public timing                                                                                                                                                      |
| Deferred next-user-turn delivery     | Pi `nextTurn` was used directly                           | Deferred advice is held in bounded in-memory runtime state and injected from `before_agent_start` because Pi 0.80.7 exposes no public cancellation API for queued `nextTurn` messages after branch navigation |
| Terminal-answer preservation         | Late advice used `nextTurn` without triggering completion | Preserved without triggering completion and materialized only after the next user prompt                                                                                                                      |
| User-interrupt preservation          | Aborted turns were excluded from review                   | Every public aborted stop reason forces in-flight accepted advice to defer because Pi 0.80.7 exposes no public abort cause                                                                                    |
| Cross-update dedupe                  | Not implemented                                           | SHA-256 keys of Unicode-normalized, lowercased, punctuation-folded, whitespace-collapsed notes use a 4,096-entry FIFO in-memory set                                                                           |
| Staleness                            | Not implemented                                           | Advice is potentially stale when the active branch advances beyond the fixed submitted window and includes a verification instruction                                                                         |
| Branch/session clearing              | In-flight work was invalidated                            | In-memory deferred advice and dedupe state are cleared on branch mismatch, disablement, shutdown, and session replacement                                                                                     |

## Scope boundaries

Batch A uses plain message-text labels only.
Custom TUI message rendering, immediate late-advice cards, XML markup, `/advisor dump`, and delivery retry handling remain issue #8.
Memory suggestion behavior remains issue #9.
Cross-exit restoration remains Slice 3.
No durable configuration or new user-configurable field was added.
The dedupe capacity is a fixed protocol bound, not a configuration option.

## Compatibility sanity gate

The pinned development packages and peer range remain on Pi 0.80.7.
The existing delivery, lifecycle, session replacement, and contract measurement tests passed before implementation.
The measured public API still exposes an aborted stop reason without a user-interrupt cause and exposes no public method to remove an already queued `nextTurn` custom message.

## Verification evidence

- `pnpm exec vitest run tests/integration/delivery-spikes.test.ts tests/integration/lifecycle-spikes.test.ts tests/integration/session-replacement-spike.test.ts tests/contract/session-measurements.test.ts` passed before edits with 4 files and 8 tests.
- `pnpm verify` passed after implementation with typecheck, lint, formatting, and 11 unit, contract, and integration files containing 67 tests.
- `pnpm test:e2e` passed the packed package installation and inactive-default load scenario.
- `git diff --check` passed.
- Claude Fable 5 approved the implementation in review round 1 with no blockers and five non-blocking hardening recommendations.
- The recommendations were resolved with pending-versus-delivered counters, unseen-note dedupe removal, pinned promise-ordering evidence, aligned documentation, and multi-note deferred coverage.
- Claude Fable 5 approved review round 2 with consensus that issue #7 was ready to commit.
- The final status-publication hardening recommendation was also applied before commit.

Manual advice-card theme verification is not part of Batch A because custom advice cards remain issue #8.

## Deviations and unresolved risks

Direct Pi `nextTurn` queuing remains valid for no-trigger timing but cannot be cancelled through a public Pi 0.80.7 API after branch navigation.
Batch A therefore uses bounded in-memory deferral and `before_agent_start` injection to preserve the measured next-user-turn behavior while meeting branch-clearing requirements.
Pi 0.80.7 does not expose a public abort cause, so the runtime intentionally treats every abort as an interruption for delivery safety.
The in-memory deferred collection has no separate configuration field or explicit independent cap, but it is constrained by one note per update, single-flight draining, bounded coalescing, and consumption on the next user-driven turn.
