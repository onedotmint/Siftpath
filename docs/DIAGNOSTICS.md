# 状态检查、供应商测试与 Pi 命令

所有诊断业务在 CLI。Pi 扩展只是调用同包的 `dist/cli.js`、解析 JSON、用原生 `ctx.ui.notify()` 展示摘要；不注册模型工具，不加载供应商连接，不调用 LLM，不增加服务或依赖。

## CLI

```bash
node dist/cli.js status
node dist/cli.js status --json
node dist/cli.js test brave
node dist/cli.js test all --json
```

如果已经 `npm link` 或安装包到全局，可直接使用 `siftpath`。

- `status` **不联网、不创建文件**：版本、运行时、配置/凭据状态、搜索/阅读/意图/后备路由、最近测试结果与时间。
- `test <provider>` 仅测试该 ID，**不经过 Router、不故障回退、不重试**。
- `test all` 按配置的 providers 顺序逐个检查；禁用/缺 Key 会明确跳过，不会启动它们。不自动加入未配置的 Tavily/Firecrawl 或其它供应商。
- 每家先 initialize，再分页 tools/list，确认配置的工具均存在，最后按配置的 Search/Read binding 做真实请求。完整保留分页工具元数据，用官方 SDK 的 JSON Schema 校验器验证声明的 structuredContent；仅支持 task 的工具明确报不支持，不会伪装成普通请求成功。每项能力最多一次；只有两项都配置才最多两次，失败后停止该家的后续请求。
- 搜索固定 `query: "example.com"`、`maxResults: 5`（保持常见官方工具最小条数约束）；阅读固定 `https://example.com`，不传 focus、不调用 rerank/crawl/research。固定参数仍经过现有配置映射；配置自定义了常量/昂贵原生工具时，费用和行为由配置决定，请先检查。
- 每家总期限为 `min(timeoutMs, 该家的 timeoutMs 或 providerTimeoutMs)`，含连接/发现/请求。清理子进程或限时 DELETE 可能额外耗时。`all` 每家独立限时而不是把一个期限均分给全部供应商。
- 网络测试可能消耗账户/匿名 API 额度，仅显式 `test` 时执行；普通启动、Pi 扩展加载和 `status` 均不会自动测试。

`--json` 含结构化结果和 CLI 自己生成的 `summary`。测试输出写 stdout；有失败、跳过、没有供应商或取消时退出非零（取消 130），其它测试仍可有成功结果。没有 Key 不是“连接失败”，而是没有尝试网络。配置/命令错误使用现有脱敏 JSON 错误输出到 stderr。

## 状态含义

配置状态与实际测试分开：

| 字段/值 | 含义 |
|---|---|
| `configured` / 测试的 `configuration` | 状态报告的存在标记 / 这次测试的配置及凭据状态代码 |
| `READY` | 已启用、配置引用的凭据存在，**不表示服务可用** |
| `MISSING_CREDENTIALS` | 缺少某个环境变量/私有配置引用；只列名称 |
| `DISABLED` / `NOT_CONFIGURED` | 已禁用 / 未配置 |
| `lastTest: null` / `NOT_TESTED` | 没有测试记录，不能判定可用 |
| `stages.connection` | 握手是否完成 |
| `stages.discovery` | 工具发现且配置的工具名均存在 |
| `stages.request` | 实际请求通过现有原生结果校验 |
| `passed` / `failed` / `not_tested` | 各阶段成功 / 失败 / 没有执行 |
| `outcome: skipped` | 缺 Key、禁用、未配置或没有 Search/Read binding，未测试 |
| `lastTestStale: true` / `CONFIG_CHANGED` | 供应商连接、参数、凭据、生效期限、输出限制或包版本已变化，历史结论不代表当前配置 |

成功也只是**该次测试成功**，并非常驻健康承诺。

**诊断与正常调用的判定不同：**诊断还要求配置工具能被发现、支持同步调用、声明的输出 Schema 合法匹配；普通业务路径要求 MCP 响应成功、可读内容与来源可封装并满足预算，不额外发 tools/list，也不校验未发现的供应商输出 Schema。因而诊断可能拒绝普通请求可使用的文本响应；诊断通过不代表意图选路、后备或 focus 已被验证。对照回归明确保留这一区别，避免把探针等同于 Router 验收。失败只输出固定脱敏分类和建议，例如 AUTH_FAILED、RATE_LIMITED、CONNECTION_FAILED、TOOL_NOT_FOUND、DISCOVERY_FAILED、INVALID_UPSTREAM_ARGUMENTS、UPSTREAM_ERROR、PROVIDER_TIMEOUT。不会输出上游错误正文、网页内容、请求头或 Key。

