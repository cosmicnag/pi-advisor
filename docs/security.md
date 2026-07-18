# Security

Pi Advisor extensions run with the user's full system permissions.
Review the package before installing it.
This document describes the defenses and residual risks around context sharing and Advisor read-only tools.

## Provider disclosure boundary

When Advisor is active, the selected model provider receives bounded review context and content returned by allowed read-only tools.
Observed Executor content and Pi-supplied project context are redacted before budgeting and submission.
Allowed file-tool results are bounded but are not transcript-redacted before the selected provider receives them.

No redaction or path policy can guarantee that every secret is excluded.
Use `tools: []` or a narrower tool set when the selected provider should not read repository files.
Add sensitive repository locations to `security.additionalProtectedPaths`.

## Protected targets

Advisor blocks normalized requested paths and canonical existing targets for:

- Exact basename `.env` and basenames beginning with `.env.`.
- Files ending in `.pem`, `.key`, `.p12`, `.pfx`, or `.jks`.
- Path segments `.ssh`, `.gnupg`, `.aws`, `.azure`, `.kube`, and `private-keys-v1.d`.
- Exact basenames `.npmrc`, `.pypirc`, `.credentials`, `credentials.json`, `auth.json`, `docker-config.json`, `login data`, and `keychain-db`.
- Exact home targets `~/.config/gcloud`, `~/.docker/config.json`, and `~/.pi/agent/auth.json`.
- User and trusted Project additional protected paths.

Search and listing tools filter protected descendants before returning results.
A blocked operation returns `Access blocked by Advisor protected-path policy.` without protected content.

User configuration may create an exception for one exact normalized or canonical target.
An exception does not exempt descendants of a directory.
Trusted Project configuration can only add restrictions and cannot create exceptions.

## Path controls

Advisor read-only tools:

- Resolve relative paths from the repository working directory.
- Strip Pi's leading `@` path alias.
- Normalize separators and dot segments.
- Resolve existing targets through `realpath`.
- Evaluate both the requested path and canonical target.
- Apply platform-appropriate case handling.
- Filter protected names from search and listing output.
- Bound traversal, file count, file size, output size, and process time.
- Rewrite ripgrep filename prefixes from absolute to working-directory-relative paths.

These controls are a static path-disclosure defense, not a filesystem sandbox.

## Tool bounds

The protected `read` tool retains Pi's built-in 2,000-line and 50 KiB output limits after authorization.

The protected `ls` tool:

- Defaults to 500 visible entries.
- Accepts at most 2,000 visible entries.
- Scans at most 5,000 directory entries per call.

The protected `find` tool:

- Returns files only.
- Defaults to 1,000 results and accepts at most 2,000.
- Skips `.git` and `node_modules` during traversal.
- Stops at 2,000 directories or 20,000 examined entries.

The protected `grep` tool:

- Preselects at most 500 files.
- Accepts files no larger than 1,000,000 bytes each and 5,000,000 bytes in total.
- Traverses at most 1,000 directories and 10,000 entries.
- Limits context to 20 lines.
- Defaults to 100 output lines and accepts at most 2,000.
- Gives `rg` two seconds.
- Uses `rg` without a shell when available.
- Uses a bounded in-process reader for explicit literal searches when `rg` is unavailable.
- Reports regex search as unavailable when `rg` is unavailable.

## Redaction

Pi Advisor pattern-redacts observed Executor deltas, Pi-supplied project context, accepted notes, configuration instructions, diagnostics, and bounded failure reasons before their next relevant use or display.
Patterns cover private-key blocks, bearer tokens, common provider token forms, common secret assignments, and passwords embedded in HTTP URLs.

Redaction reduces accidental exposure but cannot recognize every credential format or sensitive value.

## Configuration trust

User WATCHDOG files apply across repositories.
Pi reads Project WATCHDOG files only when it reports the project as trusted.
Trusted Project configuration may narrow tools and limits, add protected paths, or add lower-authority instructions.
It cannot activate Advisor, select a model, increase spending or exposure, remove protections, create exceptions, or enable transcript persistence.

Trusted Project instructions still reach the selected model and retain residual prompt-injection risk.
Fixed Advisor policy and code-enforced safety controls remain higher authority than freeform instructions.

## Persistence

Lifecycle state and optional transcript records use Pi custom entries outside model context.
Optional transcript records are disabled by default and exclude Executor and Advisor reasoning.
Redaction and bounding still cannot guarantee that every stored value is non-sensitive.
Delete the associated Pi session if you need to remove existing records.
See the [configuration reference](configuration.md#persistence-retention-inspection-and-deletion) for exact record fields and retention behavior.

## Residual risks

Known residual risks include:

- Secrets in otherwise ordinary source files, generated output, logs, databases, archives, or remote results.
- Hard-link aliases, because pathname and `realpath` checks do not identify unrelated names for the same inode.
- Concurrent symlink retargeting, file replacement, or file growth between authorization and access.
- A configured symlink target changing after Advisor tools are created.
- Novel secret formats that pattern redaction does not recognize.
- Provider-side storage, logging, and retention according to the selected provider's policies.
- Model prompt injection from trusted repository content.

Use a provider and configuration appropriate for the sensitivity of the repository.
Disable Advisor or its file tools when the remaining exposure is unacceptable.

## Reporting vulnerabilities

Do not include credentials, private session transcripts, or unredacted `/advisor dump` output in a public issue.
Report a suspected vulnerability through the repository's private security-reporting channel when available.
