# Slice 2 Batch C Evidence

## Approved scope

GitHub issue #6 is the Slice 2 umbrella.
The user approved child issue #9 after issue #8 merged in PR #26.
Issue #10 remains the ordered Slice 2 verification and closure batch.

## Behavior-gap matrix

| Issue #9 behavior     | Batch B baseline                                              | Batch C change                                                                                                                                    |
| --------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Optional capability   | The Slice 0 detector existed without runtime effect           | Runtime review, status, and diagnostics inspect the active public tool inventory without invoking or importing Memory Lane                        |
| Structured intent     | Internal `advise` accepted ordinary review only               | A strict union accepts ordinary review or structured Memory suggestion intent with category and allowed basis                                     |
| Priority              | First valid ordinary note won                                 | Ordinary material advice replaces a provisional Memory suggestion from the same update                                                            |
| Safety                | Ordinary rationale was redacted and bounded                   | Proposed memory text is independently secret-checked and bounded, suppresses instead of truncating, and never uses personal category or severity  |
| Duplicate suppression | Ordinary note identity used severity and normalized note text | Memory identity uses normalized proposed text, category, and basis, while successful current-update memory outcomes suppress a duplicate proposal |
| Governors             | Memory configuration remained reserved                        | Turn cadence, elapsed-time cadence, session cap, proposed-character limit, and proposed-token limit are active and reported                       |
| Presentation          | Cards showed ordinary severity                                | Memory cards show distinct intent, proposed text, category, basis, delivery state, and `could-not-queue` state                                    |
| Executor handoff      | Ordinary advice asked the Executor to weigh guidance          | Memory delivery asks the Executor to verify or revise, submit with `status: "pending"` without another confirmation, or briefly explain a decline |
| Capability loss       | Not applicable                                                | Delivery rechecks capability and replaces actionable guidance with a visible no-call notice                                                       |

## Scope boundaries

Batch C adds no package dependency and does not invoke an Executor memory tool.
It does not import Memory Lane, access Memory Lane storage, approve memories, or infer memory-tool outcomes beyond observing a successful current-update call for duplicate suppression.
Cross-exit restoration of deferred ordinary and Memory suggestion advice remains Slice 3.
Durable WATCHDOG configuration remains Slice 5.

## Verification evidence

- Pre-edit packed-package E2E passed on Pi 0.80.7.
- Pre-edit focused capability, policy, and presentation baseline passed 31 tests.
- Focused Batch C integration coverage passes 20 scripted scenarios, including active and deferred delivery, capability loss in both modes, governed Memory suggestion discard, content-free proposal suppression, and fractional session-cap normalization.
- Focused policy and presentation coverage passes 31 unit tests, including successful-memory metadata budgets and 24-column and 100-column Memory cards under plain and ANSI-styled theme callbacks.
- `pnpm verify` passed typecheck, lint, formatting, and 125 unit, contract, and integration tests across 13 files.
- `pnpm test:e2e` passed the packed-package Pi 0.80.7 install and inactive-default startup scenario.
- `pnpm pack:validate` passed with a 23-file package allowlist.
- `git diff --check` passed.

## Review status

Claude Opus 4.8 completed a direct high-effort implementation review and returned `CONSENSUS` with `SAFE TO OPEN PR: YES` and no required findings.
The executor then added Opus's optional active capability-loss and governed-discard coverage, refined admitted-versus-delivered accounting, and reran all verification gates.
Claude Opus 4.8 completed a follow-up review and again returned `CONSENSUS / SAFE TO OPEN PR: YES` with no required findings.
Its only remaining optional observation was stale evidence counts, which this document corrected before PR creation.
After the PR review identified seven follow-up documentation, validation, bounded-metadata, queue-accounting, and single-source-of-truth findings, the executor reproduced the two user-visible policy defects, fixed all seven findings, and reran every verification gate.
Claude Opus 4.8 reviewed the complete follow-up diff and returned `CONSENSUS / SAFE TO PUSH: YES` with no required findings.

## Deviations and unresolved risks

Eligibility basis is a structured allowlist enforced by schema and emission policy.
Whether a fact is semantically durable and whether a repeated-mistake rationale truly identifies two independent occurrences remain model judgments guided by fixed policy and verified again by the Executor before pending submission.
Batch C counts an accepted Memory suggestion against cadence and the session cap when it enters a safe active or deferred delivery queue, which prevents a deferred queue from accumulating more suggestions than the configured allowance.
Cross-exit persistence of Memory suggestion cadence and cap state remains Slice 3 by specification.
