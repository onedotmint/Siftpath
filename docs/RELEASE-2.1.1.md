# Siftpath 2.1.1 release notes

Maintenance candidate after 2.1.0. This source version is not proof of publication: final candidate CI, package artifact/hash checks, npm authentication and explicit maintainer confirmation remain release gates.

## Fixes and diagnostics

- Classify observable tool-level upstream 401/403 statuses as `AUTH_FAILED` / `UPSTREAM_FORBIDDEN` instead of a generic `UPSTREAM_ERROR`. Raw provider errors and credentials remain private; a 403 does not establish whether the cause is a plan, permission or suspended access. No anonymous credential-error recovery is added.
- Give actionable provider-specific messages for explicit Reader failures and a sole `FOCUS_UNSUPPORTED` cause. Default-route failures may still return `NO_PROVIDER_SUCCEEDED` with underlying diagnostics.
- Show whether a saved read binding maps `$focus` in offline CLI/Pi status. This checks the binding, not whether an upstream extraction will be complete or correctly focused.
- Distinguish historical test results made stale by a package upgrade, a configuration change or an unknown cause. Upgrading no longer falsely tells users their configuration changed.

## Dependencies and release checks

- Update the locked dependency tree for the body-parser advisory. Production High/Critical audit findings block release; full-tree findings, including development tooling, are reported separately. An unavailable audit is a failed check.
- Verify the actual tarball both against the repository lockfile and as a clean consumer install without that lockfile. Check production-only dependency isolation, CLI, SDK exports, MCP tool schemas and real Pi 1.4.0 registration without inference. These checks do not call providers or models; consumer installation and auditing can access the npm registry.
- Update TypeScript, esbuild and GitHub Actions tooling. Functional CI covers Linux/Windows × Node 22/24/26, with separate npm 11/12 compatibility checks. Node.js 22 remains the minimum runtime and Node 22 types remain the development baseline.
- Keep MCP SDK v1; no SDK v2 migration, new runtime dependency or new research layer is included. See [dependency assessment](DEPENDENCIES.md).

## Compatibility and upgrade

The `web_search` / `web_read` inputs, default routes, explicit Reader selection and fallback rules are unchanged. Saved Keys, custom bindings, routes and legacy configuration compatibility remain; no configuration rewrite or setup rerun is required. Upgrade the package, then restart Pi or `/reload`.

Status adds `focus` and optional `lastTestStaleReason`. Existing diagnostic history stays readable; records without the new configuration fingerprint are conservatively marked stale with an unknown cause. Consumers matching error codes should handle `AUTH_FAILED` / `UPSTREAM_FORBIDDEN` where observable upstream tool errors previously produced `UPSTREAM_ERROR`. Do not parse human-readable error messages as an API. See [diagnostics](DIAGNOSTICS.md) and [migration](MIGRATION.md).

## Known limits and acceptance

- The default serialized JSON budget remains **16,000 characters**, not tokens. Long bodies can lose decisive evidence; `truncated` describes local clipping only, not upstream completeness.
- A supported focus binding, an untruncated response or a successful call does not guarantee complete evidence or an accurate model answer. Source indexes can contain unfetched outgoing links.
- This maintenance preparation reuses historical live evidence and does not run paid model/provider acceptance. Current candidate checks and historical evidence are recorded separately in [testing](https://github.com/onedotmint/Siftpath/blob/main/docs/TESTING.md).
