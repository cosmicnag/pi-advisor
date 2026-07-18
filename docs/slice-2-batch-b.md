# Slice 2 Batch B Evidence

## Approved scope

GitHub issue #6 is the Slice 2 umbrella.
The user approved child issue #8 after issue #7 merged in PR #25.
Issues #9 and #10 remain ordered later work.

## Behavior-gap matrix

| Issue #8 behavior            | Batch A baseline                                           | Batch B change                                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Model-visible formatting     | Plain bracketed labels and guidance text                   | XML-safe `advisor-note`, `note`, and `guidance` markup carries intent, severity, delivery, and stale attributes                                |
| Custom message presentation  | Pi default custom-message rendering                        | A theme-aware renderer shows severity, delivery state, age, staleness, truncation metadata, and bounded note text                              |
| Late TUI presentation        | Deferred advice was not visible until the next user prompt | An immediate TUI-only custom entry shows accepted idle advice without adding it to Executor context                                            |
| Duplicate visual suppression | Not applicable                                             | Next-turn custom messages use `display: false` when their note was already shown as a late entry                                               |
| Diagnostics                  | `/advisor dump` was unavailable                            | Explicit diagnostics are recursively redacted, bounded to 16 KiB, and exclude transcripts, notes, reasoning, instructions, and protected paths |
| Delivery failure handling    | Active send failures became failed reviews                 | Active sends and late-entry appends now have distinct single-shot delivery-failure accounting and one bounded redacted reason                  |
| Redaction                    | Common credential shapes were redacted                     | Bare uppercase `KEY`, `TOKEN`, `SECRET`, `PASSWORD`, `PASSWD`, and `CREDENTIALS` assignments are also redacted                                 |

## Scope boundaries

Batch B adds no configuration field and no package dependency.
Memory suggestion behavior remains issue #9.
Cross-exit deferred restoration remains Slice 3.
The late-advice entry persists only as ordinary branch-local Pi session presentation and never restores package-owned deferred delivery state.
No delivery path retries a failed message send or entry append.

## Verification evidence

- The pre-edit-focused baseline passed 49 tests across the Pi public API contract and delivery and safety integration suites.
- `pnpm verify` passed with typecheck, lint, formatting, and 12 unit, contract, and integration files containing 100 tests after external review fixes.
- Presentation fixtures cover 24-column collapsed and 100-column expanded cards under plain and ANSI-styled theme callbacks.
- Integration coverage verifies immediate TUI-only late entries, hidden next-turn visual duplication, model-context delivery exactly once, append-failure fallback, and one-attempt delivery failure accounting.
- XML fixtures cover content characters, attribute characters, and invalid XML control characters.
- Diagnostics fixtures verify the 16 KiB bound, recursive redaction, valid JSON payload, and exclusion of private context categories.

## Review status

Claude Fable 5 found no blockers in its first review round.
The executor adopted its malformed-details renderer fallback and oversized-diagnostics fallback-test suggestions and documented the supported host-peer requirement.
CodeRabbit CLI then reported an invalid timestamp risk and one documentation wording issue, which were fixed, plus a quoted-secret concern that existing regex order and tests demonstrated was a false positive.
Claude Fable 5 reviewed those dispositions and returned final `APPROVE` consensus with `SAFE FOR FINAL CODERABBIT RERUN: YES`.
CodeRabbit CLI reruns continued until zero findings; a late carriage-return sanitization finding was fixed before the final clean run.

## Deviations and unresolved risks

Pi 0.80.7 invokes custom renderers only in TUI mode, so RPC, JSON, and print continue to use structured messages and status without constructing TUI components.
A TUI late-advice entry is a persisted branch-local presentation artifact, but the package still does not restore deferred delivery across process or session exit.
