# @ribbons-digital/pi-advisor

`@ribbons-digital/pi-advisor` is an independent Pi extension for automatic, isolated secondary review of an Executor session.
The planned Advisor observes completed Executor turns in the background, stays silent when work is sound, and delivers only bounded actionable notes.

> Slice 0 status: this package is a contract and compatibility skeleton only.
> Its extension entry point intentionally registers no runtime, starts no model, sends no messages, and performs no automatic review.

## Not the same as rpiv-advisor

[`@juicesharp/rpiv-advisor`](https://www.npmjs.com/package/@juicesharp/rpiv-advisor) provides an Executor-invoked consultation tool.
This package is designed for automatic background observation that does not depend on the Executor remembering to request a review.
Both packages may eventually use `/advisor`, so intentional coexistence requires Pi-assigned suffixed command names and clear user choice.
Slice 0 measures the exact collision behavior before final coexistence wording is published.

## Planned behavior

- One explicitly selected Advisor model, with no fallback to the Executor model.
- Automatic review after meaningful completed Executor turns.
- Silence when no material issue exists.
- At most one bounded visible Advisory note per review update.
- Separate private Advisor state that does not enter Executor context.
- Read-only Advisor tools with protected-path enforcement.
- Explicit token, context, tool-call, turn, and cost governors.
- Fail-safe inactive behavior when critical Pi capabilities are unavailable.
- No product telemetry.
- Optional future Memory suggestion guidance without a Memory Lane dependency or direct Memory Lane calls.

The normative public contract is in [`docs/behavior-contract.md`](docs/behavior-contract.md).
The measured OMP parity position is tracked in [`docs/omp-parity.md`](docs/omp-parity.md).
Slice 0 compatibility evidence is in [`docs/slice-0-compatibility.md`](docs/slice-0-compatibility.md).
The proposed limits are in [`docs/slice-0-limit-proposal.md`](docs/slice-0-limit-proposal.md).
The protected-path analysis is in [`docs/protected-path-threat-model.md`](docs/protected-path-threat-model.md).

## Install the Slice 0 package locally

From this repository:

```sh
pi install /absolute/path/to/pi-advisor
```

The package can also be loaded for one run:

```sh
pi --no-extensions -e ./src/index.ts --no-session
```

Neither command starts an Advisor runtime in Slice 0.

## Compatibility

Slice 0 pins development and API spikes to `@earendil-works/pi-coding-agent` 0.80.7.
The proposed peer range is `>=0.80.7 <0.81.0`, with 0.80.7 as the only initially tested version.
Missing critical capabilities leave the future Advisor safely inactive without constructing a partial runtime.

## Security, privacy, and cost

Pi extensions run with the user's full system permissions.
Review package source before installation.

The planned Advisor may send bounded Executor messages, exposed reasoning, tool activity, tool results, and allowed file contents to the user-selected secondary model provider.
Redaction and protected paths reduce risk but cannot guarantee that every secret is excluded.
The planned automatic review creates additional provider usage and cost, bounded by explicit user-owned limits.

The Slice 0 entry point sends no model requests, reads no project files, persists no Advisor transcript, and starts no background work.

## Telemetry

This package sends no product telemetry or automatic crash reports to Ribbons Digital or another analytics service.
Future model-provider traffic will occur only as required to use the user-selected Advisor model.
Future support diagnostics will require explicit user action and will be redacted and bounded.

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
