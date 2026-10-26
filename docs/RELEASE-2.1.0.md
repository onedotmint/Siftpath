# Siftpath 2.1.0 release notes

Publication is gated on the final main commit passing CI, matching package artifacts, npm authentication and explicit maintainer confirmation. These notes and the package version do not establish publication.

## Search and reading

- Recommended search pair: **Tavily** for general/research and **Exa** for semantic discovery. Brave remains available in advanced setup; new configurations do not enable it or add fallback routes.
- Two Readers: **Jina** remains the default; **Firecrawl** is explicitly selectable. `web_read({ url, reader?, focus? })` and CLI `read URL --reader ID` accept any valid configured provider ID with a read binding, including custom providers. Omitting `reader` uses saved read routes; selecting one attempts only that provider, without fallback or automatic enablement.
- New authenticated Firecrawl setup uses the official HTTP MCP endpoint `https://mcp.firecrawl.dev/v2/mcp` with Bearer authentication, native Markdown and `onlyMainContent`. Existing stdio or custom connections are not rewritten.

## Evidence and reliability

- Exact mirrored text/structured output is emitted once; distinct evidence, original URLs, native notes and warnings remain. No fuzzy deduplication or local summarization.
- Known Firecrawl responses preserve optional `creditsUsed`, `cacheState` and valid `cachedAt` metadata within the existing serialized output budget. Missing usage stays unknown; cache hits are not assumed free.
- Focus support is checked against the actual binding before a business request; unsupported focus does not silently become a full-page read. Provider-side extraction downgrades can still occur. Concise tool guidance distinguishes local clipping from completeness and asks for conditions, targeted follow-up or claim-specific uncertainty; it is not a model accuracy guarantee.
- Cold connection initialization is aborted when its final waiting caller cancels or times out, without cancelling other waiters. Impossible calendar timestamps are rejected.
- npm ships runtime files and selected user documentation, not historical experiment/acceptance reports, raw fixtures, source/tests, credentials or development dependencies. Windows fixtures retain their original bytes.

## Compatibility

This is a backward-compatible feature release relative to 2.0.1. The two MCP tool names, CLI/SDK entry points, legacy config paths and environment aliases remain. Existing routes, explicit fallback order, Keys and custom bindings are preserved; new recommended defaults do not rewrite old configurations. Environment Keys remain environment-only. Authentication errors never trigger anonymous fallback. The former experimental `mode` interface was withdrawn before this release and is not a supported API. See [migration](MIGRATION.md) for precise legacy defaults and narrow Jina binding migration.

Node.js 22+ is required, unchanged from 2.0.1. Upgrade the package, then restart Pi or `/reload`. Uninstalling does not remove saved credentials.

## Known limits and acceptance

- The default **16,000-character serialized JSON budget** (not tokens) can clip long bodies and omit decisive evidence. Changing Reader does not solve this limit. `truncated` reports local clipping only, not upstream completeness.
- Source indexes may include unfetched outgoing links. Focus mapping and successful calls do not prove complete or correct evidence.
- Authenticated business calls to Tavily, Exa, Jina and Firecrawl have succeeded. Real Pi sessions have demonstrated autonomous search, reading, explicit Reader selection and final answers. Historical transport/harness failures remain recorded but no longer describe the latest workflow evidence; see [testing and history](https://github.com/onedotmint/Siftpath/blob/main/docs/TESTING.md). Tool-chain success is not a guarantee of answer accuracy.
- Upstream focus may omit exceptions; models can misread evidence that was returned intact or infer unsupported details. These are documented model/upstream limits, not a new research or fact-checking layer in Siftpath. This release preparation reuses existing live evidence and runs no paid model/provider acceptance. Formal publication still requires maintainer confirmation.
