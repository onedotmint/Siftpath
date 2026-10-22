# 配置

## 两条路径：快速配置与高级配置

配置入口有两个，读写同一份私有文件、同一套凭据与路由规则：

| 界面 | 命令 |
|---|---|
| Pi | `/siftpath` → 快速配置（推荐）/ 高级配置 |
| 终端 | `siftpath setup`（询问选哪条）、`siftpath setup --quick`、`siftpath setup --advanced` |

**快速配置**只问两件事——用什么搜索、用什么阅读——然后只问这两家的 Key，最后按推荐路由保存：搜索优先 Tavily → Exa → Brave，阅读优先 Jina → Firecrawl，其余已就绪的服务自动成为顺序后备。快速配置只添加/更新所选服务，**未选中的已有服务保持原样，不会被停用**；路由会重新按推荐顺序生成。Pi 的「保持现有搜索/阅读」只跳过该类服务配置。需要停用服务或保留自定义路由时，使用高级配置。不需要理解 tool name、JSON Schema、意图或后备顺序，第一次使用建议走这条。

**高级配置**保留全部选项：逐家选择供应商与认证模式、默认/语义/研究搜索、阅读供应商、顺序后备。Pi 里是原生菜单循环（可反复配置/停用/改路由，最后保存），终端里是 Clack 向导。Pi 内不会启动第二套 Clack TUI。

## 交互式向导（Clack）

```bash
node dist/cli.js setup
# 安装后可直接运行 siftpath setup
```

沿用历史 Clack：方向键导航，Space 多选，Enter 确认，Esc/Ctrl+C 在任何保存前步骤取消且不落盘。预先选中当前已启用的供应商；自定义 MCP 也可保留。选择 Brave（常规搜索）、Exa（语义）、Tavily（通用搜索）、Jina（阅读）、Firecrawl（可选复杂页阅读），无需自己填写官方工具名或 Schema。

逐家显示 Key 是否已配置及连接本地状态，可保留连接、使用已有 Key、新增/替换隐藏输入的 Key，或选择官方支持的匿名模式。Enter 可保留已有 Key；禁用某家不删除凭据。Pi 和 CLI 的编辑草稿只读取磁盘值，环境 Key 仅用于运行时判断和连接，**不会因保存配置而自动复制进 JSON，也不会覆盖磁盘中已有 Key**。只有显式输入非空的新 Key 才更新本地保存值。环境变量继续优先于已保存 Key，向导在替换时提醒；若要使用新保存值，需要取消旧环境变量。现有自定义连接只有明确选择官方认证/匿名预设时才会替换。

路由仅列出选中且凭据引用就绪的能力：默认搜索可选 Tavily/Brave/Exa；语义优先 Exa，研究优先 Tavily，阅读优先 Jina。可以选择顺序后备（没有可用的另一种能力时显示未配置，而非捏造可用路由）。搜索后备链供所有意图共用，实际主供应商去重；可将 Brave 保留为 Exa 语义检索的后备。

完成摘要后默认**不进行联网测试**。只有确认后才保存并调用现有 status/test 实现，测试启用选择，不走 Router 后备。普通取消不写部分 Key。非交互 setup 不创建 UI，只创建最小 version-2 JSON，不写环境 Key。完整配置仍按下面相同路径和优先级读写。

| 预设 | 认证模式 | 无 Key 选项 | 本轮真实结果 |
|---|---|---|---|
| Brave | 官方 stdio + BRAVE_API_KEY | 不支持 | 工具契约通过，缺 Key 未搜 |
| Exa | 官方 stdio + EXA_API_KEY | 官方托管 MCP | 前轮匿名搜索通过 |
| Tavily | 官方 stdio + TAVILY_API_KEY | 官方 stdio Keyless | **搜索通过**，连接/发现/实际请求均通过 |
| Jina | 官方托管 + JINA_API_KEY | 官方托管 Reader | 前轮匿名阅读通过；Keyless focus 可能降级全文 |
| Firecrawl | 官方 stdio + FIRECRAWL_API_KEY | 官方托管 MCP | **阅读通过**，连接/发现/实际请求均通过 |

Tavily/Firecrawl 新默认配置中存在但禁用，向导选中后启用，旧已保存 providers 表不会被隐式深合并。匿名模式只用官方已有实现，额度/服务可变；Tavily 远程 MCP 匿名是 401，不作为匿名预设。官方 Tavily/Firecrawl stdio 可能自动读取工作目录 .env，严格匿名请从干净目录启动；Siftpath 本身不加载 .env。Tavily/Firecrawl stdio 预设给首次下载保留 60s 供应商期限。

## 也可直接用环境变量

