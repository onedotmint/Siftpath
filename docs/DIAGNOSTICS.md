# 状态检查、供应商测试与 Pi 命令

诊断业务在 CLI：`status`、`test`、`doctor`。Pi 扩展复用同一套逻辑：状态和测试通过运行同包 `dist/cli.js --json` 获得，配置与凭据读写使用同包的 `config.js` / `setup-plan.js`。扩展自己只负责 Pi 原生交互（菜单、遮罩输入、状态面板）和 MCP 注册。

## CLI

```bash
node dist/cli.js status
node dist/cli.js status --json
node dist/cli.js test brave
node dist/cli.js test all --json
```

如果已经 `npm link` 或安装包到全局，可直接使用 `siftpath`。

- `status` **不联网、不创建文件**：版本、**生效配置文件路径**、配置/凭据状态、搜索/阅读/意图/后备路由、最近测试结果、以及下一步建议。
- `test <provider>` 仅测试该 ID，**不经过 Router、不故障回退、不重试**。
- `test all` 按配置的 providers 顺序逐个检查；禁用/缺 Key 会明确跳过，不会启动它们。不自动加入未配置的 Tavily/Firecrawl 或其它供应商。
- 每家先 initialize，再分页 tools/list，确认配置的工具均存在，最后按配置的 Search/Read binding 做真实请求。完整保留分页工具元数据，用官方 SDK 的 JSON Schema 校验器验证声明的 structuredContent；仅支持 task 的工具明确报不支持，不会伪装成普通请求成功。每项能力最多一次；只有两项都配置才最多两次，失败后停止该家的后续请求。
- 搜索固定 `query: "example.com"`、`maxResults: 5`（满足常见官方工具的最小条数约束）；阅读固定 `https://example.com`，不传 focus、不调用 rerank/crawl/research。固定参数仍经过现有配置映射；配置自定义了常量/昂贵原生工具时，费用和行为由配置决定，请先检查。
- 每家总期限为 `min(timeoutMs, 该家的 timeoutMs 或 providerTimeoutMs)`，含连接/发现/请求。清理子进程或限时 DELETE 可能额外耗时。`all` 每家独立限时而不是把一个期限均分给全部供应商。
- 网络测试可能消耗账户/匿名 API 额度，仅显式 `test` 或用户确认后的 `/siftpath → 测试连接` 才执行；普通启动、Pi 扩展加载和 `status` 均不会自动测试。

## `test all` 的总体判定

结果分三类：实际通过（`passed`）、实际失败（`failed`）、跳过（`skipped`）。跳过包括用户主动禁用、缺凭据、未配置、没有对应 binding。

- 有一家失败 → 总体失败（退出码 1）。
- 禁用或未配置的服务只算跳过，**不会让总体失败**。
- 有通过、没有失败 → 总体成功。
- 完全没有任何有效测试（全部跳过）→ 总体**不报成功**，摘要写明 `Overall: nothing testable`，退出码 1。
- 报告同时给出 `counts: { passed, failed, skipped }` 与摘要行 `x passed, y failed, z skipped`，避免只看一个布尔值。

启用但缺凭据的供应商在 `status` 里显示 `MISSING_CREDENTIALS` 并进入 `待配置:` 提示，不会被当成健康。

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
| `configPath` | 本次生效的配置文件；`SIFTPATH_CONFIG` 可覆盖 |
| `nextStep` | 基于“已就绪 / 已测试 / 待配置”给出的下一步 |

成功也只是**该次测试成功**，并非常驻健康承诺。

**诊断与正常调用的判定不同：**诊断还要求配置工具能被发现、支持同步调用、声明的输出 Schema 合法匹配；普通业务路径要求 MCP 响应成功、可读内容与来源可封装并满足预算，不额外发 tools/list，也不校验未发现的供应商输出 Schema。因而诊断可能拒绝普通请求可使用的文本响应；诊断通过不代表意图选路、后备或 focus 已被验证。对照回归明确保留这一区别，避免把探针等同于 Router 验收。

失败只输出固定脱敏分类，并附带一条可操作提示（`hint`），例如 AUTH_FAILED、RATE_LIMITED、CONNECTION_FAILED、TOOL_NOT_FOUND、DISCOVERY_FAILED、INVALID_UPSTREAM_ARGUMENTS、UPSTREAM_ERROR、PROVIDER_TIMEOUT。不会输出上游错误正文、网页内容、请求头或 Key。

## 最近测试记录

