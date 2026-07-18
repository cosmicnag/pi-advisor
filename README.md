# @ribbons-digital/pi-advisor

`@ribbons-digital/pi-advisor` is an independent Pi extension for automatic, isolated secondary review of an Executor session.
The implemented core observes meaningful completed Executor turns in the background, stays silent when work is sound, and delivers only bounded actionable notes.

> Slice 5 completes durable WATCHDOG configuration, the model, reasoning, read-only tool, and instruction editor, public configuration documentation, coexistence warning, and publishable package metadata.
> The installed release default remains off with no implicit model selection.

## Not the same as rpiv-advisor

[`@juicesharp/rpiv-advisor`](https://www.npmjs.com/package/@juicesharp/rpiv-advisor) provides an Executor-invoked consultation tool.
This package is designed for automatic background observation that does not depend on the Executor remembering to request a review.
Both packages register `/advisor`, and Pi 0.80.7 assigns `/advisor:1` and `/advisor:2` in extension load order when both are installed.
Pi Advisor warns once when duplicate assigned commands are detectable, coexists without changing the other package, and leaves selection to the user.
Use Pi's command list to identify each suffix, and disable or uninstall one package unless both automatic and Executor-invoked review styles and their costs are intentional.

## Implemented behavior through Slice 5

- One explicitly selected Advisor model, with no fallback to the Executor model.
- Automatic review after meaningful completed Executor turns.
- Silence when no material issue exists.
- At most one bounded visible Advisory note per review update.
- XML-safe model-visible nit, concern, and blocker notes with active, deferred, and stale attributes.
- Theme-aware custom advice cards show severity, delivery state, age, and staleness while respecting terminal width.
- Advice accepted after a TUI turn settles appears immediately as a TUI-only late-advice entry, then enters model context without a duplicate visible card on the next user-driven turn.
- Active advice reaches Pi's next steering boundary regardless of severity.
  A bounded package-owned copy remains active-pending until Pi acknowledges the custom message through its lifecycle or persisted branch state; an unacknowledged copy recovered at settlement becomes deferred instead of being lost on TUI queue clearing.
- Terminal and interruption-time advice waits for the next user-driven turn without triggering completion.
- A severity-scoped 4,096-key in-memory FIFO suppresses duplicate ordinary review notes across updates on the active branch.
  For notes with well-formed matching backtick spans, dedupe applies NFKC and prose-only whitespace normalization, lowercases prose, preserves backtick delimiters plus code-span case and whitespace, and folds only attached trailing prose punctuation.
  If a backtick is unmatched, dedupe retains whole-note whitespace normalization but skips case and trailing-punctuation folding so malformed code markup cannot suppress a code-sensitive variant.
  The suppressed-note status count combines content-free calls, extra valid calls from one update, cross-update duplicates, and deferred queue admission rejections.
- Deferred advice is bounded to 4,096 items and 1,000,000 retained UTF-8 bytes, including Memory rationale and proposed text.
  Each user-driven turn receives at most a 64 KiB FIFO prefix, with remaining notes retained for later turns.
- Advice produced after the Executor advances beyond the reviewed window is marked potentially stale and asks the Executor to verify it still applies.
  Deferred advice emitted from `before_agent_start` is also potentially stale because the current user prompt is newer Executor input that Pi has not yet appended to branch state.
- Separate in-memory Advisor conversation state with no persisted Advisor transcript.
- Bounded versioned `pi-advisor-runtime-state` custom entries persist lifecycle-only state outside model context even while optional transcript persistence is false.
- Entry-ID cursor ancestry validation detects transcript shrink and equal-length branch replacement.
- Compaction and tree-navigation hints invalidate every in-flight continuation before the host lifecycle await, then reseed to the resulting active branch.
- Compatible resume restores unexpired deferred advice, reports its age, marks it restored and potentially stale, and delivers it only after the next user prompt.
- Resume also restores up to 128 newest delivered-note dedupe hashes and Memory suggestion turn and time cadence, admitted count, delivered count, and session-cap state.
- New sessions, incompatible branches, expired notes, already delivered notes, and retention `0` do not restore deferred delivery.
- Protected `read`, `grep`, `find`, and `ls` tools, with no mutating Advisor tools.
- Explicit update, pending-byte, context, token, cost, tool-call, and turn governors.
- Context estimates use Pi's public context estimator with the latest successful provider usage plus trailing messages, and include bounded system-prompt and fixed tool-schema estimates when no valid usage anchor exists.
- Configured context fraction and response reserve trigger public nested `AgentSession.compact()` maintenance and post-compaction recalculation before another review request.
- Ordinary minimum-turn and elapsed-time cadence settings actively coalesce skipped updates until eligible, with a lifecycle-safe timer flushing a final time-held update without requiring another Executor turn.
- Every Executor tool result is redacted before independent 2,000-line, 64 KiB, configured update-token, and final update bounds.
- Single-flight review with bounded coalescing while Advisor is busy.
- Epoch invalidation on disablement, branch mismatch, compaction, tree navigation, session replacement, and shutdown.
- A provider or thrown nested-runtime failure rolls the failed turn out of private Advisor context, extracts stale nested queued messages, waits a fixed bounded 250 milliseconds, and retries the same bounded update once.
- Every failed attempt increments consecutive and total failure state.
  A successful retry resets consecutive failures, while a third consecutive failed attempt pauses Advisor and warns once.
- Branch, compaction, tree, disable, replacement, and shutdown epoch changes invalidate retry-delay continuations before another provider request.
- Delivery, malformed internal tool, and governor failures remain single-shot.
  Delivery failures count separately and retain only one bounded redacted last-failure reason.
- Status reports queued transcript bytes, reported and estimated context components, context policy limit, compaction and re-prime outcomes, exact review-request token and cost totals, pending retry delay, suppression, delivery, persistence, consecutive and total failures, branch resets, and the count of stale nested queued messages discarded without retaining their content.
- While Advisor is enabled, a compact additive footer status shows active, inactive, or paused state and queued bytes when applicable without replacing Pi's built-in footer.
- Explicit `/advisor dump` diagnostics redact included strings and stay within 16 KiB.
  When optional transcript persistence is enabled or existing records remain, the dump includes a bounded recent-record preview but never includes Executor or Advisor reasoning.
- Fail-safe inactive behavior when the configured model or credentials are unavailable.
- Optional Memory suggestions activate only while an Executor tool named `memory_suggest` is active and its public schema explicitly supports required string `text`, `preference` and `project` categories, and `status: "pending"`.
- Memory suggestions use structured intent, category, and eligibility-basis metadata, never use severity, and remain lower priority than ordinary material advice from the same update.
- Proposed memory text is never truncated.
  Sensitive, redaction-altered, oversized, current-update duplicate, cross-update duplicate, cadence-limited, and cap-limited proposals remain out of primary context.
- Accepted Memory suggestions render distinctly and tell the Executor to verify or revise the proposal before calling `memory_suggest` with `status: "pending"`, without another confirmation.
  The Executor may revise the proposal and must briefly explain a decline.
- Delivery rechecks capability compatibility.
  Capability loss replaces actionable submission guidance with a visible `could-not-queue` notice and no unavailable tool-call instruction.
- Pi Advisor never imports Memory Lane, invokes `memory_save` or `memory_suggest`, writes memory storage, or approves a memory.
- No product telemetry.

Bounded branch re-prime, unsafe-snapshot pause behavior, complete accounting, and optional private transcript records are implemented through Slice 4B.
Slice 5 adds durable configuration loading plus model, reasoning, approved read-only tool, and multiline User-instruction editing.

The normative public contract is in [`docs/behavior-contract.md`](docs/behavior-contract.md).
The measured OMP parity position is tracked in [`docs/omp-parity.md`](docs/omp-parity.md).
Slice 0 compatibility evidence is in [`docs/slice-0-compatibility.md`](docs/slice-0-compatibility.md).
The approved defaults and hard maxima are in [`docs/slice-0-limit-proposal.md`](docs/slice-0-limit-proposal.md).
The protected-path analysis is in [`docs/protected-path-threat-model.md`](docs/protected-path-threat-model.md).
Slice 2 Batch A implementation evidence is in [`docs/slice-2-batch-a.md`](docs/slice-2-batch-a.md).
Slice 2 Batch B implementation evidence is in [`docs/slice-2-batch-b.md`](docs/slice-2-batch-b.md).
Slice 2 Batch C implementation evidence is in [`docs/slice-2-batch-c.md`](docs/slice-2-batch-c.md).
Full Slice 2 acceptance and closure evidence is in [`docs/slice-2-verification.md`](docs/slice-2-verification.md).
Slice 3A lifecycle and persistence evidence is in [`docs/slice-3a.md`](docs/slice-3a.md).
Slice 3B retry and recovery evidence is in [`docs/slice-3b.md`](docs/slice-3b.md).
Full Slice 3 acceptance and closure evidence is in [`docs/slice-3-verification.md`](docs/slice-3-verification.md).
Slice 4A context-policy and compaction evidence is in [`docs/slice-4a.md`](docs/slice-4a.md).
Slice 4B re-prime, accounting, persistence, and long-session evidence is in [`docs/slice-4b.md`](docs/slice-4b.md).
Full Slice 4 acceptance and closure evidence is in [`docs/slice-4-verification.md`](docs/slice-4-verification.md).
Slice 5A WATCHDOG configuration and runtime-apply evidence is in [`docs/slice-5a.md`](docs/slice-5a.md).
Slice 5B public configuration and package UX evidence is in [`docs/slice-5b.md`](docs/slice-5b.md).
Full Slice 5 acceptance and closure evidence is in [`docs/slice-5-verification.md`](docs/slice-5-verification.md).
The complete field and ownership reference is in [`docs/configuration.md`](docs/configuration.md).

## Install the package locally

From this repository:

```sh
pi install /absolute/path/to/pi-advisor
```

Install the public package through Pi with:

```sh
pi install npm:@ribbons-digital/pi-advisor
```

The package can also be loaded for one run:

```sh
pi --no-extensions -e ./src/index.ts --no-session
```

The installed default registers `/advisor` and `--advisor` but does not start a nested runtime until the user explicitly configures a model.
The publishable manifest is protected by an approval-gated GitHub Actions environment and an explicit matching version tag.
Ordinary merges to `main` never publish.

## Session controls

- `/advisor` or `/advisor configure` opens model, reasoning-level, approved read-only tool, and multiline User-instruction editors in a dialog-capable TUI or RPC client, asks for one confirmation, atomically saves User configuration, and rebuilds the current runtime without restarting Pi.
  Non-dialog clients point to [`docs/configuration.md`](docs/configuration.md) instead of opening a partial editor.
- `/advisor on` enables review for the current session when the configured `provider/model` is available and authenticated.
- `/advisor off` disables review, invalidates in-flight work, clears the bounded transcript backlog, pending advice, and dedupe history, and disposes the nested session.
- `/advisor status` reports activation, model, queued transcript and retry backlog, context maintenance, input/output/cache/total tokens, reported cost, review requests and outcomes, retry attempts, stale nested-queue discards, delivery, suppression, persistence, Memory suggestion capability and governors, pause, and last-failure state.
- `/advisor dump` explicitly emits a redacted, bounded diagnostic snapshot.
  It includes a recent optional transcript-record preview when records exist, but never includes Executor or Advisor reasoning, instructions, protected paths, or unredacted failure text.
- `--advisor` requests activation for the current session in every Pi mode.
- `defaultEnabled: true` applies only to TUI and RPC sessions, while JSON and print sessions require explicit activation.

Running `/advisor on` after the three-failure pause or a governor pause resets the session token and cost totals before starting again and reports the previous totals.
Without an in-memory model configuration, `/advisor on` and `--advisor` leave Advisor inactive with an actionable status reason and never fall back to the Executor model.

## WATCHDOG configuration

Pi Advisor loads User configuration from `~/.pi/agent/WATCHDOG.yml` and optional User instructions from `~/.pi/agent/WATCHDOG.md`.
When `ctx.isProjectTrusted()` is true, it also loads `<repository>/.pi/WATCHDOG.yml` and `<repository>/.pi/WATCHDOG.md`.
Untrusted Project files are ignored.
Malformed files produce bounded path-specific warnings without preventing Pi startup.
External edits are not watched and apply only after `/reload` or a confirmed `/advisor configure` apply.

User YAML uses version `1` and may provide any supported field over the release defaults.
Trusted Project configuration can add tagged lower-authority instructions and protected paths, intersect the User-approved read-only tool set, disable or narrow Memory suggestions, lower maximum limits, increase minimum cadence, lower the context fraction, and increase the response reserve.
Project fields that could activate Advisor, select a model, increase reasoning or spending, create protected-path exceptions, or enable persistence are warned and ignored.
Fixed Advisor policy remains above User instructions, tagged Project instructions, and observed Executor context.
Freeform instructions cannot override code-enforced safety and protocol behavior, but trusted Project instructions still carry residual model prompt-injection risk.
WATCHDOG YAML and Markdown are bounded before use, instruction text is redacted, and Project Markdown is structurally tagged rather than inserted as fixed policy.

A minimal User file is:

```yaml
version: 1
model: anthropic/claude-sonnet-4-5
effort: high
defaultEnabled: false
```

Persisted `defaultEnabled: true` activates new TUI and RPC sessions only.
JSON and print modes remain opt-in through `--advisor` or `/advisor on` in a long-lived session.
User saves use a same-directory temporary file and atomic rename, so a failed save leaves the prior valid file active.
A confirmed apply invalidates old in-flight output, rebuilds tools and policy immediately, preserves delivered-note and aggregate usage totals, and prepares one bounded current-branch re-prime for the next review update.
The interactive editor can select only `read`, `grep`, `find`, and `ls`, and cancellation leaves configuration unchanged.
Protected paths, activation, limits, Memory suggestions, and persistence remain explicit YAML fields.
See the [complete configuration reference](docs/configuration.md) for every field, default, scope, effect, ownership rule, warning, persistence record, retention rule, and example.

An embedding extension or SDK host can still provide one complete trusted `AdvisorConfig` object as the fallback when no User file exists:

```ts
import { createPiAdvisorExtension, DEFAULT_ADVISOR_CONFIG } from "@ribbons-digital/pi-advisor";

const config = structuredClone(DEFAULT_ADVISOR_CONFIG);
config.model = "anthropic/claude-sonnet-4";
config.defaultEnabled = true;

export default createPiAdvisorExtension({ config });
```

The model reference must use `provider/model` syntax and must resolve through Pi's model registry with valid credentials.
Version 1 defaults to disabled, no model, `high` effort, all four read-only tools, empty review instructions, no additional protected paths, and no protected-path exceptions.
The active configuration fields are `defaultEnabled`, `model`, `effort`, `tools`, `instructions`, all `context` fields, the note, turn, tool-call, pending-byte, token, and cost limits, and both `security` path lists.
Slice 2 activates the existing in-memory `memorySuggestions` configuration.
The release defaults require eight meaningful turns and ten minutes between accepted suggestions, cap one session at five suggestions, and bound proposed text to 1,000 characters and approximately 256 estimated tokens.
The hard maxima are 4,000 characters and approximately 1,024 estimated tokens.
Its 4,096-key dedupe history, 4,096-note and 1,000,000-byte deferred queue, and 64 KiB deferred delivery batch are fixed protocol bounds.
A full deferred queue rejects newer advice, increments the suppressed-note count, and warns once per session.
`deferredAdviceRetentionHours` now controls cross-exit deferred-note restoration, with `0` disabling it and the 24-hour default applying on compatible resume.
`minTurnsBetweenReviews` and `minIntervalMs` now throttle ordinary reviews while retaining a bounded coalesced update until both gates are eligible.
`maxReprimeTokens` bounds the redacted current-branch snapshot used after compaction fails or remains over policy.
`persistence.transcript` is active, User-owned embedding configuration and remains `false` by default.
`AdvisorProjectConfig` cannot enable it.
`AdvisorProjectConfig` and `CONFIG_VALIDATION_STRATEGY` define the active trusted Project narrowing and validation policy.
`DEFAULT_ADVISOR_CONFIG` is deeply frozen; clone it before editing configuration.
`PROPOSED_ADVISOR_CONFIG` remains a deprecated compatibility alias containing an independent mutable clone of the canonical defaults.
Programmatic hooks are intended for embedding and tests: `onRuntime` exposes the instance, `onStatus` receives status snapshots, and `onWarning` receives runtime warnings.
Observer exceptions from `onStatus` and `onWarning` do not alter runtime outcomes or prevent built-in status and UI publication.
An additional protected path blocks that target and its descendants by normalized request and canonical target, while an exception permits only one exact normalized or canonical target and can deliberately expose sensitive content.

Project context files supplied by Pi and trusted Project WATCHDOG instructions are tagged, redacted, and bounded before review, but they are treated as untrusted review context rather than higher-authority policy.

## Exported API

All current modules are re-exported from the package root.

| Surface         | Exports                                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extension       | Default Pi extension, `createPiAdvisorExtension`, `PiAdvisorExtensionOptions`                                                                                                |
| Runtime         | `AdvisorRuntime`, runtime and status types, status formatters, bounded diagnostic formatting, and delivery-failure state                                                     |
| Configuration   | Defaults, hard limits, versioned WATCHDOG loading and merge helpers, atomic save, the model and effort picker, configuration types, warnings, paths, and validation metadata |
| Advice          | `createAdviseTool`, `boundAdvice`, policy-specific normalizers, intent-scoped dedupe helpers, delivery formatting, and ordinary or Memory suggestion advice types            |
| Delivery        | Fixed delivery bounds, `BoundedKeyedByteFifo`, `takeRenderedPrefix`, and queue types                                                                                         |
| Persistence     | Runtime-state and optional transcript-record custom types, schemas, fixed bounds, strict parsers, persisted types, and the measured 128-hash cap                             |
| Presentation    | XML escaping, advice message and late-entry renderers, themed card rendering, presentation data types, and the late-entry custom type                                        |
| Protected tools | `ProtectedPathPolicy`, `createProtectedAdvisorTools`, `isAdvisorReadOnlyTool`, and `AdvisorToolContext`                                                                      |
| Transcript      | `ADVISOR_CUSTOM_TYPE`, cursor helpers, meaningful-turn filtering, delta rendering, and transcript types                                                                      |
| Redaction       | `redactSecrets`, `estimateTokens`, UTF-8 truncation helpers, and `RedactionResult`                                                                                           |

The default extension is the installable entry point.
`AdvisorRuntime` exposes cloned status snapshots, nested-message inspection, project-context capture, session restoration, explicit enable and disable, turn and message observation, active-delivery settlement, deferred-advice materialization through `takeDeferredAdvice`, eager lifecycle invalidation, branch reseeding, and shutdown, while the extension factory wires those lifecycle methods to Pi.
`AdvisorRuntimeStatus.activeNotesPending` counts active notes awaiting Pi acknowledgement, `deferredNotesPending` counts notes waiting for a later user prompt, `restoredDeferredNotesPending` identifies the restored subset, `oldestDeferredAdviceAgeMs` reports its age, and `notesDelivered` increases only after acknowledgement or deferred materialization.
The factory, runtime hooks, status formatters, configuration helpers, and policy helpers support controlled embedding, integration tests, and inspection alongside durable WATCHDOG configuration.

## Compatibility

Development, compatibility evidence, and the automatic core through Slice 5 target `@earendil-works/pi-coding-agent` 0.80.7.
The peer range is `>=0.80.7 <0.81.0`, with 0.80.7 as the only tested version.
The supported Pi host supplies the coding-agent and TUI peer packages; standalone runtime imports without those host peers are unsupported.
A missing or unavailable configured Advisor model leaves Advisor inactive without fallback or partial nested runtime construction.

## Security, privacy, and cost

Pi extensions run with the user's full system permissions.
Review package source before installation.

When explicitly configured and active, Advisor sends bounded Executor messages, exposed reasoning, tool activity, tool results, Pi-supplied tagged project context, and allowed file contents to the selected secondary model provider.
Transcript redaction runs before budgeting for observed Executor content and Pi-supplied project context.
When that formatted project context changes, Advisor clears its nested conversation before the next review so removed instructions do not remain in provider context.
Results returned by Advisor's allowed read-only tools, including allowed file contents, are bounded but are not transcript-redacted before the nested provider receives them.
The protected `grep` tool uses `rg` when available; without `rg`, explicit literal searches use a bounded in-process fallback while regex searches report that they are unavailable.
Protected-path checks cover direct and symlink-resolved access, but neither path protection nor redaction can guarantee that every secret is excluded.
Automatic review creates additional provider usage and cost, bounded by configured session governors and the active package hard maxima for notes, turns, tool calls, and pending bytes.
Optional private Advisor transcript-record persistence is disabled by default through `persistence.transcript: false`.
When explicitly enabled by trusted User or embedding configuration, Pi Advisor appends versioned `pi-advisor-transcript-record` custom entries to the active Pi session.
Each record is bounded to 256 KiB and may contain a reasoning-free redacted bounded Executor update, non-`advise` Advisor tool call, redacted bounded Advisor tool result, exact public review-request usage and reported cost, accepted delivered or queued advice, or bounded failure and stop reason.
It never stores Executor reasoning, Advisor reasoning, suppressed or rejected advice, unsafe or redaction-altered Memory suggestions, Memory Lane outcomes, unredacted secrets, unbounded tool output, or complete provider payloads.
`/advisor dump` inspects at most the newest 256 valid records in memory and emits at most the newest 32 within the existing 16 KiB diagnostics bound.
The records remain outside model context.
Disabling persistence stops future transcript-record writes but does not delete existing entries.
For a file-backed Pi session, records remain in that session's JSONL for the lifetime of the session and are deleted by deleting the session in Pi or removing its session file.
Long sessions use additional disk space proportional to the number and bounded size of records, so users should keep persistence disabled unless they need private audit history and periodically delete old Pi sessions.
In-memory sessions do not retain records across process exit.
Pi Advisor also records bounded lifecycle-only custom entries in the active Pi session state, including a branch cursor, retained deferred accepted notes, up to 128 dedupe hashes, delivery counts, and Memory suggestion cadence and cap state.
These custom entries are outside model context and contain no Executor or Advisor reasoning, provider payloads, transcript updates, suppressed notes, or raw failure text.
When the Pi session is file-backed and the append succeeds, Pi persists the entries in that session's JSONL and deleting the session file deletes them.
In-memory sessions have no lifecycle-state JSONL, and an append failure does not alter Advisor delivery.
Retention `0` prevents deferred note content from being written into new lifecycle snapshots, while disabling optional transcript-record persistence does not disable lifecycle state required for correctness.

## Telemetry

This package sends no product telemetry or automatic crash reports to Ribbons Digital or another analytics service.
Model-provider traffic occurs only while an explicitly configured Advisor is active.
Support diagnostics occur only through explicit `/advisor dump`, remain redacted and bounded, and are never exported automatically.

## Development

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm pack
```

Package installation commands in this repository use the project-required `sfw pnpm install ...` form.

## Attribution

Pi Advisor is an independently implemented extension inspired by OMP's automatic Advisor design and is not affiliated with, endorsed by, or maintained by OMP.
`@juicesharp/rpiv-advisor` is credited for product comparison and coexistence analysis; no source from that package is included through Slice 5.
See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## License

MIT
