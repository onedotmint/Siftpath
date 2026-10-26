# Architecture

One npm package, TypeScript, Node.js 22+. The public tools are only:

```text
web_search({ query, intent?, maxResults? })
web_read({ url, reader?, focus? })
Agent → shared input validation → Router/binding → official MCP → native output envelope
```

## Responsibilities

| Files | Responsibility |
|---|---|
| `inputs.ts`, `tools.ts` | Strict shared inputs, public URL guard, two tool definitions and dispatcher |
| `defaults.ts`, `config.ts` | Official presets, private configuration, credential references and narrow compatibility migrations |
| `setup-plan.ts`, `setup.ts`, `setup-ui.ts` | Shared setup rules, persistence, lazy-loaded Clack UI |
| `extensions/siftpath.mjs` | Pi MCP registration, native menus/status and masked Key input |
| `router.ts`, `client.ts` | Route selection, binding mapping, lazy SDK connections, explicit fallback and lifecycle |
| `output.ts` | Native content, source index, warnings and serialized character budget |
| `diagnostics.ts`, `cli.ts`, `mcp/stdio.ts`, `index.ts` | Explicit probes, CLI, official SDK stdio server and SDK exports |

Runtime dependencies are the official MCP SDK and Zod, including their transitive dependencies. No local fetcher/HTML parser, vendor HTTP adapter, fusion, ranking, cache, sufficiency judgment, hidden follow-up or LLM planner. Providers own retrieval, native extraction, caching and billing.

## Routing and capability checks

Search uses configured intent routes. Reading without `reader` uses `routes.read`; explicit `reader` selects any valid configured provider ID with a read binding and attempts only that provider, never a fallback. New fallbacks are empty; saved explicit chains remain ordered and deduplicated, each provider at most once. Cancellation/overall deadline stops further attempts. No parallel fan-out or automatic retry.

A focused read requires an actual `$focus` mapping in that provider's binding before the business call. Otherwise `FOCUS_UNSUPPORTED` means no call to that provider, not an unfocused success. This is a local binding check, not proof of upstream focus execution: Jina anonymous question may downgrade, and native notes remain. Forwarded focus carries `FOCUS_MAY_OMIT_CONTENT`. Tool guidance asks for exceptions and failure/return conditions, targeted follow-up only for a real evidence gap, or claim-specific uncertainty when evidence/budget is insufficient. A focus request does not prove coverage; guidance does not force a Reader or search before a known-source read. Description compliance and answer accuracy still require live behavior evidence.

Firecrawl's new authenticated preset uses official Streamable HTTP, Bearer header and Markdown/main-content arguments with a constant objective. It does not map focus. Saved stdio/custom connections are not rewritten. The withdrawn mode-based prototype is not a second interface; explicit selection is now `reader`.

## Configuration and lifecycle

Setup preserves saved Keys, custom bindings and usable routes, adds no fallback automatically, and saves complete routes. New/SDK defaults differ from compatibility defaults for existing on-disk v2/v1 files; see [MIGRATION.md](MIGRATION.md). Only the exact old official Jina binding upgrades to 3×250 in memory. No arbitrary provider-table merge or file rewrite on read; anonymous access is explicit, never credential-error recovery.

Pi registers the packaged `dist/cli.js mcp` with `exposure: direct`, exposing only `mcp__siftpath__web_search` and `mcp__siftpath__web_read`. Upstream connections start lazily, share initialization and are reused. Before a tool call, the stdio server checks config revision, replaces the Router when needed and retires the old one after in-flight work. Missing/invalid config does not hide tools; calls explain the configuration error.

Overall deadline defaults to 60s; provider attempts default to 20s including connection, with per-preset/provider overrides. SDK cancellation reaches HTTP fetch/body; shared initialization counts waiting callers, and cancelling the last waiter aborts the pending initialization without interrupting other waiters; responses are bounded to 4 MiB. Disconnection/session 404 clears the cached connection for the next operation, without replay. Shutdown aborts work, closes children/connections and bounds best-effort session DELETE to 2s; concurrent close awaits the same teardown. SDK users call `close()` in `finally`.

## Output and trust

Native text/order are preserved. For the observed `firecrawl_scrape` root `{ markdown, metadata }` envelope, an optional `WebResult.metadata` projects only validated `creditsUsed`, `cacheState` and `cachedAt` before clipping. Valid structured metadata takes precedence; JSON text is a fallback, never summed or merged. The original content is not rewritten. Other tools and unknown/nested layouts remain opaque; webpage text is not searched for usage fields. Structured content is not appended when one JSON text block already contains every field with deeply equal values (object key order irrelevant, array/string content exact); otherwise distinct evidence remains. No fuzzy matching, summary or inferred completeness class.

`sources` indexes public URLs, including outgoing links, not separately fetched or semantically verified citations. Reads preserve the exact requested URL. `retrievedAt` is local processing time. Warnings and the small allowlisted metadata projection are assembled before one final serialized JSON budget pass. Provenance, warnings and metadata count toward the same limit first; the remaining space holds the longest native content prefix (no fixed extra allowance or larger default). Missing/invalid usage is omitted, credits are not currency, and cache hits are not assumed free; the original content may still contain a copy of the projected fields, not an additional charge. `truncated` remains about content, not the provider response. In particular, `truncated` describes local clipping only. Neither a non-focused read nor `truncated:false` proves upstream completeness. The stdio response carries the JSON envelope as text for client compatibility.

Diagnostics intentionally check discovery/output contracts more strictly than normal calls; their private per-config records are not proof of search quality. See [DIAGNOSTICS.md](DIAGNOSTICS.md) and [TESTING.md](https://github.com/onedotmint/Siftpath/blob/main/docs/TESTING.md).
