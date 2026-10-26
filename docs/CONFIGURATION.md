# 配置

## 入口与保存规则

| 界面 | 入口 |
|---|---|
| Pi | `/siftpath` → 快速配置 / 高级配置 |
| CLI | `siftpath setup`、`setup --quick`、`setup --advanced` |

两端共用凭据与路由规则。Quick 只配置所选搜索/阅读服务，保留未选服务、已保存 Key、自定义 binding 及仍可用路线，**不自动加入 fallback**。Advanced 用于停用服务、修改意图路线和显式后备顺序。方向键/Enter 操作，CLI 多选用 Space；保存前取消不落盘。测试需要单独确认，不因配置完成自动联网。

Key 输入遮罩，Enter 可保留已有值；禁用不删除 Key。环境变量优先于保存值，向导保存不会把环境 Key 复制进 JSON 或覆盖已保存 Key；只有显式输入替换值才更新。已有自定义连接只有明确重新选择官方预设时才替换。

## 文件与凭据

路径优先级：`SIFTPATH_CONFIG` → 兼容别名 `SMARTSEARCH_CONFIG` → `$XDG_CONFIG_HOME/siftpath/config.json`（否则 `~/.config/siftpath/config.json`）。新路径不存在而同根目录旧 `smartsearch/config.json` 存在时继续读取旧路径，不自动搬移。

- JSON 最大 64 KiB，拒绝符号链接；原子写入，POSIX `0600`，Windows 请保护 ACL。文件是明文，不是保险库。
- `${NAME}` 在连接 env/header 中从环境优先取值，再读 `credentials.NAME`。缺引用报 `MISSING_CREDENTIALS`，不打印值。
- 官方变量：`TAVILY_API_KEY`、`EXA_API_KEY`、`JINA_API_KEY`、`FIRECRAWL_API_KEY`、高级可选 `BRAVE_API_KEY`。不必配置全部服务。
- 匿名模式必须由用户显式选择；不会在 Key 错误后移除认证重试。匿名 HTTP 使用 `headers: {}`，不是空 Bearer。上游额度及可用性可能变化；官方 stdio 包可能自行读取工作目录 `.env`，Siftpath 本身不加载它。
- `setup --non-interactive` 仅在文件不存在时创建带完整新 routes 的 version-2 配置，不保存环境 Key。读取不重写文件；交互 setup 经确认才保存。旧路径/version-1 的保存注意事项见 [MIGRATION.md](MIGRATION.md)。

## 新默认与已有配置

推荐默认路线如下；`searchFallback` / `readFallback` 均为 `[]`，Brave disabled，仅高级可选。已有显式 routes、Key、providers 和自定义 binding 不被新默认覆盖；默认不是强制迁移。

```json
{
  "version": 2,
  "routes": {
    "defaultIntent": "general",
    "search": "tavily",
    "read": "jina",
    "intents": { "semantic": "exa", "research": "tavily" },
    "searchFallback": [],
    "readFallback": []
  }
}
```

省略 `providers` 使用内置定义；**显式写 `providers` 则整表替换，不隐式深合并**。新建配置与 SDK `parseConfiguration({})` 中，省略 routes、空 routes 和局部 routes 均以新默认补缺；显式字段保留，`intents: {}` 可清空覆盖。磁盘既有 v2 的省略路线使用兼容默认，省略 providers 表时仅沿用 Brave/Exa/Jina 启用集；v1 亦保留旧启用语义，详见 [MIGRATION.md](MIGRATION.md)；未显式保存的 fallback 一律为空。新 setup 保存完整 routes，避免默认值歧义。路线 ID 应指向已配置、启用且具备相应 binding 的服务；缺 Key 不代表就绪。

只有两个模型工具：`web_search({query,intent?,maxResults?})`、`web_read({url,reader?,focus?})`。

- 搜索 `intent` 为 general / semantic / research，未传使用 `routes.defaultIntent`，对应意图未覆盖时使用 `routes.search`。
- 阅读不传 `reader` 使用 `routes.read`；显式 `reader` 可选任意合法已配置 provider ID（包括自定义 ID），仅尝试该家，不走后备、不自动启用。
- `focus` 调用前必须在所选 read binding 中确有 `$focus` 映射；否则 `FOCUS_UNSUPPORTED`，不调用该 provider、不静默转全文。上游自身仍可能降级，原生 notes 保留；匿名 Jina question 不保证聚焦成功。
- 已显式保存的 fallback 是有序、去重、每家最多一次；不并行、不自动重试，不因证据不全启动后备。显式 reader 始终忽略 readFallback。
- CLI：`siftpath read URL --reader ID [--focus "问题"]`。旧 mode/document 原型已撤回，由 reader 替代；没有 `--mode` 或 `routes.document`。