记录位于所选配置文件同目录的 `.<配置文件名>.siftpath-tests.json`（例如 `config.json` 对应 `.config.json.siftpath-tests.json`），仅保存每家最新一次的时间、耗时、阶段和固定错误代码，以及不对外展示的配置指纹。保存前按实际 JSON 编码限制为 1 MiB，超限淘汰最旧记录并保留本次结果。复用私有原子 JSON 写入（POSIX 0600），不保存 Key、查询结果或原始错误。该文件已加入 gitignore。

- 自定义 `SIFTPATH_CONFIG` 选择对应配置文件的独立记录；同目录不同配置不会覆盖。旧目录级 `.siftpath-tests.json` 不自动导入，因为无法确定属于哪份配置；已有文件保留不动，首次显示未测试，手动重新测试即可。目录只读会报告 `TEST_HISTORY_WRITE_FAILED`，不会伪造网络测试失败。
- 记录损坏/过大/符号链接时报 `TEST_HISTORY_UNREADABLE`，显示未测试，不覆盖异常文件。
- 并发多个 CLI 写入采用 last-writer-wins，不为低频手工诊断增加数据库或锁框架。

## 安装 Pi 集成

```bash
pi install npm:@onedotmint/siftpath
```

已运行的 Pi 执行 `/reload` 或重启。扩展在加载时调用 `pi.registerMcpServer('siftpath', …)`，指向同包的 `dist/cli.js mcp`，`exposure: "direct"`，因此模型只看到两个工具：

```text
mcp__siftpath__web_search
mcp__siftpath__web_read
```

- 不需要全局安装 CLI，不需要查找 `node_modules`，不需要 `pi mcp add`，不需要手写 JSON。
- 注册用固定名字，重复加载（`/reload`、升级、重新 install）替换同一次注册，不会出现同名重复工具。
- 上游供应商仍然懒连接：只有第一次真正搜索/阅读时才启动对应的官方 MCP。
- 如果 `~/.pi/agent/mcp.json` 里已有同名 `siftpath`，文件配置优先，`/mcp` 会列出被覆盖的扩展注册。
- 未配置凭据时，`session_start` 只发一条提示，建议运行 `/siftpath`；不会静默失败。

源码检出试用（不修改 Pi 设置）：

```bash
pi -e /absolute/path/to/Siftpath
```

## `/siftpath` 菜单

```text
/siftpath                 → 菜单（首次使用默认「快速配置（推荐）」，已配置默认「查看服务状态」）
/siftpath status          → 状态面板
/siftpath test brave      → 单家真实测试（不启用后备）
/siftpath test all        → 逐家真实测试
```

菜单项：快速配置、高级配置、查看服务状态、测试连接。

- **快速配置**：选择搜索服务与阅读服务 → 输入/保留 Key 或选择官方匿名访问 → 确认后按推荐路由保存。无需理解 tool name、JSON Schema、意图或后备顺序。
- **高级配置**：Pi 原生菜单循环，可逐家配置凭据、停用服务、设置 default/semantic/research 搜索、阅读服务和**有序后备**；不启动第二套 Clack TUI。
- **查看服务状态**：可滚动面板，显示生效配置路径、Pi 工具是否已接入、搜索/阅读/意图路由、每家 `READY`/`DISABLED`/`MISSING_CREDENTIALS` 与“最近测试 passed/failed”，以及下一步。READY 与“测试通过”分开显示。
- **测试连接**：先选服务并确认“会消耗额度”，再执行真实测试。

Key 输入使用自带的**遮罩输入组件**（`•` 回显、不回显明文、不写入会话记录、不进入 argv、不打印）。取消任何一步都不保存；只有确认后才原子写入私有配置。环境变量优先于本地 Key，界面会明确提示。

## 配置热更新

`dist/cli.js mcp` 在**每次工具调用前**检查配置文件的时间戳/大小：

- 未变化：复用现有连接（不会每次调用都重新初始化）。
- 已变化：读取新配置、创建新 Router，旧 Router 标记为 retire，等在途调用结束后自行关闭并断开连接。
- 文件损坏：本次调用返回 `INVALID_CONFIG` 与提示，其它调用不受影响；修好文件后无需重启即恢复。

因此在 Pi 里保存新 Key 或改路由后，下一次搜索/阅读立即生效；只有升级包本身才需要 `/reload`。

## Pi 首次安装验收

见 [TESTING.md](TESTING.md) 的“本轮 Pi 首次安装验收”一节：使用隔离的 Pi 用户目录与本仓库 `npm pack` 产物完成安装、`/siftpath` 快速配置、工具注册与首次真实搜索/阅读；真实联网调用仅在获得许可时执行，会单独标注。
