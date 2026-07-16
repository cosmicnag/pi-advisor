# Protected-Path Threat Model

## Objective

Advisor file tools must not read, search, list, or reveal common sensitive targets to a secondary model.
Protection applies before access and before returning directory or search results.

## Threats

- Direct reads of environment files, credentials, private keys, authentication stores, and secret-manager exports.
- Discovery of protected names or paths through `find`, `grep`, or `ls` results.
- Relative traversal, absolute paths, mixed separators, redundant segments, case variation on case-insensitive filesystems, and leading `@` aliases.
- Symlink or hard-link aliases that point from an apparently safe path to protected content.
- User exceptions that are broader than intended.
- Project configuration attempting to weaken package or user protections.
- Secrets embedded in otherwise ordinary source, logs, fixtures, or tool results outside known protected paths.

## Provisional default targets

The initial implementation should protect normalized forms of:

- `.env`, `.env.*`, and common environment backup variants, while allowing documented non-secret templates such as `.env.example` only after explicit review.
- Private-key and certificate-secret extensions such as `*.pem`, `*.key`, `*.p12`, `*.pfx`, and `*.jks`.
- SSH and GnuPG secret material, including `~/.ssh/`, `~/.gnupg/`, `id_*`, and `private-keys-v1.d/`.
- Cloud and package credentials such as `~/.aws/credentials`, `~/.config/gcloud/`, `~/.azure/`, `.npmrc`, `.pypirc`, and Docker authentication config.
- Secret-manager and credential-store exports such as `.credentials`, `credentials.json`, and common vault export names.
- Pi authentication data, especially `~/.pi/agent/auth.json` and equivalent rebranded agent directories.
- Operating-system keychain databases and browser credential stores when reachable through configured roots.

Patterns are provisional until implementation tests define exact basename, path-segment, extension, and exception semantics.
Broad substring matching is rejected because it creates surprising false positives.

## Required controls

- Resolve paths relative to the tool working directory.
- Strip Pi's leading `@` path alias before policy evaluation.
- Normalize separators and dot segments.
- Resolve existing targets through `realpath` before access.
- Evaluate both the requested path and resolved target.
- For non-existing targets, evaluate the normalized nearest existing ancestor plus unresolved suffix.
- Apply platform-appropriate case behavior without silently weakening Linux behavior.
- Filter protected descendants and names from listing and search output.
- Reject broad directory-wide user exceptions.
- Allow only user configuration to add narrow explicit exceptions.
- Allow project configuration only to add restrictions.
- Return a concise blocked result without protected content.

## Residual risk

Path protection cannot identify every secret.
Secrets may exist in ordinary source files, generated output, databases, archives, process output, or remote tool responses.
Redaction remains a separate defense and also cannot guarantee complete removal.
Public documentation must describe read-tool access to a secondary provider as a residual exposure risk.
