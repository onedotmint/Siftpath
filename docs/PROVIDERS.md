# 官方 MCP 接入

只经官方 MCP 转发；以下固定源码、发布包发现及历史实测不是对未来托管部署、账户权限或计费的保证。本次文档整理没有联网、模型或业务调用。

## 推荐与连接

| Provider | 用途与官方预设 | 原生映射要点 |
|---|---|---|
| Tavily | 推荐 general/research；`tavily-mcp@0.2.22` stdio + `TAVILY_API_KEY` | `tavily_search`：query/max_results/search_depth=basic，`minResults:5` |
| Exa | 推荐 semantic；`exa-mcp-server@3.4.2` stdio + `EXA_API_KEY` | `web_search_exa`：query/numResults |
| Jina | 默认 read；`https://mcp.jina.ai/v1` + Bearer `${JINA_API_KEY}` | `read_url`：url/question、topk=3、chunk_size=250 |
| Firecrawl | 显式可选 reader；新认证为 `https://mcp.firecrawl.dev/v2/mcp` + `Authorization: Bearer ${FIRECRAWL_API_KEY}` | `firecrawl_scrape`：url、formats=[markdown]、onlyMainContent=true、固定 objective |
| Brave | disabled，高级可选；`@brave/brave-search-mcp-server@2.1.4 --transport stdio` + `BRAVE_API_KEY` | `brave_web_search`：query/count |

新 fallback 均为空；已有显式路线/Key/custom binding 保留。`web_read({url,reader?,focus?})` 中显式 reader 只调用一家，可为任意合法已配置 ID；不因品牌增加适配器或隐藏后备。

### 重要差异

