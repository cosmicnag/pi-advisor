# Pi Advisor Configuration Reference

This is the complete public reference for version `1` Pi Advisor WATCHDOG configuration.
Pi Advisor supports one Advisor.
OMP paths, `@import` expansion, a fullscreen multi-pane editor, and multiple advisors are not supported.

## File locations and trust

| Scope   | YAML policy                     | Markdown instructions          |
| ------- | ------------------------------- | ------------------------------ |
| User    | `~/.pi/agent/WATCHDOG.yml`      | `~/.pi/agent/WATCHDOG.md`      |
| Project | `<repository>/.pi/WATCHDOG.yml` | `<repository>/.pi/WATCHDOG.md` |

User files are owned by the user and apply in every repository.
Project files are read only when Pi reports the project as trusted.
Untrusted Project files are ignored without being opened.
Project configuration can only specialize or narrow User policy.
External edits are not watched and remain unapplied until Pi `/reload` or a confirmed `/advisor configure` apply.

## Interactive configuration

Run `/advisor` or `/advisor configure` in a dialog-capable TUI or RPC client.
The workflow selects an authenticated model, reasoning effort, any subset of the four approved read-only tools, and optional User instructions.
The TUI model step starts focused and fuzzy-searches provider, model ID, and display name while RPC clients keep the standard selection dialog.
After tool selection, a separate instructions step lets users continue without custom instructions or explicitly open the multiline editor to add them.
When instructions already exist, that step offers deliberate keep, edit, and clear choices, and only edit opens the multiline editor.
It then shows one summary and asks for confirmation before saving.
Cancellation at the instructions choice, multiline editor, or any other step leaves the file and runtime unchanged.
The tool picker cannot select `bash`, `edit`, `write`, an extension tool, or any other mutating or unapproved tool.
A confirmed save atomically replaces the User YAML file with mode `0600` and immediately rebuilds the current runtime.
The rebuild invalidates stale in-flight output, preserves delivered-note and lifetime usage totals, and prepares one bounded current-branch re-prime for the next eligible update.
If that lifecycle snapshot cannot fit safely, Advisor discards only the snapshot and reviews the current bounded update against fresh private context instead of pausing.
The workflow remains available when Advisor is disabled, paused, missing a model, or otherwise has no live nested runtime.
Non-dialog clients receive this reference path instead of a partial editor.
Protected paths, activation, limits, Memory suggestions, persistence, and other advanced fields are edited directly in YAML.

## Activation by run mode

| Control                | TUI                     | RPC                     | JSON                                        | Print                                       | Persistence effect |
| ---------------------- | ----------------------- | ----------------------- | ------------------------------------------- | ------------------------------------------- | ------------------ |
| `defaultEnabled: true` | Activates a new session | Activates a new session | Ignored for activation                      | Ignored for activation                      | User YAML only     |
| `/advisor on`          | Activates this session  | Activates this session  | Available only where commands are processed | Available only where commands are processed | None               |
| `--advisor`            | Activates this launch   | Activates this launch   | Activates this launch                       | Activates this launch                       | None               |
| `/advisor off`         | Disables this session   | Disables this session   | Available only where commands are processed | Available only where commands are processed | None               |

Activation never chooses a model automatically.
A missing model, unavailable model, missing credentials, or incompatible critical Pi API leaves Advisor inactive without fallback.
Project configuration can never activate Advisor.

## Ownership and merge rules

| Area                      | User authority                     | Trusted Project authority                | Project attempt outside authority                                        |
| ------------------------- | ---------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| Schema version            | Must be `1`                        | Must be `1`                              | Invalid document is ignored                                              |
| Activation and model      | Full                               | None                                     | Warned and ignored                                                       |
| Reasoning effort          | Full                               | None                                     | Warned and ignored                                                       |
| Tools                     | Approves a read-only set           | Intersects and therefore only removes    | Unknown or mutating tools invalidate the document                        |
| Instructions              | Adds User instructions             | Adds lower-authority tagged instructions | Cannot replace fixed policy                                              |
| Maximum limits            | Sets within package bounds         | May lower                                | Higher values are clamped to User values                                 |
| Minimum cadence           | Sets                               | May increase                             | Lower values are clamped to User values                                  |
| Context fraction          | Sets                               | May lower                                | Higher values are clamped to User values                                 |
| Response reserve          | Sets                               | May increase                             | Lower values are clamped to User values                                  |
| Protected paths           | May add                            | May add                                  | No removal mechanism exists                                              |
| Protected-path exceptions | May create exact exceptions        | None                                     | Warned and ignored                                                       |
| Memory suggestions        | May enable, disable, or set limits | May disable or narrow                    | Re-enabling or broadening is ignored or clamped                          |
| Transcript persistence    | May enable                         | None                                     | Warned and ignored                                                       |
| Spending increases        | May set                            | None beyond lowering caps                | Activation, model, effort, and persistence fields are warned and ignored |

