# Slice 0 Pi Compatibility Evidence

## Baseline

The installed and public npm baseline is `@earendil-works/pi-coding-agent` 0.80.7.
Development dependencies pin the Pi packages to 0.80.7.
The package peer range is `>=0.80.7 <0.81.0`, while release support remains limited to versions exercised by CI and E2E tests.

## Built-in tool inventory

Pi 0.80.7 configures these built-in tools:

- `read`
- `bash`
- `edit`
- `write`
- `grep`
- `find`
- `ls`

The default active Executor set is `read`, `bash`, `edit`, and `write`.
`grep`, `find`, and `ls` are configured but inactive by default.
The Slice 1 nested session replaces and explicitly activates protected `read`, `grep`, `find`, and `ls` definitions plus the exclusive internal `advise` tool.
Nested extensions, skills, prompt templates, themes, context files, compaction, provider retry, and persistent sessions are disabled.
Startup fails inactive if the resulting nested tool or extension inventory violates that isolation boundary.
Pi exposes `find`, not an OMP-style `glob` tool.

## Delivery measurements

Active `sendMessage` with `deliverAs: "steer"` is absent from the first model request, then appears after the current assistant tool call and its tool result and before the next model request.
It does not abort the in-flight tool.

Idle `sendMessage` with `deliverAs: "nextTurn"` produces no additional model request.
The custom message becomes model-visible when the next user prompt starts a turn.
Pi 0.80.7 exposes no public method to remove an already queued `nextTurn` custom message after branch navigation.
Slice 2 Batch A therefore preserves the same next-user-turn and no-trigger boundary with individually bounded notes held in memory and injected from `before_agent_start`, allowing branch changes to clear them safely.
It does not implement package-managed deferred-advice expiry or cross-exit restoration.

## Duplicate commands

Two extensions registering `/advisor` become `/advisor:1` and `/advisor:2` in extension load order.
The resolved names are available through `getCommands()` by `session_start` and remain available at `resources_discover`.
Factory-phase command discovery is not part of the supported evidence claim.
Slice 1 registers `/advisor` but does not consume this evidence to issue a collision warning.

## Branch and lifecycle measurements

Session entry IDs remain stable in the append-only entry collection when the active leaf changes.
Equal-length branches have different leaf and ancestry IDs, so counts cannot safely anchor a complete Advisor cursor.
`buildContextEntries()` applies compaction to the active branch while the original entry IDs remain queryable from the append-only tree.
`session_tree` reports stable old and new leaf IDs after navigation.

Slice 1 combines the expected index with the entry ID at that index for minimal mismatch detection.
An obvious mismatch invalidates in-flight work, clears pending content, resets nested messages, and moves the cursor to the new tail without reconstructing or reviewing the replacement branch.
Equal-length ancestry reconstruction and bounded re-prime remain deferred.

Runtime session replacement emits `session_shutdown` for the old extension instance before `session_start` for the new instance.
The replacement has a new session ID and new bound extension instance.
Slice 1 increments its epoch, aborts streaming nested work when possible, disposes the nested session, and creates no persistent Advisor transcript.
Runtime disposal emits `session_shutdown` with reason `quit`.

## Abort measurement

Public `turn_end` exposes assistant `stopReason: "aborted"` after `AgentSession.abort()`.
The event contains no public cause distinguishing a deliberate user interruption from another abort source.
The runtime therefore excludes every aborted Executor turn from review.
Slice 2 Batch A also treats every public abort signal or aborted stop reason as an interruption signal that forces accepted in-flight advice to wait for the next user-driven turn.
It does not claim cause-aware interruption handling.

## Memory suggestion capability

The retained Slice 0 capability probe inspects registered tool metadata and the active tool-name set only.
It never invokes the tool and imports no Memory Lane package.
The probe distinguishes compatible, absent, inactive, malformed, and schema-incompatible states.
Compatibility requires a required string `text`, categories explicitly supporting `preference` and `project`, and a status explicitly supporting `pending`.
The Slice 1 runtime does not call the probe and never emits Memory suggestions.

## Slice 1 activation checks

Slice 1 validates explicit `provider/model` syntax, model-registry availability, credentials, nested extension count, and nested active tools before becoming active.
A missing model, unavailable model, credential failure, nested-session construction failure, or isolation failure leaves Advisor inactive with no fallback.
The generic Slice 0 critical-capability helper remains compatibility evidence and is not invoked by the Slice 1 runtime.

## Compatibility position

Support `>=0.80.7 <0.81.0` as the peer range while CI and release documentation identify 0.80.7 as the only tested version.
Do not emulate missing delivery, branch, lifecycle, or tool-inventory APIs with private imports or unsafe turn-triggering fallbacks.
