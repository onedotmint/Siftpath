# Changelog

## 2.2.0 — feature release

Backward-compatible release from 2.1.1. Publication is confirmed by the npm registry and Git release, not this source version.

- Add an opt-in direct DeepSeek Search API backend without changing saved routes or enabling new services automatically.
- Add a separately packaged native DSH search backend and `siftpath_read` tool with the existing `reader` / `focus` contract. **This bundle is not published**: its pinned host dependency audit fails the High/Critical gate. The core package is unaffected because it uses its own patched Zod/MCP dependencies.
- Preserve the two core MCP tools, the Pi extension, the default routes and the existing default output budget.
- Report `omittedChars` whenever the output budget clips a body, so an agent can tell it holds a prefix and how much of the end was cut; the count is rounded together with the prefix so it never overflows `maxOutputChars`.
- Classify an observable upstream 402 as `BALANCE_EXHAUSTED` and an observable 429 as `RATE_LIMITED` instead of folding both into `UPSTREAM_ERROR`. Only a status code is read (`structuredContent.error.status`, or an `HTTP <code>` prefix in a text block) — never provider wording, so no ban, plan or entitlement is inferred.
- Stop `status` from contradicting itself: a recorded provider failure now appears in `Next:` as `Last test failed: <provider>(<code>)`. A failure recorded before a package upgrade or configuration change is still listed but labelled with why it may no longer describe the current setup.
- Name every attempt when no provider succeeds: `Each attempt failed: jina(BALANCE_EXHAUSTED), jina-backup(AUTH_FAILED).` A single generic sentence made users re-check everything when the actionable cause was already known.
- Document multi-account redundancy as configuration rather than a feature: a second account is another provider plus a fallback entry, keeping the failing account visible in `warnings`. No automatic account rotation and no balance polling are added — whether a 402 means transient throttling, an exhausted plan or genuine non-payment is decided by the operator, not guessed locally.
- Document what Siftpath cannot see, because it forwards reader responses rather than fetching pages itself: a 404, an anti-bot block or empty boilerplate from a reader still arrives as `isError: false`, raw HTML is passed through uncleaned, and a focus miss is not reported as `NOT_FOUND`.
- See [release notes](docs/RELEASE-2.2.0.md) for compatibility and known limits.
## 2.1.1

Maintenance update from 2.1.0. Publication is confirmed by the npm registry and Git release, not this source version.

- Distinguish credential rejection from observable upstream tool refusals without exposing raw errors or guessing the provider's reason; make explicit Reader failure messages actionable.
- Show binding-level focus support offline and distinguish package upgrades, configuration changes and unknown causes when historical tests become stale.
- Update the locked dependency tree for the body-parser advisory; gate releases on production High/Critical findings and record the full development-tree audit separately.
- Verify both locked production installs and clean consumer tarball installs, including dependency isolation, CLI/SDK/MCP and real Pi registration without inference.
- Cover Linux/Windows × Node 22/24/26 and npm 11/12; update build tooling while retaining Node 22 as the minimum runtime.
- Keep the two-tool API, saved routes/credentials, default Reader and 16,000-character output budget unchanged. See [release notes](docs/RELEASE-2.1.1.md) for compatibility and known limits.

## 2.1.0 — 2026-10-27

Published backward-compatible update from 2.0.1.

- Keep the two-tool API: `web_search` and `web_read`.
- Recommend Tavily for general/research search and Exa for semantic discovery; retain Jina as the default Reader and support an explicit configured `reader`, including Firecrawl, without fallback.
- Use official authenticated Firecrawl HTTP MCP for new setups; preserve existing stdio/custom bindings, credentials, routes and legacy configurations.
- Preserve native evidence and exact mirror deduplication; retain validated Firecrawl usage/cache metadata within the existing output budget.
- Improve cancellation of shared cold connections and validate calendar timestamps.
- Clarify focus, completeness and evidence limits without adding orchestration or a fact-checking model. Keep historical diagnosis fixtures in Git, outside npm.
- Verify isolated production-only packages and real Pi 1.4.0 tool registration without model inference.

Known limits: the default 16,000-character serialized budget can clip long documents, upstream extraction may be incomplete, and successful tool calls do not guarantee accurate model answers. See [release notes](docs/RELEASE-2.1.0.md) for compatibility and details.
