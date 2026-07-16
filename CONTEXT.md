# Pi Advisor

Pi Advisor provides automatic secondary review of a primary Pi agent session while keeping reviewer state separate from the primary conversation.

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
The runtime generation that invalidates asynchronous Advisor work created before a reset, configuration change, disablement, session replacement, or disposal.
_Avoid_: Version, session number, retry count

**Re-prime**:
A reset of private Advisor context followed by a bounded snapshot of the Executor's current active branch.
_Avoid_: Retry, resume, full transcript replay

**Meaningful Executor turn**:
A completed internal Executor turn containing new user, reasoning, tool, or result information that can affect review.
_Avoid_: Request, full task, empty turn

**Executor reasoning**:
Private reasoning content exposed by Pi or the active provider and made available to the Advisor under the review policy.
_Avoid_: Hidden prompt, transcript, Advisory note

**Advisory note**:
One accepted, bounded, actionable observation created through a valid internal `advise` call, shown to the user, and delivered to the Executor as peer guidance.
_Avoid_: Review result, hidden instruction, approval request, feedback blob

**Memory suggestion**:
An Advisory note asking the Executor to verify a durable fact or pattern and propose it to the configured memory system for human review.
It never grants approval to the proposed memory.
_Avoid_: Saved memory, approved memory, hidden autosave, Advisor-owned memory

**Deferred advice**:
An accepted Advisory note waiting for the next user-driven Executor turn and eligible for restoration only in the same session with compatible branch ancestry.
_Avoid_: Backlog, hidden instruction, cross-session message

**Advice card**:
The user-visible presentation of an accepted Advisory note and its severity, delivery state, age, and staleness metadata.
_Avoid_: Tool result, hidden message, approval dialog

**Session activation**:
A temporary enabled state applying only to the current Pi session.
_Avoid_: Enabled setting, project activation

**User default activation**:
An explicit user-owned preference controlling whether new TUI and RPC sessions begin with Advisor active while JSON and print automation remain opt-in.
_Avoid_: Global activation, automatic project activation, automation default

**User configuration**:
User-owned policy controlling the Advisor model, effort, activation default, spending, cadence, and persistence.
_Avoid_: Global config, unrestricted base config

**Project configuration**:
Trusted repository-specific specialization that may add instructions or reduce tools and limits but cannot control activation, model choice, spending increases, or persistence.
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
A narrow User configuration rule that deliberately permits Advisor access to one otherwise protected target.
_Avoid_: Project exception, protection disablement, unrestricted access

**User interruption**:
A deliberate user action stopping the Executor that takes precedence over pending Advisor delivery.
_Avoid_: Provider failure, automatic retry, compaction

**Destructive-command guard**:
A separate Pi extension that may enforce shell-command safety independently of Pi Advisor.
Pi Advisor does not provide or configure this behavior.
_Avoid_: Advisor blocker, Advisory note enforcement, Advisor tool interruption

## Example dialogue

**Developer**: Does Project configuration turn the Advisor on when I open this repository?

**Domain expert**: No. Project configuration may customize the Advisor, but only Session activation or User default activation can enable it.

**Developer**: What enters the Executor's context after an Advisor update?

**Domain expert**: Only an accepted Advisory note. The Advisor's private review state remains separate.
