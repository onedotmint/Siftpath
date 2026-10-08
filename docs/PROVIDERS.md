# Providers

All seven adapters are implemented and have mocked HTTP contract tests. This documentation update did not run those tests or any live provider checks. The earlier delivery's credential/DNS limitations and verification record are archived in [history/DELIVERY.md](history/DELIVERY.md); they are not fresh results for this checkout. "Implemented" does not mean "vendor account or billing verified."

| Provider | Roles | Credentials | Adapter |
| --- | --- | --- | --- |
| Exa | Search; Contents extract | EXA_API_KEY | src/providers/exa.ts |
| Parallel | Search; Extract | PARALLEL_API_KEY | src/providers/parallel.ts |
| Tavily | Search; Extract | TAVILY_API_KEY | src/providers/tavily.ts |
| Brave | Search only | BRAVE_API_KEY | src/providers/brave.ts |
| Firecrawl | Scrape/extract fallback | FIRECRAWL_API_KEY | src/providers/firecrawl.ts |
| Jina | Hosted passage reranking | JINA_API_KEY | src/providers/jina.ts |
| Cloudflare | Optional sufficiency decision | CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN | src/providers/cloudflare.ts |

Exa uses `/search` and `/contents`, with `x-api-key`, explicit text extraction and query highlights. Parallel uses `/v1/search` and `/v1/extract`, advanced source policy, and objective-focused excerpts. Tavily uses Bearer search/extract, disables generated answers, and supports URL batches. Brave sends explicit freshness only when requested, restricts domains with encoded site clauses, and never guesses a publication timestamp from a relative age label.

Firecrawl uses v2 synchronous scrape. Batch orchestration is bounded at three concurrent requests; per-URL failure does not discard successful siblings. It does not add a browser framework or persistent scrape-job orchestrator.

Jina defaults to `jina-reranker-v3.5`; `jinaModel` can override the model. Scores must have valid unique document indices. Cloudflare defaults to `@cf/cloudflare/clef-flash` (or `clef`), with typed `noul` questions and numeric probability answers. Clef is not an answer generator, router, or query planner. Its response may only recommend one further bounded retrieval round.

Adapter APIs were checked against the primary documentation linked in REFERENCES.md on October 8, 2026. Live tests intentionally remain a release gate for these evolving service contracts.

Missing keys skip the provider. Invalid optional Cloudflare configuration marks it invalid and leaves retrieval usable. A configured key is not proof of validity: `doctor` reports configuration readiness without billable requests. Authentication, rate limits, malformed data, timeouts, and oversized responses are distinct warnings/errors.

Only reported provider costs are exposed, and may be estimates. Most adapters currently do not return comparable cost data; omitted cost means unknown, not free. No stale hardcoded pricing table is included.

## New adapters

Implement an existing role contract, normalize output with the shared helpers, and register it in `config.ts`. Add mocked request/response contracts and opt-in live checks. Do not add vendor names or special cases to `core/`, host integrations, or AI-facing schemas. Jev is not implemented in this prerelease; it can implement a future role adapter without changing these boundaries.
