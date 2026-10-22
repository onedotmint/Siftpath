# 测试与本轮验证记录

## 基线与边界

- 开始时位于 `main`，工作区干净，已有提交 `8fc8a3c`；创建独立 `rebuild/lightweight-mcp-router` 分支，没有修改/合并 main。
- 先安装原有锁文件依赖并运行原实现，97 项旧测试全部通过，确认原来的 EvidenceEngine、手写 MCP 协议、HTTP Adapter 和生成插件的依赖关系后才替换。
- 旧引擎/融合/评分/Gather/HTTP Server/专用插件已删除；对应测试与历史基准不再作为新版覆盖率或真实质量依据。
- 本轮没有发现 BRAVE_API_KEY、EXA_API_KEY、JINA_API_KEY、TAVILY_API_KEY、FIRECRAWL_API_KEY 环境凭据；真实调用采用官方当前匿名额度，不读取其它软件的秘密存储。

## 当前自动化检查

```bash
npm ci --ignore-scripts
npm run check
npm run verify:source
npm run pack:dry
npm audit --omit=dev
```

当前结果：

| 检查 | 结果 |
|---|---|
| `npm run typecheck` / TypeScript 5.8.3 | 通过 |
| Node 24.21.0 当前离线测试 | **81/81 通过** |
| Node 22.23.3 当前离线测试 | **81/81 通过** |
| 源码分发/lock 一致性检查 | 通过 |
| 运行时依赖审计 | 0 已知漏洞（不代表安全保证） |
| `git diff --check` | 通过 |
| npm tarball 隔离安装 | 通过；临时项目安装、CLI version/help/doctor、SDK import 和仅两工具断言通过；临时目录已清理 |

依赖只有两个直接运行时入口：官方 MCP SDK 与 Zod；SDK 自身具有约九十余个间接安装包，**不是零依赖**。构建前清理旧 dist，tarball 自动断言不包含旧引擎/插件/测试源码或秘密配置。

离线覆盖：

- 使用官方 SDK 启动真正的 stdio MCP fixture 子进程，真实协议握手、两工具 tools/list、search/read/错误/协议取消、CLI 与 SDK 共用调用路径。
- 原生 focus 参数映射、未支持 focus 提示、严格参数校验、保留 signed 原始 URL、来源/元数据封套。
- 单供应商成功即停止、按意图选择、缺凭据/禁用/不存在/不支持能力、失败/空文本/无来源/超时的顺序后备；阅读使用独立后备链且不会调用搜索供应商。
- 连接按需启动/复用/并发共享初始化；操作取消/总期限不启动后备；关闭中断挂起操作、重复 close、MCP stdin EOF 退出。
- 真正的本地 Streamable HTTP MCP、Bearer Header、不含 URL Key、复用会话、退出发送 DELETE；会话 404 后下一操作重新初始化。
- 取消和超时不只拒绝 Promise：测试确认服务端观察到原 HTTP 响应连接断开，并且并发另一次调用继续成功；4 MiB 上游响应限制。
- 完整序列化 JSON 的长度限制、转义密集文本不会误裁成空、Unicode 不切断代理项、文本摘要不丢 structuredContent、括号 URL 不被改坏或虚构重复来源。
- 私有配置权限/原子替换/符号链接拒绝、环境优先级、旧路径与显式 version-1 凭据兼容、拒绝敏感 URL 配置。

Mock 服务的搜索文字只是 fixture，不声称它证明某家真实搜索/读取质量。

## 官方 MCP 的接口契约检查（不调用搜索/抓取）

```bash
SIFTPATH_CONTRACT=1 npm run test:live
```

已实际完成：

- Brave 官方发布包 `@brave/brave-search-mcp-server@2.1.4`：stdio initialize/tools/list 成功，`brave_web_search` 要求 query；默认映射 query/count 均存在。
- Exa 官方发布包 `exa-mcp-server@3.4.2`：stdio initialize/tools/list 成功，`web_search_exa` 要求 query；默认映射 query/numResults 均存在。
- Jina 官方 `https://mcp.jina.ai/v1`：Streamable HTTP initialize/tools/list 成功，`read_url` 要求 url，question 参数存在。

