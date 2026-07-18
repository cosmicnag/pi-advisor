# Pi Advisor

Pi Advisor provides automatic secondary review of a primary Pi agent session while keeping reviewer state separate from the primary conversation.

## Slice 3A terminology status

The implemented runtime provides Executor, Advisor, Advisor update, active-branch Cursor, Epoch, Meaningful Executor turn, Executor reasoning, Advisory note, Memory suggestion, retained Deferred advice, compatible resume, lifecycle-only persisted state, Advice card, Session activation, in-memory caller configuration, Fixed Advisor policy, User instructions, tagged Project instructions, Protected path, Protected-path exception, and Destructive-command guard boundaries.
Re-prime, durable User configuration, durable Project configuration, and optional Persisted Advisor transcript remain reserved later-slice terms.

## Language

**Executor**:
The primary Pi agent performing the user's task.
_Avoid_: Main model, working model, doer

**Advisor**:
The isolated secondary agent that reviews the Executor's work using a model explicitly selected by the user.
_Avoid_: Reviewer tool, consultant model, subagent, automatic model fallback

**Advisor update**:
A bounded portion of new Executor context submitted to the Advisor for review.
_Avoid_: Prompt, sync, transcript dump

**Cursor**:
The active-branch position identifying which Executor entries the Advisor has already observed.
_Avoid_: Message count, file pointer, pagination cursor

**Epoch**:
The runtime generation that invalidates asynchronous Advisor work created before a branch reset, disablement, shutdown, or future configuration apply.
_Avoid_: Version, session number, retry count

**Re-prime**:
A reset of private Advisor context followed by a bounded snapshot of the Executor's current active branch.
_Avoid_: Retry, resume, full transcript replay

**Meaningful Executor turn**:
A completed internal Executor turn containing new user, reasoning, tool, or result information that can affect review.
An Advisory-note-only follow-up is not meaningful, while a later turn that also contains a new Executor user message remains eligible.
_Avoid_: Request, full task, empty turn

**Executor reasoning**:
Private reasoning content exposed by Pi or the active provider and made available to the Advisor under the review policy.
_Avoid_: Hidden prompt, transcript, Advisory note

**Advisory note**:
One accepted, bounded, actionable observation created through a valid internal `advise` call, shown to the user, and delivered to the Executor as peer guidance.
An active note remains package-owned and active-pending until Pi acknowledges its custom message; settlement recovers an unacknowledged note into Deferred advice.
_Avoid_: Review result, hidden instruction, approval request, feedback blob

**Memory suggestion**:
An Advisory note asking the Executor to verify a durable fact or pattern and propose it to the configured memory system for human review.
It never grants approval to the proposed memory.
_Avoid_: Saved memory, approved memory, hidden autosave, Advisor-owned memory

**Deferred advice**:
An accepted, individually bounded Advisory note waiting for the next user-driven Executor turn.
The user prompt that triggers materialization is newer Executor input, so the emitted note is potentially stale even though Pi has not yet appended that prompt to branch state during `before_agent_start`.
The pending FIFO has fixed, non-configurable limits of 4,096 advice items and 1,000,000 retained UTF-8 bytes, including Memory rationale and proposed text, and each user-turn delivery contains at most 64 KiB of rendered content.
Slice 3A retains deferred advice in versioned branch-aware custom entries when retention is nonzero.
Compatible resume marks it restored, reports and renders its age, and adds a stale-after-resume warning before next-prompt delivery.
Session replacement, branch incompatibility, delivery, expiry, or retention `0` prevents restoration.
_Avoid_: Backlog, hidden instruction, cross-session message

**Advice card**:
The theme-aware, width-bounded user-visible presentation of an accepted Advisory note and its severity, delivery state, age, and staleness metadata.
A late TUI-only card is a custom entry outside Executor context, while active and otherwise undisplayed next-turn notes use the custom message renderer.
_Avoid_: Tool result, hidden message, approval dialog

**Session activation**:
A temporary enabled state applying only to the current Pi session.
_Avoid_: Enabled setting, project activation

**User default activation**:
A default controlling whether new TUI and RPC sessions begin with Advisor active while JSON and print automation remain opt-in.
Slice 1 accepts it from trusted in-memory caller configuration, while a durable user-owned preference remains deferred.
_Avoid_: Global activation, automatic project activation, automation default

**User configuration**:
Reserved durable user-owned policy controlling the Advisor model, effort, activation default, spending, cadence, and persistence.
Slice 1 accepts only an equivalent complete in-memory object from a trusted programmatic caller.
_Avoid_: Global config, unrestricted base config

**Project configuration**:
Reserved trusted repository-specific specialization that may add instructions or reduce tools and limits but cannot control activation, model choice, spending increases, or persistence.
Slice 1 tags Pi-provided project context for review but does not load or merge Project configuration.
_Avoid_: Project activation, repository default, project spending policy

**Fixed Advisor policy**:
The highest-authority, non-overridable safety and protocol rules governing Advisor behavior.
_Avoid_: User preference, Project instructions, configurable review focus

**User instructions**:
User-owned review specialization below Fixed Advisor policy and above Project instructions.
_Avoid_: Structured policy configuration, system override, Project instructions

**Project instructions**:
Lower-authority tagged review context that specializes Advisor focus without replacing User instructions or Fixed Advisor policy.
_Avoid_: System prompt, policy override, User instructions

**Persisted Advisor transcript**:
An optional redacted, bounded record of Advisor updates, notes, tool activity, usage, cost, and failures that excludes Executor and Advisor reasoning.
_Avoid_: Raw transcript, reasoning archive, session context

**Protected path**:
A file or directory the Advisor cannot read, search, or discover because it may expose sensitive content.
_Avoid_: Ignored file, hidden file, redacted output

**Protected-path exception**:
A narrow trusted-caller rule that deliberately permits Advisor access to one otherwise protected target.
A durable User configuration owner remains deferred.
_Avoid_: Project exception, protection disablement, unrestricted access

**User interruption**:
A deliberate user action stopping the Executor that takes precedence over pending Advisor delivery.
Pi 0.80.7 exposes no public abort cause, so Batch A conservatively treats every public abort signal or aborted stop reason as an interruption signal for in-flight advice.
_Avoid_: Provider failure, automatic retry, compaction

**Destructive-command guard**:
A separate Pi extension that may enforce shell-command safety independently of Pi Advisor.
Pi Advisor does not provide or configure this behavior.
_Avoid_: Advisor blocker, Advisory note enforcement, Advisor tool interruption

## Example dialogue

**Developer**: Does Project configuration turn the Advisor on when I open this repository?

**Domain expert**: No. Slice 1 does not load Project configuration, and any future Project configuration may customize review but cannot activate it.

**Developer**: What enters the Executor's context after an Advisor update?

**Domain expert**: Only an accepted Advisory note. The Advisor's private review state remains separate.
