# Configuration

The package is `@onedotmint/siftpath`, the primary CLI is `siftpath`, and project environment variables use `SIFTPATH_*`. Legacy CLI/Pi commands and `SMARTSEARCH_*` variables remain limited compatibility aliases; new variables take precedence. Provider credential names do not change. See [MIGRATION.md](MIGRATION.md); no keys or configuration files are automatically moved.

## One-time setup

`siftpath setup` detects existing environment keys, displays available roles, and offers masked interactive credential entry. Press Enter to keep an existing value. It writes a private JSON file outside the workspace. `siftpath setup --non-interactive` does not prompt and does not persist environment secrets.

Explicit path precedence: `SIFTPATH_CONFIG` > the compatibility alias `SMARTSEARCH_CONFIG` > default selection. Use a nonempty path for an override; setting the new variable, even to an empty value, prevents fallback to the old variable. An explicit missing file does not trigger a legacy-default lookup.

The default is `$XDG_CONFIG_HOME/siftpath/config.json`, or `~/.config/siftpath/config.json` when XDG_CONFIG_HOME is unset. For compatibility, if that new default file does not exist but `smartsearch/config.json` under the same configuration root does, continue reading and writing the old file in place. If both exist, choose the new file; do not merge or move either file. If neither exists, setup uses the new default. Nonempty provider environment credentials override saved credentials. Workspace `.env` files are not automatically loaded.

```json
{
  "version": 1,
  "credentials": {"EXA_API_KEY": "replace-in-private-user-config-only"},
  "disabled": [],
  "priorities": {"exa": 10, "parallel": 20, "tavily": 30, "brave": 40, "firecrawl": 90},
  "timeoutMs": 25000,
  "providerTimeoutMs": 8000,
  "jinaModel": "jina-reranker-v3.5",
  "clefModel": "clef-flash"
}
```

Unknown fields and malformed values are rejected without echoing credential values. Timeouts are integer milliseconds between 1 and 120,000; priorities are numeric 0-1,000. A smaller priority is selected first. Omit all providers you do not use. The configuration can be empty when keys come from the environment.

Environment names: `EXA_API_KEY`, `PARALLEL_API_KEY`, `TAVILY_API_KEY`, `BRAVE_API_KEY`, `FIRECRAWL_API_KEY`, `JINA_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`. `CLOUDFLARE_AUTH_TOKEN` is accepted as a fallback alias. These credentials are not interchangeable.

Files created by setup use atomic replacement and mode 0600 on POSIX, with newly created private directories at mode 0700. Symlink targets are rejected. Existing parent-directory permissions and Windows ACLs remain the operating system/user's responsibility. This is private plaintext storage, not an OS keychain.

## Diagnostics

`siftpath doctor` reports runtime version, configuration presence, provider readiness, and deterministic routes. It makes no network calls. Exit 2 means no configured search or fetch role, or an unsupported runtime; a missing optional reranker/decision provider alone is not an error. `--json` gives a machine-readable report.

`siftpath providers` lists roles and states. `siftpath usage` reads only the last CLI operation; it is not cumulative billing. `engine.usage()` and `/siftpath-usage` in Pi retain in-process totals. Pi also exposes `/siftpath-doctor`. `--trace` writes provider timing/call/retry/cache events to stderr for CLI and MCP, not into returned agent evidence.

## HTTP serving

```bash
# Generate a random token and set it through your secret manager or protected environment.
export SIFTPATH_SERVER_TOKEN='replace-with-a-random-secret-at-least-24-characters'
siftpath mcp --http --host 127.0.0.1 --port 7337
```

`SIFTPATH_ALLOWED_HOSTS` is an optional comma-separated list of reverse-proxy Host headers. `SIFTPATH_ALLOWED_ORIGINS` explicitly allows browser origins; none are allowed by default. Corresponding `SMARTSEARCH_*` names are compatibility fallbacks only, with `SIFTPATH_*` taking precedence. Requests need `Authorization: Bearer ...`. Binding a non-loopback address does not create TLS. Terminate HTTPS with a properly configured reverse proxy and restrict inbound access.

The server is single-tenant. Do not expose a shared provider account to multiple untrusted users merely by distributing its bearer token. Multi-tenant per-user credentials, OAuth authorization/discovery, public ChatGPT registration, and hosted billing are not implemented.

## Output and caching

`fetch` accepts 1-20 URLs or session-scoped result IDs. `maxTokens` is 256-20,000 for fetch/gather. Search deliberately keeps a fixed compact budget and only exposes query, maxResults, recency, domains, and mode. Recency accepts `day`, `week`, `month`, `year`, an amount such as `7d`/`24h`, or a valid ISO calendar date. Domain filters are hostnames, not arbitrary URL expressions.

HTTP accepts only MCP `2026-07-28`; legacy MCP clients use `siftpath mcp` via stdio. The SDK supports custom timeouts/tokenizers/cache TTLs through `EvidenceEngine`. Process-local caches disappear when the CLI exits. For reuse and `resultIds`, keep one SDK engine, Pi instance, or stdio MCP connection alive. Modern HTTP reuses its bounded in-memory index within the same running process, not across restarts.

## Experimental local evidence ranking

The optional `evidenceRanking` configuration key accepts `legacy` (default) or `bm25`. For a one-command trial use `SIFTPATH_EVIDENCE_RANKING=bm25 siftpath gather "your question"` instead of editing configuration. This setting also applies to Pi/MCP when read from the user configuration. It changes only the ordering of extracted evidence passages; search source selection, providers, tool schemas and network behavior are unchanged. No model, background service, dependency, or index is added. Remove the key/environment override to revert immediately. See `npm run bench:bm25` for a synthetic A/B test; it is not a real-world quality guarantee.
