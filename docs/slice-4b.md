# Slice 4B: Token-aware Advisor context

## Scope

This batch implements issue #17 under the approved Slice 4 objective.
It adds bounded current-branch re-prime fallback, pause-on-unsafe-snapshot behavior, complete public-API status accounting, optional private transcript records, and long-session repeated-maintenance fixtures.
It does not add context-model promotion, OMP snapcompact behavior, Agent Hub integration, WATCHDOG loading, or Project-controlled persistence.

## Acceptance evidence

| Deliverable                           | Result | Evidence                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bounded current-branch re-prime       | Pass   | When nested compaction fails or remains over policy, the runtime renders the active primary branch through the existing redacted bounded re-prime serializer, reduces the snapshot budget until the combined snapshot and pending update fit policy, increments the epoch, resets only private nested context, and submits one continuity-bearing review request. |
| Unsafe snapshot pause                 | Pass   | An empty branch, a snapshot that cannot fit with the pending update, or serialization/reset failure increments re-prime failure state, records a bounded redacted failure when persistence is enabled, pauses only Advisor, and emits one warning through the existing idempotent pause path.                                                                     |
| Status and accounting                 | Pass   | Status reports review request attempts, input, output, cache-read, cache-write, total tokens, reported cost, review outcomes, deliveries, resolved-update suppression classes, compaction and re-prime outcomes, the monotonic persisted-record count, persistence failures, retry and pause state, and bounded last failures.                                    |
| Optional transcript persistence       | Pass   | `persistence.transcript` remains false by default. Enabled persistence appends strictly parsed, 256 KiB-bounded `pi-advisor-transcript-record` custom entries outside model context for reasoning-free redacted updates, non-`advise` tool calls, redacted tool results, usage, accepted advice, failures, and stop reasons.                                      |
| Long-session and repeated maintenance | Pass   | Scripted integration coverage plants a pre-maintenance requirement, exercises repeated compaction-failure re-primes, verifies every re-prime stays under policy and carries current branch continuity, and checks exact exposed review usage and cost totals.                                                                                                     |

## Persistence behavior

Optional transcript persistence is User-owned embedding configuration and is disabled by default.
Project configuration has no field that can enable it.
Each enabled record is a versioned Pi custom entry in the active session and is excluded from primary model context by Pi's public context builder.
The strict parser rejects an unexpected version, session ID, shape, unredacted text, unsafe accepted advice, or record larger than 256 KiB.
Status labels its lifetime counter as records persisted.
The runtime inspects at most the newest 256 valid records and `/advisor dump` separately reports that available count and includes at most 32 recent bounded previews within its existing 16 KiB output limit.
Disabling persistence stops future transcript-record writes without deleting existing records.
File-backed records remain in the Pi session JSONL until the user deletes the session through Pi or removes its session file.
In-memory records disappear when the process exits.
There is no time-based transcript-record retention in this batch, so enabled disk use grows with the number and bounded size of records until old Pi sessions are deleted.
Lifecycle-only runtime-state entries remain independent and continue to follow `deferredAdviceRetentionHours`.

## Stored and excluded fields

Enabled transcript records may store:

- A saved timestamp and primary Pi session ID.
- A reasoning-free redacted bounded Executor update, original entry count, and truncation flag.
- A non-`advise` Advisor tool name and redacted bounded arguments.
- A non-`advise` Advisor tool result name, error flag, and redacted bounded result.
- Review-request input, output, cache-read, cache-write, total tokens, reported cost, and stop reason.
- An accepted delivered or queued Advisory note with bounded delivery and staleness metadata.
- A bounded redacted failure and stop reason.

Enabled transcript records never store:

- Executor reasoning.
- Advisor reasoning.
- Suppressed, rejected, oversized, unsafe, or redaction-altered Memory suggestions.
- Memory Lane queued, skipped, failed, or persistence outcomes.
- Unredacted secrets.
- Unbounded tool output.
- Complete provider payloads.
- Internal `advise` calls or acknowledgements, because they can contain rejected or suppressed note candidates.

## Primary-context isolation

Transcript custom entries remain outside Pi model context.
Re-prime reads the primary active branch through the serializer that excludes Pi Advisor note messages and raw custom-entry metadata.
Accepted advice continues to enter primary context only through the existing visible delivery path.
Private Advisor responses, compaction prompts and summaries, transcript records, and failure records do not enter primary context.

## Verification

- `pnpm exec vitest run tests/unit/advisor-policy.test.ts tests/integration/context-policy.test.ts tests/integration/retry-resilience.test.ts --reporter=dot` - passed 43 focused policy, long-context, re-prime, retry, suppression, and accounting tests across 3 files.
- `pnpm verify` - passed typecheck, lint, formatting, and 165 unit, contract, and integration tests across 18 files.
- `pnpm test:e2e` - passed the packed Pi installation and default-inactive package scenario.
- `pnpm pack:validate` - passed with 30 package files validated.
- `git diff --check` - passed with no whitespace errors.

## Deviations and residual risks

Pi 0.80.7 does not expose nested compaction request usage or cost through the public `AgentSession.compact()` result or public events.
Review-request usage and reported cost remain exact, while status separately counts compaction operations whose provider usage is unavailable.
A compaction failure recovered by bounded re-prime remains visible in compaction accounting without becoming the last review failure or a persisted failure record.
Suppression totals include only the resolved successful attempt for a completed update, so discarded retries and fully failed updates do not inflate them.
One public compaction operation may perform more than one provider summarization request, so the unavailable count is operation-level rather than an estimated provider-request total.
Transcript records are append-only Pi session entries.
Disabling persistence does not delete prior records, and this batch does not add a transcript-specific retention timer or deletion command.
Redaction reduces secret exposure but cannot guarantee detection of every sensitive value.

## Review status

Direct Opus 4.8 review is owned by the parent session after this implementation handoff.
No PR is opened by this worker.
