# 官方 MCP 接入与来源核验

本轮读取官方 README、实际工具定义及输入输出代码，且通过发布包/远程 `initialize + tools/list` 核验五家内置供应商。以下是核验当时的接口，不保证未来托管端不变；工具注册名以实时 Schema 为准。

## 默认集成

| 服务 | 连接方式 | 官方工具与映射 | 输出 |
|---|---|---|---|
| Brave | 官方 npm `@brave/brave-search-mcp-server@2.1.4`，`--transport stdio`；`BRAVE_API_KEY` | `brave_web_search({query:$query,count:$maxResults})` | 每个 `content[].text` 为单条结果 JSON，包含 URL、title、description、extra_snippets 等 |
| Exa | 官方 npm `exa-mcp-server@3.4.2`，stdio；`EXA_API_KEY` | `web_search_exa({query:$query,numResults:$maxResults})` | Title、URL、Published、Author、Highlights 等可读文本 |
| Jina | 官方 Streamable HTTP `https://mcp.jina.ai/v1`；默认 Bearer `${JINA_API_KEY}` | `read_url({url:$url,question:$focus})` | YAML 文本：url/title/content；question 模式可能为 question/snippets/snippet_source，失败或无 key 可由官方降级全文 |

Brave query 原生限制 400 字符/50 词；公共 Siftpath query 上限 2000，超出 Brave 限制时交给原生校验并按配置回退，**不截断/改写用户 query**。Brave README 中有 command 启动却使用 HTTP transport 的例子，不照抄：本地进程明确 stdio。官方仓库提供的 HTTP 是自运行模式，没有假设存在 Brave 官方公共托管地址。

Exa 另有 `https://mcp.exa.ai/mcp`，可匿名；支持 `x-api-key`、Bearer/OAuth，使用 header 而不是 URL Key。本次托管普通搜索比源码/固定 npm 包多了必填 `objective`：匿名示例显式将其映射到原始 query，未新增意图分类器。固定发布包 `tools/list` 只要求 query。高级搜索、fetch、agent_run 等不纳入默认工具面。

Jina 官方仓库不是可直接 `npx jina-mcp` 安装的本地 CLI；直接调用其远程 MCP。`/sse` 是兼容路径，不据此启用旧 SSE transport。`focus` 原样映射原生 question，不自行切块/评分；无 Key 阅读可用，但**匿名 question 聚焦没有本轮实测保证**。Jina 原生聚焦对表格/代码/位置性问题有已知限制，须由 Agent 按需核对原文。

## Tavily / Firecrawl 内置可选预设

- Tavily：`https://mcp.tavily.com/mcp` + Bearer，或 `npx -y tavily-mcp@0.2.22` + `TAVILY_API_KEY`。工具为 `tavily_search` / `tavily_extract`（下划线，不是旧 README 的连字符）；query/max_results、urls/query 可分别映射搜索/原生聚焦读取。max_results 5–20，见配置文档的边界。远程匿名发现返回 401；官方 stdio 包原生支持 Keyless，已在干净工作目录中通过真实 MCP 握手、发现、搜索。认证 stdio 与匿名 stdio 两种预设均可由 setup 直接选择。不开启 `tavily_research` 多步编排。
- Firecrawl：`npx -y firecrawl-mcp@3.33.4` + `FIRECRAWL_API_KEY`，或 `https://mcp.firecrawl.dev/v2/mcp` + Bearer/匿名额度。工具 `firecrawl_scrape` / `firecrawl_search` / `firecrawl_parse`；读取最小 URL + markdown。原生问题模式为 formats/queryOptions；不默认增加搜索后逐结果 scrape 费用。托管端本次工具发现也出现额外 objective，与源码存在差异，匿名预设显式提供固定阅读 objective；已通过真实 MCP 阅读。

本轮通过 Siftpath 现有 providerTest 实际执行 Tavily 匿名 stdio `tavily_search`（basic，max_results=5），以及 Firecrawl 匿名托管 `firecrawl_scrape`（markdown，不用 LLM 格式）。两者连接/发现/实际请求均通过。独立工具发现还验证了固定的官方 npm 发布包；没有把调查过程中的 REST 测试当成 MCP 成功。

补充核对的发布提交：Tavily 0.2.22 对应 `d9284253d9c9137d13e0fffc12c5e57c277f5d9b`，Firecrawl 3.33.4 对应 `8a32a37f07593db001538ece7420d6365469ec5e`；工具映射同时对照 npm 实际发布 JS 与 https://registry.npmjs.org/tavily-mcp/latest、https://registry.npmjs.org/firecrawl-mcp/latest。官方 stdio 包可能自动加载 .env，严格匿名验证使用干净临时工作目录。

