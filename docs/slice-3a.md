# Slice 3A Lifecycle and Persistence Evidence

## Scope

This batch implements only GitHub issue #12 under parent #11.
It covers active-branch cursor correctness, eager primary lifecycle invalidation, session replacement isolation, and lifecycle-only compatible resume.
It does not implement issue #13 provider retry, retry delay, retry and pause integration, new backlog or failure status, or stale queued-output extraction.
It also does not implement Advisor context compaction or re-prime, optional full Advisor transcript persistence, durable WATCHDOG configuration, or primary execution blocking.

## Behavior comparison

| Acceptance area         | Result | Evidence                                                                                                                                                                                                                                                            |
| ----------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active-branch cursor    | Pass   | `validateCursor` uses expected index and entry ID and distinguishes transcript shrink from ancestry mismatch.                                                                                                                                                       |
| Equal-length switch     | Pass   | A no-hint integration fixture replaces one branch with another of equal length while Advisor is awaiting and proves old advice is invalidated.                                                                                                                      |
| Compaction isolation    | Pass   | `session_before_compact` increments the epoch and aborts nested work before Pi compacts, while `session_compact` reseeds to the resulting branch. The next Advisor request contains the new view and excludes the old view.                                         |
| Tree isolation          | Pass   | `session_before_tree` invalidates before navigation or summary awaits, and `session_tree` reseeds to the selected branch.                                                                                                                                           |
| Await invalidation      | Pass   | Provider-await fixtures for equal-length validation, compaction, and tree navigation prove stale continuations cannot deliver. Activation credential and nested-construction awaits also check epoch, enabled state, disposal, and Pi session ID before continuing. |
| Session replacement     | Pass   | The Pi runtime replacement fixture creates two extension instances and two Pi session IDs, queues advice in the old runtime, and proves the new session receives neither its deferred queue nor its content.                                                        |
| Compatible resume       | Pass   | Versioned state restores an unexpired branch-compatible deferred note, reports its age, marks it restored and potentially stale, and delivers it only with the next user prompt.                                                                                    |
| Retention and discard   | Pass   | Retention `0`, expiry, incompatible branch windows, delivered queue removal, wrong session IDs, malformed state, and old-branch state do not restore deferred delivery.                                                                                             |
| Dedupe restore          | Pass   | Persisted delivered-note hashes suppress an immediate normalized duplicate after resume. Deferred and active-pending identities are excluded from persisted dedupe so unseen notes cannot suppress a later note.                                                    |
| Memory lifecycle        | Pass   | Compatible resume restores meaningful-turn cadence, last admission turn and time, admitted count, delivered count, and reached-cap behavior. A copied snapshot with another Pi session ID is rejected and the genuinely new session starts fresh.                   |
| Model-context isolation | Pass   | Pi custom lifecycle entries stay outside `buildSessionContext`, and tests inspect the primary context to ensure queued state is not injected before delivery.                                                                                                       |

## Persisted lifecycle state

The custom entry type is `pi-advisor-runtime-state`, schema version `1`.
It is appended through Pi's public non-context custom-entry API.
File-backed sessions persist successful appends in their session JSONL, in-memory sessions have no JSONL, and append failure does not alter Advisor delivery.

Each snapshot contains only:

- Pi session ID and save timestamp.
- Active-branch cursor entry ID and expected index.
- Retained accepted deferred notes with their already bounded redacted note shape, branch window, staleness, display, and restored marker.
- The newest delivered-note dedupe hashes up to the measured cap.
- Delivered-note count.
- Memory suggestion meaningful-turn count, admitted count, delivered count, last admission turn and timestamp, and reached-cap state.

Each snapshot is capped at 4 MiB.
The parser validates schema version, object shapes, safe integer and timestamp bounds, accepted-note hard bounds and redaction invariance, item counts, lowercase SHA-256 format and uniqueness, Pi session ID, active cursor ancestry, and total serialized bytes.
It rejects the latest incompatible or malformed state without falling back to an older snapshot.
It never stores Executor or Advisor reasoning, Advisor transcript messages, observed transcript updates, provider payloads, protected tool results, suppressed or rejected notes, or raw failure text.
Optional full Advisor transcript persistence remains false and independent.
For file-backed sessions, deleting the Pi session deletes successfully appended lifecycle state.

## Persisted dedupe measurement

The proposed 512-hash snapshot measured 34,574 UTF-8 bytes before deferred-note content.
The equivalent 128-hash snapshot measured 8,846 bytes.
A representative medium Slice 0 session has 24 Executor turns and a tool-heavy session has 12 turns, while at most one note can be admitted per review.
The implemented cap is therefore revised to 128 hashes, which covers more than five representative medium sessions while reducing repeated append-only snapshot overhead by approximately 75 percent.
The in-memory branch-local dedupe history remains 4,096 keys.

