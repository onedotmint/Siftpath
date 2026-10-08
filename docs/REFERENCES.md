# References and actual reuse

Inspected during implementation, October 8, 2026. These references do not imply a copied codebase or live verification. The six external donor projects below were read at README level; this delivery uses the specified design ideas, not borrowed implementation files.

| Donor | Material actually inspected | Adopted idea | Deliberately omitted |
| --- | --- | --- | --- |
| [EvidenceKit](https://github.com/npow/evidencekit) | README | role adapters, timeout isolation, bounded retry, partial success, dedup, telemetry | 12-provider fanout, large policy system |
| [OpenDeepSearch](https://github.com/sentient-agi/OpenDeepSearch) | README | fast/quality separation, reranking, evaluation emphasis | full research agent, local models |
| [Exa MCP](https://github.com/exa-labs/exa-mcp-server) | README | small default search/fetch surface, plugin distribution | advanced research tools and provider-specific agent parameters |
| [Tavily MCP](https://github.com/tavily-ai/tavily-mcp) | README | separate search/extract, remote authentication experience | large vendor schema, API keys in shared URLs |
| [mcp-omnisearch](https://github.com/spences10/mcp-omnisearch) | README | skip missing providers, unified surface, deployment guidance | provider exposed as an AI tool selector |
| [Trawl](https://github.com/bbulb/trawl) | README | query-aware passage extraction, budget, transparent injection scan, degraded execution | browser framework, local embeddings/reranker |

## Historical source: SmartSearch (before Siftpath)

Repository: https://github.com/onedotmint/smartsearch

Inspected main SHA: `a6e310d8c51d1fb9eb454d27afbbc3f81cc2e61a`.

- `package.json`: original package identity/version and Node/Python wrapper distribution.
- `LICENSE`: copied verbatim, retaining GuDaStudio's copyright.
- `src/smart_search/providers/brave.py`: explicit optional freshness, subscription-token authentication, shared HTTP/retry/error treatment. New code retains the behavior concept in the unified Node HTTP layer; no Python runtime is shipped.
- `src/smart_search/providers/exa_reader.py`: contents role/auth/error isolation. The new adapter is batched and uses documented `urls`, explicit text, and query highlights rather than the old one-URL wrapper.
- `benchmarks/fixtures/retrieval_replay/brave-exa-shared-url.json`: preserved data, now exercised through new Brave/Exa adapters and the shared engine.
- `benchmarks/retrieval_queries.jsonl`: all 49 queries/categories/intent labels preserved under `benchmarks/fixtures/legacy/`. These are historical prompts, not current answers or measured live quality.

Original Python security/cache/evaluation/release implementations were **not copied**. New shared equivalents and Node tests replace runtime responsibilities. Do not describe the old release workflow or security implementation as reused code.

## Primary API contracts

- Exa search: https://exa.ai/docs/reference/search
- Exa Contents: https://exa.ai/docs/reference/get-contents
- Parallel Search: https://docs.parallel.ai/api-reference/search/search
- Parallel OpenAPI: https://docs.parallel.ai/public-openapi.json
- Tavily search: https://docs.tavily.com/documentation/api-reference/endpoint/search
- Tavily extract: https://docs.tavily.com/documentation/api-reference/endpoint/extract
- Brave web search: https://api-dashboard.search.brave.com/api-reference/web/search/get
- Firecrawl v2 scrape: https://docs.firecrawl.dev/api-reference/endpoint/scrape
- Jina reranker: https://jina.ai/reranker/
- Cloudflare Clef-flash: https://developers.cloudflare.com/workers-ai/models/clef-flash/

Contracts can change; live tests remain necessary before publishing a release backed by a production account.

## Host contracts

- Pi native extension documentation and hello example: https://github.com/earendil-works/pi/tree/main/packages/coding-agent
- Pi package installation: https://pi.dev/docs/latest/packages
- OpenAI portable/local plugin packaging: https://developers.openai.com/plugins/build/plugins
- Agent Plugins schemas: https://agent-plugins.org/schemas/1.0.0/plugin.schema.json and https://agent-plugins.org/schemas/1.0.0/mcp.schema.json
- Claude plugin manifest: https://code.claude.com/docs/en/plugins-reference
- Cursor native plugin reference: https://cursor.com/docs/reference/plugins
- Cursor local installation: https://prod.cursor.com/docs/plugins
- MCP transports: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports

The DeepSeek bundle deliberately depends only on portable skills and standard MCP, not a guessed native extension contract. Official host installation/GUI behavior was not executed here.