Brave/Exa 使用非秘密占位值仅做发现，没有调用工具，不把这描述为 Key 有效或搜索成功。另阅读了 Tavily/Firecrawl README/真实参数和匿名发现情况，详见 PROVIDERS.md；初轮未执行业务，后续 setup 恢复轮已真实通过两家业务 MCP。

## 真实调用（明确 opt-in，可能使用额度）

```bash
# 默认全部 skip，不会自行用额度：
npm run test:live

# 每家至多一条业务请求；Brave 无 Key 则 skip：
SIFTPATH_LIVE=1 npm run test:live

# 再增加一次 Siftpath stdio 搜索、一次阅读：
SIFTPATH_LIVE=1 SIFTPATH_LIVE_STDIO=1 npm run test:live
```

本轮初次验证与最终修复后复验均成功；最终业务测试 **3 项通过，1 项缺 Key 跳过**（同次运行另有 3 项 CONTRACT 未开启而跳过）：

| 真实调用 | 结果 |
|---|---|
| Exa 托管 `web_search_exa`，匿名，query=Node.js official documentation，numResults=1 | 成功，真实来源 `https://nodejs.org/api/documentation.html`，输出约 3092 字符，无截断 |
| Jina 托管 `read_url`，匿名，url=https://example.com | 成功，返回 Example Domain 正文及原始 URL，输出约 1328 字符，无截断 |
| AI Agent 协议 SDK → Siftpath stdio → 官方 Exa/Jina | tools/list 只有 web_search/web_read；两工具真实调用成功，保留上述出处 |
| 随包 anonymous.json + 文档 CLI 示例 | search 实际跳过缺 Key 的 Brave 后由 Exa 返回 Node.js 官方文档；read 经 Jina 返回 Example Domain。CLI 输出保留 MISSING_CREDENTIALS 后备诊断及出处 |
| Brave 真实搜索 | **未验证：缺少 BRAVE_API_KEY**；有凭据后相同 live 测试会启用固定官方 stdio 包 |

匿名 Exa 托管搜索要求源码/固定 npm 包没有的 `objective`，live 配置和 `examples/anonymous.json` 已显式映射。正式默认仍使用固定 Exa stdio + Key，不把托管匿名 Schema 差异硬编码进 Router。

## 未验证与已知限制

- 未验证 Brave 真实结果、Exa/Jina 账户凭据下的计费/聚焦、Tavily/Firecrawl 的账号 Key 业务调用、OAuth、真实限流/余额耗尽。
- 重建时未打开实际客户端；后续已在本机 Pi 1.3.0 原生终端验收新增的命令转发扩展和真实 Exa/Jina 诊断请求，详见 DIAGNOSTICS.md。没有让额外 LLM 自行选择工具，也未验证其它客户端 UI。扩展不注册模型工具。
- 未在 Windows 实机运行；CI 保留 Ubuntu/Windows × Node 22/24。npx 冷启动可能超过默认 20s；建议提前缓存或配置更长供应商期限。npm 进程树的强制终止不声称有跨平台任意后代回收保证。
- 匿名额度、线上工具 Schema 与服务可用性会变；生产使用自己的 Key，按需重新跑 CONTRACT 检查。无 Key 的 Jina question 可能降级全文，本轮仅真实验证普通阅读。
- 输出只做原生结果封装和长度裁剪，不做相关性/事实核验；sources 是公开 URL 索引，不保证每条网页外链都支持 query。maxResults 传给官方参数，非自行解析后精确强制条数。
- 没有发布 npm、推送远程、合并 main 或部署后台服务。

AFT 本次部分作用域诊断使用外部 TypeScript 缓存，曾对新建 defaults.ts 持续报告陈旧的“未找到模块”状态；正式门禁采用项目固定 TypeScript 的 `npm run typecheck`、真实构建和两版本 Node 测试，均通过，不将部分缓存当作编译结论。