## Public Pi lifecycle surface

The implementation uses only Pi 0.80.7 public APIs already covered by compatibility tests:

- `SessionManager.getBranch`, `getEntries`, `getSessionId`, and Pi custom entries through `ExtensionAPI.appendEntry`.
- `session_start`, `session_before_compact`, `session_compact`, `session_before_tree`, `session_tree`, and `session_shutdown`.
- Nested `AgentSession.abort`, `dispose`, and in-memory message reset.

No private import, queued-message cancellation fallback, or primary execution block is introduced.

## Opus 4.8 review response

### R1 - Memory delivered and admitted persistence invariant

The cited 4 MiB trimming path is not a source of `deliveredCount > admittedCount` in reachable runtime state.
A Memory suggestion increments `memorySuggestionAdmissions` exactly once after it enters either the active or deferred bounded queue.
Deferred delivery increments `memorySuggestionsDelivered` only after dequeuing an item from that admitted queue.
Active acknowledgement occurs only for an item retained in the active queue after admission; the measured active Pi path queues a steer while streaming, and its later message lifecycle acknowledgement cannot run inside the synchronous enqueue call before admission is recorded.
Restored deferred items come only from a snapshot that already passed the strict `deliveredCount <= admittedCount` parser invariant, and their original admissions remain in the restored count.
No runtime path decrements admissions.
The 4 MiB loop trims only the copied `state.deferredAdvice` tail and does not mutate the in-memory queue, `admittedCount`, or `deliveredCount`, so trimming can conservatively retain admissions for notes omitted from disk but cannot invert the accounting inequality.

A targeted regression seeds a reachable accounting shape with 490 admitted Memory suggestions, one already delivered and 489 still deferred, whose escaped JSON exceeds 4 MiB, then forces persistence trimming and resumes from the resulting snapshot.
It proves that the tail is trimmed, serialized state remains within 4 MiB, persisted counts remain `admittedCount: 490` and `deliveredCount: 1`, and resume restores one delivered count, 510 remaining admissions under a 1,000 cap, and the retained deferred prefix.
The unit parser also explicitly rejects a synthetic `deliveredCount: 1, admittedCount: 0` snapshot.
No production clamp was added because it would mask an unreachable internal accounting violation and under-report delivered Memory suggestions rather than repair a trim defect.

### R2 - File-backed persistence wording

README, the public behavior contract, and this evidence now distinguish non-context Pi session custom entries from file persistence.
They state that file-backed sessions write successful appends to their JSONL, in-memory sessions have no JSONL, and append failures do not affect Advisor delivery.

## Verification

Final validation commands and results:

- `pnpm typecheck` - pass.
- `pnpm lint` - pass.
- `pnpm format:check` - pass.
- `pnpm test` - pass; 142 tests across 15 unit, contract, and integration files after review response.
- `pnpm test:e2e` - pass; packed Pi 0.80.7 installation and startup.
- `pnpm pack:validate` - pass; 26 package files validated and generated artifacts removed.
- `pnpm exec vitest run tests/unit/lifecycle-state.test.ts tests/integration/lifecycle-resilience.test.ts --reporter=verbose` - pass; 14 targeted persistence invariant and lifecycle tests across 2 files.
- `pnpm exec vitest run tests/unit/lifecycle-state.test.ts tests/integration/lifecycle-spikes.test.ts tests/integration/lifecycle-resilience.test.ts tests/integration/session-replacement-spike.test.ts tests/integration/advisor-safety.test.ts tests/integration/memory-suggestions.test.ts --reporter=dot` - pass before review response; 89 focused branch, compaction, replacement, resume, dedupe, and Memory lifecycle tests across 6 files.
- `pnpm exec tsx /tmp/pi-advisor-manual-smoke.mts` - pass; manual public `SessionManager` tree mismatch and compatible-resume state smoke printed `PASS manual tree-navigation and compatible-resume state smoke` and removed its temporary file.
- `git diff --check` - pass.

## Deviations and residual risks

- Primary compaction clears private Advisor conversation state rather than splicing the compaction summary into old private context. A bounded current-branch re-prime remains Slice 4.
- `deferredAdviceRetentionHours` is evaluated on compatible restoration and does not expire a live in-memory deferred queue.
- Lifecycle snapshots use Pi's append-only custom-entry model. The revised 128-hash cap reduces snapshot amplification, but long sessions still retain historical superseded lifecycle entries until the owning Pi session is deleted.
- Pi 0.80.7 still exposes no public abort cause and no queued `nextTurn` cancellation API, so the existing conservative interruption and extension-local deferred-delivery behavior remains unchanged.
- Slice 3B retry and status behavior remains unimplemented by scope.
