# Siftpath

Siftpath gives a coding agent two web tools — `web_search` and `web_read` — backed by the official MCP
servers of five providers (Brave, Exa, Tavily, Jina, Firecrawl). It is a router, not a search engine:
it lazily connects to the provider you configured, maps two stable inputs to that provider's native
tool, returns the official result with its source URLs, and falls back to the next configured provider
when one fails. No LLM, no scraping framework, no re-ranking, no database, no daemon.

- `web_search({ query, intent?, maxResults? })`
- `web_read({ url, focus? })`

## Install in Pi

```bash
pi install npm:@onedotmint/siftpath
```

Restart Pi (or run `/reload`). The extension registers Siftpath as a Pi MCP server, so after that:

1. Run `/siftpath`.
2. Choose **快速配置（推荐） / Quick setup**.
3. Pick a search service and a read service, paste a Key when asked (input is masked), confirm.
4. Just ask the model to search; it now has `web_search` and `web_read`.

That is the whole first-run path. No global CLI install, no `node_modules` hunting, no `pi mcp add`,
no JSON editing, no tool-name knowledge.

> **Version note.** npm `2.0.0` has the older Pi extension without automatic MCP registration.
> This tree targets **2.0.1**: native Pi setup, registration, hot reload, environment-Key persistence
> and additive quick-setup fixes. Until 2.0.1 is published by the maintainer, install this tree instead:
>
> ```bash
> pi install /absolute/path/to/Siftpath          # directory, dependencies already installed by npm ci
> ```
>
> A bare `npm pack` tarball is not a valid `pi install` argument (Pi treats a file path as a single
> extension file). Unpack or npm-install it first:
>
> ```bash
> mkdir -p /tmp/siftpath-pkg && tar xzf onedotmint-siftpath-2.0.1.tgz -C /tmp/siftpath-pkg
> cd /tmp/siftpath-pkg/package && npm install --omit=dev --ignore-scripts
> pi install /tmp/siftpath-pkg/package
> ```

## Configure

Both front ends share one private configuration file and one set of rules.

| Path | Command |
|---|---|
| Pi | `/siftpath` → quick setup / advanced setup |
| Terminal | `siftpath setup` (asks quick or advanced), or `siftpath setup --quick` / `--advanced` |

- **Quick setup** asks two things — what should search, what should read — then the Keys, then saves
  recommended routes (Tavily/Exa for search, Jina for reading, remaining services as fallbacks). It
  never asks about intents, tool names or fallback order. It adds/updates the selected services without
  disabling others; routes are recommended again. Use advanced setup to disable services or edit routes.
- **Advanced setup** keeps everything: per-provider credentials, default/semantic/research search,
  reader, and ordered fallback. In Pi it is a small native menu; in a terminal it is the Clack wizard.

Credential rules, identical in both:

- Existing Keys are never displayed and never need re-entry; Enter keeps the saved Key.
- Official anonymous access is offered where the provider supports it (Exa, Jina, Tavily stdio,
  Firecrawl); no Key is stored for it.
- A Key from the environment (`BRAVE_API_KEY`, `EXA_API_KEY`, `TAVILY_API_KEY`, `JINA_API_KEY`,
  `FIRECRAWL_API_KEY`) wins over the saved Key, and the UIs say so. Saving configuration never copies
  environment Keys into JSON or overwrites stored Keys with them; only explicitly entered replacements are saved.
- Cancelling at any point saves nothing. Nothing is written until you confirm.
- Storage: `~/.config/siftpath/config.json` (`$XDG_CONFIG_HOME`, `SIFTPATH_CONFIG`, or the legacy
  `~/.config/smartsearch/config.json`) — private JSON, atomic replace, POSIX mode `0600` (protect user ACLs on Windows). Keys are never
  put in argv, notifications, logs or the model context by this input flow. The JSON is plaintext,
  not a vault: another process or model tool with the same user permissions can read it.

Changing a Key or a route takes effect on the next tool call: the running MCP server notices the
changed file, builds a new router, and retires the old one after its in-flight calls finish. You do
not need to find a process or restart the terminal. In Pi, `/reload` is only needed if you upgrade
the package itself.

## Use it

In Pi or any MCP client, ask normally ("search for the Node.js 22 release notes", "read this page")
— the model calls `web_search` / `web_read`. From a terminal:

```bash
siftpath search "Node.js 22 release notes" --intent general --max-results 5
siftpath search "similarity search API" --intent semantic
siftpath read https://example.com --focus "What is this page about?"
```

`intent` picks the configured route: `general` (default), `semantic`, `research`. `focus` is forwarded
only when the configured reader supports a native question parameter (Jina does); otherwise the result
says `FOCUS_UNSUPPORTED` instead of pretending to extract locally. Output is the provider's own text
plus traceable source URLs, bounded by `maxOutputChars`, marked `UNTRUSTED_WEB_CONTENT`. Some providers
have a native minimum number of results (Tavily: 5), so a smaller `maxResults` is raised and the result
carries a `MAX_RESULTS_RAISED` warning.

