# Slice 5 Verification and Closure

## Scope

This closure pass verifies issues #20 and #21 against the full Slice 5 specification and issue #22 acceptance criteria.
It does not begin Slice 6 or add OMP paths, `@import` expansion, a fullscreen editor, or multiple advisors.
The user explicitly required this pass to run without skills, subagents, or Claude review.

## Specification comparison

| Acceptance criterion                                                                                | Result | Evidence                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Untrusted Project configuration is ignored                                                          | Pass   | `tests/unit/configuration.test.ts` proves Project YAML and Markdown are not opened when trust is inactive.                                                                                                                                  |
| Instruction authority is fixed policy, User, tagged Project, then observed Executor context         | Pass   | Configuration merge tests and `tests/integration/configuration-runtime.test.ts` verify ordering and structural tagging.                                                                                                                     |
| Freeform instructions cannot override enforced policy                                               | Pass   | Tool registration, protected-path checks, emission validation, governors, delivery, lifecycle, and `advise` validation remain code-owned and are covered by focused integration tests.                                                      |
| Project limits only narrow User policy                                                              | Pass   | Project merge tests cover maximum limits, minimum cadence, context fraction, response reserve, Memory limits, activation, model, effort, persistence, and spending ownership.                                                               |
| Project tools only narrow User-approved tools                                                       | Pass   | The merge intersects tools, schema validation rejects unknown or mutating names, and the interactive picker is generated only from `read`, `grep`, `find`, and `ls`.                                                                        |
| Project protected paths only add restrictions and cannot create exceptions                          | Pass   | Actual trusted WATCHDOG loading unions User and Project paths while preserving only User exceptions.                                                                                                                                        |
| Malformed configuration cannot prevent startup                                                      | Pass   | Unit tests cover malformed User and Project files, and the packed E2E covers malformed persisted User startup.                                                                                                                              |
| Persisted activation applies only to TUI and RPC                                                    | Pass   | Runtime integration and packed E2E prove TUI and RPC default activation while JSON and print remain explicit opt-in.                                                                                                                        |
| Configuration apply is atomic and immediate                                                         | Pass   | Focused tests prove prior-file preservation, epoch invalidation, stale-output removal, runtime rebuild, usage and delivery preservation, and bounded re-prime.                                                                              |
| External edits require explicit reload or apply                                                     | Pass   | No watcher is installed, and public documentation states the explicit reload boundary.                                                                                                                                                      |
| Protected-path, redaction, ownership, persistence, and prompt-injection security review is complete | Pass   | `docs/protected-path-threat-model.md`, `docs/configuration.md`, Slice 5 evidence, and the security regression suite cover each boundary and its residual limitations.                                                                       |
| Public documentation is complete                                                                    | Pass   | README and `docs/configuration.md` cover every field, default, scope, merge rule, activation mode, warning, persistence record, retention and deletion behavior, telemetry, provider traffic, coexistence, migration, and required example. |
| Package metadata, discovery, and clean installation work                                            | Pass   | Pack validation checks public metadata and exclusions, while the E2E installs the tarball into an isolated consumer and then installs it through Pi.                                                                                        |
| Coexistence behavior is documented and measured                                                     | Pass   | The command-collision test covers Pi suffix detection, and public docs explain both review styles, `/advisor:1` and `/advisor:2`, and disablement.                                                                                          |
| Work remains inside Slice 5                                                                         | Pass   | The diff adds closure evidence, a missing compact footer status, and configured-model status correctness without introducing a Slice 6 candidate.                                                                                           |

## Closure fixes

Manual verification found that `/advisor status` displayed `Model: not configured` after a successful configuration apply while Advisor remained off.
Runtime status now retains the configured model before activation and after configuration apply, with integration coverage for disabled startup and disabled apply.

