# Architecture

## One package, four boundaries

```
src/core/          typed contracts + deterministic evidence pipeline
src/providers/     hosted HTTP adapters + shared response normalization
src/tools.ts       three compact schemas + shared invocation
src/cli.ts         terminal boundary
src/integrations/  Pi boundary
src/mcp/           shared JSON-RPC dispatcher + stdio / HTTP transports
skills/            one canonical instruction bundle
integrations/      generated host manifests, commands, and skill copies
```

There are no workspace packages, inheritance framework, local inference servers, vector databases, LLM routers, or planner DSLs. Native tools and MCP call the same engine. Host-specific manifests are generated; retrieval code is not copied between integrations.

## Pipeline

`search`: validate -> deterministic selection -> bounded parallel requests -> canonical/RRF fusion -> domain diversity -> budgeted candidates.

`fetch`: validate public URLs / resolve session IDs -> query-keyed TTL cache -> batch extract -> one alternate for unresolved URLs -> clean/scan/chunk -> lexical rank -> fit budget.

`gather`: search -> select URLs -> fetch -> preserve useful search excerpts when extraction fails -> lexical rank -> optional hosted rerank -> budget -> optional sufficiency check -> at most one supplementary round -> fit final pack.

An operation fails only when it has no usable evidence, invalid input/configuration, explicit cancellation, or insufficient space even for essential provenance. Provider failures normally become typed warnings. Global deadline expiration returns partial evidence when available; explicit user cancellation rejects with `ABORTED`.

## Contracts and provenance

`SearchProvider`, `FetchProvider`, `RerankProvider`, and `DecisionProvider` are small function contracts in `core/types.ts`. Capabilities are typed booleans. Adapter response validation, auth, URL endpoints, date filters, and vendor field mapping stay outside core.

`Candidate.origins` retains contributing providers, original URLs, ranks, and available vendor IDs. `Evidence` carries its own source URL and identifier. Cosmetic near-duplicate candidates may share a representative; their origins remain distinct. Text from a different URL is not concatenated into the representative's excerpt. Evidence text deduplication retains a representative rather than claiming several URLs said identical things independently.

Canonical identities remove common tracking parameters, normalize query order and fragments, and retain meaningful query parameters. Requests use the original URL, not a rewritten signed URL. Domain diversity uses a small conservative suffix table, not a full public-suffix parser. Search with explicit domain filters permits same-domain results; quality gather caps passages per domain.

## Routing and bounds

Normal fast search selects one provider. If empty/failed, it can try one alternate. Quality selects at most two per round. Optional decision insufficiency can use previously unused providers in one additional round; the query is not rewritten and the decision model cannot plan tools.

Selection first excludes missing capabilities, then compares configured priority, optional SDK quality score, latency estimate, and deterministic ID tie-break. Built-in priorities are provisional Exa/Parallel/Tavily/Brave; they are **not validated winners from a live benchmark**. No hidden query-intent taxonomy changes them.

Default deadlines: 25 seconds per operation, 8 seconds per provider attempt. At most one retry for retryable HTTP/network failures; backoff is bounded by the same cancellation scope. Firecrawl maps a requested batch into at most three concurrent synchronous scrape calls. Extract fallback retries unresolved URLs only.

Search cache: 60 seconds. Page cache: 5 minutes, keyed by canonical URL and extraction query. Both are bounded at 256 entries by default, copy on storage/read, and process-local. Result IDs last up to one hour within a bounded 1,024-entry index. No persistent search history, Redis, or distributed cache is created.

## Budgets and coverage

The budget accounts for the complete serialized result, including source metadata, warnings, and usage. Character-based token estimation is a conservative heuristic, not a guarantee for any model tokenizer. Supply `new EvidenceEngine({providers, countTokens})` to enforce a specific tokenizer's count. Counts must be nonnegative safe integers.

Passages are selected query-first and domain-interleaved. When a pack is too large, budget handling prefers compact, relevant complete units using the existing relevance and serialized unit cost. Non-normative prose may retain a continuous multi-sentence prefix at native sentence boundaries; normative evidence units remain whole; Markdown/ASCII tables use row boundaries, and recognized code blocks remain whole. Such prefixes stay marked `truncated`: a sentence boundary is not a semantic completeness guarantee. Unsafe-to-shorten or lower-value units may be omitted. Source entries are synchronized to retained evidence, and any budget reduction invalidates prior good coverage. A single unit that cannot safely fit with provenance reports `BUDGET_TOO_SMALL` instead of returning broken text. Fenced code stays whole during passage creation, and split basic tables retain their headers. Provider input clipping, excerpt-only clipping and forced oversized ordinary-paragraph splitting are also disclosed; fetched text gets the cleanup allowance before auxiliary highlights.

Heuristic coverage combines lexical query coverage and source diversity. Clef can add a sufficiency judgment, but is optional. Neither certifies truth, detects all contradiction, or guarantees source independence. The consuming agent must examine dates and evidence and cite actual source URLs.

## Transport and privacy boundary

Stdio is local. HTTP is a bounded, single-tenant, authenticated service with a shared server token, one in-memory engine, bounded concurrent requests, request size limits, host/origin checks, and explicit cancellation. The HTTP endpoint is modern `2026-07-28` only (no legacy sessions). It implements Streamable HTTP JSON response mode, not legacy SSE or an OAuth identity platform. HTTPS and stronger multi-user identity belong at the deployment boundary.

Provider keys come from the private user configuration/environment and never enter tool schemas. The CLI stores only latest-operation usage, not query or page content. SDK/Pi usage is session-local. Trace is opt-in and omits provider payloads/credentials. See SECURITY.md for limitations.

Plain `.txt` URLs do not infer Markdown section metadata: RFC ABNF hash lines are not headings. Explicit page sections remain available; ambiguous sections are omitted rather than invented. Evidence text and citation identity are unchanged.