## Other clients and the terminal CLI

```bash
npm install -g @onedotmint/siftpath
siftpath setup          # quick or advanced wizard
siftpath status
```

Any MCP client that speaks stdio:

```json
{
  "mcpServers": {
    "siftpath": {
      "command": "node",
      "args": ["/absolute/path/to/node_modules/@onedotmint/siftpath/dist/cli.js", "mcp"]
    }
  }
}
```

The server exposes exactly two tools and starts even when the configuration is missing or invalid:
the tools are always announced, and a call explains what to fix. TypeScript SDK:

```ts
import { Siftpath, readConfiguration } from '@onedotmint/siftpath';
const siftpath = new Siftpath(await readConfiguration());
try { console.log((await siftpath.search({ query: 'Node.js documentation' })).content); }
finally { await siftpath.close(); }
```

## Keys, anonymous access and cost

| Provider | Role | Without a Key | With a Key |
|---|---|---|---|
| Tavily | search (recommended) | official keyless stdio mode | higher quota |
| Exa | search (semantic), recommended | official anonymous hosted MCP | higher quota |
| Brave | search | not available | required |
| Jina | read (recommended) | official anonymous hosted MCP | higher quota, native focus |
| Firecrawl | read (optional) | official anonymous hosted MCP | higher quota |

Anonymous access is free but limited and can change upstream. Any authenticated call uses your
provider account and may consume quota. CLI `siftpath test` is itself an explicit request and does
not ask again; Pi test commands/menu ask for confirmation, with Cancel first. No tests run automatically. `status` makes no network calls at all.

## Status, tests and troubleshooting

```bash
siftpath status                 # offline: config path, READY vs tested, routes, next step
siftpath test exa --json        # real request to one provider, no fallback
siftpath test all               # sequential checks, may use API quota
```

`READY` means "configuration and credentials are complete", never "verified available". A provider you
disabled is reported as disabled and does not fail a `test all` run; a provider that is enabled but has
no credentials is reported as *pending setup*, not healthy. A run with nothing testable is reported as
such instead of succeeding.

| Symptom | Meaning and fix |
|---|---|
| No `web_search` tool in Pi | Extension not loaded or older package version: `pi list`, then restart or `/reload`. `/siftpath → 查看服务状态` shows whether the tools are registered. |
| `Warning: Siftpath 安装不完整（缺少运行时依赖）` | The package directory has no `node_modules`: install it from npm, or run `npm install --omit=dev` in the unpacked package before `pi install <dir>`. |
| `MISSING_CREDENTIALS` | Run `/siftpath` / `siftpath setup` and add the Key, or export it. |
| First call takes very long, then `PROVIDER_TIMEOUT` | The official server is being downloaded by `npx` on first use. Retry once; raise `providerTimeoutMs` if your network is slow. There is no infinite retry and no background daemon. |
| `AUTH_FAILED` | The Key was rejected: replace it. |
| `RATE_LIMITED` | Quota reached: wait, or configure a second provider as fallback. |
| `TOOL_NOT_FOUND` | The provider renamed a tool upstream: update Siftpath or the binding. |
| Wrong config file in use | `siftpath status` prints the effective path. `SIFTPATH_CONFIG` overrides it. |
| Windows and WSL | Each environment has its own home directory, so each needs its own `siftpath setup`; a config written in WSL is not visible to a Windows terminal and vice versa. |

Uninstalling (`pi remove`, `npm uninstall -g`) never deletes your configuration or Keys; remove
`~/.config/siftpath/` yourself if you want them gone. Upgrading keeps credentials, providers and
routes; legacy v1 configs are read and converted in memory without rewriting the file.

## What Siftpath deliberately is not

No internal LLM, no multi-provider fusion, no re-ranking, no HTML extraction, no cache, no server
process. The old EvidenceEngine/Gather path, provider plugins, benchmarks and generated host plugins
were removed. Official MCP services own search and reading; Siftpath owns routing, credentials,
diagnostics and the two-tool contract.

## Repository, versions and releases

- Package version: **2.0.1**. Registry publication is separate from merging; check
  `npm view @onedotmint/siftpath version` before assuming the npm release is available.
- Real Pi model acceptance and release-check results: [TESTING.md](docs/TESTING.md).
- Publishing and merging are deliberate maintainer actions; CI only verifies and packages.

## Development

```bash
npm ci
npm run check                    # typecheck + offline tests (real MCP SDK fixtures)
npm run test:setup               # PTY smoke for the Clack wizard (Linux)
npm run test:live                # opt-in real calls: SIFTPATH_LIVE=1, SIFTPATH_CONTRACT=1
npm run pack:dry
```

See [配置](docs/CONFIGURATION.md), [诊断与 Pi 命令](docs/DIAGNOSTICS.md), [官方 MCP 接入](docs/PROVIDERS.md),
[架构](docs/ARCHITECTURE.md), [安全边界](docs/SECURITY.md), [验证记录](docs/TESTING.md),
[迁移](docs/MIGRATION.md).
