# Migration

当前源码包版本为 2.1.0；版本号不代表已发布。[2.1.0](RELEASE-2.1.0.md) 在 2.0.1 的轻量接口上向后兼容地扩展搜索与 Reader；以下旧引擎移除属于此前的轻量重建，不是本次新增破坏性变更。轻量重建移除了 EvidenceEngine/createEngine、EvidencePack、Gather、web_fetch/web_gather、旧引擎选项、HTTP serving/adapters、rerank/充分性服务、缓存 ID、用量账本及生成插件。历史代码在 Git 中，旧测试/基准不算当前覆盖。

## 现有工具与 Pi

仅保留 `web_search({query,intent?,maxResults?})` 和 `web_read({url,reader?,focus?})`。SDK 用 `new Siftpath(await readConfiguration())`，在 finally 中 `close()`。CLI 阅读为 `siftpath read URL --reader ID`，无 `--mode`。旧 mode/document/routes.document 是已撤回的历史候选，不再维护，由可选择任意合法已配置 provider ID 的 `reader` 替代；不应用旧 patch 或实验 harness。

不传 reader 使用 routes.read；显式 reader 仅一家，无后备、不自动启用。带 focus 必须在 binding 中确有 `$focus`，不支持时业务前报 `FOCUS_UNSUPPORTED`，不静默转全文。匿名 Jina question 可能返回原生全文降级 note，映射检查通过不等于聚焦成功。

Pi 安装包通过官方 MCP 注册两工具，升级后重启或 `/reload`；移除旧 host plugins/重复 MCP 登记。目录安装需已有依赖，tarball 应先 npm-install 或解包，不能直接当 Pi 包目录。卸载不删除私有配置；Windows/WSL 各用自己的 home。

## 新默认与兼容读取

| 来源 | 省略路线/启用项的处理 |
|---|---|
| 全新配置、SDK `parseConfiguration({})` | Tavily general/research、Exa semantic、Jina read；Brave disabled，高级可选 |
| `readConfiguration` 读取既有 v2 文件 | 省略路线保留旧默认：search=brave、read=jina，semantic=exa、research=tavily；已有 providers 表及显式 routes/intent/fallback 保留；省略 providers 表时仅 Brave/Exa/Jina enabled |
| 明确 `version:1` 文件 | 继续复用凭据与 disabled 标志，保留旧 Brave/Exa/Jina 启用语义；旧 priorities/models/timeouts 不导入 |

**所有来源中未显式保存的 searchFallback/readFallback 都为空。** 已保存显式列表和顺序不被新默认覆盖；不自动加入备用服务或匿名路线。新 setup 保存完整新 routes；已有配置重跑 quick 保留仍可用路线，避免依赖省略值产生歧义。需要切换推荐路线时在高级配置明确选择，不替用户重排。

兼容是为了已有用户，不是推荐新用户启用 Brave。无版本号但带旧选项的文件应明确报错，不静默猜测迁移。

## 路径、Key 与窄范围迁移

- `SIFTPATH_CONFIG`、兼容别名 `SMARTSEARCH_CONFIG`、旧 `smartsearch/config.json` 路径继续存在；新路径不存在才回落旧路径，不自动移动。Key 环境优先；setup 不复制环境 Key。
- 正常读取不重写文件。setup 经确认会保存 v2 到**当前所选路径**，可能覆盖兼容路径中的旧文件；先备份，或把 `SIFTPATH_CONFIG` 指向新私有路径。
- 旧 Jina rerank Key 现用于原生 Reader，不能据此保证权限/聚焦；旧 Parallel/Cloudflare Key 可留在私有文件但无新运行路线。匿名必须显式选择，不用于 Key 错误后的恢复。
- 只对确切旧官方 Jina 两参数 binding 在内存补 `topk:3,chunk_size:250`；显式窗口、自定义 ID/端点/header/参数不改。完整匹配条件见 [CONFIGURATION.md](CONFIGURATION.md#jina-聚焦窗口与旧配置兼容)。
- Firecrawl **新认证选择**改为官方 HTTP `https://mcp.firecrawl.dev/v2/mcp` + Bearer `${FIRECRAWL_API_KEY}`，Markdown、onlyMainContent=true、固定 objective。已有 stdio/custom 配置不自动重写，也不增加额外适配器；要换连接须明确重新选预设。

升级不会解决所有长文裁剪，也没有新的付费认证或模型行为成功保证。当前验证与历史证据分开记录在 [TESTING.md](TESTING.md)。
