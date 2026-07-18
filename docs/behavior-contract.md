# Public Behavior Contract

## Status

This document defines the intended public behavior of `@ribbons-digital/pi-advisor`.
Slice 4A extends the safe automatic core with usage-anchored context estimation, active ordinary review cadence, per-tool-result serialization bounds, public nested-session compaction, and post-compaction recalculation.
Slice 4B adds bounded current-branch re-prime fallback, unsafe-snapshot pause behavior, complete public-API accounting, optional private transcript records, and repeated long-session coverage.
Durable WATCHDOG configuration remains deferred.

## Roles

The Executor is the primary Pi agent performing the user's task.
The Advisor is one isolated secondary agent using a model explicitly selected by the user.
An Advisor update is a bounded portion of new Executor context submitted for review.
An Advisory note is one accepted, bounded, actionable observation shown to the user and delivered to the Executor as peer guidance.

## Activation

Slice 1 accepts configuration only from the programmatic extension factory and does not load User configuration or Project configuration files.
Session activation through `/advisor on` or `--advisor` and the in-memory `defaultEnabled` value are the only Slice 1 activation authorities.
The in-memory default applies to TUI and RPC sessions, while JSON and print sessions remain explicit opt-in.
No model is selected implicitly.
Missing or malformed model configuration, unavailable credentials, or nested-session isolation failure leaves Advisor inactive without model fallback or a partial nested runtime.
Running `/advisor on` while paused explicitly resets the current session usage budget before reactivation.

## Review and silence

The Slice 1 core reviews each meaningful completed internal Executor turn by default.
Aborted and empty turns are excluded.
A follow-up containing an Advisory note but no new Executor user message is treated as Advisor-generated and excluded, while a later user-driven turn remains eligible even when `before_agent_start` injects deferred advice.
Silence is the successful normal result when no material issue exists.
At most one Advisory note is accepted from one Advisor update.
Normalized content-free approval phrases are suppressed, while an oversized material note is redacted, truncated to both configured note bounds with a marker as space permits, and tagged with truncation metadata.
Slice 2 considers Memory suggestions only when the compatible capability and strict policy gates are active.

## Isolation and context

Advisor conversation state remains separate from Executor context.
Only accepted Advisory notes may enter Executor context.
Executor user and assistant messages, exposed reasoning, tool calls and results, included user shell executions, branch and compaction summaries, and non-Advisor extension context may enter a bounded update.
Image payloads are omitted.
Executor reasoning is included only when Pi or the provider exposes it, after redaction and bounding.
Executor and Advisor reasoning is never persisted by Pi Advisor.
Advisor updates, coalesced or cadence-held pending deltas, protected tool results, and accepted notes are bounded.
Each serialized tool result is redacted before independent 2,000-line, 64 KiB, configured update-token, and final update bounds are applied.
When compaction fails or remains over policy, the runtime clears the private nested branch and submits one redacted bounded current-primary-branch snapshot with the pending update.
The snapshot is reduced until the estimate fits the same context policy.
Re-prime increments the runtime epoch, remains bounded by `maxReprimeTokens`, and cannot recursively compact or re-prime within the same maintenance pass.
If no non-empty snapshot and pending update can fit safely, Advisor pauses and warns once.
Optional transcript records persist only reasoning-free redacted bounded shapes when explicitly enabled in Slice 4B.
Lifecycle-only custom entries persist outside model context independently of optional transcript persistence.

## Delivery

