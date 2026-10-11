# Siftpath

**面向 AI Agent 的网页证据检索：搜索来源、提取网页、汇总带出处的证据，控制模型上下文大小。**

Siftpath 是证据引擎，不是答案生成器或自动研究 Agent。SDK、CLI、Pi 和 MCP 共用一个 TypeScript 核心，返回结构化 `EvidencePack`，由调用方判断、引用并生成答案。

源码仓库：<https://github.com/onedotmint/Siftpath>。当前包名为 `@onedotmint/siftpath`，主命令为 `siftpath`，版本仍为 **`2.0.0-next.1` 预发布版**。不假定该版本已发布到 npm，也不假定已有 Release tarball。

## 从源码安装

需要 Git、Node.js 22+ 和 npm。构建后的包**零运行时依赖**，不需要 Python、本地模型或浏览器下载。以下是供使用者执行的安装步骤；**本轮文档整理未执行这些命令**，也未验证干净安装或构建。

```bash
git clone https://github.com/onedotmint/Siftpath.git
cd Siftpath
npm ci --ignore-scripts
npm run build
npm link
siftpath setup
```

所有 npm 命令在仓库根目录执行。`build` 会先同步集成资产，再生成 `dist/`。`npm link` 将当前源码包链接到全局命令；保留该源码目录。若不想全局安装，完成前四步后直接用 Node 调用：

```bash
node dist/cli.js setup
node dist/cli.js search "HTTP conditional request documentation"
```

可选：维护者或使用者可在根目录运行 `npm pack`，由 `prepack` 自动构建并生成本地 `.tgz`，然后通过 `npm install -g ./onedotmint-siftpath-2.0.0-next.1.tgz` 安装。先生成产物，不要把此文件名当作已提供的下载链接。SDK 消费方也可安装这个本地 tarball。

`setup` 提供隐藏输入的密钥配置，保存到项目外的私有用户配置。一个搜索服务商密钥即可开始；未配置的服务商会跳过。Exa、Parallel、Tavily 同一密钥也支持提取；只有 Brave 时可以搜索和汇总摘要，但不能提取网页。配置路径、权限和旧配置复用规则见[配置文档](docs/CONFIGURATION.md)。

已有环境变量密钥时可以跳过 setup，服务商凭据名称不变：

```bash
export EXA_API_KEY='your-key'
siftpath doctor
siftpath search "HTTP conditional request documentation"
siftpath fetch https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/ETag --query "conditional requests"
siftpath gather "Compare HTTP ETag and Last-Modified revalidation" --mode quality --max-tokens 4000
```

`doctor` 仅检查本地配置，不访问网络；检索命令会调用已配置的托管服务，可能产生费用。普通检索向 stdout 输出紧凑 JSON，`--trace` 向 stderr 输出诊断，不直接输出最终文章。默认 token 数是估算值；SDK 可提供 tokenizer。

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
The `url` is source metadata only: no DNS lookup or HTTP fetch happens. Input is capped at 1 MiB; the normal complete-result token budget applies. This is deliberately **not** a fourth AI/MCP tool. Basic cleanup is dependency-free and may retain navigation. For article-oriented parsing, explicitly install `@mozilla/readability` and `linkedom` in the same Node resolution scope and use `--readability` (or `extractor: 'readability'`). These libraries are never installed by Siftpath itself. No Trawl, Chromium, Python, or local model is required.

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

旧 CLI、Pi 命令和环境变量仅作为兼容别名保留；旧配置不会自动搬迁。旧 npm 包不会自动切换成新 SDK。升级请看[迁移说明](docs/MIGRATION.md)。

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

本轮未安装依赖、运行测试、类型检查、构建、打包、基准或真实 API 调用；未验证客户端实际安装。锁文件已补齐此前缺失的 integrity，但干净安装仍待验证。已有离线测试和合成回放不证明真实服务商质量或费用。

MIT；保留原始 SmartSearch / GuDaStudio 版权声明。见 [LICENSE](LICENSE) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
