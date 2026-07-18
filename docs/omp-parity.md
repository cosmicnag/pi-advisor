# OMP Advisor Parity

Pi Advisor independently implements the useful automatic-review behavior associated with OMP while remaining within Pi's public extension APIs and this package's security boundaries.
This document records current capabilities and intentional differences.

## Implemented behavior

| Capability                         | Pi Advisor behavior                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Automatic review                   | Reviews meaningful completed Executor turns without requiring an Executor tool call.                                                 |
| Silence when work is sound         | Empty completions, private plain text, content-free approval phrases, and normalized duplicates produce no note.                     |
| Isolated Advisor                   | Uses one in-memory nested Pi session with recursive extensions and other resources disabled.                                         |
| Explicit model                     | Requires one configured `provider/model` and valid credentials, with no Executor-model fallback.                                     |
| Active delivery                    | Sends accepted advice at Pi's next steering boundary without claiming to abort the current tool.                                     |
| Deferred delivery                  | Holds idle, terminal, interruption-time, and restored advice for a later user-driven turn without triggering completion.             |
| Advice presentation                | Uses theme-aware, width-bounded cards with intent, severity, delivery, age, and staleness metadata.                                  |
| Dedupe and bounds                  | Applies bounded normalization-aware dedupe, note limits, queue limits, and per-turn delivery limits.                                 |
| Branch and lifecycle safety        | Uses entry identity, epochs, eager lifecycle invalidation, session isolation, and compatible resume.                                 |
| Retry and pause                    | Rolls back a failed private turn, retries once after a bounded delay, and pauses after repeated failures.                            |
| Context maintenance                | Uses public usage estimation, compaction, recalculation, and bounded current-branch re-prime.                                        |
| Cost controls                      | Enforces review cadence, turn, tool-call, token, reported-cost, update, context, and pending-byte limits.                            |
| Read-only tools                    | Provides protected and bounded `read`, `grep`, `find`, and `ls`, plus the private internal `advise` tool.                            |
| Durable configuration              | Loads Pi-native User and trusted Project WATCHDOG YAML and Markdown with narrow Project authority.                                   |
| Interactive configuration          | Selects model, reasoning effort, approved tools, and User instructions through Pi dialogs.                                           |
| Optional Memory suggestion handoff | Detects a compatible active `memory_suggest` capability and delivers verification guidance without calling or importing Memory Lane. |
| Optional transcript records        | Stores only opt-in, reasoning-free, redacted, bounded Pi custom entries outside model context.                                       |
| Diagnostics                        | Produces explicit redacted diagnostics bounded to 16 KiB.                                                                            |
| Product telemetry                  | Sends none.                                                                                                                          |

## Intentional differences

| OMP behavior or capability                 | Pi Advisor position                                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Hard interruption of an in-flight tool     | Pi's public steering boundary does not abort the current tool, so active advice arrives at the next assistant boundary.        |
| Blocking Executor until Advisor catches up | Pi Advisor coalesces a bounded backlog and never pauses the Executor for review synchronization.                               |
| Deliberate user-interrupt distinction      | Pi 0.80.7 exposes no public abort cause, so every public abort signal or aborted stop reason forces in-flight advice to defer. |
| `.omp` and root WATCHDOG paths             | Pi Advisor uses only Pi-native User and trusted Project WATCHDOG paths.                                                        |
| OMP `glob` tool                            | Pi 0.80.7 supplies `find`, which Pi Advisor protects and bounds.                                                               |
| Raw Advisor transcript persistence         | Prohibited. Optional records are bounded, redacted, reasoning-free shapes only.                                                |
| Multiple Advisors                          | Not supported in the initial release.                                                                                          |
| Context-model promotion                    | Not implemented because no equivalent public Pi policy primitive is assumed.                                                   |
| Fullscreen multi-pane configuration        | Replaced by a Pi-native dialog flow plus complete YAML documentation.                                                          |
| Mutating Advisor tools                     | Not supported. They require a separate security design.                                                                        |
| Destructive-command interception           | Out of scope and belongs in a separate extension independent of Advisor activation.                                            |

## rpiv-advisor coexistence

`@juicesharp/rpiv-advisor` provides Executor-invoked consultation, while Pi Advisor provides automatic observation.
Both packages register `/advisor`.
Pi 0.80.7 assigns `/advisor:1` and `/advisor:2` in extension load order.
Pi Advisor warns once when duplicate assigned commands are detectable and does not modify the other package.
Use Pi's command list to identify each suffix, and disable or uninstall one package unless both review styles and their costs are intentional.
