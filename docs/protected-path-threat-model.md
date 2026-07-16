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
- Project configuration attempting to weaken package or user protections.
- Secrets embedded in otherwise ordinary source, logs, fixtures, or tool results outside known protected paths.
- Hard-link aliases unless a future implementation adds device-and-inode tracking across protected roots.

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
- Reject broad directory-wide user exceptions.
- Allow only user configuration to add narrow explicit exceptions.
- Allow project configuration only to add restrictions.
- Return a concise blocked result without protected content.

## Residual risk

Path protection cannot identify every secret.
Secrets may exist in ordinary source files, generated output, databases, archives, process output, or remote tool responses.
Redaction remains a separate defense and also cannot guarantee complete removal.
Additional protected-path canonical targets are resolved when the nested Advisor tools are created, so retargeting a configured symlink during the same session can evade the original canonical-target restriction for a different direct pathname.
The normalized configured alias remains protected.
Public documentation must describe read-tool access to a secondary provider as a residual exposure risk.