The full specification also required a compact Advisor footer indicator, but the merged implementation exposed status only through commands and programmatic hooks.
The extension now uses Pi's additive `ctx.ui.setStatus()` API to show `Advisor active`, `Advisor inactive`, or `Advisor paused`, with queued bytes only when backlog exists.
It clears the status when Advisor is off or the session shuts down and never replaces Pi's built-in footer.
A focused formatter test covers active, queued, paused, and hidden states.

## Manual TUI verification

Manual checks used Pi `0.80.7`, the extension loaded from `src/index.ts`, an isolated `PI_CODING_AGENT_DIR`, and no session persistence.
No successful model request was made during the checks.

| Check                                     | Result                                                                                                                                                                |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Narrow configuration UI at `60x24`        | Pass: model, effort, read-only tool, multiline instructions, confirmation, wrapping, cancellation boundaries, and save notification remained usable without clipping. |
| Wide configuration UI at `120x35`         | Pass: the complete confirmation and reference rendered clearly without replacing Pi's footer.                                                                         |
| Disabled status after configuration apply | Initially failed, then passed after the configured-model status fix.                                                                                                  |
| Active footer at `60x24` and `120x35`     | Pass: the additive `Advisor active` line remained compact and Pi's normal footer stayed visible.                                                                      |
| Disable behavior                          | Pass: `/advisor off` cleared the extension status while preserving Pi's footer.                                                                                       |
| Advice card at `60x24` and `120x35`       | Pass: a deterministic TUI-only fixture rendered a concern card with severity, delivery, age, and staleness metadata, wrapping without clipping.                       |
| Theme behavior                            | Pass: the same card rendered under Catppuccin Latte and Frappe with distinct ANSI theme output and no rendering failure.                                              |
| `/advisor status` and `/advisor dump`     | Pass: status remained width-bounded and the dump remained redacted and bounded.                                                                                       |

An attempted `/theme` slash input was treated by Pi as an ordinary prompt rather than a built-in command and received a provider `400` before producing content or usage.
Theme verification was therefore completed by restarting the isolated fixture with explicit Latte and Frappe settings.

## Automated verification

- `pnpm exec vitest run tests/unit/presentation.test.ts tests/integration/advisor-core.test.ts tests/integration/configuration-runtime.test.ts` passed 20 focused tests across 3 files.
- `pnpm verify` passed typecheck, lint, formatting, and 187 unit, contract, and integration tests across 20 files.
- `pnpm test:e2e` passed 1 packed clean-consumer Pi installation and run-mode activation scenario.
- `pnpm pack:validate` validated publishable metadata and 36 required package files while excluding `docs/internal`, tests, workflows, scripts, and `CONTEXT.md`.
- `pnpm exec yaml valid < .github/workflows/ci.yml` and the equivalent release-workflow command passed.
- `git diff --check` passed.
- `pnpm view @ribbons-digital/pi-advisor version --json` returned npm `E404` for the requested scoped package from the queried public registry.

## Deviations and unresolved risks

The user explicitly waived the specification's Claude Fable 5 closure review and required no Claude review.
Code review is therefore limited to the author's specification comparison, automated verification, GitHub CI, and CodeRabbit on the closure PR.

Pi 0.80.7 exposes no public multi-select dialog, so the approved tool editor remains a repeated single-select toggle picker followed by Done.
Advanced policy remains YAML-edited, while `/advisor configure` covers model, effort, tools, and instructions as specified.

The package remains version `0.0.0` until the user selects and approves a release version.
A live npm OIDC publication remains untested because it requires an approved version tag, GitHub environment, and npm trusted-publisher registration.
The npm registry `E404` result demonstrates absence from the queried public registry, not ownership or trusted-publisher configuration.

Protected-path checks, static symlink handling, and redaction reduce exposure but do not form a sandbox or guarantee elimination of every secret.
Trusted Project instructions retain residual model prompt-injection risk.
Optional transcript records remain append-only until the owning Pi session file is deleted.

## Stop condition

Stop after Slice 5 merge cleanup and explicit release approval handling.
Do not begin Slice 6 without separate user authorization.
