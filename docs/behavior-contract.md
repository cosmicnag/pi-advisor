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

Project configuration never activates Advisor.
Session activation and user-owned default activation are the only activation authorities.
Persisted defaults may apply to interactive and RPC sessions, while JSON and print automation remain explicit opt-in.
No model is selected implicitly.
Missing model configuration, credentials, or critical Pi capabilities leaves Advisor inactive without a partial runtime.

## Review and silence

The Slice 1 core reviews each meaningful completed internal Executor turn by default.
Aborted, empty, and Advisor-generated turns are excluded.
Silence is the successful normal result when no material issue exists.
At most one Advisory note is accepted from one Advisor update.
Ordinary correctness, safety, and verification advice takes precedence over a Memory suggestion.

## Isolation and context

Advisor conversation state remains separate from Executor context.
Only accepted Advisory notes may enter Executor context.
Executor reasoning is included only when Pi or the provider exposes it, after redaction and bounding.
Executor and Advisor reasoning is not persisted by default.
Advisor updates, tool results, re-prime snapshots, and persisted records are bounded.

## Delivery

Active advice uses Pi's measured steering boundary and never claims to abort an in-flight tool.
Idle or terminal advice waits for the next user-driven turn without triggering a new completion.
A deliberate user interruption takes priority over Advisor delivery.
When Pi cannot distinguish abort causes safely, every aborted run is treated as a user interruption.
Session or incompatible branch replacement invalidates deferred advice.
Every accepted note remains user-visible and is framed as guidance to weigh rather than obey blindly.

## Tools and protected paths

The Slice 1 Advisor uses only verified read-only Pi tools.
Mutating tools are unavailable.
Protected paths are denied before file access and before search or listing results are returned.
Checks normalize resolved paths and account for symlinks.
Read-only access and redaction cannot guarantee complete secret protection, and public documentation must state that limitation.

## Memory suggestions

Memory Lane is an optional future integration and is not a dependency.
Advisor never calls `memory_save`, calls `memory_suggest`, imports Memory Lane, writes Memory Lane storage, or approves memory.
Memory suggestion policy is available only while an active Executor tool named `memory_suggest` exposes the exact verified pending-review schema.
The Executor independently verifies a visible proposal before optionally submitting it with explicit pending status.
Absent, inactive, malformed, or incompatible capability remains silent during ordinary use and does not degrade ordinary review.

## Configuration ownership

User configuration owns activation defaults, model choice, reasoning effort, spending, cadence, persistence, and protected-path exceptions.
Trusted project configuration may add instructions, narrow tools, add protections, disable Memory suggestions, and lower limits.
Project configuration cannot activate Advisor, choose a model, raise a limit, broaden tools, weaken protections, enable persistence, or re-enable a user-disabled feature.
Fixed Advisor safety and protocol policy remains above user instructions, project instructions, and observed Executor context.

## Lifecycle and limits

Only one Advisor update runs at a time.
Updates arriving while Advisor is busy are coalesced within a bounded backlog.
Every asynchronous continuation is guarded by a runtime epoch.
Active-branch entry IDs, not message counts, anchor cursor validation.
Compaction, tree navigation, configuration apply, disablement, session replacement, and shutdown invalidate stale work.
Turn, tool-call, transcript, context, token, cost, cadence, note, and persistence limits remain enabled by default.
Crossing a session soft cap pauses only Advisor and never interrupts Executor.

## Privacy and telemetry

Private Advisor transcript persistence is disabled by default.
Any future enabled persistence excludes Executor and Advisor reasoning and stores only redacted bounded records.
The package sends no product analytics, usage telemetry, or automatic crash reports.
The user-selected model provider receives only the bounded content required for Advisor requests.
Diagnostics are generated only through explicit user action and are redacted and bounded.

## Scope boundary

Pi Advisor does not intercept destructive commands or enforce shell policy.
That behavior belongs in a separate extension with an independent safety specification.