## 连接与 binding

`search/read: {name, arguments}` 指向官方工具。`$query/$intent/$maxResults/$url/$focus` 按**整个值**替换，可嵌套对象/数组；未提供的可选值省略，其他值为常量。没有字符串拼接或模板执行，不在业务参数中注入 Key。能力以实际 binding 为准，不能按品牌或原生字段名猜测 focus 支持。

- stdio：`{transport:"stdio",command,args?,env?}`，不经 shell；只继承 SDK 最小系统环境及显式 env。不能在 command/args 插入密钥。
- HTTP：`{transport:"http",url,headers?}`，使用 Streamable HTTP；拒绝 URL 密钥、userinfo、敏感 query 和非 loopback 明文 HTTP。不实现旧 SSE/OAuth 登录。

### Firecrawl 新认证预设

以下是 provider 条目，不是完整配置；放入显式 providers 表时须同时保留其他需要的条目。新认证选择使用官方 HTTP，无额外适配器：

```json
{
  "enabled": true,
  "connection": {
    "transport": "http",
    "url": "https://mcp.firecrawl.dev/v2/mcp",
    "headers": { "Authorization": "Bearer ${FIRECRAWL_API_KEY}" }
  },
  "read": {
    "name": "firecrawl_scrape",
    "arguments": {
      "url": "$url",
      "formats": ["markdown"],
      "onlyMainContent": true,
      "objective": "Read the supplied public webpage as Markdown."
    }
  }
}
```

该预设没有 `$focus`，带 focus 会在业务前报 `FOCUS_UNSUPPORTED`；固定 objective 不是 focus。匿名须明确选择同一官方端点的空 headers 预设。旧已保存 Firecrawl stdio/自定义连接不会自动重写；认证连接定义不等于已验证账户调用成功。

### Jina 聚焦窗口与旧配置兼容

官方认证/匿名预设为 `read_url({url:$url,question:$focus,topk:3,chunk_size:250})`。历史托管 Schema 确认 topk 1–50、chunk_size 1–4096 词；没有 focus 仍是普通读取。更大窗口可能增加输出和用量，不保证逐问题覆盖。

加载时仅在内存升级可明确识别的旧预设：ID `jina`、官方 `https://mcp.jina.ai/v1`、空 headers 或标准 `Authorization: Bearer ${JINA_API_KEY}`、无自定义 search，read 恰好为旧 `read_url({url:$url,question:$focus})`。保留 enabled、timeout、凭据和路线，不自动写文件。不同 ID/端点/header、额外参数、显式窗口均不改；需要旧窗口时显式写 `topk:1,chunk_size:100`。重新选择官方预设应用新窗口，保留当前连接不重置自定义值；确认保存 setup 时可将内存迁移写入磁盘。

## 限制与诊断

- 操作默认 60s、供应商尝试默认 20s（含连接），`timeoutMs/providerTimeoutMs` 范围 100–120000ms；provider.timeoutMs 可单独覆盖，部分 npx 预设为冷下载留 60s。提高期限需同时考虑总期限，不隐藏重试。
- `maxOutputChars` 默认 16000，范围 2000–50000，限制完整序列化 JSON 的 UTF-16 字符数，不是下载量/token 数。sources 最多 50 条，裁剪有标志；增加预算不能补回上游未返回内容，也不保证长文完整。
- `maxResults` 默认 5，范围 1–20。Tavily binding 的 `minResults:5` 会把更小请求提升并附 `MAX_RESULTS_RAISED`；最终条数由服务决定，不本地重排。
- `siftpath status [--json]` / `doctor` 离线；READY 仅表示配置就绪。`siftpath test <provider|all> [--json]` 明确发起真实诊断，单家不回退，可能消耗额度。配置热更新、分阶段结果见 [DIAGNOSTICS.md](DIAGNOSTICS.md)。
