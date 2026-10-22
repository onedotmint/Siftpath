# Siftpath

Siftpath is a small TypeScript/Node.js 22+ MCP router for AI agents. It exposes exactly two model-facing tools:

- `web_search({ query, intent?, maxResults? })`
- `web_read({ url, focus? })`

It does not search, parse HTML, chunk, rerank, merge, or run an LLM. It lazily connects to configured official MCP servers, maps the two stable inputs to their configured tool names, forwards the official result, keeps source URLs, bounds the serialized output, and tries configured fallbacks sequentially.

## Install and run

Install the stable release (Node.js 22+; npm `latest` tag):

```bash
npm install -g @onedotmint/siftpath@latest
siftpath --version
siftpath setup
siftpath status
```

Alternatively, build from an existing source checkout:

```bash
npm ci
npm run build
# Optional: npm link (installs the siftpath command for this source checkout)
node dist/cli.js mcp
```

In an MCP client, the simplest local configuration is:

```json
{
  "mcpServers": {
    "siftpath": {
      "command": "node",
      "args": ["/absolute/path/to/Siftpath/dist/cli.js", "mcp"]
    }
  }
}
```

The same process serves stdio MCP. It requires no Docker, database, browser, background daemon, local model, or HTTP server.

With the global npm install or `npm link` (otherwise replace `siftpath` with `node dist/cli.js`):

```bash
siftpath doctor
siftpath search "Node.js 22 release notes" --intent general
siftpath search "semantic similarity API" --intent semantic --max-results 5
siftpath read https://example.com --focus "What is this page about?"
```

To install the single package elsewhere, run `npm pack` here, then `npm install /absolute/path/to/onedotmint-siftpath-2.0.0.tgz` in the consuming project (or `npm install -g` for the CLI). The tarball includes compiled runtime, declarations, docs and the anonymous config example.

SDK example:

```ts
import { Siftpath, readConfiguration } from '@onedotmint/siftpath';
const siftpath = new Siftpath(await readConfiguration());
try {
  const result = await siftpath.search({ query: 'Node.js documentation' });
  console.log(result.content, result.sources);
} finally { await siftpath.close(); }
```

## Try without provider keys

Exa and Jina currently offer anonymous hosted MCP access. To opt in (quotas/availability may change):

```bash
SIFTPATH_CONFIG="$PWD/examples/anonymous.json" node dist/cli.js search "Node.js documentation"
SIFTPATH_CONFIG="$PWD/examples/anonymous.json" node dist/cli.js read https://example.com
```

For a local MCP client, add `"env": { "SIFTPATH_CONFIG": "/absolute/path/to/Siftpath/examples/anonymous.json" }` to the server entry above. Brave remains the general primary when a key exists, otherwise it falls back to Exa. These examples write no private configuration or secrets. See [配置与可选服务](docs/CONFIGURATION.md), [接口核验](docs/PROVIDERS.md), [验证记录](docs/TESTING.md), [迁移](docs/MIGRATION.md), and [安全边界](docs/SECURITY.md).

## Configuration

Run `siftpath setup` for the Clack wizard: arrows navigate, Space selects providers, Enter confirms, Esc/Ctrl+C cancels without saving. Select Brave/Exa/Tavily/Jina/Firecrawl, keep or replace hidden Keys (or explicitly choose supported anonymous access), choose default search/read and ordered fallback, then optionally confirm real tests. No tool-name/JSON editing is required.

`setup --non-interactive` only creates minimal defaults at `~/.config/siftpath/config.json` (or `SIFTPATH_CONFIG`). Keys can also be supplied as environment variables. Configuration is private JSON, written atomically with mode 0600; secrets are never printed or put into model schemas.

The built-in routes are:

- general/default search → Brave `brave_web_search`
- semantic search → Exa `web_search_exa`
- research → optional configured provider (Tavily is an example)
- read → Jina `read_url`, with `focus` mapped to its native `question` parameter

Only a provider with a complete connection and all required credential references resolved is attempted. The default config uses:

- Brave stdio: `npx -y @brave/brave-search-mcp-server@2.1.4 --transport stdio`, `BRAVE_API_KEY`
- Exa stdio: `npx -y exa-mcp-server@3.4.2`, `EXA_API_KEY`
- Jina Streamable HTTP: `https://mcp.jina.ai/v1`, `JINA_API_KEY` for the default authenticated route; anonymous reading is an explicit opt-in

The versions and tool names above were checked against the official repositories on this rebuild. Check the official servers before upgrading: hosted/runtime schemas can change independently of their source README. Jina `question` is native; if a configured reader has no `$focus` mapping, Siftpath returns `FOCUS_UNSUPPORTED` rather than pretending to extract locally.