## 后续轻量诊断与 Pi 命令验收

新增 CLI `status`/`test`、私有最新测试记录、同包 `extensions/siftpath.mjs`；现有两个模型工具与 Router 不变。扩展不增加依赖或模型工具。详见 [DIAGNOSTICS.md](DIAGNOSTICS.md)。

本轮完整离线套件 **68/68** 在 Node 24.21.0 与 Node 22.23.3 均通过，类型检查、源码分发和 npm 打包检查通过。

新增覆盖单供应商绝不回退、分阶段失败/缺 Key/禁用/未配置、分页工具发现和完整输出 Schema 校验、认证拒绝、期限/输出预算/凭据变化使历史过期、1 MiB 历史淘汰边界、损坏历史不覆盖、Pi 命令参数/非零退出 JSON/原生通知转发/关闭取消。

已在实际 Pi 1.3.0 终端验收 `/siftpath`、`/siftpath test brave`、`/siftpath test all` 和测试后离线状态；Exa/Jina 经官方匿名 MCP 的三个阶段与真实请求均成功，Brave 明确缺 Key 跳过。另在临时 Pi 用户目录验证本地 `pi install` 后自动发现命令，不改个人 Pi 设置。没有调用 LLM 或其它供应商。

## 最终定点质量修复

先从源码构建并运行新增回归，四项缺陷、锁文件旧入口和并发 close 提前返回均在修复前失败；随后修复并重新从源码构建验证，不仅运行已有 dist。

- URL 标点与括号均改为线性尾部扫描/计数。Worker 隔离回归覆盖 100 KB 长尾右括号，以及长串句点、逗号、分号后接右括号；旧实现超过 5 秒，修复后四个案例含 worker 启动约 140ms（非性能 SLA）。
- 默认路由统一来自 defaultRoutes，验证省略、空对象、局部覆盖的一致性，以及显式顺序不被覆盖。
- 后备/focus 警告先进入结果，再进行唯一一次完整 JSON 裁剪；长来源加多条回退诊断仍保留可用正文，不突破预算。
- 两份同目录配置保留独立的最新诊断结果，旧目录级历史不导入、不覆盖；凭据/期限失效、文件权限和 1 MiB 限制保留。
- 本地 SSE 专项验证工具响应成功、突发断流和正常 EOF 截断后按期限失败、不重放、后续调用恢复；取消实际关闭 SSE 响应；通知 GET 断流不杀掉正常 POST。
- 并发 close 等待同一个 DELETE/子进程清理；DELETE 不响应时约 2 秒限时结束，不重复发送，关闭后拒绝新请求。
- 同一 fixture 明确证明诊断可以因声明的输出 Schema 不符而失败，同时正常业务调用仍可返回可读原生文本；二者不是等价验收，不削弱任何一条现有判定。
- Live 匿名配置直接复用 examples/anonymous.json；锁文件入口与 package.json 一致，且不含 smartsearch/smart-search。

源码构建后的完整离线套件现为 68 项；默认 live 命令仍全部 opt-in 跳过。额外显式开启官方契约和业务测试时，本轮 6 项通过、1 项因缺 BRAVE_API_KEY 跳过：三个官方 MCP initialize/tools/list 均通过，Exa 匿名搜索返回 Node.js 官方文档，Jina 匿名阅读返回 Example Domain，Siftpath stdio 两工具真实调用通过。本轮没有发布、推送或修改 main，也没有新增依赖/生产模块。

代码规模相对本轮修复前：生产源码（src 与 Pi 入口，含空行/注释）781 → 791 行，净增 10；测试及 fixture 752 → 891 行，净增 139；Live 文件自身 56 → 49 行。新增生产代码用于线性扫描、共享关闭 Promise 和契约边界说明。

## Clack 恢复与五家官方预设（当前增补）

历史来源：本地远端跟踪分支 `origin/feat/lightweight-html-mcp-2026`，`9d4b9ca` 的 Clack 首版，`b5939d1` 的密码校验与 `611e80e` 的终端尺寸验收。复用了 select/multiselect/password/isCancel 交互方式、取消不落盘、保留 Key 和 build-only 独立 esbuild bundle；不迁移旧 EvidenceEngine、旧 Pi 面板、Gather/用量/缓存逻辑。

