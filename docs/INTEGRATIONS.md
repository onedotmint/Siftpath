# Integrations

First build/link the root source package and run `siftpath setup` as described in the [root README](../README.md). Alternatively, generate a local tarball with `npm pack` and install that actual file; no npm publication or Release tarball is assumed. Host packages invoke `siftpath mcp` on PATH and therefore never need a second set of API keys or provider logic. A host launched by a GUI may have a different PATH/environment; the saved user configuration avoids environment duplication.

The package is `@onedotmint/siftpath`; MCP/plugin IDs are `siftpath`, and local marketplace IDs are `siftpath-local`. All relative paths and npm commands below start at the repository root. These are installation instructions, not commands executed during this documentation update.

`siftpath integration <host>` prints the installed package root, host entry, canonical skill, guide, and an absolute Node/MCP command for troubleshooting. Restart the host after installation. Installing a package is not evidence that its live calls work: the delivery tests use host contracts and protocol sessions, not actual installed agent applications.

## Pi: native first

From a source checkout after `npm ci --ignore-scripts` and `npm run build` at the repository root:

```bash
pi install /absolute/path/to/Siftpath
```

Or reuse the global compiled package without building:

```bash
pi install "$(npm root -g)/@onedotmint/siftpath"
```

The package `pi` manifest loads `integrations/pi/index.ts` and `skills/`. The extension imports the host's current `@earendil-works/pi-ai` Type factory, registers exactly three native tools, forwards cancellation, sends progress/status updates, and exposes `/siftpath-doctor` and `/siftpath-usage`. The old `/smartsearch-doctor` and `/smartsearch-usage` spellings remain compatibility aliases. All retrieval calls use the shared engine. Current official Pi contracts were inspected; older namespace/version combinations and real terminal rendering still require a host smoke test. Do not enable the MCP copy alongside the native tools unnecessarily.

## Codex and local ChatGPT desktop

The source/package root includes `.agents/plugins/marketplace.json`; its local entry points at `integrations/codex`. This folder is a portable Agent Plugin: root `plugin.json`, typed `mcp.json`, and `skills/`.

```bash
codex plugin marketplace add /absolute/path/to/Siftpath
```

Restart the ChatGPT desktop app, open Plugins, select the Siftpath local marketplace, and install its entry on supported surfaces. The marketplace marks it available rather than silently installing or enabling it. Host trust/rollout/administrator restrictions still apply. Refer to the official packaging guide in REFERENCES.md; no marketplace installation was executed here.

For an MCP-only Codex setup, use:

```bash
codex mcp add siftpath -- siftpath mcp
```

Use the shared skill as well, rather than a bare server alone. When migrating, replace the old server entry instead of adding a duplicate. Configure only one MCP service, and do not enable the plugin's MCP backend alongside an equivalent standalone entry. See [MIGRATION.md](MIGRATION.md).

## Claude Code

From the source repository:

```bash
claude --plugin-dir ./integrations/claude-code
```

The native manifest, `.mcp.json`, shared skill, and evidence command are bundled. The root `.claude-plugin/marketplace.json` is also supplied for local/team marketplace installation. No hooks are needed: installing interception hooks simply to wrap retrieval would add complexity without value.

## Cursor

Copy the actual plugin directory, not a symlink to somewhere else:

```bash
mkdir -p ~/.cursor/plugins/local
cp -R ./integrations/cursor ~/.cursor/plugins/local/siftpath
```

Restart Cursor or run Developer: Reload Window, then inspect Customize. Local plugin imports must be allowed by the account/administrator. The native `.cursor-plugin/plugin.json`, command, skill, and `mcp.json` use the `siftpath` executable. No `${PLUGIN_ROOT}` variable is used, because Cursor's portable support does not expand it. The root `.cursor-plugin/marketplace.json` supports later repository distribution; it has not been submitted to a public marketplace.

## DeepSeek Harness

`integrations/deepseek-harness/mcp.example.json` supplies a standard MCP server entry; the neighboring skill supplies tool selection and stopping rules. Apply the example using the installed Harness version's MCP configuration UI or file and load the skill using that version's instruction mechanism. This is a compatibility bundle, **not a native Harness plugin or a verified installation path**. No evolving Harness API is imported into the core.

## Generic MCP

```json
{"mcpServers":{"siftpath":{"command":"siftpath","args":["mcp"]}}}
```

For executable-resolution problems, use the absolute `process.execPath` and script path returned by `siftpath integration codex`. Do not paste API keys into shared repository MCP JSON. Stdio stdout is reserved for JSON-RPC; diagnostics go to stderr.

HTTP deployments use `siftpath mcp --http`. Modern `2026-07-28` requests use a per-request `_meta` envelope, matching `MCP-Protocol-Version` and `Mcp-Method` headers (also `Mcp-Name` for tool calls), and receive stateless JSON replies with no `mcp-session-id`. This is a bounded implementation of the three core tools and `server/discover`, not the full surface of the official SDK/conformance suite. Legacy 2025 HTTP clients retain authenticated session IDs, `initialize`, and `DELETE` termination. The stdio server also accepts the modern envelope and preserves legacy initialization. TLS remains external. See CONFIGURATION.md and SECURITY.md.

## Public ChatGPT is a separate deployment step

The local files do not create a public HTTPS endpoint, OAuth identity system, registered MCP connection, or directory listing. To use a remote deployment in ChatGPT, deploy behind HTTPS, choose an authentication arrangement supported by the target client, register that actual MCP endpoint, then map its real connection ID into the plugin. Do not invent a `plugin_asdk_app...` ID or claim that installing this local archive publishes it.

## Keeping packages in sync

`scripts/sync-integrations.mjs` generates host packaging and copies the single canonical skill from `skills/web-research/`. `npm run sync:integrations` refreshes these assets explicitly; build and prepack also synchronize them automatically. CI definitions check generated diffs before other gates; tests compare skill copies byte-for-byte and check manifest versions/commands. None of those checks ran in this documentation update. Change retrieval only in `src/`, and change agent instructions only in the canonical skill. See [DEVELOPMENT.md](DEVELOPMENT.md).
