# OMP Advisor Parity Matrix

## Status labels

- `implemented` means the safe automatic core through Slice 2 Batch B provides the bounded behavior described in the evidence column.
- `measured only` means Slice 0 established Pi 0.80.7 behavior but the current runtime does not add a product workflow around it.
- `intentional difference` means public Pi APIs or product boundaries require a documented divergence.
- `deferred` means the capability requires a separately approved later batch or slice.
- `out of scope` means the behavior does not belong in Pi Advisor.

| Capability                                         | Pi Advisor position    | Current behavior or evidence                                                                                           |
| -------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Automatic review after Executor work               | implemented            | Skips aborted, empty, and note-only follow-ups while retaining later user-driven turns                                 |
| Silence when work is sound                         | implemented            | Empty completions, plain text without `advise`, approval phrases, and normalized duplicates stay silent                |
| One long-lived isolated Advisor                    | implemented            | Uses one in-memory nested `AgentSession` with extensions and recursive resources disabled                              |
| Explicit secondary model selection                 | implemented            | Requires `provider/model`, valid credentials, and no Executor-model fallback                                           |
| Active advice delivery                             | implemented            | Every severity uses Pi 0.80.7 steer, with bounded acknowledgement tracking and deferred recovery after TUI queue clear |
| Idle and terminal deferred advice                  | implemented            | Fixed item, raw-byte, and per-turn formatted-byte bounds preserve FIFO advice without triggering a completion          |
| Immediate late-advice presentation                 | implemented            | TUI-only custom entries render accepted idle advice immediately without entering model context                         |
| Advice card rendering                              | implemented            | Theme-aware custom message and entry renderers show severity, delivery, age, and staleness within terminal width       |
| XML-safe model delivery                            | implemented            | Structured note and guidance elements escape content and attributes and replace invalid XML characters                 |
| Explicit support diagnostics                       | implemented            | `/advisor dump` emits at most 16 KiB and excludes transcripts, notes, reasoning, instructions, and protected paths     |
| Cross-update dedupe                                | implemented            | A severity-scoped conservative-normalization 4,096-key FIFO preserves operators and case inside matched backtick spans |
| Staleness annotation                               | implemented            | Advice is potentially stale after branch advance or when the pending user prompt triggers deferred materialization     |
| Hard interruption of an in-flight tool             | intentional difference | Pi steering reaches the next assistant boundary and does not abort the current tool                                    |
| Executor backlog blocking until Advisor catches up | intentional difference | Slice 1 coalesces a bounded backlog but does not pause Executor                                                        |
| Stable active-branch cursor                        | implemented            | Entry IDs and expected indexes detect obvious mismatches before delivery                                               |
| Equal-length branch reconstruction                 | deferred               | Minimal Slice 1 cursor validation does not reconstruct compatible ancestry                                             |
| Session replacement isolation                      | implemented            | Shutdown invalidates the epoch and disposes the in-memory nested session                                               |
| Deliberate user-interrupt distinction              | intentional difference | Pi exposes no public abort cause, so every abort signal or aborted stop reason forces in-flight advice to defer        |
| Automatic configuration from repository            | intentional difference | Slice 1 loads no durable configuration, and future Project configuration cannot activate review                        |
| OMP `.omp` and root WATCHDOG paths                 | deferred               | Slice 1 has no WATCHDOG or Pi-native configuration files                                                               |
| OMP `glob` Advisor tool                            | intentional difference | Pi 0.80.7 exposes `find`, which Slice 1 protects and bounds                                                            |
| Read-only Advisor tools                            | implemented            | Activates only protected `read`, `grep`, `find`, and `ls`, plus exclusive internal `advise`                            |
| Protected sensitive paths                          | implemented            | Checks normalized requests and canonical targets and filters traversal results                                         |
| Private Advisor transcript persistence             | deferred               | The reserved config field has no effect, and nested state stays in memory only                                         |
| Context compaction and bounded re-prime            | deferred               | Slice 1 pauses at the context governor and does not compact or re-prime                                                |
| Multiple Advisors                                  | deferred               | Requires production evidence and separate approval                                                                     |
| Context-model promotion                            | deferred               | No equivalent public Pi policy primitive is assumed                                                                    |
| Fullscreen multi-pane configuration                | deferred               | Batch B provides `/advisor on`, `off`, `status`, and bounded `dump`, but no fullscreen configuration                   |
| Mutating Advisor tools                             | deferred               | Requires a separate advanced security specification                                                                    |
| Destructive-command interception                   | out of scope           | Must be a separate extension independent of Advisor activation                                                         |
| Memory Lane integration                            | deferred               | Slice 1 performs no Memory calls or suggestions                                                                        |
| Product telemetry                                  | intentional difference | Pi Advisor sends none                                                                                                  |

## rpiv-advisor coexistence

`@juicesharp/rpiv-advisor` is Executor-invoked consultation, while this package is automatic observation.
Both register `/advisor`.
Pi 0.80.7 assigns `/advisor:1` and `/advisor:2` in load order, and the resolved names are discoverable by `session_start`.
Slice 1 does not implement a collision warning, so users must inspect Pi's command list when both extensions are installed.
