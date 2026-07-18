# Slice 5B WATCHDOG Public UX and Package Closure

## Scope

This batch implements issue #21 under the approved Slice 5 objective.
It completes approved read-only tool selection, multiline User-instruction editing, the `/advisor configure` workflow, protected-path ownership documentation and regression coverage, the public configuration reference, coexistence UX, and publishable package and release metadata.
It does not add OMP paths, `@import` expansion, a fullscreen multi-pane editor, multiple advisors, mutating Advisor tools, or any Slice 6 candidate.

## Deliverable evidence

| Deliverable                         | Result | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read-only tools and protected paths | Pass   | The interactive toggle loop is generated only from `READ_ONLY_TOOL_NAMES`; focused tests prove no `bash` option and canonical output ordering. User and trusted Project protected paths accumulate, while Project exceptions warn and remain absent. The dedicated reference documents defaults, exact User exceptions, blocked results, and stable-filesystem limitations.                                                                                                                                                                                                                                                                 |
| Instructions editing                | Pass   | The Pi multiline editor starts with persisted User YAML instructions, explicitly states that fixed policy remains authoritative, supports clearing text, and cancels without saving. YAML and Markdown instruction precedence remains unchanged.                                                                                                                                                                                                                                                                                                                                                                                            |
| Complete configure workflow         | Pass   | Dialog-capable TUI and RPC clients select model, effort, tools, and instructions, see one confirmation with the destination and reference, then receive atomic save plus immediate runtime apply. Disabled or inactive Advisor state does not prevent configuration because the editor operates on loaded User policy before calling runtime rebuild. Non-dialog clients point to `docs/configuration.md`.                                                                                                                                                                                                                                  |
| Public documentation                | Pass   | `docs/configuration.md` catalogs every version `1` field, type, accepted value, default, scope, merge rule, security/privacy/context/cost effect, apply semantics, activation matrix, warnings, precedence, protected paths, persistence records and exclusions, deferred retention and compatible resume, locations, inspection, disablement, deletion, telemetry, provider network, coexistence, migrations, and required examples. README links the reference and contains concise public warnings and coexistence guidance.                                                                                                             |
| Package and release closure         | Pass   | The manifest is public and exposes the TypeScript root while retaining Pi discovery metadata, tested peer ranges, MIT license, runtime TypeBox and YAML dependencies, repository metadata, and a files allowlist. Pack validation checks publishability, runtime dependencies, and required metadata and content. CI verifies the pinned Pi version, all checks, an isolated packed-install E2E, and package content. The manual approved-tag workflow publishes the exact validated tarball through a lockfile-pinned npm CLI with OIDC trusted publishing and provenance. Attribution and dependency notices are current through Slice 5. |

## Security and ownership review

Fixed Advisor policy remains above User instructions, tagged Project instructions, and observed Executor context.
The UI can only approve `read`, `grep`, `find`, and `ls` and cannot create an unknown or mutating tool name.
Project tool lists only intersect User approval.
Project protected paths add restrictions, and only User YAML can create exact protected-path exceptions.
Project limits remain narrow-only under the existing merge implementation.
Freeform instructions cannot replace code-enforced tools, path checks, emission validation, bounds, context and spending governors, delivery, lifecycle, or `advise` protocol.
Trusted Project text still carries residual model prompt-injection risk.
Redaction and read-tool path protection reduce exposure but cannot guarantee elimination of every secret.
Malformed configuration remains fail-safe and cannot prevent startup.

## Trusted-publishing tool decision

The release workflow deliberately uses npm CLI 11.6.2 because npm trusted publishing requires npm CLI 11.5.1 or later, as documented in the official [npm trusted publishing requirements](https://docs.npmjs.com/trusted-publishers/#supported-cicd-providers).
Version 11.6.2 is a development dependency recorded in `pnpm-lock.yaml`, and the workflow invokes it with `pnpm exec npm` after `pnpm install --frozen-lockfile` rather than fetching it at release time with `pnpm dlx`.
Local evidence from `pnpm exec npm --version` returned `11.6.2`; a live OIDC exchange remains gated on the approved GitHub environment, tag, and npm trusted-publisher registration.

## Verification

- `pnpm exec vitest run tests/unit/configuration.test.ts tests/integration/configuration-runtime.test.ts` passed 17 focused tests across 2 files.
- `pnpm verify` passed typecheck, lint, formatting, and 184 unit, contract, and integration tests across 20 files.
- `pnpm test:e2e` passed the packed install from a temporary consumer project isolated from repository `node_modules`, resolved TypeBox and YAML from the installed package dependency graph, and passed public package metadata and reference checks, RPC and JSON activation behavior, malformed startup safety, and explicit CLI activation.
- `pnpm pack:validate` validated the publishable identity and metadata plus all 35 packed files, including `docs/configuration.md`, while excluding `docs/internal`, tests, scripts, workflows, and `CONTEXT.md`.
- `pnpm exec yaml valid < .github/workflows/ci.yml` and the same command for `release.yml` passed syntax validation.
- `git diff --check` passed with no whitespace errors.

An initial focused integration run exposed that coexistence detection had been placed on `ExtensionContext`, where `getCommands` is unavailable.
The implementation was corrected to use the measured public `ExtensionAPI.getCommands()` surface at `session_start`; typecheck, lint, focused tests, full verification, and E2E then passed.

## Deviations and residual risks

The Pi-native public UI offers a repeated single-select toggle list because Pi 0.80.7 exposes `select` but no public multi-select dialog.
This remains a picker-based workflow rather than the explicitly deferred fullscreen editor.
Protected paths, activation, limits, Memory suggestions, and persistence remain direct YAML editing because the approved `/advisor configure` surface covers model, effort, tools, and instructions.
The package version remains `0.0.0`; release version selection, release notes, tag creation, environment approval, and actual publication remain explicit Slice 5 closure and user release gates.
The trusted-publishing workflow cannot be executed locally without an approved GitHub tag, environment, and npm trusted-publisher registration, so local validation covers its lockfile-pinned npm CLI, immutable inputs, and exact tarball path rather than a real publish.
Manual narrow and wide TUI presentation is reserved for Slice 5 closure because this worker was asked for implementation and automated verification without opening a live interactive review process.