Malformed User configuration falls back to safe release defaults with persisted activation off.
Malformed Project configuration is ignored.
Warnings identify the file and field path without printing its value.
Unknown fields are warned and ignored only when the remaining known document validates.

## Complete field reference

All numeric limits are applied before a provider request or accepted-note delivery as appropriate.
A confirmed configure apply affects the current runtime immediately except where the field explicitly controls only future session activation or restoration.
An external edit affects no running extension instance until `/reload` or configure apply.

### Top-level fields

| YAML path        | Type and accepted values                                     | Release default | Scope and Project merge           | Effect                                                                                                      |
| ---------------- | ------------------------------------------------------------ | --------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `version`        | Integer literal `1`                                          | Required `1`    | User and Project                  | Selects the schema and rejects unsupported versions.                                                        |
| `defaultEnabled` | Boolean                                                      | `false`         | User only                         | Controls new TUI and RPC sessions only and never activates JSON or print runs.                              |
| `model`          | `provider/model` string                                      | Unset           | User only                         | Selects the only Advisor provider model and therefore its provider network and pricing.                     |
| `effort`         | `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max` | `high`          | User only                         | Controls provider reasoning effort and can change latency, shared reasoning, tokens, and cost.              |
| `tools`          | Unique subset of `read`, `grep`, `find`, and `ls`            | All four        | User approves; Project intersects | Controls which protected read-only tools the Advisor can call. An empty list allows only internal `advise`. |
| `instructions`   | String                                                       | Empty           | User and Project                  | Adds review focus under the fixed policy. Project text is tagged below User text.                           |

Example tool selection:

```yaml
version: 1
tools: [read, grep]
```

### Context fields

| YAML path                 | Type                           | Release default | Scope and Project merge         | Effect                                                                                                   |
| ------------------------- | ------------------------------ | --------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `context.maxFraction`     | Number from `0.01` through `1` | `0.65`          | User sets; Project may lower    | Sets the fraction of model context available before private compaction or fresh current-update recovery. |
| `context.reserveTokens`   | Number at least `0`            | `8192`          | User sets; Project may increase | Reserves response space and can trigger earlier maintenance.                                             |
| `context.maxUpdateTokens` | Number at least `1`            | `24000`         | User sets; Project may lower    | Bounds each redacted Executor update and limits provider exposure and cost.                              |

### Review, delivery, and session limits

| YAML path                             | Type                             | Release default | Hard maximum | Scope and Project merge         | Effect                                                                                                  |
| ------------------------------------- | -------------------------------- | --------------- | ------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `limits.maxAdviceCharacters`          | Number at least `1`              | `2000`          | `8000`       | User sets; Project may lower    | Bounds accepted note characters and visibly truncates oversized ordinary rationale.                     |
| `limits.maxAdviceTokens`              | Number at least `1`              | `512`           | `2048`       | User sets; Project may lower    | Adds an estimated-token bound to accepted notes.                                                        |
| `limits.maxAdvisorTurnsPerUpdate`     | Number at least `1`              | `4`             | `12`         | User sets; Project may lower    | Stops long private Advisor tool loops.                                                                  |
| `limits.maxToolCallsPerUpdate`        | Number at least `0`              | `8`             | `32`         | User sets; Project may lower    | Caps read-only calls in one update. `0` disables read-only calls while preserving `advise`.             |
| `limits.maxPendingTranscriptBytes`    | Number at least `1`              | `200000`        | `1000000`    | User sets; Project may lower    | Bounds coalesced Executor backlog and associated bounded metadata.                                      |
| `limits.maxReprimeTokens`             | Number at least `1`              | `32000`         | `128000`     | User sets; Project may lower    | Bounds a redacted current-branch re-prime snapshot.                                                     |
| `limits.minTurnsBetweenReviews`       | Number at least `1`              | `1`             | None         | User sets; Project may increase | Reduces review frequency by requiring more meaningful Executor turns.                                   |
| `limits.minIntervalMs`                | Number at least `0`              | `0`             | None         | User sets; Project may increase | Reduces review frequency by requiring elapsed time while retaining one bounded coalesced update.        |
| `limits.deferredAdviceRetentionHours` | Number at least `0`              | `24`            | None         | User sets; Project may lower    | Controls cross-exit retention for accepted deferred advice. `0` disables new cross-exit note retention. |
| `limits.sessionTokenSoftCap`          | `off` or number at least `1`     | `off`           | None         | User sets; Project may lower    | Optionally pauses only Advisor when exact reported lifetime review tokens reach the configured cap.     |
| `limits.sessionCostSoftCapUsd`        | `off` or number greater than `0` | `off`           | None         | User sets; Project may lower    | Optionally pauses only Advisor when provider-reported lifetime review cost reaches the configured cap.  |