```bash
export BRAVE_API_KEY='…'  # 普通搜索；缺少时跳过
export EXA_API_KEY='…'    # 语义搜索/后备；缺少时跳过
export JINA_API_KEY='…'   # 默认阅读、原生 question 聚焦；缺少时跳过
node dist/cli.js doctor
node dist/cli.js mcp
```

不必全部配置：一个搜索 Key 即可搜索，一个 Jina Key 即可阅读。`setup` 提供不回显的交互式密钥输入，`setup --non-interactive` 仅创建 `{ "version": 2 }`，不把环境中的密钥写进文件。普通调用和 `doctor` 不保存历史、查询或网页。

配置路径沿用项目原有机制：`SIFTPATH_CONFIG` → `SMARTSEARCH_CONFIG` 兼容别名 → `$XDG_CONFIG_HOME/siftpath/config.json` 或 `~/.config/siftpath/config.json`。仅在新路径不存在且旧 smartsearch 配置存在时读取旧路径，不自动移动。JSON 最大 64 KiB，拒绝符号链接。POSIX 写入模式 0600；Windows 请保护用户 ACL。

## 不提供 Key 的显式试用配置

官方匿名额度不是可用性或长期免费保证。以下配置实际完成过 Exa 搜索、Jina 阅读和 Siftpath stdio 全链路；Brave 保留为有 Key 时的普通检索主路由。将其保存到**私有路径**，然后设置 `SIFTPATH_CONFIG`。本示例还随包提供为 `examples/anonymous.json`。

```json
{
  "version": 2,
  "providers": {
    "brave": {
      "enabled": true,
      "connection": {
        "transport": "stdio", "command": "npx",
        "args": ["-y", "@brave/brave-search-mcp-server@2.1.4", "--transport", "stdio"],
        "env": { "BRAVE_API_KEY": "${BRAVE_API_KEY}", "BRAVE_MCP_ENABLED_TOOLS": "brave_web_search" }
      },
      "search": { "name": "brave_web_search", "arguments": { "query": "$query", "count": "$maxResults" } }
    },
    "exa": {
      "enabled": true,
      "connection": { "transport": "http", "url": "https://mcp.exa.ai/mcp", "headers": {} },
      "search": { "name": "web_search_exa", "arguments": { "query": "$query", "objective": "$query", "numResults": "$maxResults" } }
    },
    "jina": {
      "enabled": true,
      "connection": { "transport": "http", "url": "https://mcp.jina.ai/v1", "headers": {} },
      "read": { "name": "read_url", "arguments": { "url": "$url", "question": "$focus" } }
    }
  },
  "routes": {
    "defaultIntent": "general", "search": "brave", "read": "jina",
    "intents": { "semantic": "exa", "research": "tavily" },
    "searchFallback": ["brave", "exa"], "readFallback": []
  },
  "timeoutMs": 60000, "providerTimeoutMs": 20000, "maxOutputChars": 16000
}
```

Exa 托管端本次 `tools/list` 的 `web_search_exa` 还要求 `objective`，已映射到原始 query；固定版 stdio 只要求 query。Jina 无 Key 可以普通阅读，但 `question` 可能由官方降级为全文并附带 note；Siftpath 保留官方输出，不宣称匿名聚焦已验证。

需要带 Key 的远程连接时，只改 `headers`，不要把凭据放入 URL：

```json
{ "Authorization": "Bearer ${JINA_API_KEY}" }
```

Exa 官方远程也支持 `x-api-key: ${EXA_API_KEY}`。`${NAME}` 从环境变量优先读取，其次从私有配置的 `credentials.NAME` 读取。任何连接 env/header 引用缺失都会让该供应商被跳过，`doctor` 报告缺失的**变量名**，不输出值。匿名配置的 headers 必须显式为 `{}`，不要填写空 Bearer。

## 配置规则

