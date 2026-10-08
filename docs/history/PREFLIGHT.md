# Historical delivery preflight

The current project is **Siftpath** at `onedotmint/Siftpath`. The checks below record the original SmartSearch delivery environment and historical target, not the current repository state.

Historical target: onedotmint/smartsearch. Inspected main via the authenticated GitHub connector at
`a6e310d8c51d1fb9eb454d27afbbc3f81cc2e61a` (package version 1.0.3).

This is a new canonical reconstruction tree, not a successful clone of upstream history.
The original runtime is replaced as requested. Upstream is inspected through the connector;
no remote repository writes have been performed. All implementation checkpoints will be local.

| Check | Result |
| --- | --- |
| Node | 22.16.0 |
| npm | 10.9.2 |
| TypeScript | 5.8.3 globally installed |
| pnpm | Not installed; use npm, no workspace manager required |
| git | Available; local identity configured for implementation commits |
| Initial tree | Empty; one canonical tree, no parallel worktrees |
| git clone https://github.com/onedotmint/smartsearch.git | Failed: Could not resolve host: github.com |
| curl -I --max-time 15 https://registry.npmjs.org/typescript | Failed: Could not resolve host: registry.npmjs.org |
| GitHub connector | Read access succeeds |
| Provider credentials | No supported provider credential environment variables present |
| rsync / zip / unzip / tar | Available; zip creation and extraction test passed |
| ssh | Not installed; not needed for this Web Evidence Engine |
| Daytona | Not configured; not part of this project's runtime |
| Destination | /mnt/data, writable |

The attached delivery addendum includes Outboard/SSH/Daytona examples. Its checkpoint,
verification and packaging rules are applied here, not its unrelated product architecture.
External DNS/credentials will not block code, deterministic tests, or packaging.
Exact subsequent verification commands and outcomes are recorded in DELIVERY.md.

## Dependency verification follow-up

`npm install --package-lock-only --ignore-scripts --offline` with no linked local
modules failed with `ENOTCACHED` because the Node type metadata was unavailable.
A prior run with local symlinks produced nonportable absolute lock entries and was
explicitly rejected, not shipped. The delivered lockfile pins registry tarballs.
Two type-only integrity hashes could not be fetched; no hash was fabricated.

Build/tests use TypeScript 5.8.3 and Node types 22.19.7 already available in the
container. The ignored links are only a verification aid, not distributed code or
a claim of successful fresh npm installation. Final artifact install verification
uses the compiled zero-runtime-dependency tarball independently of those links.