Active advice uses Pi's measured steering boundary for every severity and never claims to abort an in-flight tool.
Queueing an active steer is not counted as delivery.
The runtime retains a bounded active-pending copy until Pi acknowledges the custom message through message lifecycle or branch state.
At agent settlement, an unacknowledged copy is recovered into deferred FIFO delivery, covering TUI abort queue clearing without duplicating RPC abort continuation.
Idle or terminal advice waits in bounded in-memory runtime state for the next user-driven turn without triggering a new completion.
The active-pending and deferred queues each reject new advice when admission would exceed 4,096 items or 1,000,000 UTF-8 bytes of retained review-note text or combined Memory rationale and proposed-memory text.
A rejection preserves older FIFO entries, increments the suppressed-note count, and emits at most one queue-capacity warning per session.
Pi 0.80.7 exposes no public abort cause, so every public abort signal or aborted Executor stop reason forces advice already being reviewed to use deferred delivery, and aborted Executor turns are excluded from new review.
Pi 0.80.7 also exposes no public method to cancel an already queued `nextTurn` custom message after branch navigation, so deferred delivery uses the documented `before_agent_start` injection fallback.
Slice 3B preserves Slice 3A retained deferred-advice persistence and applies `deferredAdviceRetentionHours` only when restoring a compatible session.
Retention `0` excludes deferred note content from new persisted snapshots.
An incompatible active-branch cursor invalidates in-flight review and clears deferred advice before delivery, while disablement, compaction, tree navigation, session replacement, and shutdown invalidate the runtime epoch.
Every delivered item is visible and is framed as guidance to weigh rather than obey blindly.
It uses custom message type `pi-advisor-note` and XML-safe `<advisor-note>` content.
Review-note wrappers carry review intent, severity, delivery, and stale attributes plus bounded note and guidance text.
Memory-suggestion wrappers carry Memory intent, category, basis, delivery, stale, and optional `queue-state` attributes plus bounded rationale, proposed-memory, and guidance text.
All wrapper text escapes XML markup characters and replaces characters that XML 1.0 cannot represent.
Review severity is `nit`, `concern`, or `blocker`, with `concern` as the default.
A `notes` details array contains common active or deferred delivery, optional staleness, truncation, original post-redaction size, creation time, and optional opaque attempt-scoped delivery ID metadata.
Each details item then contains either review intent and severity or Memory-suggestion intent, category, basis, proposed text, and optional `queueState`.
Dedupe identity remains separate so a stale acknowledgement cannot confirm a later attempt with the same advice.
Each user-driven turn receives the largest FIFO prefix whose final rendered custom-message content fits 64 KiB in UTF-8, including every XML note, guidance wrapper, and inter-note separator but excluding non-model-visible details metadata.
No note is split, remaining notes wait for later user turns, and a one-note message mirrors its fields at the top level for compatibility.
In TUI mode, advice accepted after the Executor is idle is appended immediately as custom entry type `pi-advisor-late-note` and rendered without entering model context.
The pending note records that visible presentation so its next-turn model-visible custom message uses `display: false`; RPC, JSON, and print modes never append this TUI-only entry.
An unacknowledged active TUI delivery recovered at settlement uses the same late-entry path when Pi is idle.

## Tools and protected paths

The Slice 1 Advisor uses only verified read-only Pi tools.
Mutating tools are unavailable.
Protected `grep` uses `rg` for regex and literal searches when available.
Without `rg`, regex searches report that they are unavailable and explicit literal searches use a bounded in-process fallback.
Ripgrep match and context filename prefixes are rewritten from absolute to working-directory-relative paths before output.
Protected paths are denied before file access and before search or listing results are returned.
Checks normalize resolved paths and account for symlinks.
Read-only access and redaction cannot guarantee complete secret protection, and public documentation must state that limitation.

## Memory suggestions

Memory suggestions are optional and capability-oriented.
Pi Advisor inspects Pi's active public tool inventory without invoking a tool or importing Memory Lane.
The capability is available only when an active tool named `memory_suggest` has an object schema with required string `text`, explicit `preference` and `project` category support, and explicit `pending` status support.
Absent, inactive, malformed, incompatible, or inspection-failing capability remains silent in ordinary use and does not degrade ordinary review.
`/advisor status` and explicit redacted diagnostics expose the bounded capability state and reason.

A Memory suggestion requires structured `memory-suggestion` intent, proposed text, `preference` or `project` category, and one allowed basis.
Allowed bases are gate milestone, human correction, durable preference, workflow change, repeated mistake, project procedure, and project constraint.
Memory suggestions prohibit severity and proactive personal category.
The Advisor policy excludes transient details, speculation, unverified conclusions, ordinary successful steps, one-off uncorrected mistakes, sensitive content, and current-turn-only guidance.
A repeated-mistake rationale must identify two distinct observed occurrences.
Ordinary material advice replaces a provisional Memory suggestion from the same update, and a provisional Memory suggestion is discarded if that update fails or is governed.

