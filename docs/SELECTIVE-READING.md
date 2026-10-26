# Selective Reading：既有源码与实测证据

调查日期：2026-10-24 UTC。本文保留既有调查，不是新研究或当前模型验收。**问题导向阅读保持默认；Firecrawl 原生 CSS 在两个已知结构样本有效，不据此新增通用 outline/section/selector/offset、分页或快照系统。**

当前仅 `web_search` / `web_read({url,reader?,focus?})`。reader 可选任意合法已配置 ID，显式仅一家无后备；focus 按 binding 实际 `$focus` 映射在业务前检查，不支持则 `FOCUS_UNSUPPORTED`、不调用、不转全文。映射成功不代表上游选段成功，尤其匿名 Jina 可能返回全文降级 note；保留原生 notes。历史 mode 原型已撤回，不再维护，由 reader 替代。

## 1. 证据等级

| 材料 | 做过什么 | 不能证明什么 |
|---|---|---|
| [selective-reading-schemas.json](https://github.com/onedotmint/Siftpath/blob/main/docs/selective-reading-schemas.json) | 初轮匿名 Jina/Firecrawl 各一次完整 tools/list；业务0、模型0 | 业务权限、当前部署源码或计费 |
| 下列固定提交 | 核对 schema、下游转换/筛选/输出实现 | 托管端一定部署相同版本 |
| [selective-reading-results.json](https://github.com/onedotmint/Siftpath/blob/main/docs/selective-reading-results.json) | 复用已有 RFC/SQLite/Python 正文离线定位、切片、记录SHA-256 | 原网页完整获取、重新请求同节、模型自主选节成功 |
| [firecrawl-css-results.json](https://github.com/onedotmint/Siftpath/blob/main/docs/firecrawl-css-results.json) | 后续独立授权2次匿名官方 MCP CSS读取 | 通用章节能力、模型收益、多行代码缩进或货币账单 |

字符为 UTF-16 code units，不是 token。Schema发现、离线字符串保真、实际选区与模型正确率分开判定；初轮“CSS未测”已由第5节两例补充，但没有新的模型成功结论。

## 2. 官方能力与固定源码

| 服务 | 可用表达 | 不能混同 |
|---|---|---|
| Jina read_url | question/topk/chunk_size，普通读取，OCR page | REST selector不在MCP；OCR页不是网页分页 |
| Firecrawl scrape | includeTags/excludeTags、onlyMainContent、formats/queryOptions、缓存选项 | 标题节点不是整章；无section/offset/maxCharacters；directQuote非逐字切片 |
| Context7 | 库ID+单主题query、可选language | 不是任意URL Reader，没有旧topic/page/tokens接口 |
| MCP Fetch | max_length/start_index/raw | 每次重新GET，不是同一快照续读 |
| Exa web_fetch_exa | urls/maxCharacters | 每页长度上限，不是focus/精确章节 |

Context7/Fetch/Exa 此轮只核验源码，未核验托管 Schema 或调用业务。

### Jina：原生选段与供应商降级

固定 MCP [`b938c00`](https://github.com/jina-ai/MCP/tree/b938c00f0870a75b39a78d5dff1f5bf645151a6e)：

- [schema L242–283](https://github.com/jina-ai/MCP/blob/b938c00f0870a75b39a78d5dff1f5bf645151a6e/src/tools/jina-tools.ts#L242-L283)：url/withAllLinks/withAllImages/question/chunk_size/topk/ocr/page；历史发现确认 topk1–50、chunk_size1–4096词。Siftpath 显式3×250，旧预设窄迁移见 [CONFIGURATION.md](CONFIGURATION.md#jina-聚焦窗口与旧配置兼容)。
- [readWithQuestion L79–132](https://github.com/jina-ai/MCP/blob/b938c00f0870a75b39a78d5dff1f5bf645151a6e/src/utils/read.ts#L79-L132)：URL/q/topk/chunk_size交给svip，注释说明聚焦可能去掉表格/fenced code；不是按多条指令逐项问答。
- [调用链 L192–302](https://github.com/jina-ai/MCP/blob/b938c00f0870a75b39a78d5dff1f5bf645151a6e/src/utils/read.ts#L192-L302)：需Key才走svip；成功时仅选段，失败/空结果回普通读取；无Key跳过选段并说明降级。links/images可让供应商内部并行读全文和选段，本项目不默认请求。**一次Siftpath MCP调用不等于内部一次抓取或一份费用。**
- [token guardrail L264–293](https://github.com/jina-ai/MCP/blob/b938c00f0870a75b39a78d5dff1f5bf645151a6e/src/utils/token-guardrail.ts#L264-L293)：特定客户端/端点参数可启用上游裁剪，0关闭；不是章节导航，也非所有客户端默认适用。
- Reader REST 的 [X-Target/Remove-Selector](https://github.com/jina-ai/reader/blob/1574bfd380d249c86c82db4dace0d9c8fe17e2b1/src/dto/crawler-options.ts#L178-L197)、[X-Max-Tokens](https://github.com/jina-ai/reader/blob/1574bfd380d249c86c82db4dace0d9c8fe17e2b1/src/dto/crawler-options.ts#L328-L337) 未由 MCP 逐字段转换转发任意headers；不能在MCP连接上加REST header就宣称生效。

后续focus是新调用；没有正文快照句柄，不能保证免费复用、不重新抓取或完整。snippet_source只说明响应形式，不是完整性凭证。

### Firecrawl：CSS、query与费用边界

固定 npm3.33.4 对应 [`8a32a37`](https://github.com/firecrawl/firecrawl-mcp-server/tree/8a32a37f07593db001538ece7420d6365469ec5e)；当时主分支 [`da436cc`（3.34.1）](https://github.com/firecrawl/firecrawl-mcp-server/tree/da436cccdf3f51da530350b3c15753b4742aa8a2) 核心字段/转换一致：

- [schema L947–1111](https://github.com/firecrawl/firecrawl-mcp-server/blob/8a32a37f07593db001538ece7420d6365469ec5e/src/server.ts#L947-L1111)、[转换 L873–945](https://github.com/firecrawl/firecrawl-mcp-server/blob/8a32a37f07593db001538ece7420d6365469ec5e/src/server.ts#L873-L945)：query需同时formats=[query]和queryOptions.prompt；只加prompt而仍markdown不启用选段。匿名托管额外要求objective，只列scrape/search/parse；输入无highlights/section/offset/outline，不能从输出字段反推输入能力。
- 后端 [`e1dc7a4` CSS L92–174](https://github.com/firecrawl/firecrawl/blob/e1dc7a43954b1dd61eb7c7230363c62539a652b2/apps/api/src/scraper/scrapeURL/lib/removeUnwantedElements.ts#L92-L174)：先Rust、失败再Cheerio，include克隆匹配节点、exclude移除，再主体清理/Markdown转换。已知article/section容器能表达区域；`#heading`通常仅标题，不能自动包含后续兄弟段落；rawHtml不等于筛选正文。标题用单个联合selector避免回退按多个selector分组复制。
- [directQuote L149–244](https://github.com/firecrawl/firecrawl/blob/e1dc7a43954b1dd61eb7c7230363c62539a652b2/apps/api/src/scraper/scrapeURL/transformers/query.ts#L149-L244)：模型选编号再程序重组，长输入先裁尾；[highlight-spans L141–155](https://github.com/firecrawl/firecrawl/blob/e1dc7a43954b1dd61eb7c7230363c62539a652b2/apps/api/src/lib/highlight-spans.ts#L141-L155)对代码逐行trim并丢空行，表格/空白亦重组，不是Python/YAML原文切片。freeform直接生成文本，提示“不改写”不构成保证；成功响应也可能缺answer并附warning。
- [billing L156–217](https://github.com/firecrawl/firecrawl/blob/e1dc7a43954b1dd61eb7c7230363c62539a652b2/apps/api/src/lib/scrape-billing.ts#L156-L217)：公开实现普通scrape通常1 credit，query另加4，directQuote无豁免；不是本次实际扣款或价格承诺。CSS不走query模型费用，但基础抓取仍可能计费。
- [执行 L1524–1580](https://github.com/firecrawl/firecrawl-mcp-server/blob/8a32a37f07593db001538ece7420d6365469ec5e/src/server.ts#L1524-L1580)：每次调用SDK/HTTP。maxAge为缓存年龄窗口，0请求实时；storeInCache控制写，不保证不读缓存。cache hit不是免费或不可变快照。map是站点URL发现，parse是文件流程，PDF maxPages不是网页章节；旧extract已弃用，不新增这些编排。

当前新认证预设使用官方HTTP+Bearer，Markdown/onlyMainContent=true/固定objective，无focus映射；旧stdio不重写。本文queryOptions里的原生mode是供应商参数，不是已撤回的Siftpath公共mode接口。

### 对照项目：只保留可核验边界

- **Context7** [`b5e81de` 注册/执行](https://github.com/upstash/context7/blob/b5e81de845092694ba1bfc5af15400f319c89b6d/packages/mcp/src/index.ts#L306-L462)、[API](https://github.com/upstash/context7/blob/b5e81de845092694ba1bfc5af15400f319c89b6d/packages/mcp/src/lib/api.ts#L137-L225)：resolve-library-id(query,libraryName)、query-docs(libraryId,query,language?)；后端选择上下文，无公开本地查询缓存。[2.0变更](https://github.com/upstash/context7/blob/b5e81de845092694ba1bfc5af15400f319c89b6d/packages/mcp/CHANGELOG.md#L332-L349)移除旧topic/page等；[后端未开源](https://github.com/upstash/context7/blob/b5e81de845092694ba1bfc5af15400f319c89b6d/README.md#L133-L137)，不能审计实际排序/抓取/计费。只借鉴明确库/版本/主题，不搬文档库。
- **MCP Fetch** [`51b6382` schema/切片](https://github.com/modelcontextprotocol/servers/blob/51b6382a3e827aceb6bce430b1208d69b93d95ea/src/fetch/src/mcp_server_fetch/server.py#L421-L479)：max_length默认5000，1–999999；start_index≥0。[GET/转换](https://github.com/modelcontextprotocol/servers/blob/51b6382a3e827aceb6bce430b1208d69b93d95ea/src/fetch/src/mcp_server_fetch/server.py#L247-L338)每次重新robots/GET/全文转换后切片，无ETag/Range/snapshot；页面变化可错位。[安全成本](https://github.com/modelcontextprotocol/servers/blob/51b6382a3e827aceb6bce430b1208d69b93d95ea/src/fetch/README.md#L11-L16)含重定向/私网/DNS/robots/解析上限，不为省上下文自建fetcher。
- **Exa** [`0b499f0` webFetch](https://github.com/exa-labs/exa-mcp-server/blob/0b499f095c4ca145eee07b09137641c037d58449/src/tools/webFetch.ts#L39-L100)：/contents每页text.maxCharacters，默认3000，无query/selector/offset。[高级搜索](https://github.com/exa-labs/exa-mcp-server/blob/0b499f095c4ca145eee07b09137641c037d58449/src/tools/webSearchAdvanced.ts#L175-L210)的highlightsQuery/subpages不是精确章节；[errorHandler](https://github.com/exa-labs/exa-mcp-server/blob/0b499f095c4ca145eee07b09137641c037d58449/src/utils/errorHandler.ts#L34-L58)对部分5xx可重试2次，Siftpath不重试不能保证供应商内部不重试。

## 3. 离线导航/切片结果

隔离辅助 `tests/support/selective-reading.mjs` 仅识别顶层ATX、忽略fenced code、记录原字符串offset，以同级/更高级标题作为节尾。不导入src、不暴露工具、不生成slug/selector。Setext/HTML/blockquote/list标题不支持；覆盖重复标题、fence、代码缩进、空行/表格、CRLF/Unicode与缺失边界。

| 已保存正文 | 正文字符 | 标题 | 导航字符 | 等预算前缀有目标 | 同正文目标节 |
|---|---:|---:|---:|---|---|
| RFC9111 | 133247 | 76 | 2552 | 否 | no-store响应节1358字符，存储/复用、private/shared、易失/非易失、隐私限制保留 |
| SQLite | 39317 | 10 | 425 | 否 | 第2节2854字符，每连接/事务内无效/无错误/PRAGMA保留 |
| Python venv | 37909 | 11 | 288 | 否 | How venvs work4152字符，激活表保留；另取EnvBuilder11765字符，缩进逐字保留 |

证明短导航能展示晚于前缀的真实标题、**同一内存字符串**可无损切片；不证明模型正确选择或远程重读相同章节。目录不含目标事实，不能代替证据。历史Jina SQLite聚焦3/3可一步足够；历史Jina RFC普通正文缺目标节，导航也无法恢复上游未给内容，尚无成功窄focus补齐RFC的实测。

已知问题时导航+切片下界分别3910/3279/4440字符，尚不含封套/声明/历史重传；比直接切片多目录。不留快照还需新供应商调用，不能用离线内存切片抹掉费用；保留快照则要大小/淘汰/并发/隐私/失效管理。最终normalize后再提目录无法找回已被裁掉的标题，提前提也须可靠区分供应商正文与包装。

```bash
# 纯离线，缺历史正文时明确跳过，不自动联网重建
node --test tests/selective-reading.test.mjs
# 可选：提供已有正文副本，路径取报告记录或自己的留存
SIFTPATH_SELECTIVE_ARTIFACTS=/path/to/saved-artifacts node --test tests/selective-reading.test.mjs
```

初轮新增套件历史为无外部正文7通过/1跳过，带正文8通过；不作为当前总测试数。报告记SHA-256，临时原始正文目录可能过期。

## 4. 工程取舍

| 方案 | 价值 | 成本/限制 | 决策 |
|---|---|---|---|
| A 原生focus | 已知问题可一次取证 | 选段/供应商降级可能缺证据；表格/代码保真有限 | 默认保留，证据足够不重读 |
| B 概览 | 未知长文结构导航 | 标题不是证据，通常至少再读一次；也可能裁剪 | 不自动前置outline |
| C 区域/章节 | 已知DOM容器可保留相关段/表 | heading不等于容器；站点变化，稳定offset需内容版本 | 仅静态自定义binding，不承诺通用section |

现有递归binding可映射CSS常量；专用自定义provider可由reader显式选择，例如给已知站点设置includeTags，而不污染默认reader。没有按调用动态selector接口。Firecrawl query虽然可嵌套映射 `$focus`，但省略focus时仍formats=query可能不合法，且费用/保真不同，不作为通用预设。

**导航不是证据；选区不是完整文档；本地未裁剪不是上游完整。** 不加本地推理、DOM猜测、隐藏补查或状态系统，也不把16000字符预算当作已解决长文覆盖。

## 5. Firecrawl CSS：两次真实业务验证

这是Schema调查后单独授权的实验：最多2次匿名官方MCP，实际每页1次；无模型、搜索、Jina、REST、后备或隐藏重试。`tests/live/firecrawl-css.test.mjs` 的出站guard限制端点/工具/URL/次数、拒绝Authorization；blockedRequests=0，供应商内部请求数未知。

2026-10-24 11:36:21 UTC曾另对两个公开源站各GET一次HTML，用Python标准库检查DOM，非Reader业务。源HTML SHA-256/预先期望在 `tests/fixtures/firecrawl-css-dom.json`。CSS业务于11:42:07 UTC开始；完整MCP/Schema/输出在报告记录的临时目录，公开原文保存在 `firecrawl-css-rfc-headings.md`、`firecrawl-css-venv-container.md`，不依赖临时目录存续。

### 实际参数

官方端点 `https://mcp.firecrawl.dev/v2/mcp`，`firecrawl_scrape`；不请求query/summary/JSON/截图，不设置maxAge强制实时。objective为托管必填说明，不是CSS生效或逐字保证的来源。选择器与期望在调用前已确定，没有看结果换selector重读。

```json
{
  "url": "https://www.rfc-editor.org/rfc/rfc9111.html",
  "formats": ["markdown"],
  "includeTags": ["h1, h2, h3, h4, h5, h6"],
  "onlyMainContent": false,
  "objective": "Return the actual heading elements of this page as Markdown navigation, preserving their document order, levels and existing links. Do not summarize or infer headings."
}
```

```json
{
  "url": "https://docs.python.org/3/library/venv.html",
  "formats": ["markdown"],
  "includeTags": ["section#how-venvs-work"],
  "onlyMainContent": false,
  "objective": "Read only the selected existing section container as Markdown, preserving its paragraphs, table and inline code. Do not summarize or generate an answer."
}
```

### 实测结果

| 指标 | RFC标题 | Python容器 |
|---|---:|---:|
| 业务请求 | 1 | 1 |
| 原始MCP封套字符 | 26911 | 13365 |
| 供应商正文→最终正文 | 11700→11700 | 4150→4150 |
| 最终封套字符/本地裁剪 | 14234/否 | 7218/否 |
| 原始→最终逐字相同 | 是 | 是 |
| 业务耗时，不含发现/关闭 | 4807ms | 3678ms |
| creditsUsed/cacheState | 1/hit | 1/hit |
| cachedAt | 2026-10-24T09:00:51.884Z | 2026-10-23T12:42:45.686Z |

text/structured镜像的credits只计一次，合计2，不是4；credit不是货币账单，cache hit不证明免费、实时或同一快照。模型请求0，实际工具输出token未知。

- **RFC**：76/76标题名称/层级/顺序一致，无遗漏/重复，全部非空行是ATX标题；141正文链接fragment均在源DOM存在。请求/响应两个no-store可区分，但标题没有存储条件正文，不能直接回答技术问题。版权/索引等真实标题亦保留；正文11700、封套14234，远大于离线标签导航2552，原生标题过滤不等于极短目录，长页仍可裁剪。
- **metadata例外**：有一条metadata.url的 `#name-calculating-cache-keys-with-` 不在源DOM，正文对应无尾横线fragment有效。该项未算入正文141链接验证；保留原始请求URL/供应商metadata，sources不是验证过的证据列表。
- **Python**：返回How venvs work整个容器，不是仅h2，也未混入其他章节。6行shell/command表（bash/zsh、fish、csh/tcsh、pwsh、cmd.exe、PowerShell）完整有序、无重复，反斜杠/inline code保留。`sys.prefix != sys.base_prefix`、可不激活直接用解释器路径、VIRTUAL_ENV不足以证明、通常不可移植/搬迁后重建等条件都在。
- 历史同Python节4152字符，本例4150，仅边界空白不同，trim后逐字相同；raw→最终完全逐字保留。DOM容器没有pre，**多行代码缩进未测**，不把表格/inline code泛化为代码块保真。

历史普通读来自 [reader-comparison-results.json](https://github.com/onedotmint/Siftpath/blob/main/docs/reader-comparison-results.json)：RFC正文133247→最终14924，Python37909→14767，封套均16000并裁剪。本次CSS原始正文分别少91.2%/89.1%；但跨时间、onlyMainContent、缓存、本地去重版本不同，不能把封套全部差值归因CSS、比较性能或宣称回答/token/账单改善。未为刷新基线追加全文请求。

### 结论与离线复核

两例支持已知DOM结构下CSS的可选价值：不按相关性重排，可保留完整容器条件/表格，或列出整页真实标题；不支持默认换Reader或通用章节系统。实验经现有Siftpath.read/binding常量完成，无新增adapter。未知页面先目录通常多一次调用；标题链接不提供正文容器selector，模型自主导航收益仍未验收。

```bash
# 不联网：复核保存原文、DOM期望、标题/anchor/表格/条件
node --test tests/firecrawl-css.test.mjs
```

历史该专项离线5项通过，不是本轮总回归。重新发现需 `SIFTPATH_SELECTIVE_SCHEMA`、重新业务需 `SIFTPATH_FIRECRAWL_CSS` 显式授权；它们会更新报告/消耗新额度，不属于离线复现。本次只保留证据，不运行这些开关；最终门禁由main补至 [TESTING.md](TESTING.md)。