Minimal custom provider example:

```json
{
  "version": 2,
  "providers": {
    "brave": {
      "enabled": true,
      "connection": {
        "transport": "stdio",
        "command": "npx",
        "args": ["-y", "@brave/brave-search-mcp-server@2.1.4", "--transport", "stdio"],
        "env": { "BRAVE_API_KEY": "${BRAVE_API_KEY}" }
      },
      "search": {
        "name": "brave_web_search",
        "arguments": { "query": "$query", "count": "$maxResults" }
      }
    }
  },
  "routes": { "search": "brave", "read": "jina", "intents": {}, "searchFallback": [], "readFallback": [] }
}
```

Connection transports are `stdio` (`command`, `args`, `env`) and Streamable HTTP (`url`, `headers`). HTTP URLs reject credentials, query-string secrets, and insecure non-loopback HTTP. Use `${ENV_NAME}` in connection env/headers, never in commands, arguments or URLs; environment variables override saved credentials. `doctor` reports `READY`, `MISSING_CREDENTIALS`, `DISABLED`, and unsupported route diagnostics without making network calls.

Tavily and Firecrawl have built-in presets, disabled until selected in `setup`. Tavily uses official `tavily-mcp@0.2.22` / `tavily_search` (basic, 5–20 results), with a Key or its native stdio Keyless mode. Firecrawl uses official `firecrawl-mcp@3.33.4` / `firecrawl_scrape` with a Key, or the official anonymous hosted MCP. Both were verified through real MCP calls. See [配置向导](docs/CONFIGURATION.md). Clack 1.8.1 and esbuild 0.25.12 are build-only: the ~111 KiB setup bundle is dynamically loaded only in interactive setup, with no new runtime dependency.

## Output and safety

Each successful result includes the selected provider, official tool name, retrieval timestamp, original URL where relevant, traceable public source URLs, `UNTRUSTED_WEB_CONTENT`, fallback diagnostics, and `truncated`/`sourcesTruncated` flags. The returned `content` is official output, not a Siftpath-generated answer. Treat it as data, never instructions.

Public HTTP(S) URLs only are accepted for reads. IP literals, local names, credentials and reverse-DNS names are rejected. Provider failures are sanitized into stable diagnostics; raw upstream bodies, API keys and URLs containing credentials are not returned. Connections are initialized on first use, reused within one process, and closed on normal MCP shutdown.

## Status and Pi command

```bash
siftpath status                 # offline, never treats READY as tested availability
siftpath status --json
siftpath test brave --json      # real request to this provider only; no fallback
siftpath test all               # sequential checks, may use API quota

# Install the Pi command extension from the stable npm release:
pi install npm:@onedotmint/siftpath@latest

# Source-checkout alternatives (choose one instead of the npm install):
# After building, try without changing Pi settings:
pi -e /absolute/path/to/Siftpath/extensions/siftpath.mjs
# Or install persistently: pi install /absolute/path/to/Siftpath
```

After installation, restart Pi or run `/reload`. In Pi: `/siftpath`, `/siftpath test brave`, `/siftpath test all`. The extension uses the same private configuration and credential environment as the CLI; set `SIFTPATH_CONFIG` before starting Pi to select another file. The extension only invokes the packaged CLI and displays its summary using native notifications. No model tools are added. Connection, tool discovery and real-request stages are reported separately; recent results are stored privately alongside the selected config, with changed configurations marked stale. See [诊断与 Pi 安装/真实验收](docs/DIAGNOSTICS.md).

## Tests and verification

```bash
npm run typecheck
npm test
npm run test:live                 # skips network/quota tests unless explicitly enabled
SIFTPATH_LIVE=1 npm run test:live # Exa anonymous + Jina anonymous in this rebuild
SIFTPATH_CONTRACT=1 npm run test:live # tools/list contract checks only
```

Offline tests use real MCP SDK fixture processes and local HTTP MCP servers, not mocked vendor HTTP APIs: 81 tests cover tool exposure, stdio, Streamable HTTP, configuration, fallback, cancellation, timeout, output bounds, URL safety, provenance and shutdown. This repository run also verified real anonymous Exa search and Jina read, plus the full Siftpath stdio path. Brave real search was not verified because `BRAVE_API_KEY` was absent. Tavily anonymous official stdio search and Firecrawl anonymous hosted reading were also live-tested; account Key flows were not verified.

## Deliberate non-goals

The old EvidenceEngine, Gather path, multi-provider fusion, custom relevance scoring, sufficiency judgment, HTTP server, old Pi model-tool extension, generated host plugins, and research orchestration were removed from the active package. Siftpath is not a search engine or answer generator; official MCP services own those capabilities.
