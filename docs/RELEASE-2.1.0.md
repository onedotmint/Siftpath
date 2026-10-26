# Siftpath 2.1.0 release notes

Status: release candidate, not yet tagged or published. The package version does not establish npm publication. Formal Tag, GitHub Release and npm publication require explicit maintainer confirmation after final acceptance.

## Search and reading

- Recommended search pair: **Tavily** for general/research and **Exa** for semantic discovery. Brave remains available in advanced setup; new configurations do not enable it or add fallback routes.
- Two Readers: **Jina** remains the default; **Firecrawl** is explicitly selectable. `web_read({ url, reader?, focus? })` and CLI `read URL --reader ID` accept any valid configured provider ID with a read binding, including custom providers. Omitting `reader` uses saved read routes; selecting one attempts only that provider, without fallback or automatic enablement.
- New authenticated Firecrawl setup uses the official HTTP MCP endpoint `https://mcp.firecrawl.dev/v2/mcp` with Bearer authentication, native Markdown and `onlyMainContent`. Existing stdio or custom connections are not rewritten.

## Evidence and reliability

- Exact mirrored text/structured output is emitted once; distinct evidence, original URLs, native notes and warnings remain. No fuzzy deduplication or local summarization.
- Known Firecrawl responses preserve optional `creditsUsed`, `cacheState` and valid `cachedAt` metadata within the existing serialized output budget. Missing usage stays unknown; cache hits are not assumed free.
- Focus support is checked against the actual binding before a business request; unsupported focus does not silently become a full-page read. Provider-side extraction downgrades can still occur.
- Cold connection initialization is aborted when its final waiting caller cancels or times out, without cancelling other waiters. Impossible calendar timestamps are rejected.
- npm ships runtime files and Markdown documentation, not historical raw JSON reports, source/tests, credentials or development dependencies. Windows fixtures retain their original bytes.

## Compatibility

This is a backward-compatible feature release relative to 2.0.1. The two MCP tool names, CLI/SDK entry points, legacy config paths and environment aliases remain. Existing routes, explicit fallback order, Keys and custom bindings are preserved; new recommended defaults do not rewrite old configurations. Environment Keys remain environment-only. Authentication errors never trigger anonymous fallback. The former experimental `mode` interface was withdrawn before this release and is not a supported API. See [migration](MIGRATION.md) for precise legacy defaults and narrow Jina binding migration.

Node.js 22+ is required, unchanged from 2.0.1. Upgrade the package, then restart Pi or `/reload`. Uninstalling does not remove saved credentials.

## Known limits and acceptance

- The default **16,000-character serialized JSON budget** (not tokens) can clip long bodies and omit decisive evidence. Changing Reader does not solve this limit. `truncated` reports local clipping only, not upstream completeness.
- Source indexes may include unfetched outgoing links. Focus mapping and successful calls do not prove complete or correct evidence.
- Engineering acceptance, authenticated provider calls, Pi Agent workflow and npm package verification are separate gates; see [testing](TESTING.md) for dated evidence. Four providers have prior authenticated business successes, but the previous autonomous Agent attempt timed out before any Siftpath tool call. It is not a passing workflow test or proof of an implementation defect.
- New paid model/provider acceptance requires a separate explicit budget authorization. Release preparation does not silently retry, change models, use anonymous access or add fallback routes.