Proposed memory text is independently checked for content-free wording, secret redaction, character size, and estimated token size.
Redaction-altered or oversized proposed text suppresses the whole suggestion and is never truncated, delivered, or persisted.
Successful `memory_save` or `memory_suggest` outcomes in the current observed update suppress an exactly normalized duplicate proposal.
Cross-update dedupe uses intent, normalized proposed text, category, and basis rather than rationale wording.
The in-memory release defaults require eight meaningful turns and ten minutes between accepted suggestions, cap one session at five, and bound proposed text to 1,000 characters and approximately 256 estimated tokens.
The hard proposed-text maxima are 4,000 characters and approximately 1,024 estimated tokens.

Accepted Memory suggestions reuse ordinary active and deferred queues and never trigger an extra completion.
Their model-visible wrapper tells the Executor to verify or revise the proposal, then call `memory_suggest` with chosen text, category, and explicit `status: "pending"` without another confirmation.
The pending memory review remains the human approval gate.
The Executor may revise text or category and briefly explains a decline.
Delivery rechecks capability compatibility.
Capability loss changes the card and model-visible wrapper to `could-not-queue`, removes actionable submission guidance, and tells the Executor not to attempt the unavailable call.

Pi Advisor never calls `memory_save` or `memory_suggest`, imports Memory Lane, writes Memory Lane storage, approves a memory, or infers Memory Lane's eventual queued, skipped, failed, or persistence outcome.

## Configuration ownership

The Slice 1 programmatic `AdvisorConfig` is trusted caller input, normalized once, and held in memory for one extension instance.
There is no runtime configuration apply, Project configuration merge, file validation, or reload in Slice 1.
The exported `AdvisorProjectConfig` and `CONFIG_VALIDATION_STRATEGY` describe reserved later-slice policy and are not consumed by the Slice 1 runtime.
Future durable User configuration owns activation defaults, model choice, reasoning effort, spending, cadence, persistence, and protected-path exceptions.
Future trusted Project configuration may only add instructions, narrow tools, add protections, disable Memory suggestions, and lower limits.
Fixed Advisor safety and protocol policy remains above caller instructions, tagged project context, and observed Executor context.
When the formatted Pi-supplied project context changes, the nested Advisor conversation is cleared before its next review so removed instructions do not remain in historical provider messages.

## Lifecycle and limits