- **Jina**：focus 仅在 binding 确有 `$focus` 映射时才发业务请求，否则 `FOCUS_UNSUPPORTED`，不转全文。映射不保证成功选段；匿名 question 不保证聚焦，认证调用也可能由供应商降级，原生 notes 保留。选段可能缺表格、代码或多条件证据；3×250 不是完整性承诺。不是可直接 `npx jina-mcp` 的本地 CLI，不启用旧 SSE。
- **Firecrawl**：新认证 read 参数固定为 `url:$url, formats:["markdown"], onlyMainContent:true, objective:"Read the supplied public webpage as Markdown."`。objective 是托管契约说明，不是 focus；该 binding 不支持 focus。旧保存 stdio/自定义连接不自动重写。原生 query 必须同时设置 formats=query 和 queryOptions.prompt，有模型/费用/保真差异，不是默认 read。配置示例见 [CONFIGURATION.md](CONFIGURATION.md#firecrawl-新认证预设)。
- **Exa**：显式匿名 HTTP 为 `https://mcp.exa.ai/mcp`；历史托管发现比固定 stdio 多必填 objective，匿名 binding 将它映射到 query。认证 header 支持方式依实际端点，不在 URL 放 Key。不默认开放 agent/research/fetch 编排。
- **Tavily**：官方 stdio 有显式 Keyless 选项；托管 `https://mcp.tavily.com/mcp` 需认证，历史匿名发现返回 401，不用作匿名预设。原生 max_results 下限 5，小请求提升并附 `MAX_RESULTS_RAISED`。自定义原生 extract 可映射 urls/query，但不据此宣称所有 Tavily read binding 都支持 focus。
- **Brave**：原生 query 有 400 字符/50 词限制；不截断改写用户 query。没有假设官方公共托管地址。

匿名只由用户显式选择（Exa/Jina/Firecrawl 托管、Tavily stdio），不是 Key 错误后的 fallback。匿名服务与额度可变；官方 stdio 包可能自动读 `.env`，严格匿名历史验证用了干净目录。历史匿名业务成功不证明付费 Key 成功。

## 原始来源索引

保留既有调查的固定版本，不在此次整理中重新研究。npm 固定版本与 Git 快照不一定逐字相同；历史还核对过发布包的 initialize/tools/list。

- Brave `e4866a9`：[README](https://github.com/brave/brave-search-mcp-server/blob/e4866a959a635038f8f889804aba6061ed214bf4/README.md)、[启动](https://github.com/brave/brave-search-mcp-server/blob/e4866a959a635038f8f889804aba6061ed214bf4/src/config.ts)、[参数](https://github.com/brave/brave-search-mcp-server/blob/e4866a959a635038f8f889804aba6061ed214bf4/src/tools/web/params.ts)、[输出](https://github.com/brave/brave-search-mcp-server/blob/e4866a959a635038f8f889804aba6061ed214bf4/src/tools/web/index.ts)。
- Exa `0b499f0`：[README](https://github.com/exa-labs/exa-mcp-server/blob/0b499f095c4ca145eee07b09137641c037d58449/README.md)、[stdio](https://github.com/exa-labs/exa-mcp-server/blob/0b499f095c4ca145eee07b09137641c037d58449/src/stdio.ts)、[搜索](https://github.com/exa-labs/exa-mcp-server/blob/0b499f095c4ca145eee07b09137641c037d58449/src/tools/webSearch.ts)、[托管认证](https://github.com/exa-labs/exa-mcp-server/blob/0b499f095c4ca145eee07b09137641c037d58449/api/mcp.ts)。
- Jina `b938c00`：[README](https://github.com/jina-ai/MCP/blob/b938c00f0870a75b39a78d5dff1f5bf645151a6e/README.md)、[Schema](https://github.com/jina-ai/MCP/blob/b938c00f0870a75b39a78d5dff1f5bf645151a6e/src/tools/jina-tools.ts)、[question/降级](https://github.com/jina-ai/MCP/blob/b938c00f0870a75b39a78d5dff1f5bf645151a6e/src/utils/read.ts)、[端点/认证](https://github.com/jina-ai/MCP/blob/b938c00f0870a75b39a78d5dff1f5bf645151a6e/src/index.ts)。
- Tavily：早期快照 `688b0f7` 的 [README](https://github.com/tavily-ai/tavily-mcp/blob/688b0f78d518d507cb31b94d9cc0e44c6eadd7c0/README.md)、[工具](https://github.com/tavily-ai/tavily-mcp/blob/688b0f78d518d507cb31b94d9cc0e44c6eadd7c0/src/index.ts)、[输出](https://github.com/tavily-ai/tavily-mcp/blob/688b0f78d518d507cb31b94d9cc0e44c6eadd7c0/src/format-results.ts)；0.2.22 发布提交 `d9284253d9c9137d13e0fffc12c5e57c277f5d9b`，曾对照实际发布 JS。
- Firecrawl：早期 [README](https://github.com/firecrawl/firecrawl-mcp-server/blob/4c20af3ef1d894400e3ec804a17e6050afe47570/README.md)、[注册实现](https://github.com/firecrawl/firecrawl-mcp-server/blob/4c20af3ef1d894400e3ec804a17e6050afe47570/src/server.ts)；3.33.4 对应 `8a32a37f07593db001538ece7420d6365469ec5e`。源码行级选择器、query、计费依据见 [SELECTIVE-READING.md](https://github.com/onedotmint/Siftpath/blob/main/docs/SELECTIVE-READING.md)。

参考项目仅借鉴边界：[web-search-plus-mcp](https://github.com/robbyczgw-cla/web-search-plus-mcp/tree/7a8bd5709c93a882a502201d203895bbd4683e10) 的职责分离/显式后备；[agntn/web](https://github.com/agntn/web/tree/255a2e4d5b087e4266a2e12ca60577f16808f200) 的统一封套/失败记录。不迁移它们的缓存、HTTP adapters、融合或研究编排。

历史业务、Schema 快照、模型失败样本分别索引于 [TESTING.md](https://github.com/onedotmint/Siftpath/blob/main/docs/TESTING.md)。不能把 discovery、匿名普通读取、源码规则和账户聚焦/收费验证混为一谈。
