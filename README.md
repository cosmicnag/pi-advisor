# @ribbons-digital/pi-advisor

`@ribbons-digital/pi-advisor` is an independent Pi extension for automatic, isolated secondary review of an Executor session.
The Slice 1 core observes meaningful completed Executor turns in the background, stays silent when work is sound, and delivers only bounded actionable notes.

> Slice 1 status: the safe automatic core is implemented with in-memory configuration only.
> The installed default remains off and has no model selection until the durable WATCHDOG configuration and `/advisor configure` workflow arrive in a later approved slice.

## Not the same as rpiv-advisor

[`@juicesharp/rpiv-advisor`](https://www.npmjs.com/package/@juicesharp/rpiv-advisor) provides an Executor-invoked consultation tool.
This package is designed for automatic background observation that does not depend on the Executor remembering to request a review.
Both packages register `/advisor`, and Pi 0.80.7 assigns `/advisor:1` and `/advisor:2` in extension load order when both are installed.
Slice 1 does not add a collision warning, so users must identify the intended command from Pi's command list.

## Slice 1 behavior

- One explicitly selected Advisor model, with no fallback to the Executor model.
- Automatic review after meaningful completed Executor turns.
- Silence when no material issue exists.
- At most one bounded visible Advisory note per review update.
- Separate in-memory Advisor state that does not persist a transcript.
- Protected `read`, `grep`, `find`, and `ls` tools, with no mutating Advisor tools.
- Explicit update, pending-byte, context, token, cost, tool-call, and turn governors.
- Single-flight review with bounded coalescing while Advisor is busy.
- Epoch invalidation on disablement, branch mismatch, and shutdown.
- Three consecutive failed updates pause Advisor and warn once.
- Fail-safe inactive behavior when the configured model or credentials are unavailable.
- No product telemetry.

Cross-update deduplication, rich advice cards, lifecycle restoration, provider retry, context compaction, WATCHDOG files, transcript persistence, and Memory suggestions remain outside Slice 1.

The normative public contract is in [`docs/behavior-contract.md`](docs/behavior-contract.md).
The measured OMP parity position is tracked in [`docs/omp-parity.md`](docs/omp-parity.md).
Slice 0 compatibility evidence is in [`docs/slice-0-compatibility.md`](docs/slice-0-compatibility.md).
The approved defaults and hard maxima are in [`docs/slice-0-limit-proposal.md`](docs/slice-0-limit-proposal.md).
The protected-path analysis is in [`docs/protected-path-threat-model.md`](docs/protected-path-threat-model.md).

## Install the Slice 1 package locally

From this repository:

```sh
pi install /absolute/path/to/pi-advisor
```

The package can also be loaded for one run:

```sh
pi --no-extensions -e ./src/index.ts --no-session
```

The installed default registers `/advisor` and `--advisor` but does not start a nested runtime because no model is durably configured in Slice 1.
The manifest remains deliberately private as an accidental-publication guard.
An approved release change must remove that guard before the manual trusted-publishing workflow can publish.

## Session controls

- `/advisor on` enables review for the current session when the configured `provider/model` is available and authenticated.
- `/advisor off` disables review, invalidates in-flight work, clears the bounded backlog, and disposes the nested session.
- `/advisor status` reports activation, model, backlog, context, usage, review, note, pause, and last-failure state.
- `--advisor` requests activation for the current session in every Pi mode.
- `defaultEnabled: true` applies only to TUI and RPC sessions, while JSON and print sessions require explicit activation.

Running `/advisor on` after the three-failure pause or a governor pause resets the session token and cost totals before starting again and reports the previous totals.
Without an in-memory model configuration, `/advisor on` and `--advisor` leave Advisor inactive with an actionable status reason and never fall back to the Executor model.

## In-memory configuration

Slice 1 has no YAML, WATCHDOG, User configuration file, Project configuration file, configuration reload, or `/advisor configure` workflow.
An embedding extension or SDK host can provide one complete trusted `AdvisorConfig` object for the lifetime of the extension instance:

```ts
import { createPiAdvisorExtension, DEFAULT_ADVISOR_CONFIG } from "@ribbons-digital/pi-advisor";

const config = structuredClone(DEFAULT_ADVISOR_CONFIG);
config.model = "anthropic/claude-sonnet-4";
config.defaultEnabled = true;

export default createPiAdvisorExtension({ config });
```

The model reference must use `provider/model` syntax and must resolve through Pi's model registry with valid credentials.
Version 1 defaults to disabled, no model, `high` effort, all four read-only tools, empty review instructions, no additional protected paths, and no protected-path exceptions.
The active Slice 1 fields are `defaultEnabled`, `model`, `effort`, `tools`, `instructions`, all `context` fields, the note, turn, tool-call, pending-byte, token, and cost limits, and both `security` path lists.
`maxReprimeTokens`, review cadence, deferred-advice retention, `memorySuggestions`, `persistence`, `AdvisorProjectConfig`, and `CONFIG_VALIDATION_STRATEGY` are reserved contract fields and do not change Slice 1 runtime behavior.
`PROPOSED_ADVISOR_CONFIG` remains a deprecated compatibility alias for an independent clone of `DEFAULT_ADVISOR_CONFIG`.
Programmatic hooks are intended for embedding and tests: `onRuntime` exposes the instance, `onStatus` receives status snapshots, and `onWarning` receives pause warnings.
An additional protected path blocks that target and its descendants by normalized request and canonical target, while an exception permits only one exact normalized or canonical target and can deliberately expose sensitive content.

Project context files supplied by Pi are tagged, redacted, and bounded before review, but they are treated as untrusted review context rather than higher-authority policy.

## Exported API

All Slice 1 modules are re-exported from the package root.

| Surface         | Exports                                                                                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extension       | Default Pi extension, `createPiAdvisorExtension`, `PiAdvisorExtensionOptions`                                                                                                          |
| Runtime         | `AdvisorRuntime`, `AdvisorRuntimeHooks`, `AdvisorRuntimeStatus`, `AdvisorUsageTotals`, `formatAdvisorStatus`, `formatAdvisorEnableStatus`                                              |
| Configuration   | `DEFAULT_ADVISOR_CONFIG`, deprecated `PROPOSED_ADVISOR_CONFIG`, `normalizeAdvisorConfig`, `HARD_LIMITS`, `READ_ONLY_TOOL_NAMES`, configuration types, and reserved validation metadata |
| Advice          | `createAdviseTool`, `boundAdvice`, `isContentFreeAdvice`, and Advisory note types                                                                                                      |
| Protected tools | `ProtectedPathPolicy`, `createProtectedAdvisorTools`, `isAdvisorReadOnlyTool`, and `AdvisorToolContext`                                                                                |
| Transcript      | `ADVISOR_CUSTOM_TYPE`, cursor helpers, meaningful-turn filtering, delta rendering, and transcript types                                                                                |
| Redaction       | `redactSecrets`, `estimateTokens`, UTF-8 truncation helpers, and `RedactionResult`                                                                                                     |

The default extension is the installable entry point.
`AdvisorRuntime` exposes cloned status snapshots, nested-message inspection, project-context capture, explicit enable and disable, turn observation, and shutdown, while the extension factory wires those lifecycle methods to Pi.
The factory, runtime hooks, status formatters, and policy helpers support controlled embedding, integration tests, and inspection without enabling durable configuration or persistence.

## Compatibility

Development, compatibility evidence, and the Slice 1 automatic core target `@earendil-works/pi-coding-agent` 0.80.7.
The peer range is `>=0.80.7 <0.81.0`, with 0.80.7 as the only tested version.
A missing or unavailable configured Advisor model leaves Advisor inactive without fallback or partial nested runtime construction.

## Security, privacy, and cost

Pi extensions run with the user's full system permissions.
Review package source before installation.

When explicitly configured and active, Advisor sends bounded Executor messages, exposed reasoning, tool activity, tool results, Pi-supplied tagged project context, and allowed file contents to the selected secondary model provider.
Redaction runs before budgeting and protected-path checks cover direct and symlink-resolved access, but neither defense can guarantee that every secret is excluded.
Automatic review creates additional provider usage and cost, bounded by configured session governors and the active package hard maxima for notes, turns, tool calls, and pending bytes.
Advisor transcript persistence remains disabled and unimplemented in Slice 1.

## Telemetry

This package sends no product telemetry or automatic crash reports to Ribbons Digital or another analytics service.
Model-provider traffic occurs only while an explicitly configured Advisor is active.
Support diagnostics remain deferred and no automatic diagnostic export occurs.

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

Pi Advisor is inspired by OMP's automatic Advisor design and is not affiliated with OMP.
`@juicesharp/rpiv-advisor` is credited for comparison and for any implementation pattern that is directly adapted in the future.
See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## License

MIT