Both cumulative caps are opt-in and are disabled by default so normal Advisor review continues across long cache-heavy sessions.
Input, output, cache-read, cache-write, total-token, and provider-reported cost accounting remains visible when a cap is `off`.
A trusted Project finite cap may narrow a User `off` value.
A Project `off` value cannot disable or raise a finite User cap.
Provider pricing or usage can be absent or incomplete, so explicitly enabled token and dollar caps remain independent safeguards.
Compaction request usage is unavailable in Pi 0.80.7 and is counted separately rather than estimated into exact totals.

### Protected paths

| YAML path                           | Type                            | Release default | Scope and Project merge              | Effect                                                                                                                                       |
| ----------------------------------- | ------------------------------- | --------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `security.additionalProtectedPaths` | Array of non-empty path strings | `[]`            | User and Project; arrays are unioned | Blocks each target and descendants by normalized request and canonical target. Relative paths resolve from the repository working directory. |
| `security.protectedPathExceptions`  | Array of non-empty path strings | `[]`            | User only                            | Allows only an exact normalized or canonical target that would otherwise be blocked. It does not exempt descendants.                         |

Default protection blocks `.env` and `.env.*`, `.ssh`, `.gnupg`, `.aws`, `.azure`, `.kube`, `private-keys-v1.d`, `.npmrc`, `.pypirc`, `.credentials`, `credentials.json`, `auth.json`, `docker-config.json`, `login data`, `keychain-db`, and files ending in `.pem`, `.key`, `.p12`, `.pfx`, or `.jks`.
It also blocks `~/.config/gcloud`, `~/.docker/config.json`, and `~/.pi/agent/auth.json`.
Blocked tools return `Access blocked by Advisor protected-path policy.` without protected content.
Search and listing filter protected descendants before returning results.

An exact User exception looks like this:

```yaml
version: 1
security:
  additionalProtectedPaths:
    - fixtures/private
  protectedPathExceptions:
    - fixtures/private/public-example.txt
```

Exceptions can expose sensitive content to the selected provider and should be rare.
Read-only access, static symlink-aware checks, and redaction are defenses rather than a sandbox.
They cannot guarantee detection of every secret, hard-link alias, or concurrent same-user filesystem mutation.

### Memory suggestion fields

Memory suggestions activate only while ordinary Advisor is active and Pi exposes a schema-compatible active `memory_suggest` tool.
Pi Advisor never calls that tool itself and never saves or approves a memory.

| YAML path                                       | Type                | Release default | Hard maximum   | Scope and Project merge                 | Effect                                                                       |
| ----------------------------------------------- | ------------------- | --------------- | -------------- | --------------------------------------- | ---------------------------------------------------------------------------- |
| `memorySuggestions.enabled`                     | Boolean             | `true`          | Not applicable | User sets; Project may set only `false` | Enables capability-gated proposals without making Memory Lane a dependency.  |
| `memorySuggestions.minTurnsBetweenSuggestions`  | Number at least `0` | `8`             | None           | User sets; Project may increase         | Requires meaningful-turn distance between admitted suggestions.              |
| `memorySuggestions.minIntervalMs`               | Number at least `0` | `600000`        | None           | User sets; Project may increase         | Requires ten minutes by default between admitted suggestions.                |
| `memorySuggestions.sessionSuggestionCap`        | Number at least `0` | `5`             | None           | User sets; Project may lower            | Caps admitted suggestions per compatible Pi session. `0` disables admission. |
| `memorySuggestions.maxProposedMemoryCharacters` | Number at least `1` | `1000`          | `4000`         | User sets; Project may lower            | Suppresses the entire proposal rather than truncating durable text.          |
| `memorySuggestions.maxProposedMemoryTokens`     | Number at least `1` | `256`           | `1024`         | User sets; Project may lower            | Adds an estimated-token suppression bound.                                   |

### Persistence fields

