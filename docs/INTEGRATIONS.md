# Integrations

## Pi：推荐的原生集成

**正式发布 npm 后**：在 Pi 中执行 `pi install npm:@onedotmint/siftpath`，重启后运行 `/siftpath` 打开基于 Pi 原生 `SelectList` 的 TUI 状态面板。可用 ↑↓ 选择、Enter 确认、Esc 关闭；面板不会额外启动后台终端应用。还可以使用 `/siftpath usage` 查看本会话调用和缓存数据，或 `/siftpath reload` 在更改配置后重新建立检索引擎（清空内存缓存及计数）。三个操作均不联网、不会计费或暴露密钥；状态中的“已配置”不代表真实连通。如果没有配置 API Key，`/siftpath` 会给出需要在**系统终端**执行的设置命令；密钥不得粘贴在 AI 对话中。

**当前 PR 的开发者试用**：按 [README](../README.md) 克隆并编译 `feat/lightweight-html-mcp-2026` 分支，再执行 `pi install /absolute/path/to/Siftpath`。直接安装尚未编译的 Git 源无法保证 `dist/` 存在；因此目前不宣传 git: 一键安装为可靠方式。

Pi 原生集成只有 `web_search`、`web_fetch`、`web_gather` 三个工具，以及一个 `/siftpath` 命令（省略参数等同 `status`；支持 `usage` 和 `reload`）。旧 Pi 命令在 2.0 预发布阶段直接删除，不额外注册别名。不要再重复加载相同的 MCP 工具。验证安装请使用 `pi list` 并在 Pi 内运行 `/siftpath`；CI 会额外使用 Pi 0.99 的真实组件和加载器测试扩展入口、输入及窄终端排版；但仍不等同于在用户终端中完整手动安装、操作 Pi。

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

HTTP deployments use `siftpath mcp --http`. Modern `2026-07-28` requests use a per-request `_meta` envelope, matching `MCP-Protocol-Version` and `Mcp-Method` headers (also `Mcp-Name` for tool calls), and receive stateless JSON replies with no `mcp-session-id`. This is a bounded implementation of the three core tools and `server/discover`, not the full surface of the official SDK/conformance suite; official v2 client smoke tests are required in CI. Legacy HTTP `initialize`, session IDs, and `DELETE` termination are deliberately unsupported; those clients must upgrade or use local stdio. The stdio server retains legacy initialization alongside the modern envelope. TLS remains external. See CONFIGURATION.md and SECURITY.md.

## Public ChatGPT is a separate deployment step

The local files do not create a public HTTPS endpoint, OAuth identity system, registered MCP connection, or directory listing. To use a remote deployment in ChatGPT, deploy behind HTTPS, choose an authentication arrangement supported by the target client, register that actual MCP endpoint, then map its real connection ID into the plugin. Do not invent a `plugin_asdk_app...` ID or claim that installing this local archive publishes it.

## Keeping packages in sync

`scripts/sync-integrations.mjs` generates host packaging and copies the single canonical skill from `skills/web-research/`. `npm run sync:integrations` refreshes these assets explicitly; build and prepack also synchronize them automatically. CI definitions check generated diffs before other gates; tests compare skill copies byte-for-byte and check manifest versions/commands. None of those checks ran in this documentation update. Change retrieval only in `src/`, and change agent instructions only in the canonical skill. See [DEVELOPMENT.md](DEVELOPMENT.md).
