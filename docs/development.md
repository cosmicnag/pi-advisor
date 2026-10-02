# Development

## Pi 1.0.0 packaging baseline

Development dependencies pin Pi 1.0.0 and TypeBox 1.3.27.
The five host-provided packages use wildcard peers so Pi can supply its own modules.
This does not claim compatibility with every Pi version.
Packaging alone does not prove runtime compatibility or approve a release.

Run dependency installation and project commands only inside Docker Sandboxes.
Do not use host npm, pnpm, or Node to run project code.

## Packaging sandbox

The Phase 1 checks use the existing `pi-advisor-compat-research` Docker Sandbox.
Its mounted workspace is `/tmp/pi-advisor-compat-research.jXV79D`.
The clean project snapshot is `/tmp/pi-advisor-compat-research.jXV79D/phase1`.
Host `node_modules` and credentials are not shared.

Run these host commands from the repository root to refresh the snapshot:

```sh
SANDBOX=pi-advisor-compat-research
WORKSPACE=/tmp/pi-advisor-compat-research.jXV79D/phase1
mkdir -p "$WORKSPACE"
git ls-files --cached --others --exclude-standard -z \
  | tar --null -T - -cf - \
  | tar -xf - -C "$WORKSPACE"
```

If that sandbox no longer exists, create one for the snapshot only:

```sh
sbx create --name "$SANDBOX" --skills off shell "$WORKSPACE"
```

`sbx exec` starts the sandbox when it is stopped.

The sandbox's system Node 22.22.1 was compiled without TypeScript support.
Oxlint needs this support to load `oxlint.config.ts`.
The checks use the official Node 22.22.3 Linux arm64 build inside the sandbox instead.
Install it with a checksum check if the sandbox no longer has it:

```sh
sbx exec --workdir "$WORKSPACE" "$SANDBOX" bash -lc '
  set -e
  mkdir -p /tmp/pi-advisor-node
  cd /tmp/pi-advisor-node
  curl -fLSsO https://nodejs.org/dist/v22.22.3/SHASUMS256.txt
  curl -fLSsO https://nodejs.org/dist/v22.22.3/node-v22.22.3-linux-arm64.tar.gz
  grep " node-v22.22.3-linux-arm64.tar.gz$" SHASUMS256.txt | sha256sum --check -
  tar -xzf node-v22.22.3-linux-arm64.tar.gz
'
```

Check the workspace and run the focused packaging checks:

```sh
sbx exec --workdir "$WORKSPACE" "$SANDBOX" bash -lc '
  set -e
  pwd
  mkdir -p /tmp/pi-advisor-bin
  corepack enable --install-directory /tmp/pi-advisor-bin
  export PATH="/tmp/pi-advisor-node/node-v22.22.3-linux-arm64/bin:/tmp/pi-advisor-bin:$PATH"
  pnpm install --frozen-lockfile
  pnpm exec vitest run tests/contract/release-surface.test.ts tests/e2e/package-host-dependencies.test.ts
  pnpm pack:validate
'
```

The managed-install test uses the pinned npm development dependency through Pi's package manager.
It may need registry access for `yaml`; it does not make model-provider calls.
It verifies command registration, not functioning Advisor reviews.

For an intentional dependency change, run `pnpm install --no-frozen-lockfile` inside the sandbox and copy the generated lockfile back:

```sh
cp "$WORKSPACE/pnpm-lock.yaml" pnpm-lock.yaml
```

Copy any intended source edits or formatter changes back before checking the final diff.
Stop without deleting the sandbox:

```sh
sbx stop "$SANDBOX"
```

No development server, port mapping, or local URL is used by these packaging checks.

## Runtime sandbox checks

Phase 2 uses the same sandbox with a separate snapshot at `/tmp/pi-advisor-compat-research.jXV79D/phase2`.
This preserves the reviewed Phase 1 snapshot.
Refresh the runtime snapshot and run the checks:

```sh
SANDBOX=pi-advisor-compat-research
WORKSPACE=/tmp/pi-advisor-compat-research.jXV79D/phase2
mkdir -p "$WORKSPACE"
git ls-files --cached --others --exclude-standard -z \
  | tar --null -T - -cf - \
  | tar -xf - -C "$WORKSPACE"
sbx exec --workdir "$WORKSPACE" "$SANDBOX" bash -lc '
  set -e
  export PATH="/tmp/pi-advisor-node/node-v22.22.3-linux-arm64/bin:/tmp/pi-advisor-bin:$PATH"
  pnpm install --frozen-lockfile
  pnpm verify
  pnpm test:e2e
  pnpm pack:validate
'
```

These checks use scripted providers and local HTTP capture servers inside the sandbox.
They do not verify live model services or the rendered Pi interface.
No host port mapping or local preview URL is needed.
Use the same `sbx stop "$SANDBOX"` command above to stop the sandbox without deleting it.
The complete checks and independent review remain required before release.