| YAML path                | Type    | Release default | Scope and Project merge | Effect                                                                                        |
| ------------------------ | ------- | --------------- | ----------------------- | --------------------------------------------------------------------------------------------- |
| `persistence.transcript` | Boolean | `false`         | User only               | Enables reasoning-free redacted bounded optional transcript records in the active Pi session. |

Disabling transcript persistence stops future optional records but does not delete records already in a Pi session file.
Lifecycle state required for correct delivery remains independent of this field.

## Instruction sources and authority

The complete authority order is:

1. Fixed Advisor safety and protocol policy.
2. User `instructions` and User `WATCHDOG.md`.
3. Tagged trusted Project `instructions` and Project `WATCHDOG.md`.
4. Observed Executor context.

YAML `instructions` and Markdown are joined within their scope.
Each Markdown file and the combined instruction text are redacted and bounded to 64 KiB before use.
Project instructions are enclosed as lower-authority tagged review context.
Freeform instructions can specialize review focus, quality standards, architecture, and domain concerns.
They cannot override code-enforced tool registration, protected paths, emission validation, note bounds, context and cost governors, delivery and lifecycle behavior, or the internal `advise` schema.
Trusted Project text still reaches a model and retains residual prompt-injection risk despite structural tagging.

## Persistence, retention, inspection, and deletion

Pi Advisor custom entries are outside model context.
For a file-backed Pi session, successful custom entries live in that Pi session's JSONL file under `~/.pi/agent/sessions/`, organized by working directory.
`PI_CODING_AGENT_DIR`, `PI_CODING_AGENT_SESSION_DIR`, and Pi's `--session-dir` option can relocate that storage.
Use Pi's normal session management to identify and delete a session, or remove its session JSONL file while Pi is not using it.
In-memory and `--no-session` runs do not retain these entries across process exit.
Run `/advisor dump` to inspect a redacted preview bounded to 16 KiB.
No diagnostic or persisted record is exported automatically.

| Record class             | Stored when                                                           | Included fields                                                                                                                                                           | Explicit exclusions                                                                                                                                     | Retention and deletion                                                                    |
| ------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Lifecycle state          | Independently of optional transcript persistence when append succeeds | Version, Pi session ID, save time, branch cursor, retained accepted deferred notes, up to 128 dedupe hashes, delivery counts, and Memory suggestion cadence and cap state | Executor reasoning, Advisor reasoning, provider payloads, transcript updates, protected tool output, suppressed or rejected notes, and raw failure text | New snapshots follow the Pi session. Delete the Pi session file to delete them.           |
| Deferred accepted advice | Retention is above `0` and the note is pending                        | Already bounded redacted note shape, branch window, creation time, staleness, display, and resume markers                                                                 | Delivered, expired, branch-incompatible, suppressed, rejected, and unsafe notes                                                                         | Default `24` hours on compatible resume. `0` prevents content in new lifecycle snapshots. |
| Optional update          | `persistence.transcript: true`                                        | Reasoning-free redacted bounded Executor update                                                                                                                           | Executor reasoning and raw provider payload                                                                                                             | No time expiry. Delete the Pi session file.                                               |
| Optional tool call       | Persistence enabled                                                   | Non-`advise` tool name and bounded redacted arguments                                                                                                                     | Internal `advise`, mutating tools, and unbounded inputs                                                                                                 | No time expiry. Delete the Pi session file.                                               |
| Optional tool result     | Persistence enabled                                                   | Bounded redacted result for an allowed tool                                                                                                                               | Unbounded or unredacted output                                                                                                                          | No time expiry. Delete the Pi session file.                                               |
| Optional usage           | Persistence enabled                                                   | Exact public review-request token fields and provider-reported cost                                                                                                       | Compaction estimates and unavailable private provider accounting                                                                                        | No time expiry. Delete the Pi session file.                                               |
| Optional accepted advice | Persistence enabled after accepted queue or delivery state            | Bounded accepted ordinary note or eligible Memory suggestion shape                                                                                                        | Suppressed, duplicate, rejected, oversized, unsafe, or redaction-altered proposals                                                                      | No time expiry. Delete the Pi session file.                                               |
| Optional failure or stop | Persistence enabled                                                   | Bounded redacted reason and supported stop metadata                                                                                                                       | Raw error objects, credentials, and reasoning                                                                                                           | No time expiry. Delete the Pi session file.                                               |

Compatible resume requires the same Pi session ID and a cursor matching the active branch.
Restored advice is marked restored and potentially stale, displays its age, and waits for the next user prompt.
Delivered, expired, incompatible, retention-disabled, and over-capacity advice is discarded.
The live in-memory deferred queue does not expire merely because the configured cross-exit retention interval passes.
Long transcript-enabled sessions can grow on disk by one bounded record per persisted event, with a maximum of 256 KiB per record.
Keep optional transcript persistence disabled unless private audit history is needed, and periodically delete old Pi sessions.