当前 setup 迁移为版本-2 私有配置：使用空环境读取磁盘，避免保存环境 Key；显式保留/替换凭据、认证/匿名预设，保留自定义 MCP。默认意图和仍有效的意图路由不会因重跑向导被重置。格式化后超过 64 KiB 的配置在替换原文件前拒绝保存，保留原文件。路由只用已启用且凭据引用就绪的能力，搜索顺序后备供所有意图共享、主供应商自动去重。

自动化：当前 **81 项 Node 离线测试**，其中新增 Clack 注入测试覆盖匿名/Key/环境优先级/保留/替换/取消/默认意图/后备顺序，预设开关和打包延迟导入，超限配置不损坏原件。真实 `python3 tests/setup-pty-smoke.py` 适配历史 PTY 技术，验证方向键、Space 多选、Enter、Esc/Ctrl+C、隐藏 Key 新增/保留/替换、输入后取消不保存、默认搜索/阅读选择、匿名 Reader 无密码、拒绝测试不联网，以及明确确认时复用本地 MCP 的现有 testReport（不是官方测试成功）。Node 22/24 均从源码编译并打包后执行；Linux CI 增加相同 PTY 命令。

安装包：临时项目用 `npm install --omit=dev --ignore-scripts <tarball>`，确认没有 `@clack/prompts` 或 esbuild 安装目录，直接对安装后的 CLI 执行全部 PTY 用例成功，不依赖仓库交互模块。测试中的本地模拟 MCP fixture 单独由验收脚本提供，未作为产品依赖。当前 Pi 1.3.0 原生交互终端通过安装包扩展验收 `/siftpath` 和明确未配置的供应商测试，未改个人 Pi 设置。原有 MCP 两工具协议、取消和生命周期回归继续通过。最终生产依赖安装包还实测 tools/list 仅 web_search/web_read，web_search 经 Tavily 官方匿名 stdio 返回 example.com 来源，web_read 经 Jina 返回 Example Domain；不是仅单独 providerTest 成功。

官方验证显式运行 `SIFTPATH_CONTRACT=1 SIFTPATH_OPTIONAL_LIVE=1 npm run test:live`：5 项官方包/端点发现契约通过，2 项真实业务通过。Tavily 官方 `tavily-mcp@0.2.22` **stdio** Keyless 搜索（basic/max_results=5）连接+发现+请求成功，首次冷下载在内约 30.6s（业务约 3.9s）；Firecrawl 官方匿名托管 `firecrawl_scrape` 成功约 7.4s（业务约 0.65s）。不是 REST Adapter 或 Mock。Keyless stdio 在干净临时目录运行，避免上游包自动读取 .env。Tavily 匿名托管返回过 401，不选作匿名预设。

依赖方案完全沿用历史精确版本：`@clack/prompts@1.8.1` 和 `esbuild@0.25.12` 仅 devDependencies；直接 runtime dependencies 仍为官方 MCP SDK、Zod 两个。Clack 独立包约 111 KiB（未压缩），setup 动态 import，正常 Search/Read/MCP 路径不加载。相较本轮开始，自有生产代码（src + Pi 入口，含空行/注释）791 → 887 行，净增 96 行，生产模块 15 → 16，仅新增 setup-ui；setup.ts 57 → 35 行，删除手写终端输入逻辑。第三方 MIT 通知随包保留。

未验证：没有五家账号 Key，Brave 真实搜索、Tavily/Firecrawl 的账户 Key 业务调用及 Windows 真终端输入仍未实测；Exa 匿名业务沿用前轮验证；本轮仅为安装包 MCP 全链路再做一次 Jina 匿名阅读，不进行额外 LLM/研究调用。生产路径没有增加新模型工具、自动网络测试、融合算法或 Router 改造。Python 只用于 Linux 开发/CI验收，安装用户不需要 Python。
