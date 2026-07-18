# Public Behavior Contract

## Status

This document defines the intended public behavior of `@ribbons-digital/pi-advisor`.
Slice 2 Batch B extends the safe automatic core with themed advice cards, immediate TUI-only late-advice entries, XML-safe model-visible delivery, bounded redacted diagnostics, and explicit delivery-failure accounting.
Durable configuration, cross-exit lifecycle restoration, context compaction, transcript persistence, and Memory suggestions remain deferred to their separately approved slices.

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
Memory suggestions are not considered in Slice 1.

## Isolation and context

Advisor conversation state remains separate from Executor context.
Only accepted Advisory notes may enter Executor context.
Executor user and assistant messages, exposed reasoning, tool calls and results, included user shell executions, branch and compaction summaries, and non-Advisor extension context may enter a bounded update.
Image payloads are omitted.
Executor reasoning is included only when Pi or the provider exposes it, after redaction and bounding.
Executor and Advisor reasoning is never persisted by Pi Advisor in Slice 1.
Advisor updates, coalesced pending deltas, protected tool results, and accepted notes are bounded.
Re-prime snapshots and persisted records are not implemented in Slice 1.

## Delivery

Active advice uses Pi's measured steering boundary for every severity and never claims to abort an in-flight tool.
Queueing an active steer is not counted as delivery.
The runtime retains a bounded active-pending copy until Pi acknowledges the custom message through message lifecycle or branch state.
At agent settlement, an unacknowledged copy is recovered into deferred FIFO delivery, covering TUI abort queue clearing without duplicating RPC abort continuation.
Idle or terminal advice waits in bounded in-memory runtime state for the next user-driven turn without triggering a new completion.
The active-pending and deferred queues each reject a new note when admission would exceed 4,096 notes or 1,000,000 UTF-8 bytes of raw note text.
A rejection preserves older FIFO entries, increments the suppressed-note count, and emits at most one queue-capacity warning per session.
Pi 0.80.7 exposes no public abort cause, so every public abort signal or aborted Executor stop reason forces advice already being reviewed to use deferred delivery, and aborted Executor turns are excluded from new review.
Pi 0.80.7 also exposes no public method to cancel an already queued `nextTurn` custom message after branch navigation, so Batch A uses the documented `before_agent_start` injection fallback for branch-safe deferred delivery.
Batch A does not implement cross-exit deferred-advice restoration or a package-managed retention timer.
An incompatible active-branch cursor invalidates in-flight review and clears in-memory deferred advice before delivery, while disablement and shutdown invalidate the runtime epoch and dispose nested work.
Every delivered note is visible and is framed as guidance to weigh rather than obey blindly.
It uses custom message type `pi-advisor-note` and XML-safe `<advisor-note>` content with intent, severity, delivery, and stale attributes.
Note and guidance text escape XML markup characters and replace characters that XML 1.0 cannot represent.
Severity is `nit`, `concern`, or `blocker`, with `concern` as the default.
A `notes` details array contains the bounded note, review intent, active or deferred delivery, optional staleness, truncation, original post-redaction size, creation time, and an opaque attempt-scoped delivery ID for active acknowledgement.
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

Memory suggestions are unavailable in Slice 1, even if the Executor exposes a compatible `memory_suggest` tool.
Advisor never calls `memory_save` or `memory_suggest`, imports Memory Lane, writes Memory Lane storage, or approves memory.
The retained Slice 0 capability probe and reserved configuration fields do not activate runtime integration.
Any future Memory suggestion behavior requires a separately approved implementation.

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
Updates arriving while Advisor is busy are coalesced within a bounded backlog.
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
Active-branch entry IDs, not message counts, anchor minimal cursor validation.
Obvious tree-navigation or branch mismatches reset private Advisor context, while disablement and shutdown invalidate stale work.
Batch A does not reconstruct equal-length branches or restore advice across process or session exits.
Update, pending-byte, context, turn, tool-call, note, session-token, and reported-cost governors remain enabled by default.
Review cadence, re-prime, deferred-retention, Memory, and persistence settings remain reserved and have no Batch B runtime effect.
In particular, `deferredAdviceRetentionHours` does not expire in-memory Batch B advice and remains reserved for cross-exit lifecycle work.
Batches A and B add no user-configurable field.
Its 4,096-key dedupe history, 4,096-note and 1,000,000-byte deferred queue, and 64 KiB delivery batch are fixed protocol bounds.
Provider, malformed internal tool, governor, and delivery failures are not retried, and failed update messages are removed from private Advisor context.
Active message-send failures count as both one failed review and one delivery failure, remove the active-pending copy, and retain only a bounded redacted reason.
A failed TUI late-entry append counts once but leaves next-turn delivery available and does not retry the entry append.
A well-formed read-only tool error remains ordinary review feedback rather than failing the update by itself.
If a turn or tool-call governor fires after one valid note has already been accepted, that one bounded note may still be delivered while the update counts as failed.
Three consecutive failed updates pause Advisor and produce one pause warning, while a successful review resets the consecutive-failure count.
Programmatic status and warning observers are isolated so observer exceptions cannot alter review outcomes, counters, queue admission, built-in UI warning publication, or later status publication.
The custom message and entry renderers use current theme colors, sanitize terminal control characters, render age and delivery metadata, and keep every line within the supplied terminal width.
Exceeding the context limit or reaching a session token or reported-cost cap pauses only Advisor and never interrupts Executor.

## Privacy and telemetry

Private Advisor transcript persistence is unimplemented and cannot be enabled in Slice 1.
Any future enabled persistence must exclude Executor and Advisor reasoning and store only redacted bounded records.
The package sends no product analytics, usage telemetry, or automatic crash reports.
The user-selected model provider receives only the bounded content required for Advisor requests.
Support diagnostics require explicit `/advisor dump` action and never export automatically.
The dump is bounded to 16 KiB, recursively redacts every included string, and excludes Executor and Advisor transcripts, reasoning, Advisory note content, instructions, and protected paths.

## Scope boundary

Pi Advisor does not intercept destructive commands or enforce shell policy.
That behavior belongs in a separate extension with an independent safety specification.