## Security, privacy, network, and cost warnings

Pi extensions execute with the user's full system permissions, so review package source before installation.
When Advisor is active, the selected model provider receives bounded Executor messages, exposed reasoning, tool activity and results, tagged context, and allowed file content.
Reasoning exposure depends on Pi and the provider, and higher effort can increase provider traffic, latency, and cost.
Protected read tools and redaction cannot guarantee that every secret is excluded.
Automatic review creates additional paid provider requests until disabled or paused by an enabled governor.
Cumulative token and reported-cost caps default to `off`; configure a positive limit when a session-wide spending stop is required.
Private context pressure compacts first, then clears only private Advisor history and retries the same bounded update once when compaction cannot restore safe headroom.
An update that still cannot fit fresh private context is dropped with a bounded warning while Advisor remains active for later updates.
Three consecutive updates that each fail after bounded retry handling pause Advisor with one warning containing the final bounded, secret-redacted failure reason.
Provider attempts remain separately visible in request, retry, usage, and failed-review diagnostics.
Optional transcript persistence stores private local audit data and is disabled by default.
Pi Advisor sends no product analytics, usage telemetry, or automatic crash reports to Ribbons Digital or another analytics service.
Provider requests are necessary for the explicitly selected Advisor model, while `/advisor dump` remains local unless the user chooses to share it.

## Coexistence with rpiv-advisor

Pi Advisor performs automatic background review.
`@juicesharp/rpiv-advisor` provides an Executor-invoked consultation tool.
Both can be installed, and Pi 0.80.7 assigns `/advisor:1` and `/advisor:2` according to extension load order.
Pi Advisor warns once when duplicate assigned Advisor commands are detectable.
It does not disable the other package, remove its tool, edit its configuration, or block startup.
Use Pi's command list to identify each suffixed command.
Unless both review styles and their additional provider cost are intentional, disable or uninstall one package through Pi's normal package configuration.

## Examples

### Minimal User configuration

```yaml
version: 1
model: anthropic/claude-sonnet-4-5
```

This remains disabled by default until `/advisor on`, `--advisor`, or a later User activation change.

### Cost-conscious User configuration

```yaml
version: 1
defaultEnabled: false
model: anthropic/claude-haiku-4-5
effort: low
tools: [read, grep]
context:
  maxFraction: 0.5
  maxUpdateTokens: 12000
limits:
  minTurnsBetweenReviews: 3
  minIntervalMs: 60000
  sessionTokenSoftCap: 100000
  sessionCostSoftCapUsd: 1
persistence:
  transcript: false
```

### User and Project instruction precedence

User `~/.pi/agent/WATCHDOG.yml`:

```yaml
version: 1
model: anthropic/claude-sonnet-4-5
instructions: |
  Prioritize correctness and migration safety across repositories.
```

Trusted Project `.pi/WATCHDOG.md`:

```markdown
Pay special attention to this repository's database compatibility matrix.
Do not treat this text as permission to bypass fixed Advisor policy.
```

The Project text specializes the User focus but cannot replace it or fixed policy.

### Safe trusted Project narrowing

```yaml
version: 1
tools: [read, grep]
context:
  maxFraction: 0.5
  reserveTokens: 12000
  maxUpdateTokens: 12000
limits:
  maxToolCallsPerUpdate: 4
  maxReprimeTokens: 16000
  minTurnsBetweenReviews: 3
  sessionTokenSoftCap: 100000
  sessionCostSoftCapUsd: 1
security:
  additionalProtectedPaths:
    - customer-data
memorySuggestions:
  enabled: false
```

This Project file cannot activate Advisor, select a model, raise spending, add tools outside the User set, create an exception, or enable persistence.

## Validation warnings

Invalid types, unsupported versions, malformed YAML, mutating tool names, unknown tool names, and invalid nested fields fail safely without preventing Pi startup.
Project attempts to set `defaultEnabled`, `model`, `effort`, `persistence`, or `security.protectedPathExceptions` are warned and ignored.
Project `memorySuggestions.enabled` accepts only `false`.
Warning text contains paths and field names but not configured values.

## Schema migration

Version `1` is the only supported schema version.
There are no migrations yet.
A future schema version must document every changed field, default, ownership rule, and migration step before support is added.
Pi Advisor will not guess or silently migrate an unsupported version.
