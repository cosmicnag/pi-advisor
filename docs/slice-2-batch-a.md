# Slice 2 Batch A Evidence

## Approved scope

GitHub issue #6 is the Slice 2 umbrella.
The user approved beginning only child issue #7.
Issues #8, #9, and #10 remain ordered later work.

## Behavior-gap matrix

| Issue #7 behavior                    | Slice 1 baseline                                          | Batch A change                                                                                                                                                                                                                                                            |
| ------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nit, concern, and blocker formatting | Severity existed only as message metadata                 | Plain model-visible labels now include severity and active or deferred delivery state                                                                                                                                                                                     |
| Active steer delivery                | Implemented with Pi `steer` timing                        | Preserved for every severity with bounded acknowledgement tracking; unacknowledged TUI-cleared steers recover to deferred FIFO delivery                                                                                                                                   |
| Deferred next-user-turn delivery     | Pi `nextTurn` was used directly                           | Individually bounded notes are held in in-memory runtime state and injected from `before_agent_start` because Pi 0.80.7 exposes no public cancellation API for queued `nextTurn` messages after branch navigation                                                         |
| Terminal-answer preservation         | Late advice used `nextTurn` without triggering completion | Preserved without triggering completion and materialized only after the next user prompt                                                                                                                                                                                  |
| User-interrupt preservation          | Aborted turns were excluded from review                   | Every public abort signal or aborted stop reason forces in-flight accepted advice to defer because Pi 0.80.7 exposes no public abort cause                                                                                                                                |
| Cross-update dedupe                  | Not implemented                                           | Severity-scoped SHA-256 keys use NFKC and whitespace normalization, fold prose case and trailing prose punctuation, preserve matched backtick delimiters and code case, and conservatively avoid case folding when backticks are unmatched; history is a 4,096-entry FIFO |
| Staleness                            | Not implemented                                           | Advice is potentially stale when the active branch advances beyond the fixed submitted window during review, before deferred materialization, or through the pending user prompt that triggers materialization, and includes a verification instruction                   |
| Branch/session clearing              | In-flight work was invalidated                            | In-memory deferred advice and dedupe state are cleared on branch mismatch, disablement, shutdown, and session replacement                                                                                                                                                 |

## Scope boundaries

Batch A uses plain message-text labels only.
Custom TUI message rendering, immediate late-advice cards, XML markup, `/advisor dump`, and delivery retry handling remain issue #8.
Memory suggestion behavior remains issue #9.
Cross-exit restoration remains Slice 3.
No durable configuration or new user-configurable field was added.
The 4,096-key dedupe history, 4,096-note and 1,000,000-byte deferred queue, and 64 KiB deferred delivery batch are fixed protocol bounds rather than configuration options.
Deferred queue admission rejects newer notes when full, while delivery drains bounded FIFO prefixes across later user-driven turns.

## Compatibility sanity gate

The pinned development packages and peer range remain on Pi 0.80.7.
The existing delivery, lifecycle, session replacement, and contract measurement tests passed before implementation.
The measured public API still exposes an aborted stop reason without a user-interrupt cause and exposes no public method to remove an already queued `nextTurn` custom message.

## Verification evidence

- `pnpm exec vitest run tests/integration/delivery-spikes.test.ts tests/integration/lifecycle-spikes.test.ts tests/integration/session-replacement-spike.test.ts tests/contract/session-measurements.test.ts` passed before edits with 4 files and 8 tests.
- `pnpm verify` passed on the final active-delivery implementation with typecheck, lint, formatting, and 11 unit, contract, and integration files containing 87 tests.
- `pnpm test:e2e` passed the packed package installation and inactive-default load scenario.
- `pnpm exec vitest run tests/integration/advisor-safety.test.ts tests/unit/advisor-policy.test.ts tests/contract/pi-public-api.test.ts` passed 65 focused delivery, policy, and public-API tests.
- `git diff --check` passed.
- Claude Fable 5 and the executor agreed on the root cause and a complete policy split for content-free matching, conservative severity-scoped dedupe, bounded deferred storage, bounded multi-turn FIFO delivery, and acknowledgement-backed active delivery.
- Claude Fable 5 gave the final implementation an `APPROVE` verdict with no blockers and `SAFE FOR NEXT SLICE: YES`.
- Its evidence-documentation and active-branch-invalidation test recommendations were resolved before the final commit.
- CodeRabbit CLI reviewed the final active-delivery implementation, its verified findings were fixed, and the final re-review completed with zero findings.
- No-mistakes was stopped and skipped for final validation at the user's direction; the commands above ran directly outside that workflow.

Manual advice-card theme verification is not part of Batch A because custom advice cards remain issue #8.

## Deviations and unresolved risks

Direct Pi `nextTurn` queuing remains valid for no-trigger timing but cannot be cancelled through a public Pi 0.80.7 API after branch navigation.
Batch A therefore holds individually bounded notes in memory and uses `before_agent_start` injection to preserve the measured next-user-turn behavior while meeting branch-clearing requirements.
Pi calls that hook before persisting its current user prompt, so Batch A passes explicit pending-input state into deferred materialization and marks the emitted advice potentially stale.
Pi 0.80.7 does not expose a public abort cause, so the runtime intentionally treats every abort as an interruption for delivery safety.
Active steering retains a bounded package-owned copy until Pi acknowledges the custom message.
Agent settlement recovers unacknowledged TUI-cleared advice to deferred delivery, while RPC continuation acknowledgement prevents duplication.
The in-memory deferred collection has no separate configuration field.
It is bounded by fixed item and raw-note-byte limits, and each primary-context injection has a separate fixed formatted-byte limit.
The reserved `deferredAdviceRetentionHours` field remains unenforced until cross-exit lifecycle work.
