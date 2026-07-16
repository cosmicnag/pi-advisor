# Slice 0 Pi Compatibility Evidence

## Baseline

The installed and public npm baseline is `@earendil-works/pi-coding-agent` 0.80.7.
Development dependencies pin the Pi packages to 0.80.7.
The proposed first compatibility range is `>=0.80.7 <0.81.0`, but release support remains limited to versions exercised by CI and E2E tests.

## Built-in tool inventory

Pi 0.80.7 configures these built-in tools:

- `read`
- `bash`
- `edit`
- `write`
- `grep`
- `find`
- `ls`

The initial Advisor allowlist remains `read`, `grep`, `find`, and `ls`.
Pi exposes `find`, not an OMP-style `glob` tool.

## Delivery measurements

Active `sendMessage` with `deliverAs: "steer"` is absent from the first model request, then appears after the current assistant tool call and its tool result and before the next model request.
It does not abort the in-flight tool.

Idle `sendMessage` with `deliverAs: "nextTurn"` produces no additional model request.
The custom message becomes model-visible when the next user prompt starts a turn.
No fallback injection is required for Pi 0.80.7.

## Duplicate commands

Two extensions registering `/advisor` become `/advisor:1` and `/advisor:2` in extension load order.
The resolved names are available through `getCommands()` by `session_start` and remain available at `resources_discover`.
A detector that checks both hooks can issue exactly one warning by retaining an extension-instance boolean.
Calling `getCommands()` from the extension factory is not used because command resolution is not yet finalized at that phase.

## Branch and lifecycle measurements

Session entry IDs remain stable in the append-only entry collection when the active leaf changes.
Equal-length branches have different leaf and ancestry IDs, so counts cannot safely anchor an Advisor cursor.
`buildContextEntries()` applies compaction to the active branch while the original entry IDs remain queryable from the append-only tree.
`session_tree` reports stable old and new leaf IDs after navigation.

Runtime session replacement emits `session_shutdown` for the old extension instance before `session_start` for the new instance.
The replacement has a new session ID and new bound extension instance.
A captured old raw session object must not be reused, and production code must retain session-scoped objects only behind epoch invalidation and shutdown cleanup.
Runtime disposal emits `session_shutdown` with reason `quit`.

## Abort measurement

Public `turn_end` exposes assistant `stopReason: "aborted"` after `AgentSession.abort()`.
The event contains no public cause distinguishing a deliberate user interruption from another abort source.
The initial safe policy therefore treats every aborted primary run as user interruption and defers accepted advice.

## Memory suggestion capability

Capability detection inspects registered tool metadata and the active tool-name set only.
It never invokes the tool and imports no Memory Lane package.
The detector distinguishes compatible, absent, inactive, malformed, and schema-incompatible states.
Compatibility requires a required string `text`, categories explicitly supporting `preference` and `project`, and a status explicitly supporting `pending`.

## Critical activation checks

The Slice 0 capability check fails inactive when a required extension or context method is missing.
The no-op package entry point creates no nested session or partial Advisor runtime.
Production activation must run capability checks before constructing session-scoped background resources.

## Compatibility proposal

Declare `>=0.80.7 <0.81.0` as the peer range while CI and release documentation identify 0.80.7 as the only initially tested version.
Treat any missing critical capability as unsupported and inactive with an actionable status reason.
Do not emulate missing delivery, branch, lifecycle, or tool-inventory APIs with private imports or unsafe turn-triggering fallbacks.