Only one Advisor update runs at a time.
Updates arriving while Advisor is busy are coalesced within a bounded backlog that accounts for both transcript text and bounded successful-memory metadata.
Successful-memory metadata uses at most 4,096 normalized texts and half of the configured pending-transcript byte allowance, retains the newest successful values during extraction and coalescing, and shares the overall pending-transcript byte bound with transcript text.
Tool-call candidates use separate fixed item, byte, and raw-input guards, while the configured retention budgets apply only after a matching successful tool result is observed.
Content-free phrase matching uses broad punctuation and symbol folding against the fixed noise list.
For notes with well-formed matching backtick spans, ordinary-note dedupe uses NFKC Unicode normalization and prose-only whitespace collapse, applies `en-US` lowercasing only to prose, preserves each backtick delimiter plus the case and whitespace inside its code span, and folds only attached trailing prose sentence punctuation.
If any backtick delimiter is unmatched, dedupe retains NFKC and whole-note whitespace collapse but skips case and trailing-punctuation folding so malformed code markup cannot suppress a code-sensitive variant.
Dedupe identity includes review intent, severity, and normalized note text before SHA-256 hashing, so a severity change is not suppressed.
The in-memory dedupe history holds 4,096 keys and evicts the oldest key in insertion order without refreshing duplicate access.
A branch reset clears that branch-local dedupe history.
Deferred advice removed before emission also removes its dedupe key so unseen advice cannot suppress a future note.
If the Executor advances beyond the transcript window fixed for Advisor submission, accepted advice is marked potentially stale and instructs the Executor to verify that it still applies.
Deferred advice recomputes staleness against its captured branch window when it materializes.
Pi invokes `before_agent_start` before appending that event's current user prompt to branch state, so the runtime receives explicit notice of that pending newer Executor input and marks every deferred note emitted alongside it potentially stale.
Every asynchronous review continuation is guarded by a runtime epoch and a captured active-branch window.
Active-branch entry IDs, not message counts, anchor cursor validation.
The cursor validator distinguishes transcript shrink from an equal-length ancestry mismatch.
`session_before_compact` and `session_before_tree` eagerly invalidate in-flight work before host lifecycle awaits, while the corresponding completion events reseed the cursor to the resulting branch.
Entry identity remains authoritative when no lifecycle hint is observed.
Compatible resume restores only state whose Pi session ID and cursor match the active branch.
Update, pending-byte, context, turn, tool-call, note, session-token, and reported-cost governors remain enabled by default.
Ordinary review cadence uses the configured minimum meaningful-turn distance and elapsed interval.
Skipped updates are redacted, bounded, and coalesced until both cadence gates are eligible rather than discarded.
A single epoch-guarded timer flushes a final update held only by elapsed-time cadence without waiting for another Executor turn, and lifecycle invalidation cancels that timer.
Before every Advisor submission, context estimation uses Pi's public context estimator, including the latest successful provider usage when available plus trailing messages and the incoming bounded update.
Because successful provider usage already accounts for the fixed request shape, the runtime does not add tool-schema cost to a usage-anchored estimate.
When no valid usage anchor exists, including immediately after compaction, the whole private context is estimated with Pi's public estimator plus bounded system-prompt and fixed Advisor tool-schema estimates.
If the configured context fraction and response reserve would be exceeded, the runtime calls the nested `AgentSession.compact()` public API and recalculates policy from the compacted messages before submission.
Compaction failure or a still-over-policy recalculation invokes one bounded re-prime fallback.
An unsafe fallback pauses only Advisor and emits one warning.
Optional transcript records remain disabled unless `persistence.transcript` is explicitly enabled.
Memory suggestion cadence, session cap, proposed-text bounds, and cross-exit cadence and cap restoration are active.
`deferredAdviceRetentionHours` applies during cross-exit restoration but does not expire a live in-memory queue.
Slice 3B adds no user-configurable field.
Its 4,096-key dedupe history, 4,096-note and 1,000,000-byte deferred queue, and 64 KiB delivery batch remain fixed protocol bounds.
A provider-reported failure or exception thrown by the nested prompt restores the exact private Advisor message snapshot from before that attempt, extracts and discards stale nested steering and follow-up messages, and retries the same already bounded update once.
The retry waits a fixed 250 milliseconds, and no automatic retry delay or update receives more than that one fixed wait.
An epoch change during the provider request or retry delay invalidates the continuation before another request or delivery.
The retry does not replay failed assistant, tool-call, or tool-result messages as valid Advisor context.
Malformed internal tool, governor, and delivery failures are not retried.
Active message-send failures count as both one failed review and one delivery failure, remove the active-pending copy, and retain only a bounded redacted reason.
A failed TUI late-entry append counts once but leaves next-turn delivery available and does not retry the entry append.
A well-formed read-only tool error remains ordinary review feedback rather than failing the update by itself.
If a turn or tool-call governor fires after one valid note has already been accepted, that one bounded note may still be delivered while the update counts as failed.
Every failed attempt increments total and consecutive-failure state.
A successful initial attempt or retry resets consecutive failures, while the third consecutive failed attempt pauses Advisor and produces one pause warning.
Status exposes whether retry delay or coalesced transcript work is pending, queued transcript bytes, retry delay, started retry-attempt count, total and consecutive failures, last bounded failure reason, branch resets, and the count of stale nested queued messages discarded.
Only the discard count is retained; queued message content is not added to status, diagnostics, persistence, or model context.
Programmatic status and warning observers are isolated so observer exceptions cannot alter review outcomes, counters, queue admission, built-in UI warning publication, or later status publication.
The custom message and entry renderers use current theme colors, sanitize terminal control characters, render age and delivery metadata, and keep every line within the supplied terminal width.
An unsafe bounded re-prime or reaching a session token or reported-cost cap pauses only Advisor and never interrupts Executor.
Status distinguishes reported context usage from trailing estimates and reports completed and failed nested compactions and re-primes.
Status reports review request count, input, output, cache-read, cache-write, total tokens, reported cost, review outcomes, delivery, suppression, persistence, and failure state.
Pi 0.80.7 does not expose nested compaction-request usage or cost through its public compaction result or events, so status separately counts compaction operations whose provider usage is unavailable rather than folding an estimate into exact review totals.

