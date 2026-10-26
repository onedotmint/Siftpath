# 测试与证据索引

## 当前验收状态

当前发布候选版本为 **2.1.0**，尚未创建 Tag/Release 或发布 npm；变更与兼容性见 [Release Notes](RELEASE-2.1.0.md)。PR [#3](https://github.com/onedotmint/Siftpath/pull/3) 已按既有 merge-commit 策略合并至 `main`：`6af5846f3c4c43368978b51eb93c16701d4fce2b`，文件树与 RC `63d004ad44f233e103f2d83c482cb9703d0f20cb` 一致。[合并后 CI 40259123093](https://github.com/onedotmint/Siftpath/actions/runs/40259123093) 的 Linux/Windows × Node22/24 四格均通过。以下历史 RC 记录保留原样，不冒充最终 2.1.0 提交验收。

历史 RC 本地 **223/223** 离线通过；本轮历史 `/tmp` 正文目录已不存在，正常套件明确跳过该单项而不补抓网络。四家认证已有业务成功记录，不混作闭环证明。**本轮模型短请求通过，自主 Agent 闭环仍未完成**：授权后的普通请求返回 OK；随后唯一真实 Pi 会话被临时验收 connector 的隐式 HTTPS 端口校验缺陷在 TLS 前阻断，0工具/0供应商业务/无答案，未补试。这不是外部模型超时或 Siftpath 实现故障的证据，详细计数和最终版本检查见文末。

## 当前命令

```bash
npm ci
npm run check                  # typecheck + build + tests/*.test.mjs
npm run test:setup             # Linux PTY setup smoke，需 Python 3
npm run verify:source          # 分发与 lock/入口一致性
npm run pack:dry               # 构建并检查 tarball 内容
```

`npm run test:live` 会构建并运行 opt-in 测试；没有设置任何 live 开关时应跳过网络/模型测试。运行前检查继承环境，不能把“默认跳过”当成真实能力验收。以下仅列当前入口，不是本轮已执行记录：

| 显式开关/入口 | 范围与边界 |
|---|---|
| `SIFTPATH_CONTRACT=1 npm run test:live` | initialize/tools/list；发现成功不证明 Key、业务或质量 |
| `SIFTPATH_LIVE=1 npm run test:live` | 真实搜索/阅读；可能消耗额度，缺凭据应明确跳过 |
| `SIFTPATH_LIVE=1 SIFTPATH_LIVE_STDIO=1 npm run test:live` | 再验证 Siftpath stdio 两工具链路 |
| `SIFTPATH_PI_LIVE=1 SIFTPATH_PI_MODEL=provider/model node --test tests/live/pi-model.test.mjs` | 真实 Pi/模型及供应商；必须另行授权模型与业务预算 |

历史专项实验不要以通用 live 开关重建；按下方文档/报告核对边界，需要新调用时另行授权。离线重放保存结果不应自动补抓缺失材料。

## 关键覆盖与最终验收清单

本轮离线回归覆盖以下边界；mock 不代表真实供应商能力：

- **接口**：仅 web_search/web_read；reader 支持任意合法已配置 ID；不传使用 routes.read，显式仅一家且不回退；CLI `--reader`，拒绝撤回的 mode 接口。
- **focus**：按 binding 中实际 `$focus` 映射在业务前检查，支持嵌套；不支持返回 `FOCUS_UNSUPPORTED` 且不调用该家、不静默转全文。上游 notes 原样保留，不把匿名 question 算成聚焦成功。
- **配置/setup**：新默认 Tavily/Exa/Jina、fallback=[]、Brave disabled；磁盘既有 v2 省略路线兼容、v1 旧启用语义；显式 routes/Key/custom binding 不丢，quick 保留可用路线且不自动加 fallback。匿名必须显式选择，不在认证错误后重试匿名。Firecrawl 新 HTTP 认证与旧 stdio 不重写；Jina 3×250 窄迁移。
- **协议/生命周期**：官方 SDK 的真实本地 stdio/HTTP fixtures、握手与工具发现、会话复用/失效、配置热更新/旧 Router 退役、取消/期限不启动后备、HTTP body 断开、并发 close 与 stdin EOF。
- **输出/安全**：完整 JSON 字符预算、Unicode/转义、来源与原始 URL、警告、text/structured 精确去重及反例、代码/表格保留；配置权限/原子保存/超限保全、敏感 URL/符号链接拒绝、环境 Key 不落盘。
- **安装/UI**：Pi 注册两工具、遮罩 Key、取消不保存、READY 与最近测试分离、test all 全跳过不报成功、生产依赖隔离安装/SDK import；跨平台由最终 CI 记录确认。

Mock 文本只证明协议与逻辑；工具调用成功也不等于事实完整或模型回答正确。

## 历史实验结果索引

保留原始 JSON、公开原文 fixtures 和失败样本，不用逐轮操作日志混充当前说明。

| 历史材料 | 保存的证据与结论 |
|---|---|
| [reader-comparison-results.json](https://github.com/onedotmint/Siftpath/blob/main/docs/reader-comparison-results.json) | 8 页 Jina/Firecrawl 普通读取 + 2 次 Jina 聚焦；另一次 Pi 部署验证，共 19 次授权业务读取。全文固定事实：Jina 原始21/24→最终18/24，Firecrawl24/24→21/24；本地裁剪7/8与5/8。不是全文完整度或随机 A/B |
| [MODEL-EXPERIENCE.md](MODEL-EXPERIENCE.md)、[model-experience-results.json](https://github.com/onedotmint/Siftpath/blob/main/docs/model-experience-results.json) | 精确镜像去重；8 个真实 Pi 会话、网页供应商0次，6单元有完整记录。离线可保留原文，但真实行为验收未通过；未证明新说明减少总调用/token |
| [SELECTIVE-READING.md](SELECTIVE-READING.md)、[selective-reading-schemas.json](https://github.com/onedotmint/Siftpath/blob/main/docs/selective-reading-schemas.json) | 2026-10-24 Jina/Firecrawl 各一次发现，业务0/模型0；固定源码、REST/MCP区别、原生能力边界 |
| [selective-reading-results.json](https://github.com/onedotmint/Siftpath/blob/main/docs/selective-reading-results.json) | 保存正文上的 ATX 导航/同字符串切片与 SHA-256；导航小但不是证据，不证明重新请求同节或模型自主选节成功 |
| [firecrawl-css-results.json](https://github.com/onedotmint/Siftpath/blob/main/docs/firecrawl-css-results.json) | 后续2次匿名官方 MCP：RFC76/76标题、141正文anchor；Python容器表格/条件保留，两例原始→最终逐字一致，无本地裁剪。各1 credit、均cache hit；无模型/货币账单/多行缩进验收 |
| [dual-reader-results.json](https://github.com/onedotmint/Siftpath/blob/main/docs/dual-reader-results.json) | 已撤回 mode 原型：6会话、18模型请求、11供应商读取（Jina10/Firecrawl1）。RFC原始有目标但本地预算后丢失，任务未完成；未通过保留门禁，不再维护其 patch/harness，现由 reader 契约替代 |

### 需要保留的历史解释

- Jina SQLite 窗口对照：旧1×100一次覆盖1/3；3×250两次、4×160两次各3/3，均未裁剪。单页小样本促成3×250预设，不证明普遍最佳或匿名聚焦成功。
- 8页对照中 Jina RFC 原始正文跳过目标第5节；Firecrawl原始有目标、最终前缀丢失。上游缺内容和本地裁剪是两类故障，不能都靠省略 focus 或换 reader 解决。
- 普通读取、焦点映射、Schema发现与付费账户认证是不同验收。历史 Exa/Jina/Tavily/Firecrawl 匿名成功不代表 Key 成功；缺 Key 的 Brave 真实搜索未获验证。部分原始 MCP/正文仅在报告列出的临时目录，可能失效；公开 CSS fixture 不依赖该目录。
- 历史 Pi两工具调用及 Ubuntu/Windows × Node22/24 CI 曾成功；不能转述为新 reader/兼容实现的本轮结果。模型回放也有 guard/fixture代表性限制，失败没有通过换模型或追加额度消除。

公开 CSS 原文与 DOM 期望保留在 `tests/fixtures/firecrawl-css-rfc-headings.md`、`firecrawl-css-venv-container.md`、`firecrawl-css-dom.json`；去重基线在 `model-experience-baseline.json`。JSON报告/原文不因文档压缩删除。

## 此前整合轮次：离线执行记录

- `SIFTPATH_SELECTIVE_ARTIFACTS=/tmp/siftpath-reader-compare-H012au npm run check`：typecheck、build、211/211 测试通过。额外环境仅指向已保存正文，未补抓网络；目录不存在时对应历史正文检查会明确跳过。
- 实际 Pi CLI RPC 加载 `builtin:mcp` + 生产扩展，发现且启用恰好两个 Siftpath 工具、reader/focus schema 和一次 `/siftpath` 注册。临时 HOME/配置、环境白名单、fetch/socket 阻断；0 prompt、0 模型推理、0 真实供应商业务。未安装本机 Pi 时明确 skip，不用模拟注册冒充。
- 本地官方 SDK HTTP 服务验证 Firecrawl Bearer header、原生 Markdown/objective 参数及代码/表格；这不是付费账户认证证明。mock 路由与 focus 执行由独立回归验证，不归于 Pi 加载验收。
- `npm run test:setup`：真实 Linux Clack PTY 通过，包括键盘操作、Key 遮罩/新增/替换/保留、取消、显式匿名与不自动诊断。
- `npm run verify:source`：81 个分发/入口文件检查通过；`npm run pack:dry`、`git diff --check` 通过。撤回 patch/harness 已移除，历史 JSON 与原文保留。
- `npm run test:live`：显式将所有 live 开关设为 `0`，16/16 跳过、0 业务/模型调用；不是供应商能力验证。

此前整合轮次未跑新 Windows/Node22 CI、真实账户认证或模型答案质量；后续有限真实验收见下。16,000 字符预算仍可能裁掉长文关键证据，不以换 reader 宣称已解决。

## 2026-10-25：认证供应商与真实 Pi 端到端验收

### 初次验收结论与边界（Firecrawl 补验前）

**证据不足**：Tavily、Exa、Jina 的本次认证业务通过；Firecrawl 未配置，无法验收四家闭环。Pi B 交付了语义基本正确的答案，但代码逐字保真不通过；Pi A 没有最终答案。未发现已复现的 Siftpath 路由/映射/裁剪实现缺陷，不能据此要求功能重构，也不能宣布全面可发布。三家已验证路径可有限日常试用；完整四供应商发布门禁尚缺证据。

脱敏逐次调用、原生 MCP 文本、最终工具结果、Schema、完整提示、公开答案及 usage 已追加到现有 [model-experience-results.json](https://github.com/onedotmint/Siftpath/blob/main/docs/model-experience-results.json) 的 `liveAcceptance20261025`；顶层旧实验及 runs 原样保留。没有新增研究文档或修改生产代码/配置。

### 实际配置与认证

读取 `/home/dotmint/.config/siftpath/config.json`，不是 anonymous 示例。search=tavily、read=jina；general/research=tavily、semantic=exa；用户已有 searchFallback=[exa]、readFallback=[]；预算仍为 16,000 字符。保留这些设置，测试闸门仅在执行前阻止后备请求。原配置字节哈希前后一致。

| Provider | 启用与认证状态 | 实际连接 / 工具 | 连接 / tools/list / 业务 |
|---|---|---|---|
| Tavily | enabled，私有 Key 注入环境 | stdio `tavily-mcp@0.2.22`，`tavily_search` | 通过 / 通过 / 通过 |
| Exa | enabled，私有 Key 注入环境 | stdio `exa-mcp-server@3.4.2`，`web_search_exa` | 通过 / 通过 / 通过 |
| Jina | enabled，Bearer header | HTTP `https://mcp.jina.ai/v1`，`read_url` | 通过 / 通过 / 通过 |
| Firecrawl | **disabled，缺 FIRECRAWL_API_KEY** | 已保存旧 stdio `firecrawl-mcp@3.33.4` / `firecrawl_scrape` | 未尝试 / 未尝试 / 跳过 |

Firecrawl 没有被改成新 HTTP 预设，没有试匿名，也没有声称其 Key 或 creditsUsed 已验证。所有实发业务都带配置凭据；没有认证失败后降级。

### 第一阶段：各家至多一次

| 实发编号 | 调用及可核对来源 | 最终正文 / 序列化结果字符数 | 结果 |
|---|---|---|---|
| 1 | Tavily general：`site:sqlite.org WAL automatic checkpoint default 1000 pages`，max_results=5、search_depth=basic；[WAL](https://www.sqlite.org/wal.html)、[auto-checkpoint](https://www.sqlite.org/c3ref/wal_autocheckpoint.html) 等 5 来源 | 4,865 / 5,439 | HTTP 200，MCP 成功 |
| 2 | Exa semantic：自然语言查找官方 WAL checkpoint 技术资料，numResults=3；[WAL](https://sqlite.org/wal.html)、[C API](https://sqlite.org/c3ref/wal_autocheckpoint.html)、[源码](https://sqlite.org/src/doc/tip/src/wal.c) | 9,366 / 9,831 | HTTP 200，MCP 成功 |
| 3 | Jina：WAL 原生 question 聚焦默认阈值、提交触发和执行线程；topk=3、chunk_size=250 | 5,298 / 5,706 | HTTP 200，MCP 成功 |
| — | Firecrawl：禁用且缺 Key | — | 未发业务请求 |

实际映射字段均存在于该次发现的官方工具 Schema，必填参数齐全；随后业务确实接受，不以 tools/list 代替业务成功。WAL 返回证据包括 COMMIT 使 WAL 达到 1000 页、最后连接关闭、同提交线程、可配置/关闭阈值及 PASSIVE 可能不完成。

本轮五个成功 MCP 响应均只有一个 text block，无 structuredContent 镜像；归一化正文与原生文本逐字相同。未新增重复封套或丢失原生文本；不同搜索结果中重复提到同一事实不是镜像去重对象。全部 `truncated=false`，第一阶段 `sourcesTruncated=false`；Jina 保留 FOCUS_MAY_OMIT_CONTENT，均保留 UNTRUSTED_WEB_CONTENT。不据此声称长文完整性已解决。

### 第二阶段：两个独立真实 Pi 会话

使用本地生产 CLI 与 `extensions/siftpath.mjs`，Pi 1.4.0 RPC、临时 HOME/agent 与私有快照；确认恰好两个 direct 工具、reader/focus Schema 和生产 `/siftpath` 一次注册。仅为预算与脱敏增加临时启动闸门，不替换真实网页结果。模型为已有配置的 `deepseek/deepseek-flash`，thinking=off；关闭 retry、compaction、cache warming。提示只给任务、最多两次业务请求、不得重试及引用要求，不指定品牌/意图/Reader。

**A：SQLite WAL**

1. 自主 `web_read({url:"https://www.sqlite.org/wal.html",focus:"automatic checkpoint trigger conditions, ..."})` → 默认 Jina，实发编号 4，成功。正文 5,367 字符；工具 JSON 5,776 字符，未裁剪。
2. 模型后续响应 `stopReason=length`，**公开最终答案为空**。验收侧为成本控制额外设置 `max_output_tokens=1800`；末次响应 1800 输出 token 全被报告为 reasoning，尽管 thinking=off。不得当作 Siftpath 16k 裁剪、答案正确或正常完成。未补发请求、换模型或调提示重跑。

官方返回足以支持默认 1000 页、COMMIT 阈值、最后连接关闭、同提交线程及 PASSIVE 条件，但 Pi 没有交付可评分答案。直接读已知官方 URL 有合理性、只花一次业务请求；没有搜索调用，**无法评价搜索意图选择或搜索→阅读定位链路**。

**B：Python venv**

1. 自主 `web_read({url:"https://docs.python.org/3/library/venv.html",focus:"How to activate ... and whether activation is required"})` → 默认 Jina，实发编号 5，成功。正文 4,049 字符；工具 JSON 4,470 字符，未裁剪。
2. 自主同 URL、`reader:"firecrawl"` **同时携带 focus** → 本地 `DISABLED`，工具错误 JSON 271 字符；未连接供应商、未消耗业务预算、未回退。生产工具说明明确 Firecrawl without focus，此选择未遵守说明；因 DISABLED 先返回，不能宣称实测得到 FOCUS_UNSUPPORTED。
3. 正常 `stop` 给出答案，并披露第二次失败和首轮占位符补回。

可观察判断：先聚焦关键条件、发现命令保真缺口后换 Markdown Reader 的方向合理，但额外携带 focus 不合理。它没有为了测试覆盖而被强迫选择 Firecrawl，也没有成功验证该 Reader。没有同 Reader 重复读取或失败重试。

答案覆盖 bash/zsh `source <venv>/bin/activate`、Windows PowerShell `<venv>\Scripts\Activate.ps1`、可能需要 `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`、激活只改变 PATH、可直接用环境解释器完整路径，因此激活非必需。引用 Python 官方 URL，与已知官方语义相符。

**保真限制**：本次原生 Jina 证据实际是 `source /bin/activate`、`\Scripts\Activate.ps1`、`#!/ /bin/python`，并把表格/代码扁平化；`<venv>` 在进入 Siftpath 前已丢失。模型声明按语义补回占位符，所以不判为隐瞒，但不能把补回后的代码当成已逐字保留/成功复核的在线证据。这是上游读取保真问题，不是本地 16k 丢失。

### 用量、预算与成本

**供应商业务 5/8 次**：第一阶段 3、A 1、B 1，全部成功；本地拒绝 1 次另记。其他 Provider 请求 0、后备 0、重试 0、匿名 0；未把未用预算转移到其他阶段。握手、GET/SSE、tools/list 与业务分别记录。

| 会话 | 已记录模型请求 | input token | output token | cacheRead token | cacheWrite | total token |
|---|---:|---:|---:|---:|---:|---:|
| A | 2 | 2,463 | 1,975 | 1,664 | 0 | 6,102 |
| B | 3 | 2,322 | 1,232 | 4,352 | 0 | 7,906 |
| 总计 | 5 | 4,785 | 3,207 | 6,016 | 0 | 14,008 |

这些是 Pi usage，不是字符换算；reasoning 已包含在 output 中，不再相加。没有可靠的逐工具 token 数据。模型配置的估价字段报告 cost=0，**不是账户零收费证明**；有缓存读取也不等于免费。5 次 provider-request hook 与 5 份响应 usage 对应；额外实验性模型 fetch hook 未观察到 wire 事件，不将它当独立网络计数证明，也不声称可观察网关内部请求。

- Exa 底层 API 返回 `costDollars.total=0.007` USD，`search.neural=0.007` 是同一总额的分类，不相加成 0.014；官方 MCP 文本未转发此字段。不是完整账单。
- Tavily 底层响应及 MCP、三次 Jina MCP 均未报告可用 Credits/usage，成本未知，不按请求数估价。
- Firecrawl 未调用，无 creditsUsed 可核对；不挪用历史匿名/cache-hit 的 1 credit 作为本轮数据。

预算在实际 Tavily HTTPS、Exa fetch、Jina MCP HTTP business send 前扣除，先计失败、不退款；全局 8、阶段一每家 1、每会话 2、重复请求/后备均 fail closed。离线 fake-transport 自检覆盖重复、第三次会话请求和第九次总请求阻断。缓存 Exa 官方包内有自动重试，但网络闸门阻止重复发送；另拦截其无关 `api.agnost.ai` 遥测，没有修改官方源码。供应商内部服务编排与最终账单不在此边界内。

### 后续与回归

本轮不修功能、不扩 16k、不改默认路线或现有 fallback，不追加真实调用。未来要补齐证据，需用户私下配置并启用 Firecrawl，以及另行授权充分但受控的模型输出预算；不要求展示 Key。小样本不支持可靠性/速度/普遍成本排名。

结束后离线回归结果记录于下方；未提交、推送、发布，临时凭据副本在归档后清理，用户原件不动。

收尾离线回归：`SIFTPATH_SELECTIVE_ARTIFACTS=/tmp/siftpath-reader-compare-H012au npm run check` **211/211 通过、0 跳过**，`npm run verify:source` 81 文件通过，`git diff --check` 通过；归档 JSON 可解析且旧记录语义未变，公开证据凭据扫描通过。临时配置/模型认证副本已清理，原私有配置哈希未变。硬调用闸门仅属于此次验收设施，不代表生产已内置账单硬上限；Exa 官方包的重试/遥测行为仍是需要了解的上游边界。

## 2026-10-25：Firecrawl Key 配置后的单次补验

用户自行配置并启用 Firecrawl 后明确授权继续。本次只补第一阶段 Firecrawl 的 **1 次**，沿用原 8 次总预算；没有重试、后备、匿名请求或新 Pi/模型会话。累计实发 **6/8**：第一阶段四家各 1，Pi A 1，Pi B 1。

### 认证、发现与业务

- 最新配置为 enabled / READY、私有 FIRECRAWL_API_KEY、官方 HTTP `https://mcp.firecrawl.dev/v2/mcp`。在实际业务发送前校验 Authorization 与配置解析出的 Bearer **一致**，不保存/打印认证头或 Key。
- 连接成功、tools/list 成功且 binding 字段/必填项匹配；随后 `firecrawl_scrape` 实际业务成功、HTTP 200、非 isError，三项独立记录。
- 请求：`url=https://docs.python.org/3/library/venv.html`、`formats=["markdown"]`、`onlyMainContent=true`、`objective="Read the supplied public webpage as Markdown."`。没有 focus。
- 当前私有配置字节哈希补验前后一致；临时凭据副本已清理，没有修改用户保存的路线、fallback 或 16,000 字符预算。

### 原文、裁剪与保真

原生 Markdown **37,909 字符**，原生 JSON text **41,370 字符**。text 与 structuredContent 是逐项完全相同的镜像；Siftpath 未再追加第二份 structuredContent。最终 content **15,183 字符**，整个 WebResult JSON **16,000 字符**，`truncated=true`、`sourcesTruncated=false`；最终正文是去重后原文的精确前缀。

离线逐项断言确认：以下内容在原生与最终结果中均保留，不需要靠模型补写：

- Markdown 激活命令表头与 `<venv>` 占位符。
- bash/zsh：`$ source <venv>/bin/activate`。
- Windows PowerShell：`PS C:\> <venv>\Scripts\Activate.ps1`。
- `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser` 及可能需要调整策略的上下文。
- “You don’t specifically _need_ to activate a virtual environment”、解释器完整路径说明和 `#!/<path-to-venv>/bin/python`。

因此本例比初次 Jina 结果保留了更准确的命令/占位符，且后来取得的原文支持 B 答案的核心命令与激活非必需语义；**不改变 B 当时只有缺损原文、复核未成功的事实**。也不据单页样本宣称普遍更优：HTML rowspan 转 Markdown 后，部分表格行只有两格而表头三格，平台列未展开，不能声称 DOM/表格结构无损。后部文档和 metadata 确实因 16k 被裁掉。

### 用量与当前结论

- 原生 `metadata.creditsUsed=1`、`cacheState="hit"`。text JSON 与 structuredContent 各出现一次，是**同一响应的镜像**，总计只记录 **1 credit，不是 2**。缓存命中不被视为免费，未取得货币账单。
- **最终被裁剪的 content 不含 creditsUsed**：费用字段在末尾 metadata 中，已被 16k 截去。此次能报告 1 credit，是因为验收单独捕获了原生结果；不能承诺日常模型总能从最终工具结果看到用量。
- 脱敏证据追加到既有 JSON 的 `liveAcceptance20261025.firecrawlFollowup` 与 `latestSummary`，保存一份原生 Markdown、所需 metadata、镜像证明、最终结果和逐项断言，避免把长 Markdown 镜像重复归档。
- **四家认证业务现在均有真实成功证据；完整 Pi Agent 发布验收仍为证据不足**。A 无最终答案、自主搜索意图及搜索→阅读链路未演示，且此次没有新增模型验证。未发现必须立即修复的新路由/映射实现缺陷；16k 文档与用量裁剪仍是已知限制。

补验后离线检查：输出/精确去重/Reader 定向回归 **23/23 通过**，`verify:source` 81 文件通过，`git diff --check` 通过。归档前已断言 7 项命令/条件在原生和最终结果均存在，验证新 Key 未进入公开 JSON，原私有配置哈希未变。未再发业务或模型请求。

## 输出稳定性修复：裁剪时保留必要元数据

根因已确认：旧 WebResult 没有独立供应商元数据位置，Firecrawl 将 metadata 放在 Markdown 后；现有 `fitOutput` 对整个原生 JSON 文本取前缀，导致费用/缓存字段被截掉。修复不改变 16,000 字符默认值、原生正文、来源逻辑或工具接口。

现在在**同一个 WebResult** 中增加可选 `metadata: { creditsUsed?, cacheState?, cachedAt? }`：仅识别工具名 `firecrawl_scrape` 的已观察根级 `{markdown:string,metadata:object}`，不递归猜结构、不匹配网页文字；也适用于配置成自定义 Provider ID 的原生 Firecrawl 工具。只投影有限非负数 creditsUsed、有界缓存状态及有效有界时间字符串；缺失或无效字段不输出。已验证的 structuredContent 优先，JSON text 为后备；不跨表示合并、不相加镜像、不推断货币费用。短原生 content 保持逐字不变，其中已有的 metadata 是原文副本，不是第二笔费用。

预算分配：来源/Provider/工具/警告及这个小型 metadata 先计入既有序列化预算，剩余空间沿用原有二分裁剪取最长正文前缀；没有额外预算或固定百分比。仅当元数据本身有效时增加字段，其他 Provider 的已保存输出做逐字段兼容比较。未知包装（包括未经验证的 data 子层）、其他工具及普通网页 JSON 不强行提取用量；日期/状态不合规范时省略，不修造值。

定向回归复用现有 JSON 中保存的真实 Firecrawl Markdown/metadata 与 Tavily/Exa/Jina 原生响应，以及 CSS 原文 fixture；部分 native envelope 从保留字段重建，明确不声称它与历史完整原始封套字节相同。覆盖 text/structured 镜像计数、冲突优先级、无费用/非法值/网页伪装、零值、短正文与代码/占位符/表格、Unicode/转义预算边界、自定义 Provider ID、现有精确去重。已通过 48 项输出/Router/CSS 定向测试。

新 Pi 验收尚未执行：本轮真实业务请求 **0**、新增模型推理 **0**。准备使用独立最多 3 次实发业务请求、1 个会话的预算；必须在报告模型与成本边界并取得本轮确认后才运行，不沿用此前 8 次预算，也不重跑旧 A/B。完整工程检查与真实验收结果后续补记。

本轮离线结果：完整 `npm run check` **218/218 通过、0 失败、0 跳过**，typecheck/build、`verify:source`（81 文件）、`pack:dry`（69 文件）及 `git diff --check` 均通过。对保存的完整 Firecrawl 原始响应离线重放：最终正文由 15,183 变为 **15,099 字符**，整个 JSON 仍为 **16,000 字符**；顶层 metadata 保留 creditsUsed=1、cacheState=hit、原 cachedAt，原始关键命令/条件仍在。这里只重新处理旧响应，没有再次消耗 credit；详情见既有 JSON 的 `outputMetadataRegression`。

新闸门准备于 `/tmp/siftpath-final-acceptance-SKvhp3`，**尚未运行真实 Pi**。假网络自检通过 Jina/Firecrawl 共享第 4 次请求阻断、重复请求/匿名拒绝及 Exa 实际 fetch 闸门；启动脚本要求显式批准标记，未批准时在复制凭据/启动 Pi 前失败。提案：现有 deepseek/deepseek-flash、1 会话、预计 2–3 次业务、硬上限 3，最多 4 次模型请求且每次最多 8,192 输出 token（包含 reasoning），关闭重试/compaction/cache warming。这是最多 32,768 输出 token 的请求级上界，不是预计用满，也不是货币承诺；输入与供应商额度/实际金额按返回记录，未知不填零。必须取得本轮确认后才启动。

### 本轮唯一真实 Pi 会话：已确认、已执行，模型请求超时

用户在本轮确认问答中明确选择按提案执行后，启动了**唯一一个**新 Pi 1.4.0 RPC 会话，加载本地最新生产 CLI/扩展。两个 direct 工具、reader/focus Schema 与生产 `/siftpath` 命令均已确认。提示仅为 SQLite checkpoint 任务和 3 次业务上限，没有品牌、意图、Reader 或预置 URL。新预算未沿用历史剩余额度。

实际结果：1 次 before-provider-request 记录、1 份错误响应；约 **11.743 秒**后 `stopReason=error`、`Request timed out.`，**调用序列为空、公开最终答案为空、供应商业务 0/3**。虽然进程退出码为 0 且 agent_settled，但这不等于任务成功。没有重试、替代模型、追加提示或第二会话。

离线核对：临时设置的 provider timeout 为 **90,000ms**、进程总 deadline 为 **300,000ms**，自动 retry=false、provider maxRetries=0，首次 payload 设置 max_output_tokens=8192，未达到输出上限；没有 HTTP 状态码、cause 或有效模型用量。只能定位为**Siftpath 工具调用之前的模型 SDK/传输层请求超时**，无法据此区分客户端、网络或配置网关内部的超时，更不能归因于供应商参数或输出归一化。请求 thinking=off，但 Pi 实际有效级别被模型能力限制为 **minimal**；记录以实际 identity 为准。

Pi 错误路径返回 input/output/cache/total=0 和 cost=0；这是缺少成功用量报告，**不是可靠的零 token/零收费证明**。模型实际账单未知。供应商未收到业务请求，因此无本轮 Credits 可报告；前述离线重放 creditsUsed=1 仍是旧响应的数据，不是新费用。也无法据此次错误验证 8192 token 是否足够完成任务。

三层结论：
- **工程正确性**：修复、预算、原文保留、镜像处理及兼容性离线通过；新增字段只在已知 Firecrawl 原生结构出现。
- **Agent 行为**：尚未观察到搜索、阅读、选择或答案，不评为通过。
- **成本与上下文**：本轮只有 1 次已记录模型尝试、0 次供应商业务；模型计费未知，无有效工具结果字符数或供应商用量。

本轮脱敏结果追加至既有 JSON 的 `outputMetadataRegression.agentAcceptance`，旧实验不覆盖。私有配置哈希未变，临时配置/auth/models 凭据副本已清理。代码可提交评审并进入 CI（本轮不提交）；不能把这次失败当最终 Agent 发布验收通过，整体结论仍是**证据不足**，不是已证明 Siftpath 实现失效。继续真实验收需另获授权，不自动消耗余量。

真实尝试结束后再次运行完整离线回归：**218/218 通过、0 失败、0 跳过**；`verify:source` 81 文件与 `git diff --check` 通过。打包 dry-run 已在同一源码修复上通过，产物清单 69 文件；本轮未新增运行时依赖或模型工具。

## RC 工程审查与 CI 验收

审查范围是 `main` 已合并轻量重建之后的全部累积源码/测试/文档，不只 metadata 最后一次修改。负载假设为每个本地 Pi/MCP 进程共享少量 Provider 连接与并发工具请求；不引入服务端多租户、缓存或费用调度。

确认修复的发布相关问题：

- **P2 冷连接取消不释放底层初始化**：旧代码只取消等待，initialize HTTP 请求或 stdio 子进程可能继续存活到 Provider deadline。现在共享连接有初始化控制器与等待者计数，最后等待者取消时移除并中止未就绪连接；单个等待者取消不会中断其他并发调用，已就绪连接仍复用。新增挂起 HTTP initialize 的取消/总超时、共享等待者及 stdio 子进程退出回归。
- **P2 日期校验不准确**：`Date.parse` 会把 `2026-02-30` 归一化成有效时间。使用已安装 Zod ISO datetime 校验拒绝不可能日历值，保留有效原生字符串，不新增依赖。
- **分发与验证缺口**：npm 从 `docs` 改为 `docs/*.md`，6 个历史原始 JSON 报告仍提交 Git、供回归读取，但不发 npm；Markdown 报告链接改到 GitHub。补充 `verify:package`，对实际 tarball 独立解包、离线按 lock 安装仅生产依赖，在禁止网络的进程中 smoke CLI/SDK，再用现有真实无推理 Pi RPC 测试加载已安装包。
- **CI 不能把 skip 算 Pi 验收**：Linux/Windows × Node22/24 均安装 pinned Pi 1.4.0，测试脚本支持显式 JS CLI 路径，避免 Windows 的 npm.cmd 执行差异；CI 明确将所有 live 开关设为 0、没有 API Keys，验证默认 live 跳过。
- 修正 SECURITY/DIAGNOSTICS 中 Quick setup 会重排可用路线的过期说明。SDK Server 弃用提示为上游迁移建议，不在此次RC引入协议重构。

本机首轮 RC 检查：全套无失败，历史临时正文目录未指定时对应单项明确跳过；真实 Pi 1.4.0 工作区与隔离 tarball 均加载成功，0 prompt/0 供应商业务。隔离包 **63 文件、约 428KB 解包**（最终文档更新会小幅改变大小），不存在 TypeScript/esbuild/Clack/Pi-TUI 开发依赖，却能启动CLI/SDK与通过宿主Pi加载。tarball 的生产依赖按现有lock从npm缓存安装，不依赖工作区 node_modules。最终完整命令、秘密扫描、PR/CI结果待本轮实际执行后补记，不把旧轮次CI当当前通过证明。

版本仍为 2.0.1 仅表示源码身份；RC不创建tag/release、不发布npm。四家认证成功及模型请求超时记录仍是历史证据；本轮不新开付费Agent验收，不宣称自主搜索→阅读→回答闭环通过。

RC 本地最终记录（Linux / Node v24.22.1）：`npm ci --ignore-scripts`、`npm run check` **223/223 通过**（指定既有离线正文目录，无网络）、Linux PTY 通过、`verify:source` **83 文件**通过、`verify:package` 真实tarball隔离安装与宿主Pi 1.4.0加载通过；63个分发文件。默认普通check若无历史临时正文目录为222通过/1明确skip，CI不依赖此目录。16个live测试全部显式关闭并skip。秘密检查覆盖源码/构建/测试/报告/示例等127文件，与本地已配置秘密值精确比较及常见token/私钥模式匹配均无发现（不是完备秘密审计）；私有配置哈希未变。

打包复验曾因npm本地缓存缺锁定tarball而ENOTCACHED；用正常 `npm ci --ignore-scripts` 补齐公开依赖缓存后，严格 `--offline` 隔离安装通过，未放宽断言。历史正文回归现在仅输出诊断，不再重写已有JSON报告；临时子代理定义已清理，不进入提交。跨平台CI尚待实际PR运行，以下不预先记绿。

PR [#3](https://github.com/onedotmint/Siftpath/pull/3)，初始RC提交 `9b5d137`。首次远端 [run 40197322012](https://github.com/onedotmint/Siftpath/actions/runs/40197322012) Linux Node22/24通过，Windows两版在真实CSS原文字节SHA-256断言失败：checkout CRLF转换改变了fixture字节。新增窄范围 `.gitattributes` 对两份原生Markdown设为 `-text`，不转换、不修改原文、不降低哈希断言；四格CI需重跑确认。

修复后的 PR CI 已实际通过：[pull_request run 40197596202](https://github.com/onedotmint/Siftpath/actions/runs/40197596202)，代码提交 `cfcb8c4ae623d553bacb2f573c8a484a3da92cee`；同提交 push run 40197593436 也通过。

| 远端平台 | Node 22 | Node 24 |
|---|---|---|
| ubuntu-latest | 通过 | 通过 |
| windows-latest | 通过 | 通过 |

四格均：完整普通离线套件222通过/1仅限历史临时正文目录的明确skip、0失败；真实Pi1.4.0工作区加载通过；63文件tarball仅生产依赖离线隔离安装、CLI/SDK和实际Pi加载通过（Pi检查本身0 skip）；16 live全部关闭并skip。Linux PTY两版通过，Windows不运行Linux PTY脚本，但Pi原生菜单/遮罩与非PTY配置测试仍在全套中。CI没有生产Key，没有供应商业务或模型prompt。

GitHub仍有checkout/setup-node v4自身Node20动作运行时弃用提示（runner强制Node24执行动作），非项目Node22/24测试失败；上游SDK Server弃用提示同样未改造。建议合并作为工程RC供评审，但正式npm发布仍应先完成另行授权的Agent闭环验收并明确发布版本；本轮未合并、创建Tag/Release或发布npm。

## 2026-10-26：2.1.0 发布准备（未经正式发布授权）

PR #3 已合并为 `6af5846f3c4c43368978b51eb93c16701d4fce2b`，无新增 review/冲突阻塞；merge tree 与指定 RC 完全相同。[main CI 40259123093](https://github.com/onedotmint/Siftpath/actions/runs/40259123093) 四格均成功。远端尚无 Git Tag/GitHub Release；npm `latest=2.0.1`，已发布列表中无 `2.1.0`。这些是本轮准备时的快照，正式发布前须再查。

发布准备仅更新 package/lock 的版本身份及 README、MIGRATION、本文和 [Release Notes](RELEASE-2.1.0.md)，不更改生产源码、路由、依赖或私有配置。2.1.0 相对于已发布 2.0.1 为向后兼容扩展，不把此前轻量重建的旧引擎移除记成本次破坏性变更。

本机 Linux / Node v24.22.1 / npm 11.19.1 / Pi 1.4.0 已执行：

- `npm ci --ignore-scripts --no-audit --no-fund`、`npm run check`：typecheck/build 通过；**222 passed / 1 skipped / 0 failed**，共223项。唯一跳过项是历史临时完整正文回放，原目录已不存在；没有补抓网页或弱化断言。保存在 Git 的 CSS 原文/哈希与其他回归正常执行。
- `npm run test:setup`：真实 Linux Clack PTY 操作、Key 遮罩、取消与显式诊断边界通过。
- `npm run verify:source`：85文件通过；package/lock/入口一致。`git diff --check` 通过。
- `npm run test:live`：全部9个 live/contract 专项环境开关显式设为0，**16/16明确跳过**；不是认证或模型成功证明。
- `npm run pack:dry`、`npm run verify:package`：64个分发文件；实际tarball按lock离线仅安装生产依赖，CLI version/help/setup/doctor/status、SDK自导入与依赖隔离通过；开发依赖、历史原始JSON报告、源码、测试和凭据不入包。
- 工作区及隔离包均由**真实 Pi 1.4.0** RPC 加载生产扩展与 builtin MCP，恰好发现/启用两个 direct 工具，验证 reader/focus/custom ID Schema 与 `/siftpath` 唯一注册；**0 prompt / 0模型推理 / 0真实供应商业务**，不是Agent闭环。

上述结果先在发布候选工作树取得，并已在准备提交 `1ff330af9df256cefa31783ac63681580058474a` 重跑：[四格CI 40259661862](https://github.com/onedotmint/Siftpath/actions/runs/40259661862) 和 [打包CI 40259663684](https://github.com/onedotmint/Siftpath/actions/runs/40259663684) 全部通过，CI tarball 与本地逐字节一致。该段是付费验收前的工程快照；下节补记后最终文档提交仍须完整复验，准确SHA和最终产物完整性以发布门禁报告为准。已知16k预算不因工程检查通过而消失。

### 本轮授权后的模型与唯一 Agent 验收：准确区分失败归属

1. **模型连通性通过**：先单独授权普通请求，原配置 `deepseek/deepseek-flash` / `openai-responses` / `api.deepseek.com/responses`，仅输入 `Reply exactly OK.`；1次实际发送，258 bytes，HTTP200、stop/completed、正文 `OK`，总耗时1.381秒。input=34、output=2、total=36 token；实际reasoning=minimal，不宣称关闭推理。Pi缺省价格产生cost=0，不是免费或实际账单证明。0 Agent/0工具/0供应商业务；没有改API或重试。
2. **Agent闭环未完成**：另获授权后，仅创建1个真实Pi1.4.0 AgentSession并提交1条原文SQLite WAL任务；不指定Provider、intent、Reader、URL或结论。限额为4次模型、每次8192输出token含推理/累计32768、请求体256KiB、共享3次供应商业务、90秒模型/60秒业务/600秒会话；实际传输预扣且失败不退款。
3. 生产extension→builtin MCP→候选CLI本地initialize/tools/list通过，两个生产schema正常。19组实发前离线集成检查覆盖模型/跨子进程共享业务计数、第四业务/第五模型、重复/匿名/fallback和内部重发等；但MockAgent绕过了真实connector，**漏测隐式HTTPS端口**，不能把19组通过当完整live门禁可用性证明。
4. 唯一会话首次模型尝试在dispatcher预扣后约4ms由临时验收connector拒绝：undici传入默认HTTPS端口为 `""`，临时校验错误地只接受 `"443"`，产生 `BACKEND_ENDPOINT`；Pi最后aborted/Request aborted、无HTTP响应。会话总耗时1.100秒，模型runtime约120ms。事后只用假TLS离线复现，相同错误且TLS调用0；推断发生于任何TLS/HTTP外发前，不把1次预扣说成远端收到1次请求。**这是本次验收代码缺陷，不是DeepSeek超时、协议不支持、供应商或Siftpath故障。**
5. **实际调用序列为空、公开答案为空、来源为空**；供应商业务0/3、远程握手/发现0、无供应商usage/credits/cache响应。Pi错误默认token/cost=0不是有效计费报告，实际账单unknown。SQLite答案与搜索→阅读→回答链路均不可评分，未代写补全。唯一会话及锁已消费，失败后停止，无第二会话、追问、换模型或补试。

模型与Agent脱敏完整证据分别保存在本机 `~/.cache/siftpath-release/2.1.0/model-connectivity/`、`agent-acceptance/`，含脚本hash、一次性锁、原始本地MCP、逐次事件/usage、离线postmortem与前后配置hash；不进入npm包。用户配置/凭据/路线未变，验收子进程均退出。公开npm依赖曾按原固定版本下载到隔离缓存，未运行安装脚本或用额外业务请求预试；不是生产依赖变更。

发布评估：工程实现、既有四家认证和npm候选包证据独立保留；**不能宣布完整Agent验收通过**。在明确披露验收脚本失败及未验证闭环的前提下，可以由维护者决定是否接受剩余风险发布轻量工具；本轮不无限重试。正式门禁还包括用户明确确认准确最终提交、恢复当前返回E401的npm发布认证、再查版本未发布。没有创建Tag/Release或执行publish。
