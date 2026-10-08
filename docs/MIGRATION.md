# 迁移到 Siftpath

项目、包和集成名称统一为 **Siftpath**。当前包版本仍为 `2.0.0-next.1`，命名迁移没有宣告新的稳定发布，也不表示该版本已发布到 npm。源码安装以[根 README](../README.md) 为准；本轮未运行安装、构建、测试或真实 API。

## 当前名称与兼容范围

| 入口 | 当前名称 | 保留的兼容行为 |
| --- | --- | --- |
| npm / SDK | `@onedotmint/siftpath` | 不提供旧 npm 包名或旧 import 的自动重定向 |
| CLI | `siftpath` | 新包同时提供 `smartsearch`、`smart-search` 可执行别名，调用同一 CLI |
| Pi | `/siftpath-doctor`、`/siftpath-usage` | `/smartsearch-doctor`、`/smartsearch-usage` 调用相同逻辑 |
| 项目环境变量 | `SIFTPATH_*` | 对应的 `SMARTSEARCH_*` 仍可作为回退；新名称优先 |
| MCP / plugin ID | `siftpath` | 旧客户端配置需自行更新，不自动改写客户端文件 |
| 本地 marketplace ID | `siftpath-local` | 不将旧 marketplace 自动重命名或重新安装 |

三个操作仍是 `search`、`fetch`、`gather`，Agent 工具名仍是 `web_search`、`web_fetch`、`web_gather`。可执行别名不意味着旧版子命令或工具 schema 自动恢复。

## 包安装与 SDK import

旧包 `@onedotmint/smart-search` 与新包是不同的 npm 身份；更新旧包不会自动获得新包。请从当前仓库构建/链接，或生成本地 tarball 后安装新包，再更新消费项目依赖和 import：

```ts
import { createEngine, readConfiguration } from '@onedotmint/siftpath';
```

旧包本身不会被改造成兼容 shim。全局同时安装旧包和新包可能争用 `smartsearch` / `smart-search` 命令；先检查并妥善处理旧安装，日常以 `siftpath` 为准。新源码布局在仓库根目录，不再进入旧包子目录执行 npm 命令。不要假定已有 npm 发布或 Release 下载产物。

## 配置路径：复用但不搬迁

显式路径优先级为 **`SIFTPATH_CONFIG` > `SMARTSEARCH_CONFIG` > 默认路径**。要使用显式覆盖，请提供非空路径；若设置了新变量，旧变量不会再作为第二次文件读取或写入目标。显式指定的文件不存在时，也不会自动转去读旧默认文件。

没有显式覆盖时：

1. 配置根目录取 `$XDG_CONFIG_HOME`，未设置时取 `~/.config`。
2. 新默认路径是 `<配置根目录>/siftpath/config.json`。
3. 仅当新默认文件不存在且 `<配置根目录>/smartsearch/config.json` 已存在时，继续**读写旧文件**，不移动、不复制，也不另建新文件。
4. 两个默认文件都存在时，选择新文件，不合并内容；两个都不存在时，setup 写入新默认路径。

因此旧用户可能仍在原路径保存密钥，这不是迁移失败。`siftpath doctor` 可显示当前选中的配置路径，它不访问网络。私有配置权限与严格 schema 见 [CONFIGURATION.md](CONFIGURATION.md)。

本次不会自动迁移 keys、改写任意旧配置对象或合并两个文件。若要手动改用新路径，先备份私有文件，确认其符合当前 schema 和权限，再明确选择新路径；不要把密钥放入项目、客户端共享 JSON 或版本控制。

## 环境变量与凭据

当前项目变量包括 `SIFTPATH_CONFIG`、`SIFTPATH_SERVER_TOKEN`、`SIFTPATH_ALLOWED_HOSTS`、`SIFTPATH_ALLOWED_ORIGINS` 和用于显式 live 测试授权的 `SIFTPATH_LIVE`。对应的 `SMARTSEARCH_*` 仅作兼容回退，**同时设置时新变量优先**。不要留下两套冲突值；新变量设为空值不代表回退到旧值。

服务商凭据名没有变：`EXA_API_KEY`、`PARALLEL_API_KEY`、`TAVILY_API_KEY`、`BRAVE_API_KEY`、`FIRECRAWL_API_KEY`、`JINA_API_KEY`、`CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`。`CLOUDFLARE_AUTH_TOKEN` 仍是回退别名。非空服务商环境凭据覆盖已保存凭据；setup 的非交互模式不把环境密钥落盘。此命名迁移不自动重命名或搬迁这些密钥。

## 客户端集成

更新 MCP 服务 ID、plugin ID 为 `siftpath`，本地 marketplace 为 `siftpath-local`，将命令改为 `siftpath mcp`；具体安装见 [INTEGRATIONS.md](INTEGRATIONS.md)。只保留**一个** MCP 服务配置，移除或替换旧条目，不要同时配置两个 ID 指向同一后端，否则会重复暴露工具和增加误调用机会。Pi 原生扩展与 MCP 副本也不应重复启用。

```json
{"mcpServers":{"siftpath":{"command":"siftpath","args":["mcp"]}}}
```

GUI 客户端的 PATH 可能与终端不同。可从 `siftpath integration <host>` 获取绝对 Node/MCP 命令；配置路径与凭据规则不因宿主改变。仓库中的资产不表示实际客户端安装、公共市场上架或公共 ChatGPT 连接已经验证。

## 从 SmartSearch 1.x 升级的额外边界

本预发布实现以一个 TypeScript/Node 引擎替代 Python runtime 加 npm wrapper，不是旧版兼容层。旧 research/deep 命令、厂商专用工具 schema、Python 配置模型、Python 包安装与自动 bootstrap 不保留。旧配置文件只有符合当前严格 JSON schema 时才能复用；不要复制未知的旧配置对象。

旧上游、独立重建基线、原始 MIT 许可及实际复用材料见 [历史迁移原文](history/MIGRATION.md)、[历史索引](history/README.md)、[REFERENCES.md](REFERENCES.md) 和 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。历史来源 URL 和原版权保留；旧交付验证结果不代表当前迁移已经运行验证，也不能假定历史 checkpoint bundle 与旧上游共享祖先。