## Lifecycle persistence

Pi Advisor attempts to append versioned `pi-advisor-runtime-state` custom entries to the active Pi session state.
Pi custom entries do not participate in model context.
A file-backed Pi session persists successful appends in its JSONL, while an in-memory session has no JSONL and an append failure does not alter Advisor delivery.
Each snapshot is bounded to 4 MiB and stores the Pi session ID, save timestamp, active-branch cursor, retained deferred accepted notes, at most 128 lowercase SHA-256 dedupe hashes, delivered-note count, and Memory suggestion meaningful-turn count, admission count, delivered count, last-admission turn and timestamp, and session-cap state.
Deferred notes retain only their already bounded redacted accepted-note shape, branch window, staleness and display flags, and restored-after-resume marker.
Snapshots never contain Executor or Advisor reasoning, Advisor transcript messages, observed transcript updates, provider payloads, protected tool output, suppressed or rejected notes, or raw failure text.
The strict version, shape, item, text, hash, byte, session-ID, and cursor checks reject malformed or incompatible state without fallback to an older snapshot.
The latest state entry on the active branch is authoritative.
A genuinely new or forked Pi session receives a new session ID and cannot restore copied state from its parent.
Compatible resume restores unexpired deferred notes as potentially stale, reports their age, shows a restored marker, and materializes them only after the next user prompt.
Delivered, expired, branch-incompatible, over-capacity, and retention-disabled deferred notes are discarded.
For a file-backed session, successfully appended lifecycle state is deleted by deleting that session through Pi or removing its session file.

## Optional transcript-record persistence

Optional private transcript-record persistence is disabled by default.
Trusted User or embedding configuration may explicitly enable `persistence.transcript`; Project configuration cannot enable it.
Enabled persistence appends versioned `pi-advisor-transcript-record` custom entries to the active Pi session.
Each record is strictly validated and bounded to 256 KiB.
Records may contain reasoning-free redacted bounded Executor updates, non-`advise` Advisor tool calls, redacted bounded Advisor tool results, public review-request usage and reported cost, accepted delivered or queued notes, and bounded failures and stop reasons.
Records never contain Executor reasoning, Advisor reasoning, suppressed or rejected notes, unsafe or redaction-altered Memory suggestions, Memory Lane outcomes, unredacted secrets, unbounded tool output, or complete provider payloads.
The custom entries remain outside model context.
`/advisor dump` inspects at most the newest 256 valid records and includes at most 32 recent records within its 16 KiB bound.
Disabling transcript persistence prevents future record writes but does not delete existing records.
File-backed records remain in the Pi session JSONL until the session is deleted through Pi or its session file is removed.
In-memory records do not survive process exit.
There is no time-based optional-transcript retention in Slice 4B, so disk use grows with bounded records until old Pi sessions are deleted.

## Privacy and telemetry

The package sends no product analytics, usage telemetry, or automatic crash reports.
The user-selected model provider receives only the bounded content required for Advisor requests.
Support diagnostics require explicit `/advisor dump` action and never export automatically.
The dump is bounded to 16 KiB, recursively redacts every included string, and excludes reasoning, instructions, protected paths, unredacted failures, and complete raw transcripts.
When optional records exist, it may include their bounded recent update, tool, accepted-note, usage, and failure preview.
Boolean fields report whether review or delivery failure details exist without serializing those details when no optional transcript record carries the already bounded redacted failure.

## Scope boundary

Pi Advisor does not intercept destructive commands or enforce shell policy.
That behavior belongs in a separate extension with an independent safety specification.
