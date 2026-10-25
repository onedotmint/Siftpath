# Siftpath

A lightweight router from two agent tools to official provider MCP servers. Node.js 22+; no internal LLM, local scraper, ranking, cache or research planner.

```text
web_search({ query, intent?, maxResults? })
web_read({ url, reader?, focus? })
```

- Search: Tavily for `general` / `research`, Exa for `semantic`.
- Read: Jina by default; Firecrawl is an explicit optional reader.
- New configurations have empty search/read fallback lists; Brave is disabled and available in advanced setup.
- Saved routes, Keys and custom bindings are preserved. No automatic switch to anonymous access after a Key error.

## Install and configure

```bash
pi install npm:@onedotmint/siftpath
```

Restart Pi or `/reload`, then `/siftpath` → **Quick setup**. Choose search/read services, provide Keys or explicitly select supported anonymous access, and confirm. The extension registers the packaged MCP server; no separate CLI or `pi mcp add` is needed.

Quick setup adds or updates selected services without disabling others, preserves still-usable routes and does not add fallbacks. Advanced setup controls providers, intent routes and ordered fallbacks. Cancelling saves nothing; network tests require explicit consent.

For terminal use or another stdio MCP client:

```bash
npm install -g @onedotmint/siftpath
siftpath setup
siftpath status                 # offline, not an availability test
siftpath mcp                    # stdio server: only web_search and web_read
```

A client may instead launch `node /absolute/path/to/package/dist/cli.js mcp`. For this checkout, install dependencies with `npm ci` before `pi install /absolute/path/to/Siftpath`. Pi directory installs need the directory's runtime dependencies; a bare tarball path is not a Pi package source—npm-install or unpack it first. Package version is `2.0.1`; source version does not establish registry publication.

## Use

```bash
siftpath search "Node.js release notes" --intent general --max-results 5
siftpath search "similarity search API" --intent semantic
siftpath read https://www.sqlite.org/foreignkeys.html --focus "Can foreign keys be changed inside a transaction?"
siftpath read https://www.rfc-editor.org/rfc/rfc9111.html --reader firecrawl
```

`reader` accepts any valid configured provider ID with a read binding, including custom IDs. Omit it to use `routes.read` and any explicitly saved `readFallback`. An explicit reader attempts **only that provider**, with no fallback or automatic enablement. The historical mode-based prototype was withdrawn and replaced by `reader`; there is no `--mode` interface.

Before a focused business call, Siftpath checks that the selected binding actually maps `$focus`. Otherwise it returns `FOCUS_UNSUPPORTED` without calling that provider or silently reading the full page. Mapping is not proof of successful extraction: Jina anonymous `question` cannot guarantee focus, and providers may themselves downgrade. Native notes and warnings are preserved.

For specific facts, use a precise focus when supported. Check the evidence for key conclusions; reread only for a real gap, or state uncertainty. Neither focused excerpts nor a non-focused read prove completeness. No automatic follow-up is performed.

## Results, credentials and cost

- Output preserves native content, source URLs and notes, marked `UNTRUSTED_WEB_CONTENT`. `sources` can include unfetched page links; cite the original evidence, not every indexed link.
- `truncated` means **local output clipping only**. The default `maxOutputChars: 16000` is a serialized character budget, not a token budget or a solution to long-document coverage. `retrievedAt` is local processing time.
- A structured result already exactly contained in a JSON text block is not appended twice; distinct evidence remains. No fuzzy deduplication or local summarization.
- Known Firecrawl scrape responses may include optional `metadata` (`creditsUsed`, `cacheState`, `cachedAt`), retained before body clipping within the same budget. These are reported fields, not a currency bill or an extra charge to add to their native-content copy; missing values stay absent and cache hits are not assumed free.
- Keys come from environment variables or private configuration; environment values win and setup does not copy them into JSON. Saved JSON is plaintext, not a secret vault.
- Anonymous access is opt-in, limited and controlled upstream. It is not a fallback for failed credentials. Authenticated calls may use account quota; provider-internal calls and billing are outside Siftpath's control.

Configuration lives at `~/.config/siftpath/config.json` (or `$XDG_CONFIG_HOME` / `SIFTPATH_CONFIG`); legacy path/environment/version-1 compatibility remains. Changes take effect on the next MCP call; `/reload` is needed after a package upgrade. Uninstalling does not delete saved Keys. See [configuration](docs/CONFIGURATION.md) and [migration](docs/MIGRATION.md).

## Diagnostics and development

```bash
siftpath status --json          # READY means configured, not tested
siftpath test jina --json       # explicit real request; one provider, no fallback
npm ci
npm run check                  # typecheck + build + offline tests
npm run test:setup             # Linux PTY setup smoke
npm run verify:source
npm run pack:dry
npm run verify:package         # actual tarball, prod-only install, CLI/SDK/Pi loading; no inference
```

`AUTH_FAILED` / `MISSING_CREDENTIALS`: fix the Key or explicitly change access mode. `FOCUS_UNSUPPORTED`: choose a capable binding/reader or explicitly omit focus if a broader read is appropriate. `TOOL_NOT_FOUND`: review the binding against the provider's schema. Cold `npx` downloads can consume the provider deadline. Windows and WSL use separate homes/configurations.

Historical JSON reports and raw fixtures stay in the Git repository, not the npm runtime tarball. Documentation links to those reports open GitHub. `verify:package` uses cached locked dependencies offline; install dependencies first. Its Pi loading check explicitly skips when Pi is absent; CI installs pinned Pi 1.4.0 to exercise it.

[Configuration](docs/CONFIGURATION.md) · [Providers and pinned sources](docs/PROVIDERS.md) · [Architecture](docs/ARCHITECTURE.md) · [Diagnostics](docs/DIAGNOSTICS.md) · [Security](docs/SECURITY.md) · [Testing and historical evidence](docs/TESTING.md) · [Selective reading](docs/SELECTIVE-READING.md) · [Model-experience limits](docs/MODEL-EXPERIENCE.md)
