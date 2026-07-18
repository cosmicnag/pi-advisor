# OMP Advisor Parity Matrix

## Status labels

- `implemented` means the completed Slice 4 safe automatic core provides the bounded behavior described in the evidence column.
- `partial` means a named later slice owns the remaining capability.
- `measured only` means Slice 0 established Pi 0.80.7 behavior but the current runtime does not add a product workflow around it.
- `intentional difference` means public Pi APIs or product boundaries require a documented divergence.
- `deferred` means the capability requires a separately approved later batch or slice.
- `out of scope` means the behavior does not belong in Pi Advisor.

| Capability                                         | Pi Advisor position    | Current behavior or evidence                                                                                             |
| -------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Automatic review after Executor work               | implemented            | Skips aborted, empty, and note-only follow-ups while retaining later user-driven turns                                   |
| Silence when work is sound                         | implemented            | Empty completions, plain text without `advise`, approval phrases, and normalized duplicates stay silent                  |
| One long-lived isolated Advisor                    | implemented            | Uses one in-memory nested `AgentSession` with extensions and recursive resources disabled                                |
| Explicit secondary model selection                 | implemented            | Requires `provider/model`, valid credentials, and no Executor-model fallback                                             |
| Active advice delivery                             | implemented            | Every severity uses Pi 0.80.7 steer, with bounded acknowledgement tracking and deferred recovery after TUI queue clear   |
| Idle and terminal deferred advice                  | implemented            | Fixed item, raw-byte, and per-turn formatted-byte bounds preserve FIFO advice without triggering a completion            |
| Immediate late-advice presentation                 | implemented            | TUI-only custom entries render accepted idle advice immediately without entering model context                           |
| Advice card rendering                              | implemented            | Theme-aware custom message and entry renderers show severity, delivery, age, and staleness within terminal width         |
| XML-safe model delivery                            | implemented            | Structured note and guidance elements escape content and attributes and replace invalid XML characters                   |
| Explicit support diagnostics                       | implemented            | `/advisor dump` emits at most 16 KiB, redacts previews, and excludes reasoning, instructions, and protected paths        |
| Cross-update dedupe                                | implemented            | A severity-scoped conservative-normalization 4,096-key FIFO preserves operators and case inside matched backtick spans   |
| Staleness annotation                               | implemented            | Advice is potentially stale after branch advance or when the pending user prompt triggers deferred materialization       |
| Hard interruption of an in-flight tool             | intentional difference | Pi steering reaches the next assistant boundary and does not abort the current tool                                      |
| Executor backlog blocking until Advisor catches up | intentional difference | The runtime coalesces a bounded backlog but does not pause Executor                                                      |
| Stable active-branch cursor                        | implemented            | Entry IDs and expected indexes validate ancestry and distinguish shrink from equal-length replacement                    |
| Equal-length branch reconstruction                 | implemented            | A changed entry ID at the expected index invalidates old output even when branch lengths match                           |
| Eager compaction and tree invalidation             | implemented            | Public before-events invalidate awaits, completion events reseed, and entry identity remains authoritative               |
| Session replacement isolation                      | implemented            | Shutdown persists only old-session state, invalidates the epoch, and a new session ID rejects copied queued state        |
| Clean bounded provider retry                       | implemented            | Restores the pre-attempt private message snapshot, waits 250 ms, retries once, and invalidates retry on epoch changes    |
| Retry and pause recovery                           | implemented            | Failed attempts share the three-failure pause; successful retry resets consecutive state and repeated failure warns once |
| Backlog and failure status                         | implemented            | Reports queued transcript bytes, retry delay and attempts, consecutive failures, reset count, and stale queue discards   |
| Compatible lifecycle resume                        | implemented            | Restores bounded unexpired deferred notes, 128 dedupe hashes, and Memory cadence or cap state outside model context      |
| Deliberate user-interrupt distinction              | intentional difference | Pi exposes no public abort cause, so every abort signal or aborted stop reason forces in-flight advice to defer          |
| Automatic configuration from repository            | intentional difference | The current runtime loads no durable configuration, and future Project configuration cannot activate review              |
| OMP `.omp` and root WATCHDOG paths                 | deferred               | The current runtime has no WATCHDOG or Pi-native configuration files                                                     |
| OMP `glob` Advisor tool                            | intentional difference | Pi 0.80.7 exposes `find`, which the current runtime protects and bounds                                                  |
| Read-only Advisor tools                            | implemented            | Activates only protected `read`, `grep`, `find`, and `ls`, plus exclusive internal `advise`                              |
| Protected sensitive paths                          | implemented            | Checks normalized requests and canonical targets and filters traversal results                                           |
| Private Advisor transcript persistence             | intentional difference | Opt-in bounded redacted reasoning-free custom records; raw transcripts remain prohibited                                 |
| Context compaction and bounded re-prime            | implemented            | Public compaction recalculates policy, then one bounded current-branch re-prime falls back or pauses safely              |
| Reduced ordinary review cadence                    | implemented            | Configured turn and elapsed-time gates retain one bounded coalesced update until both gates are eligible                 |
| Usage-aware context estimation                     | implemented            | Latest successful provider usage anchors context, while public Pi estimation bounds trailing or post-compaction content  |
| Multiple Advisors                                  | deferred               | Requires production evidence and separate approval                                                                       |
| Context-model promotion                            | deferred               | No equivalent public Pi policy primitive is assumed                                                                      |
| Fullscreen multi-pane configuration                | deferred               | Current commands provide `/advisor on`, `off`, `status`, and bounded `dump`, but no fullscreen configuration             |
| Mutating Advisor tools                             | deferred               | Requires a separate advanced security specification                                                                      |
| Destructive-command interception                   | out of scope           | Must be a separate extension independent of Advisor activation                                                           |
| Optional Memory suggestion handoff                 | implemented            | Detects compatible active capability, delivers bounded pending-submission guidance, and never calls Memory Lane          |
| Product telemetry                                  | intentional difference | Pi Advisor sends none                                                                                                    |

## rpiv-advisor coexistence

`@juicesharp/rpiv-advisor` is Executor-invoked consultation, while this package is automatic observation.
Both register `/advisor`.
Pi 0.80.7 assigns `/advisor:1` and `/advisor:2` in load order, and the resolved names are discoverable by `session_start`.
The current runtime does not implement a collision warning, so users must inspect Pi's command list when both extensions are installed.