## 精确代码来源

检查快照与关键链接：

- Brave `e4866a959a635038f8f889804aba6061ed214bf4`：[README](https://github.com/brave/brave-search-mcp-server/blob/e4866a959a635038f8f889804aba6061ed214bf4/README.md)、[启动 config](https://github.com/brave/brave-search-mcp-server/blob/e4866a959a635038f8f889804aba6061ed214bf4/src/config.ts)、[web 参数](https://github.com/brave/brave-search-mcp-server/blob/e4866a959a635038f8f889804aba6061ed214bf4/src/tools/web/params.ts)、[web 输出](https://github.com/brave/brave-search-mcp-server/blob/e4866a959a635038f8f889804aba6061ed214bf4/src/tools/web/index.ts)。
- Exa `0b499f095c4ca145eee07b09137641c037d58449`：[README](https://github.com/exa-labs/exa-mcp-server/blob/0b499f095c4ca145eee07b09137641c037d58449/README.md)、[stdio](https://github.com/exa-labs/exa-mcp-server/blob/0b499f095c4ca145eee07b09137641c037d58449/src/stdio.ts)、[webSearch](https://github.com/exa-labs/exa-mcp-server/blob/0b499f095c4ca145eee07b09137641c037d58449/src/tools/webSearch.ts)、[托管鉴权](https://github.com/exa-labs/exa-mcp-server/blob/0b499f095c4ca145eee07b09137641c037d58449/api/mcp.ts)。
- Jina `b938c00f0870a75b39a78d5dff1f5bf645151a6e`：[README](https://github.com/jina-ai/MCP/blob/b938c00f0870a75b39a78d5dff1f5bf645151a6e/README.md)、[工具 schema](https://github.com/jina-ai/MCP/blob/b938c00f0870a75b39a78d5dff1f5bf645151a6e/src/tools/jina-tools.ts)、[原生 question/全文降级](https://github.com/jina-ai/MCP/blob/b938c00f0870a75b39a78d5dff1f5bf645151a6e/src/utils/read.ts)、[端点与认证](https://github.com/jina-ai/MCP/blob/b938c00f0870a75b39a78d5dff1f5bf645151a6e/src/index.ts)。
- Tavily `688b0f78d518d507cb31b94d9cc0e44c6eadd7c0`：[README](https://github.com/tavily-ai/tavily-mcp/blob/688b0f78d518d507cb31b94d9cc0e44c6eadd7c0/README.md)、[工具注册/参数](https://github.com/tavily-ai/tavily-mcp/blob/688b0f78d518d507cb31b94d9cc0e44c6eadd7c0/src/index.ts)、[格式化](https://github.com/tavily-ai/tavily-mcp/blob/688b0f78d518d507cb31b94d9cc0e44c6eadd7c0/src/format-results.ts)。
- Firecrawl `4c20af3ef1d894400e3ec804a17e6050afe47570`：[README](https://github.com/firecrawl/firecrawl-mcp-server/blob/4c20af3ef1d894400e3ec804a17e6050afe47570/README.md)、[注册实现](https://github.com/firecrawl/firecrawl-mcp-server/blob/4c20af3ef1d894400e3ec804a17e6050afe47570/src/server.ts)。GitHub 可能跳转到 mendableai 组织。

版本固定用于可复现的本地进程启动，不代表 npm 发布包与上述 Git 快照逐字相同；已额外执行发布包的协议发现核验。

## 两个参考项目：只借鉴边界，不搬运行时

- [web-search-plus-mcp](https://github.com/robbyczgw-cla/web-search-plus-mcp/tree/7a8bd5709c93a882a502201d203895bbd4683e10)：阅读 README、server.py 工具 schema 和 routing.py；借鉴搜索/提取职责分离、分别配置优先级、显式后备与错误信息。不迁移缓存、健康探测、研究编排或并行研究模式。
- [agntn/web](https://github.com/agntn/web/tree/255a2e4d5b087e4266a2e12ca60577f16808f200)：阅读 README、tools.ts、core/fallback.ts、core/search-filters.ts；借鉴统一 Search/Read 封套、实际供应商/失败记录、对不支持的能力给提示。它采用的 HTTP API Adapter、融合及 continuation 框架不在本任务中复刻。
