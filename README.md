# Siftpath

**轻量、可追溯、可控预算的 Agent 网页检索。** 搜索、提取和证据整理共用一个 TypeScript 核心；不需要本地模型或后台服务。

> 当前为 **2.0.0-next.1 预发布版本**。新实现位于 [Draft PR #1](https://github.com/onedotmint/Siftpath/pull/1)，尚未合并或发布 npm。下方正式安装命令须等 npm 发布后才能使用。

## 快速开始

### Pi（正式发布后推荐）

```bash
pi install npm:@onedotmint/siftpath
```

重启 Pi，运行 `/siftpath` 打开 Pi 内置的交互式 TUI 面板，查看版本、搜索服务、连接检查状态和本会话调用统计；可以使用 ↑↓ 和 Enter 在 Overview、Usage、Reload、Close 间切换。`/siftpath usage` 查看使用情况，`/siftpath reload` 在修改 API Key 后重新加载配置（会清空当前内存缓存与会话计数）。这些命令不会联网或打印密钥；真实连接检查仍通过终端 `siftpath doctor --live` 明确触发。缺少密钥时，`/siftpath` 会给出在**系统终端**执行的配置命令；不要将 API Key 粘贴进 AI 对话。默认只需要一个 Exa 密钥，也支持 Tavily、Parallel 或 Brave。

### CLI（正式发布后）

```bash
npm install -g @onedotmint/siftpath
siftpath setup
siftpath doctor
siftpath doctor --live
siftpath search "HTTP ETag"
```

`setup` 首次默认推荐 Exa（搜索与正文提取共用密钥），已有配置则默认不修改。普通 `doctor` **不联网**；`--live` 明确触发一次可能收费的真实搜索检查，最多包含一次网络重试。

### 现在试用 PR（开发者路径）

```bash
git clone --branch feat/lightweight-html-mcp-2026 https://github.com/onedotmint/Siftpath.git
cd Siftpath
npm ci --ignore-scripts
npm run build
npm link
siftpath setup
siftpath doctor --live
```

需要 Node.js 22+、Git 和 npm。源码路径下 `pi install /absolute/path/to/Siftpath` 要求该目录已完成编译。**暂不推荐直接用 Pi 的 Git 源安装**，因为未编译的 `dist/` 并不包含在 Git 仓库中。正式发布前还需要打包产物安装验收。

更多高级用法见 [配置](docs/CONFIGURATION.md) 和 [各客户端接入](docs/INTEGRATIONS.md)。

## 三种操作

| 操作 / Agent 工具 | 用途 | 默认行为 |
| --- | --- | --- |
| `search` / `web_search` | 查找来源和可用摘要 | fast；通常一个搜索服务商；约 2,200 估算输出 tokens |
| `fetch` / `web_fetch` | 从 1–20 个已知 URL 提取相关段落 | 批量提取；3,000 估算输出 tokens |
| `gather` / `web_gather` | 为比较和调查汇集证据 | quality；首轮最多两个搜索服务商；6,000 估算输出 tokens |

fast gather 默认预算为 3,500。quality 模式可使用托管重排和充分性判断；不足时最多补充一轮，不无限循环。fast 搜索失败时可尝试一个备选服务商。

证据保留 URL、标题、服务商、检索时间、可用的发布日期、段落/片段和来源 ID。`coverage` 为 `low`、`partial` 或 `good`，是停止检索的提示，**不是事实正确或来源独立的保证**。

## Lightweight offline HTML input

Raw HTML can be turned into a normal evidence pack without a browser, a local model, or a network request:

```bash
siftpath html --url https://example.com/article --query "retry policy" < article.html
```

SDK: `await engine.fromHtml({ url: 'https://example.com/article', html, query: 'retry policy' })`.
The `url` is source metadata only: no DNS lookup or HTTP fetch happens. Input is capped at 1 MiB; the normal complete-result token budget applies. This is deliberately **not** a fourth AI/MCP tool. Basic cleanup is dependency-free and may retain navigation. For article-oriented parsing, explicitly install `@mozilla/readability` and `linkedom` in the same Node resolution scope and use `--readability` (or `extractor: 'readability'`). The optional parser is never installed automatically. These libraries are never installed by Siftpath itself. No Trawl, Chromium, Python, or local model is required.

## 实验：本地 BM25 段落排序

默认仍使用原有关键词命中率算法。可以临时启用 **BM25**，只在已获取的 `fetch`、`gather`、离线 HTML 证据段落之间排序，不影响搜索服务商排名或请求次数：

```bash
SIFTPATH_EVIDENCE_RANKING=bm25 siftpath gather "HTTP ETag revalidation"
npm run bench:bm25
```

也可在私人配置文件设置 `"evidenceRanking": "bm25"`，或使用 SDK 的 `new EvidenceEngine({ ..., evidenceRanking: 'bm25' })`。移除该设置立即恢复原算法。保持零额外运行依赖，沿用现有中英文词法规则，不需要索引、向量库或模型。BM25 在每次调用内统计段落词频、稀有度与长度，超过 512 段或查询缺乏可用词时自动使用原排序；相关性分数只是当前候选集内的相对值，不是答案置信度。已配置托管 reranker 时，quality 模式仍允许其覆盖本地初排。

`npm run bench:bm25` 包含有标注的合成段落对比和原有模拟服务商回放。**它不能证明真实网页或真实服务商上的准确率提高**，因此 BM25 尚不作为默认值。

## MCP protocol compatibility

The built-in zero-runtime-dependency MCP server handles modern `2026-07-28` `server/discover`, tool discovery and the existing three tool calls alongside legacy 2025 clients. Local stdio remains the default and still accepts legacy 2025 initialization. Authenticated HTTP supports only the modern `2026-07-28` stateless protocol; older HTTP session/init clients must migrate to modern HTTP or use stdio. There is no session store or cleanup timer. This is **minimal protocol compatibility**, not a claim of complete official MCP SDK/conformance support. No Express, Python, database, browser, or local AI model is required. Run the integration test suite after changes and validate against an independent official client before release.

## SDK

在消费项目中安装本地打包产物后，使用当前包名：

```ts
import { createEngine, readConfiguration } from '@onedotmint/siftpath';

const engine = createEngine(await readConfiguration());
const controller = new AbortController();
const pack = await engine.gather(
  { query: 'Compare ETag and Last-Modified validation', maxTokens: 5000 },
  { signal: controller.signal },
);
console.log(pack.evidence, pack.coverage);
```

复用同一个 engine 可保留有界 TTL 缓存和结果 ID；跨进程/会话请传 URL。自定义服务商实现小型类型接口，核心不混入厂商分支。详见[架构](docs/ARCHITECTURE.md)。

## 服务商与集成

- 搜索：Exa、Parallel、Tavily、Brave。
- 提取：Exa Contents、Parallel Extract、Tavily Extract、Firecrawl。
- 可选：Jina 段落重排、Cloudflare Clef / Clef-flash 充分性判断。
- 客户端：Pi 原生扩展；Codex / 本地 ChatGPT Agent Plugin；Claude Code、Cursor 插件；DeepSeek Harness 通用 MCP 示例；其他 stdio 或认证 HTTP MCP 客户端。

`siftpath integration pi`（或其他 host 名）可定位本地集成资产和绝对 Node/MCP 命令。集成 ID 为 `siftpath`，本地 marketplace 为 `siftpath-local`。实际安装说明见[集成文档](docs/INTEGRATIONS.md)；公共 ChatGPT 连接需要另行部署和注册，不是仓库文件已完成的发布。

旧 CLI 和环境变量仅作为兼容别名保留；旧的 Pi `/siftpath-doctor`、`/siftpath-usage` 和 `/smartsearch-*` 命令已统一为 `/siftpath`，不再注册。旧配置不会自动搬迁。旧 npm 包不会自动切换成新 SDK。升级请看[迁移说明](docs/MIGRATION.md)。

## 文档与验证边界

| 文档 | 内容 |
| --- | --- |
| [配置](docs/CONFIGURATION.md) | 密钥、私有存储、诊断、HTTP 部署 |
| [安全](docs/SECURITY.md) | 不可信网页、网络边界、认证与隐私 |
| [集成](docs/INTEGRATIONS.md) | Pi、插件和 MCP 安装 |
| [开发](docs/DEVELOPMENT.md) / [测试与评估](docs/TESTING.md) | 根目录命令、版本、生成资产和发布门槛 |
| [仓库导览](docs/REPOSITORY.md) / [架构](docs/ARCHITECTURE.md) | 代码阅读顺序与后续优化 |
| [服务商](docs/PROVIDERS.md) / [来源与复用](docs/REFERENCES.md) | 托管 API 契约和历史溯源 |
| [历史归档](docs/history/README.md) | 此前交付与验证记录，不能视为当前验证结果 |

当前 Draft PR 的 GitHub Actions 验证会执行干净安装、类型检查、离线测试、合成基准、源码核验、npm 打包检查，并使用官方 MCP 客户端和可选 Readability 解析器做独立联通测试。是否通过以最新提交对应的 CI 为准。未配置凭据时实时 API 检查会跳过，因此不声称真实搜索服务商质量、费用或正式 MCP Conformance 已经过验证。

MIT；保留原始 SmartSearch / GuDaStudio 版权声明。见 [LICENSE](LICENSE) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
