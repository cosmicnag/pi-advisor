# Public Behavior Contract

## Status

This document defines the intended public behavior of `@ribbons-digital/pi-advisor`.
Slice 1 implements the safe automatic core with in-memory configuration, one nested Advisor, protected read-only tools, bounded updates and notes, single-flight draining, failure pauses, minimal delivery, commands, and a session flag.
Durable configuration, richer delivery and presentation, cross-update lifecycle restoration, context compaction, transcript persistence, and Memory suggestions remain deferred to their separately approved slices.

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
Aborted, empty, and Advisor-generated turns are excluded.
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

Active advice uses Pi's measured steering boundary and never claims to abort an in-flight tool.
Idle or terminal advice waits for the next user-driven turn without triggering a new completion.
Aborted Executor turns are not reviewed because Pi 0.80.7 does not expose a reliable public abort cause.
Slice 1 does not implement cross-update deferred-advice restoration or a package-managed retention timer.
Advice accepted after the Executor becomes idle is queued with Pi's `nextTurn` delivery and does not trigger a completion.
An incompatible active-branch cursor invalidates in-flight review before delivery, while disablement and shutdown invalidate the runtime epoch and dispose nested work.
Every accepted note is user-visible and is framed as guidance to weigh rather than obey blindly.
It uses custom message type `pi-advisor-note`, severity `nit`, `concern`, or `blocker` with `concern` as the default, and details for review intent, active or deferred delivery, truncation, original size, and creation time.

## Tools and protected paths

The Slice 1 Advisor uses only verified read-only Pi tools.
Mutating tools are unavailable.
Protected `grep` uses `rg` for regex and literal searches when available.
Without `rg`, regex searches report that they are unavailable and explicit literal searches use a bounded in-process fallback.
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

## Lifecycle and limits

Only one Advisor update runs at a time.
Updates arriving while Advisor is busy are coalesced within a bounded backlog.
Every asynchronous review continuation is guarded by a runtime epoch and a captured active-branch window.
Active-branch entry IDs, not message counts, anchor minimal cursor validation.
Obvious tree-navigation or branch mismatches reset private Advisor context, while disablement and shutdown invalidate stale work.
Slice 1 does not reconstruct equal-length branches or restore advice across updates.
Update, pending-byte, context, turn, tool-call, note, session-token, and reported-cost governors remain enabled by default.
Review cadence, re-prime, deferred-retention, Memory, and persistence settings are reserved and have no Slice 1 runtime effect.
Provider, malformed internal tool, and governor failures are not retried, and failed update messages are removed from private Advisor context.
A well-formed read-only tool error remains ordinary review feedback rather than failing the update by itself.
If a turn or tool-call governor fires after one valid note has already been accepted, that one bounded note may still be delivered while the update counts as failed.
Three consecutive failed updates pause Advisor and produce one pause warning, while a successful review resets the consecutive-failure count.
Exceeding the context limit or reaching a session token or reported-cost cap pauses only Advisor and never interrupts Executor.

## Privacy and telemetry

Private Advisor transcript persistence is unimplemented and cannot be enabled in Slice 1.
Any future enabled persistence must exclude Executor and Advisor reasoning and store only redacted bounded records.
The package sends no product analytics, usage telemetry, or automatic crash reports.
The user-selected model provider receives only the bounded content required for Advisor requests.
Support diagnostics are not implemented in Slice 1.
Any future diagnostics must require explicit user action and be redacted and bounded.

## Scope boundary

Pi Advisor does not intercept destructive commands or enforce shell policy.
That behavior belongs in a separate extension with an independent safety specification.
