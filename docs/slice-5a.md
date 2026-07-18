# Slice 5A WATCHDOG Configuration and Public UX

## Scope

This batch implements issue #20 under the approved Slice 5 objective.
It adds versioned YAML validation, User and trusted Project merge, bounded WATCHDOG Markdown loading, atomic User saves with immediate runtime rebuild, explicit external-edit reload behavior, and a Pi-native model and reasoning picker.
It does not add OMP paths, `@import`, a fullscreen editor, multiple advisors, read-only tool selection UI, instructions editing UI, or the full Slice 5 configuration reference.

## Acceptance evidence

| Deliverable                      | Result | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Versioned YAML schema validation | Pass   | `WATCHDOG.yml` uses a compiled TypeBox version `1` schema over YAML parsing. A present partial User file merges over approved release defaults rather than programmatic fallback values. Unknown fields warn and are ignored. Invalid types, unsupported versions, and mutating tool names fail safely without preventing startup.                                                                                                       |
| User and trusted Project merge   | Pass   | User configuration owns activation, model, effort, persistence, exceptions, and spending. Project files are not read when trust is inactive. Trusted Project tools intersect the User set, protected paths only accumulate, maximums only decrease, minimum cadence only increases, response reserve only increases, and User-only fields warn and are ignored.                                                                          |
| `WATCHDOG.md` loading            | Pass   | User and trusted Project Markdown is read through a fixed byte bound, redacted, truncated to 64 KiB, and combined under the correct authority. Project text is inserted in a tagged lower-authority section below fixed policy and User instructions.                                                                                                                                                                                    |
| Atomic save and runtime apply    | Pass   | Confirmed User changes are written to a same-directory mode `0600` temporary file, flushed, and atomically renamed. Save failure leaves the prior file and runtime active. Successful apply increments epoch, aborts old nested work, clears old-policy pending output, rebuilds policy and tools, preserves usage and delivered-note totals, and prepends one bounded branch re-prime to the next review. No file watcher is installed. |
| Model and reasoning picker       | Pass   | `/advisor` and `/advisor configure` use Pi-native selectors in dialog-capable TUI or RPC clients over authenticated registry models and the approved effort values, then show one confirmation before persistence and apply. JSON and print modes return configuration-path guidance rather than opening a dialog.                                                                                                                       |

## Instruction precedence and security

The generated Advisor system prompt states the complete authority order: fixed Advisor policy, User instructions, tagged Project instructions, then observed Executor context.
It also states that freeform instructions cannot replace code-enforced tool restrictions, protected paths, emission guards, bounds, context and cost governors, delivery and lifecycle behavior, or the internal `advise` schema.
Trusted Project text still reaches a model and therefore retains residual prompt-injection risk.
Project configuration cannot create protected-path exceptions or enable transcript persistence.
Redaction reduces but cannot guarantee elimination of every sensitive value.

## Tests

- Versioned partial User loading over release defaults, including when programmatic fallback values differ.
- Malformed YAML, unsupported or invalid fields, and mutating tool rejection with safe inactive fallback.
- Untrusted Project file exclusion.
- Trusted Project tool intersection, path accumulation, limit narrowing, cadence narrowing, exception preservation, and User-only field warnings, including non-false Memory enablement values.
- User and Project Markdown redaction and byte bounds.
- Atomic replacement, temporary-file cleanup, and prior-file preservation on save failure.
- Picker model ordering and approved reasoning choices.
- Live configuration apply with delivered-note and usage preservation, epoch invalidation, paused-state soft-cap re-evaluation, tool rebuild, and bounded current-branch re-prime on the next review.
- Packed Pi startup with no config, persisted RPC default activation, JSON default suppression, malformed config warning, and explicit CLI activation.

## Verification

- `pnpm exec vitest run tests/unit/configuration.test.ts tests/integration/configuration-runtime.test.ts` - passed 13 focused tests across 2 files.
- `pnpm verify` - passed typecheck, lint, formatting, and 180 unit, contract, and integration tests across 20 files.
- `pnpm test:e2e` - passed the packed Pi installation scenario covering persisted RPC activation, JSON opt-in behavior, malformed startup safety, and explicit CLI activation.
- `pnpm pack:validate` - passed with 33 package files validated, including the new configuration runtime, public Slice 5A evidence, and YAML dependency metadata while excluding internal planning files and `CONTEXT.md`.
- `git diff --check` - passed with no whitespace errors.

## Deviations and residual risks

The Slice 5A picker intentionally edits only model and reasoning level.
Read-only tool selection and instructions editing remain issue #21 Batch B work.
The full dedicated configuration reference, ownership matrix, complete field catalog, coexistence closure, package release closure, and manual narrow and wide TUI verification remain Slice 5B or Slice 5 verification work.
Configuration apply prepares the bounded current-branch snapshot immediately and submits it together with the next eligible Advisor update rather than creating a separate paid review solely for re-prime.
This preserves continuity without triggering an unsolicited provider request.
Pi exposes the canonical agent directory through `getAgentDir()` rather than on `ExtensionContext`, so WATCHDOG User paths follow that public Pi helper.
Atomic rename provides all-or-old-file visibility, but the initial implementation does not claim crash durability for the containing directory metadata.
There is no automatic file watcher.
External edits apply only through Pi `/reload` or a later confirmed configure apply.
