# Pi Advisor

Automatic, isolated secondary review for [Pi](https://pi.dev).

Pi Advisor observes meaningful completed turns from your primary Pi agent, called the Executor, and reviews them with a separate model that you choose.
It stays silent when work is sound and delivers a bounded, actionable note when it finds a material correctness, safety, verification, or workflow issue.

> [!WARNING]
> Pi extensions run with your full system permissions.
> Review this package before installing it.
> When Advisor is active, it sends bounded session content and allowed file content to the model provider you select, which can create additional usage and cost.

## Features

- Automatic review without relying on the Executor to request it.
- One explicitly selected Advisor model with no fallback to the Executor model.
- Isolated Advisor conversation state that does not enter the Executor context.
- Silence-first review with at most one bounded visible note per update.
- Active, deferred, restored, and potentially stale delivery states.
- Protected and bounded `read`, `grep`, `find`, and `ls` tools, with no mutating Advisor tools.
- Context, update, tool-call, turn, pending-byte, and opt-in cumulative token and reported-cost governors.
- Branch, compaction, session replacement, retry, and compatible-resume handling.
- Optional capability-based Memory suggestions without a Memory Lane dependency.
- Optional reasoning-free, redacted, bounded transcript records, disabled by default.
- No product telemetry or automatic crash reporting.

## Requirements

- Node.js 22 or later.
- `@earendil-works/pi-coding-agent` 0.80.7.

The declared compatibility range is `>=0.80.7 <0.81.0`, with 0.80.7 as the tested release.
A missing critical Pi capability, unavailable model, or missing model credential leaves Advisor inactive without selecting a fallback.

## Install

Install the unpinned npm package through Pi:

```sh
pi install npm:@ribbons-digital/pi-advisor
```

Using the unpinned package source allows Pi to install future compatible releases through its normal extension update process.

To try Pi Advisor for one run without installing it:

```sh
pi -e npm:@ribbons-digital/pi-advisor
```

## Configure and enable

Start Pi and run:

```text
/advisor configure
```

The configuration flow selects an authenticated model, reasoning effort, approved read-only tools, and User instructions.
It shows a summary and asks for confirmation before atomically saving `~/.pi/agent/WATCHDOG.yml`.

Then enable Advisor for the current session:

```text
/advisor on
```

Pi Advisor never selects a model automatically.
The installed default remains disabled until you explicitly configure and enable it.

A minimal manual configuration is:

```yaml
version: 1
model: anthropic/claude-sonnet-4-5
effort: high
defaultEnabled: false
```

Save it as `~/.pi/agent/WATCHDOG.yml`, then run Pi `/reload` before enabling Advisor.
See the [complete configuration reference](docs/configuration.md) for every field, default, ownership rule, security and cost effect, and trusted Project configuration example.

## Commands

| Command                            | Effect                                                                                             |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `/advisor` or `/advisor configure` | Opens interactive User configuration in a dialog-capable TUI or RPC client.                        |
| `/advisor on`                      | Enables Advisor for the current session without changing the persisted default.                    |
| `/advisor off`                     | Disables Advisor for the current session and invalidates in-flight review work.                    |
| `/advisor status`                  | Shows activation, model, backlog, context, usage, cost, delivery, persistence, and failure status. |
| `/advisor dump`                    | Produces an explicit redacted diagnostic snapshot bounded to 16 KiB.                               |
| `--advisor`                        | Requests activation for the launched Pi session, including JSON and print modes.                   |

Persisted `defaultEnabled: true` applies only to new TUI and RPC sessions.
JSON and print runs always require explicit activation.

## Upgrade

Upgrade installed Pi packages, including an unpinned Pi Advisor installation, with:

```sh
pi update --extensions
```

To update only Pi Advisor:

```sh
pi update npm:@ribbons-digital/pi-advisor
```

A version-pinned source such as `npm:@ribbons-digital/pi-advisor@0.1.0` is intentionally skipped by package updates.
Install the unpinned source shown above if you want normal extension updates.

## Uninstall

Remove Pi Advisor through Pi:

```sh
pi remove npm:@ribbons-digital/pi-advisor
```

Uninstallation removes the package from Pi settings and package storage.
It does not delete your User WATCHDOG files or existing Pi session files.
Remove `~/.pi/agent/WATCHDOG.yml` and `~/.pi/agent/WATCHDOG.md` yourself if you no longer want the configuration.
Delete affected Pi sessions through Pi or remove their session JSONL files while Pi is not using them if you also want to delete previously persisted lifecycle or optional transcript records.

## How review and delivery work

Advisor reviews meaningful completed Executor turns in a separate in-memory Pi session.
Only an accepted Advisory note enters the Executor context.
Private Advisor reasoning, rejected notes, duplicate notes, content-free responses, and ordinary silent reviews remain outside the Executor context.

Advice created during an active run reaches Pi's next steering boundary and does not abort a running tool.
Late or interruption-time advice waits for the next user-driven turn without triggering another completion.
Advice is marked potentially stale when the Executor has advanced beyond the reviewed window, and restored advice requires fresh verification.

## Security, privacy, and cost

When Advisor is active, the selected model provider may receive bounded versions of:

- User and assistant messages.
- Exposed Executor reasoning when Pi or the provider supplies it.
- Tool calls and tool results.
- Branch and compaction summaries.
- Pi-supplied project context.
- Content returned by allowed Advisor read-only tools.

Observed Executor content and Pi-supplied context are redacted before budgeting and submission.
Allowed read-only tool results are bounded but are not transcript-redacted before the selected provider receives them.
Protected paths and redaction reduce risk but cannot guarantee that every secret is excluded.
Secrets can exist in ordinary source files, generated output, hard-link aliases, archives, databases, or content changed during a concurrent filesystem race.
See [Security](docs/security.md) for the protected targets, tool bounds, controls, and residual risks.

Automatic review creates additional provider requests, latency, token usage, and cost.
Cumulative session token and reported-cost caps default to `off`, while complete lifetime usage remains visible in `/advisor status`.
An explicitly configured positive cap pauses only Advisor and never interrupts the Executor.
A trusted Project may add or lower a finite cap but cannot remove or raise a finite User cap.
Provider usage or pricing can be missing or incomplete, so explicitly enabled token and dollar caps remain independent safeguards.

Advisor estimates its private context before each bounded update and asks Pi's public nested `AgentSession.compact()` API to compact when needed.
If compaction fails or remains unsafe, Advisor clears only its private nested history and retries the same current bounded update once without replaying the full Executor branch.
If that update still cannot fit fresh context, Advisor drops only that update, warns, and remains active for later updates.
Branch, session, and confirmed configuration resynchronization may use one bounded branch snapshot, but an unsafe lifecycle snapshot degrades to the current bounded update instead of pausing Advisor.

Pi Advisor writes bounded lifecycle state as Pi custom entries outside model context when required for correct compatible resume and delivery.
Optional transcript-record persistence is controlled by `persistence.transcript` and is disabled by default.
When enabled, it stores reasoning-free, redacted, bounded records in the active Pi session, but disabling it does not delete existing records.
See [Configuration: persistence, retention, inspection, and deletion](docs/configuration.md#persistence-retention-inspection-and-deletion) for exact stored and excluded fields.

## Telemetry and diagnostics

Pi Advisor sends no product analytics, usage telemetry, or automatic crash reports to Ribbons Digital or another analytics service.
Network requests to your explicitly selected model provider are necessary while Advisor is active.
`/advisor dump` is local, explicit, redacted, bounded, and never exported automatically.

## Coexistence with rpiv-advisor

[`@juicesharp/rpiv-advisor`](https://www.npmjs.com/package/@juicesharp/rpiv-advisor) provides Executor-invoked consultation.
Pi Advisor provides automatic background observation.

Both packages register `/advisor`.
Pi 0.80.7 assigns `/advisor:1` and `/advisor:2` in extension load order when both are installed.
Pi Advisor warns once when duplicate assigned commands are detectable and does not disable or modify the other package.
Use Pi's command list to identify each suffix.
Unless you intentionally want both review styles and their additional provider cost, disable or uninstall one package.

## Scope and compatibility differences

Pi Advisor intentionally:

- Supports one Advisor rather than multiple Advisors.
- Uses Pi-native User and trusted Project WATCHDOG paths rather than OMP `.omp` paths.
- Uses Pi's `find` tool rather than an OMP-style `glob` tool.
- Delivers active advice at Pi's next assistant boundary instead of hard-interrupting a running tool.
- Coalesces bounded backlog instead of blocking the Executor until review catches up.
- Keeps mutating Advisor tools and destructive-command interception out of scope.
- Provides a Pi-native configuration flow rather than a fullscreen multi-pane editor.
- Uses Pi's public nested `AgentSession.compact()` behavior rather than OMP's private in-memory LLM-summary implementation.
- Does not perform OMP context-model promotion because Pi exposes no equivalent public policy primitive for this nested runtime.

## Public documentation

- [Configuration reference](docs/configuration.md)
- [Security](docs/security.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## Attribution

Pi Advisor is an independently implemented extension inspired by OMP's automatic Advisor design.
It is not affiliated with, endorsed by, or maintained by OMP, `@juicesharp/rpiv-advisor`, Pi, or their maintainers.
See [Third-Party Notices](THIRD_PARTY_NOTICES.md) for dependency and upstream acknowledgements.

## License

MIT
