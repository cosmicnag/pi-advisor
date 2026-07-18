# Slice 2 Verification and Closure Evidence

## Scope

This closure compares the merged Slice 2 implementation from issues #7, #8, and #9 with the full specification in issue #6 and the verification gate in issue #10.
No Slice 3 implementation is included.

## Acceptance comparison

| Acceptance area                   | Result | Evidence                                                                                                                                                                                              |
| --------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active severity delivery          | Pass   | Scripted integration coverage proves concern, nit, and blocker notes each reach the same next Pi steering boundary once.                                                                              |
| Terminal and interrupted delivery | Pass   | Late blockers cause no extra completion, and every public abort fallback preserves advice for the next user-driven turn.                                                                              |
| Visibility and single delivery    | Pass   | Active custom messages, immediate TUI-only late entries, acknowledgement tracking, and hidden next-turn visual delivery keep accepted notes visible without duplicate model context.                  |
| Branch and session isolation      | Pass   | Branch navigation clears deferred advice and dedupe state, while shutdown invalidates and disposes the old runtime before session replacement.                                                        |
| Noise, dedupe, and bounds         | Pass   | Content-free suppression, severity-scoped normalized dedupe, 4,096-key FIFO eviction, bounded deferred queues, and 64 KiB delivery batches are covered.                                               |
| Staleness                         | Pass   | Advice is annotated when the Executor advances after the reviewed window or when a newer user prompt materializes deferred advice.                                                                    |
| Presentation and XML safety       | Pass   | Custom message and entry renderers sanitize terminal controls, escape XML, use theme callbacks, and keep visible lines within terminal width.                                                         |
| Non-interactive behavior          | Pass   | RPC, JSON, and print fixtures avoid TUI-only APIs, preserve explicit activation policy, and keep late single-shot advice out of the primary answer.                                                   |
| Diagnostics and delivery failure  | Pass   | `/advisor dump` is recursively redacted and bounded to 16 KiB, while delivery failures are counted once without retry loops.                                                                          |
| Optional Memory capability        | Pass   | Absent, inactive, malformed, and incompatible `memory_suggest` capabilities remain non-fatal, while the exact compatible active schema enables policy without tool invocation or Memory Lane imports. |
| Memory structure and priority     | Pass   | The schema requires an allowed basis and `preference` or `project` category, prohibits severity and personal category, and gives ordinary material advice priority.                                   |
| Memory safety and suppression     | Pass   | Content-free, redaction-altered, oversized, current-update duplicate, cross-update duplicate, cadence-limited, and cap-limited proposals remain outside primary context and persisted branch state.   |
| Memory handoff                    | Pass   | Active and deferred wrappers require Executor verification or revision followed by `memory_suggest` with explicit pending status and no second confirmation.                                          |
| Capability loss                   | Pass   | Active and deferred delivery recheck compatibility and replace call guidance with a visible `could-not-queue` notice.                                                                                 |

## Verification commands

- `pnpm verify` - passed typecheck, lint, formatting, and 126 tests across 13 unit, contract, and integration files.
- `pnpm exec vitest run tests/integration/advisor-safety.test.ts tests/integration/memory-suggestions.test.ts tests/integration/delivery-spikes.test.ts tests/unit/presentation.test.ts --reporter=verbose` - passed 78 focused delivery, Memory suggestion, Pi timing, rendering, and diagnostics tests before the elapsed-time cadence regression was added.
- `pnpm exec vitest run tests/integration/memory-suggestions.test.ts --reporter=verbose` - passed all 21 Memory suggestion scenarios, including the added elapsed-time cadence regression.
- `pnpm test:e2e` - passed the packed Pi 0.80.7 install and inactive-default startup scenario.
- `pnpm pack:validate` - passed with 24 packed files, including this public closure evidence.
- `git diff --check` - passed after all closure edits.

## Manual theme verification

A manual renderer smoke loaded Pi 0.80.7's actual built-in `dark` and `light` themes and rendered an expanded blocker card plus a Memory suggestion card at 72 columns.
Both themes produced 20 lines with a maximum visible width of 72 columns.
The dark theme used its dark custom-message background with error, warning, accent, muted, and text colors.
The light theme used its light custom-message background with the corresponding theme-specific colors.
Headings, body text, proposed memory, delivery state, age, staleness, category, basis, and expanded metadata remained readable and aligned in both outputs.

## Deviations and unresolved risks

- Pi 0.80.7 cannot cancel a queued public `nextTurn` message after branch navigation, so deferred advice is held in bounded package state and injected from `before_agent_start` instead.
- Pi 0.80.7 exposes no public abort cause, so every public abort signal or aborted stop reason uses the conservative interruption fallback.
- Semantic durability and repeated-occurrence eligibility remain guided model judgments that the Executor verifies before pending Memory submission.
- Memory suggestion cadence and session allowance are consumed when a suggestion enters a safe active or deferred queue, while delivered counters follow acknowledgement or deferred materialization.
- Cross-exit deferred restoration and cross-exit Memory cadence or cap persistence remain explicitly out of scope until Slice 3.
- Provider retry, context compaction, durable WATCHDOG configuration, and transcript persistence remain later approved slices.

No unresolved Slice 2 implementation todo was moved silently into a later slice.
