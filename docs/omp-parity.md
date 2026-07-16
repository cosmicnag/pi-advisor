# OMP Advisor Parity Matrix

## Status labels

- `planned` means required for the initial production release but not implemented in Slice 0.
- `measuring` means Slice 0 must replace an API assumption with evidence.
- `intentional difference` means public Pi APIs or product boundaries require a documented divergence.
- `deferred` means the capability requires a separately approved later specification.
- `out of scope` means the behavior does not belong in Pi Advisor.

| Capability                                         | Pi Advisor position    | Slice 0 evidence target                                                                 |
| -------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------- |
| Automatic review after Executor work               | planned                | No production runtime in Slice 0                                                        |
| Silence when work is sound                         | planned                | Scripted provider supports empty and plain-text responses                               |
| One long-lived isolated Advisor                    | planned                | Verify public nested `AgentSession` construction APIs                                   |
| Explicit secondary model selection                 | planned                | Verify `ModelRegistry` lookup and credential APIs                                       |
| Active advice delivery                             | planned                | Pi 0.80.7 steer arrives after the current tool boundary and before the next model call  |
| Idle and terminal deferred advice                  | planned                | Pi 0.80.7 nextTurn does not trigger a completion and needs no fallback                  |
| Hard interruption of an in-flight tool             | intentional difference | Pi steering reaches the next assistant boundary and does not abort the current tool     |
| Executor backlog blocking until Advisor catches up | intentional difference | Public Pi API provides coalescing but no clean Executor pause primitive                 |
| Stable active-branch cursor                        | planned                | Entry IDs remain stable across append, compaction, and tree navigation                  |
| Session replacement isolation                      | planned                | Old shutdown precedes new start with a fresh session and extension instance             |
| Deliberate user-interrupt distinction              | intentional difference | Public abort events expose no cause, so every abort uses the safe interruption fallback |
| Automatic configuration from repository            | intentional difference | Project configuration never activates paid review                                       |
| OMP `.omp` and root WATCHDOG paths                 | intentional difference | Initial release uses Pi-native user and project paths only                              |
| OMP `glob` Advisor tool                            | intentional difference | Pi 0.80.7 exposes `find` in a seven-tool built-in inventory                             |
| Read-only Advisor tools                            | planned                | Verify active and configured tool inventory APIs                                        |
| Protected sensitive paths                          | planned                | Review default patterns and symlink-aware threat model                                  |
| Private Advisor transcript                         | planned                | Disabled by default and reasoning-free when later enabled                               |
| Context compaction and bounded re-prime            | planned                | Measure public compaction and context-building APIs                                     |
| Multiple Advisors                                  | deferred               | Requires production evidence and separate approval                                      |
| Context-model promotion                            | deferred               | No equivalent public Pi policy primitive is assumed                                     |
| Fullscreen multi-pane configuration                | deferred               | Initial UI uses Pi-native picker workflows                                              |
| Mutating Advisor tools                             | deferred               | Requires a separate advanced security specification                                     |
| Destructive-command interception                   | out of scope           | Must be a separate extension independent of Advisor activation                          |
| Memory Lane integration                            | intentional difference | Capability-oriented visible suggestion only, with no dependency or direct Advisor call  |
| Product telemetry                                  | intentional difference | Pi Advisor sends none                                                                   |

## rpiv-advisor coexistence

`@juicesharp/rpiv-advisor` is Executor-invoked consultation, while this package is automatic observation.
Both may register `/advisor`.
Pi 0.80.7 assigns `/advisor:1` and `/advisor:2` in load order.
The resolved collision is detectable at `session_start`, and one extension-instance boolean supports a one-time warning.
