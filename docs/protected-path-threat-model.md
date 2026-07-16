# Protected-Path Threat Model

## Objective

Advisor file tools must not read, search, list, or reveal common sensitive targets to a secondary model.
Protection applies before access and before returning directory or search results.

## Threats

- Direct reads of environment files, credentials, private keys, authentication stores, and secret-manager exports.
- Discovery of protected names or paths through `find`, `grep`, or `ls` results.
- Relative traversal, absolute paths, mixed separators, redundant segments, case variation on case-insensitive filesystems, and leading `@` aliases.
- Symlink aliases that point from an apparently safe path to protected content.
- Hard-link aliases that expose a protected inode through an unrelated pathname, which pathname and `realpath` checks alone cannot identify.
- User exceptions that are broader than intended.
- A future Project configuration attempting to weaken package or User protections.
- Secrets embedded in otherwise ordinary source, logs, fixtures, or tool results outside known protected paths.
- A symlink target changing between policy evaluation and file access.

## Slice 1 default targets

The Slice 1 implementation protects normalized requested paths and canonical existing targets for:

- Exact basenames `.env` and every basename beginning with `.env.`, including `.env.example`.
- File extensions `*.pem`, `*.key`, `*.p12`, `*.pfx`, and `*.jks`.
- Path segments `.ssh`, `.gnupg`, `.aws`, `.azure`, `.kube`, and `private-keys-v1.d`.
- Exact basenames `.npmrc`, `.pypirc`, `.credentials`, `credentials.json`, `auth.json`, `docker-config.json`, `login data`, and `keychain-db`.
- Exact home targets `~/.config/gcloud`, `~/.docker/config.json`, and `~/.pi/agent/auth.json`.
- User-supplied additional protected paths, checked in both their normalized requested form and canonical target form.

Slice 1 uses exact basename, path-segment, extension, home-path, and explicit-path checks rather than broad substring matching.
User exceptions match one exact normalized or canonical target and do not exempt descendants of an excepted directory.

## Required controls

- Resolve paths relative to the tool working directory.
- Strip Pi's leading `@` path alias before policy evaluation.
- Normalize separators and dot segments.
- Resolve existing targets through `realpath` before access.
- Evaluate both the requested path and resolved target.
- For non-existing targets, evaluate the normalized nearest existing ancestor plus unresolved suffix.
- Apply platform-appropriate case behavior without silently weakening Linux behavior.
- Filter protected descendants and names from listing and search output.
- Bound directory traversal by file, directory, and examined-entry budgets.
- Bound grep by file count, per-file bytes, total bytes, output size, and an external process timeout.
- Give an exception effect only when its normalized requested or canonical path exactly matches the requested target.
- Allow only trusted programmatic Slice 1 configuration, and later User configuration, to add narrow explicit exceptions.
- Allow any future Project configuration only to add restrictions.
- Return a concise blocked result without protected content.

## Slice 1 tool bounds

The protected `read` tool retains Pi's built-in line and output truncation behavior after the path check.
The protected `ls` tool defaults to 500 visible entries, accepts at most 2,000, and scans at most 5,000 directory entries for one call.
The protected `find` tool returns files only, defaults to 1,000 results, accepts at most 2,000, skips `.git` and `node_modules` during traversal, and stops at 2,000 directories or 20,000 examined entries.
The protected `grep` tool preselects at most 500 files whose measured sizes are at most 1,000,000 bytes each and 5,000,000 bytes in total, traverses at most 1,000 directories and 10,000 entries, limits context to 20 lines, accepts at most 2,000 output matches, and gives `rg` 2 seconds.
Regex `grep` uses `execFile` without a shell and returns bounded messages for unavailable `rg`, invalid patterns, and timeouts.
When `rg` is unavailable, literal searches use a bounded in-process file reader with no regular-expression evaluation.
Search and listing output also passes through Pi's head truncation helper.

## Redaction boundary

Slice 1 pattern-redacts Executor deltas, Pi-supplied project context, accepted notes, and reported failure reasons before their next use or display.
The patterns cover private-key blocks, bearer and common provider token forms, common secret assignments, and passwords embedded in HTTP URLs.
Tool output from an allowed path is bounded but is not passed through the transcript redactor before the nested provider receives it.

## Residual risk

Path protection cannot identify every secret.
Secrets may exist in ordinary source files, generated output, databases, archives, process output, or remote tool responses.
Redaction remains a separate defense and also cannot guarantee complete removal.
Additional protected-path canonical targets are resolved when the nested Advisor tools are created, so retargeting a configured symlink during the same session can evade the original canonical-target restriction for a different direct pathname.
The normalized configured alias remains protected.
Path checks, file-size measurements, and file access are separate operations, so concurrent symlink retargeting or file growth can race those checks even though direct and already-resolved symlink aliases are checked.
Hard links are not tracked by device and inode.
Public documentation must describe allowed read-tool access to a secondary provider as a residual exposure risk.