## 最近测试记录

记录位于所选配置文件同目录的 `.<配置文件名>.siftpath-tests.json`（例如 `config.json` 对应 `.config.json.siftpath-tests.json`），仅保存每家最新一次的时间、耗时、阶段和固定错误代码，以及不对外展示的配置指纹。保存前按实际 JSON 编码限制为 1 MiB，超限淘汰最旧记录并保留本次结果。复用私有原子 JSON 写入（POSIX 0600），不保存 Key、查询结果或原始错误。该文件已加入 gitignore。

- 自定义 `SIFTPATH_CONFIG` 选择对应配置文件的独立记录；同目录不同配置不会覆盖。旧目录级 `.siftpath-tests.json` 不自动导入，因为无法确定属于哪份配置；已有文件保留不动，首次显示未测试，手动重新测试即可。目录只读会报告 `TEST_HISTORY_WRITE_FAILED`，不会伪造网络测试失败。
- 记录损坏/过大/符号链接时报 `TEST_HISTORY_UNREADABLE`，显示未测试，不覆盖异常文件。
- 并发多个 CLI 写入采用 last-writer-wins，不为低频手工诊断增加数据库或锁框架。

## 安装 Pi 命令

先构建当前仓库：

```bash
npm ci
npm run build
```

一次试用，不修改 Pi 用户设置：

```bash
pi -e /absolute/path/to/Siftpath/extensions/siftpath.mjs
```

持久安装本地单包（命令由当前安装 Pi 1.3.0 API 提供）：

```bash
pi install /absolute/path/to/Siftpath
```

已经运行的 Pi 执行 `/reload` 或重启。包的 `pi.extensions` 只声明这一个轻量命令文件；CLI 和扩展必须保留在同一包中，**不要只把扩展文件复制到别处**。

使用：

```text
/siftpath
/siftpath test brave
/siftpath test all
```

Pi 子进程继承启动 Pi 时的 SIFTPATH_CONFIG 和凭据环境；也可使用现有私有配置。这里没有第二套凭据机制。无 UI 的自动化场景直接使用 CLI `--json`。

无 Key 的显式匿名试用（额度和服务可能变化）：

```bash
SIFTPATH_CONFIG=/absolute/path/to/Siftpath/examples/anonymous.json \
  pi -e /absolute/path/to/Siftpath/extensions/siftpath.mjs
```

这份配置会使 Brave 缺 Key 时跳过，Exa/Jina 使用官方匿名远程 MCP。普通 `web_search`、`web_read` 及它们的 Schema 不变；诊断命令不替代 MCP 客户端接入。

## 前轮实际 Pi 验收记录（Pi 1.3.0）

在本机 Pi **1.3.0** 的真实交互终端中，用独立临时 agent 目录、`--no-session`、禁用其它扩展和 MCP 自动连接进行测试；没有更改个人 Pi 设置，也没有调用 LLM：

1. `/siftpath`：显示离线配置、两条就绪连接、Brave 缺 Key 和 NOT_TESTED。
2. `/siftpath test brave`：SKIPPED / MISSING_CREDENTIALS，三个网络阶段均 not_tested，没有故障回退。
3. `/siftpath test all`：Brave 跳过；**Exa 搜索真实通过，4491ms；Jina 阅读真实通过，3640ms**；两家连接/发现/实际请求三个阶段均 passed。使用官方匿名额度。
4. 再次 `/siftpath`：原生通知显示刚刚的最近测试时间、结果和耗时；CLI `status --json` 读取到相同记录。
5. Ctrl-D 正常退出，Pi 进程退出码 0。
6. 在同一个独立临时 agent 目录执行 `pi install /absolute/path/to/Siftpath`，再次启动 Pi（不加 -e）能自动加载命令，`/siftpath` 正常显示状态。

该轮尚未验证 Brave 有 Key 搜索和 Tavily/Firecrawl；后续 setup 恢复轮已通过官方 MCP 验证 Tavily 匿名 stdio 搜索、Firecrawl 匿名托管阅读（详见 TESTING.md），仍未验证账号 Key 业务；不将缺凭据跳过或自动化 Mock 结果算作实际可用。
