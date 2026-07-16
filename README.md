# @ribbons-digital/pi-advisor

`@ribbons-digital/pi-advisor` is an independent Pi extension for automatic, isolated secondary review of an Executor session.
The Slice 1 core observes meaningful completed Executor turns in the background, stays silent when work is sound, and delivers only bounded actionable notes.

> Slice 1 status: the safe automatic core is implemented with in-memory configuration only.
> The installed default remains off and has no model selection until the durable WATCHDOG configuration and `/advisor configure` workflow arrive in a later approved slice.

## Not the same as rpiv-advisor

[`@juicesharp/rpiv-advisor`](https://www.npmjs.com/package/@juicesharp/rpiv-advisor) provides an Executor-invoked consultation tool.
This package is designed for automatic background observation that does not depend on the Executor remembering to request a review.
Both packages may eventually use `/advisor`, so intentional coexistence requires Pi-assigned suffixed command names and clear user choice.
Slice 0 measures the exact collision behavior before final coexistence wording is published.

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
The proposed limits are in [`docs/slice-0-limit-proposal.md`](docs/slice-0-limit-proposal.md).
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
Programmatic SDK fixtures may use the exported `createPiAdvisorExtension({ config })` factory to supply approved in-memory configuration.
The manifest remains deliberately private as an accidental-publication guard.
An approved release change must remove that guard before the manual trusted-publishing workflow can publish.

## Compatibility

Development, compatibility evidence, and the Slice 1 automatic core target `@earendil-works/pi-coding-agent` 0.80.7.
The peer range is `>=0.80.7 <0.81.0`, with 0.80.7 as the only tested version.
A missing or unavailable configured Advisor model leaves Advisor inactive without fallback or partial nested runtime construction.

## Security, privacy, and cost

Pi extensions run with the user's full system permissions.
Review package source before installation.

When explicitly configured and active, Advisor sends bounded Executor messages, exposed reasoning, tool activity, tool results, trusted project context, and allowed file contents to the selected secondary model provider.
Redaction runs before budgeting and protected-path checks cover direct and symlink-resolved access, but neither defense can guarantee that every secret is excluded.
Automatic review creates additional provider usage and cost, bounded by the approved defaults and hard package maxima.
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
