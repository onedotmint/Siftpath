# Changelog

## 2.2.0-dev.0 — unpublished development candidate

- Add an opt-in direct DeepSeek Search API backend without changing saved routes or enabling new services automatically.
- Add a separately packaged native DSH search backend and `siftpath_read` tool with the existing `reader` / `focus` contract.
- Preserve the two core MCP tools, the Pi extension and the existing default output budget.
- This candidate is not published. Core offline checks and 17 DSH functional tests pass, but the pinned DSH host dependency audit blocks complete integration/release acceptance. No overrides or suppressed security gates are applied; live acceptance is separate.

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