- 不写 `providers` 时使用内置五家定义（Brave/Exa/Jina 启用，Tavily/Firecrawl 禁用）；**写了 providers 则整张表替换，不做隐式深合并**。可通过交互 setup 生成完整配置后编辑，或复制上述完整示例。
- `enabled: false` 跳过该供应商。供应商 ID 只是本地路由标识，Router 没有品牌分支。
- stdio：`connection: { transport: "stdio", command, args?, env? }`。不使用 shell；只继承官方 SDK 的最小系统环境和明确配置的 env。密钥不能使用 `${…}` 放在 command/args，避免进程参数泄露。
- Streamable HTTP：`connection: { transport: "http", url, headers? }`。支持带非敏感工具选择参数的 URL；拒绝 userinfo、敏感 query key、URL 密钥插值和非 loopback 明文 HTTP。不实现旧 SSE/OAuth 登录；已有 Bearer/header 凭据可用。
- `search/read: { name, arguments }` 指向官方工具。`arguments` 内的 `$query/$intent/$maxResults/$url/$focus` 是**整个值**的替换，支持嵌套对象/数组；未提供的可选值被省略，其余值原样作为常量。没有字符串拼接、模板执行或私有解析器。参数本身从不注入凭据。
- `routes.search/read` 定义默认主供应商，`routes.defaultIntent` 默认为 general，`routes.intents` 只覆盖明确列出的意图。默认 general 使用 routes.search，semantic→exa，research→tavily；`intents: {}` 可清空意图覆盖。不存在或未配置的 optional Tavily 不阻塞其它路由。
- 省略 `routes`、填写 `routes: {}` 或只覆盖某个字段，均使用同一份默认值；默认搜索后备顺序为 Brave → Exa。
- `searchFallback/readFallback` 是**顺序**；对重复 ID 去重，每家只试一次，无自动并行或重试。可为空；不要用很长后备链放大费用。
- 默认每次操作 60s、每次供应商尝试 20s（包含首次连接），可配置 `timeoutMs/providerTimeoutMs`；供应商可覆盖自己的 `timeoutMs`，范围 100–120000ms。内置 `npx` 预设（Brave/Exa/Tavily/Firecrawl）已默认 60s，首次下载官方包不会被 20s 期限误判为失败；更慢的网络可再提高 providerTimeoutMs。
- `maxOutputChars` 默认 16000，范围 2000–50000；限制完整序列化 JSON（UTF-16 字符数），不是下载大小或模型 token 数。先保留出处，截断文本；sources 最多 50 条并有单独标志。官方附带的日期、作者等留在 content，未虚构统一字段。
- `maxResults` 默认 5，范围 1–20，映射给原生参数。若官方工具本身有更高下限（Tavily `max_results` 最小 5），binding 可写 `minResults: 5`：请求小于它时由 Router 提升到下限并附带 `MAX_RESULTS_RAISED` 警告，不会因参数校验失败而白白触发后备；其它供应商不受影响。最终数量仍由官方服务决定，Siftpath 不自行截断/重排。

## 可选 Tavily / Firecrawl

直接在 setup 选择即可，无需手写本节 JSON；以下保留为高级连接自定义示例。两家已分别真实验证官方 Tavily stdio 搜索、Firecrawl 匿名托管阅读；示例为可选的其它认证连接方式，不代表带 Key 业务也已验证。缺 Key 自动跳过。

```json
{
  "tavily": {
    "enabled": true,
    "connection": { "transport": "http", "url": "https://mcp.tavily.com/mcp", "headers": { "Authorization": "Bearer ${TAVILY_API_KEY}" } },
    "search": { "name": "tavily_search", "arguments": { "query": "$query", "max_results": "$maxResults", "search_depth": "basic" } },
    "read": { "name": "tavily_extract", "arguments": { "urls": ["$url"], "query": "$focus", "format": "markdown" } }
  },
  "firecrawl": {
    "enabled": true,
    "connection": { "transport": "stdio", "command": "npx", "args": ["-y", "firecrawl-mcp@3.33.4"], "env": { "FIRECRAWL_API_KEY": "${FIRECRAWL_API_KEY}" } },
    "read": { "name": "firecrawl_scrape", "arguments": { "url": "$url", "formats": ["markdown"] } }
  }
}
```

例如 `routes.readFallback: ["firecrawl"]`、`routes.intents.research: "tavily"`。内置 Tavily 预设的 search binding 带 `minResults: 5`（官方 `max_results` 最小 5）：用户或模型请求 1–4 条时，Router 会提升到 5 并在结果 `warnings` 里给出 `MAX_RESULTS_RAISED`，不触发无意义的后备。自定义 Tavily binding 时也要自己写 `minResults: 5`。Firecrawl 上例未映射 focus，将返回 `FOCUS_UNSUPPORTED`；确需原生问题提取时按官方 `formats:["query"]` 与 `queryOptions.prompt` 配置，先验证自己套餐/版本。不要默认开 crawl/agent/research 编排或给每个搜索结果附加 scrape。

## 手动状态与供应商测试

使用 `siftpath status [--json]` 查看离线配置与最近结果（含生效配置路径和下一步）；`siftpath test <provider|all> [--json]` 才发起真实 MCP 测试，绝不故障回退。Pi 的 `/siftpath` 菜单会在同一套逻辑上提供快速配置、高级配置、状态面板与确认后的真实测试。分阶段状态、`test all` 判定、热更新与安装方法见 [DIAGNOSTICS.md](DIAGNOSTICS.md)。
