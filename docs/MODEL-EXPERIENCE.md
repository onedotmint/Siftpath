# 模型证据使用体验：历史结果与限制

本文记录已有调查，不是新 reader 契约的模型验收。本次文档整理不运行模型或供应商调用；当前最终回归见 [TESTING.md](TESTING.md)。

## 证据语义

- 片段缺代码、表格行、版本或条件，不能推断原文不存在。精确 focus 在支持时有用，但应按关键结论核对证据；充分就停止，真有缺口才显式补查，无法确定可报告未知。**不要求每次再读全文。**
- `truncated` 只表示本地封套裁剪；非聚焦读取也不证明上游完整。历史 Jina RFC 缺第5节，Firecrawl同页则是原始有目标、最终输出被裁掉，不能混为同一问题。
- `url` 是请求页面；`sources` 可能含未独立读取的外链。`retrievedAt` 是本地时间。供应商原生 notes/诊断保留，不凭通用元数据猜测 readScope。
- 当前只有 `web_search` / `web_read({url,reader?,focus?})`。显式 reader 只选一家；focus 业务前依实际 `$focus` binding 检查，不支持不调用、不转全文。检查通过仍不代表匿名 Jina 或其他上游已成功聚焦。

## 精确镜像去重

旧 normalize 只去除整对象序列化相同的镜像；text 为 `{results,received}`、structured 为 `{results}` 时仍重复。现有改动仅在**一个可解析 JSON text 块逐字段包含整个 structuredContent，值深度相等**时不再追加 structured：对象键序无关，数组/字符串/代码/表格必须相同。原 text 及额外字段逐字保留；有不同证据则两路都留，不做模糊匹配、YAML/HTML解析或摘要。

`mcp/stdio.ts` 对外是一个 JSON 文本封套，不再额外发送 structuredContent；Pi 直接注册同一 MCP，没有第二套工具说明。去重没有引入自动重读、充分性判断或新的公开输出形状。

## 离线输出对照

基线为 `tests/fixtures/model-experience-baseline.json`；同一受控回复、相同警告与16000字符预算。数字为完整封套 UTF-16 字符，不是 token，也不是各线上供应商的重复比例。

| 样例 | 修改前→后 | 减少 | 保留边界 |
|---|---:|---:|---|
| SQLite | 1304→835 | 36.0% | 原 text 逐字保留 |
| RFC条件缺失 | 1392→887 | 36.3% | 缺失仍缺失 |
| 长规范不完整返回 | 1132→757 | 33.1% | 不假称完整 |
| 代码/选取表格行 | 842→600 | 28.7% | 代码/版本/表格逐字保留 |

四例无本地裁剪；另有小预算与Unicode/转义回归。没有精确 tokenizer，不把字符/4称实测 token。

## 历史真实 Pi 回放：行为门禁未通过

脱敏调用/答案/usage：[model-experience-results.json](https://github.com/onedotmint/Siftpath/blob/main/docs/model-experience-results.json)。`deepseek/deepseek-flash` 共8会话，每会话上限4模型请求/3工具调用，网页供应商调用为0。用本地证据 fixture（引用复用旧原文，部分边界/代码API构造），不是当前 Jina/Firecrawl 线上质量或账单测试。

两早期失败单元未完整保存；其余6单元共16模型请求、8 fixture调用。含未完整记录部分，总模型请求只能界定为至多24，不虚构精确账单。模型识别 fixture 标记，代表性受限；单样本非随机配对，不能分离提示和去重的独立因果作用。

| 场景 | 结果 |
|---|---|
| SQLite已有三事实 | 修改后仍2读+1失败搜索，未达到充分即停，还补入fixture未提供示例 |
| RFC缺响应条件 | 前后均触及guard/未完成，未验证成功定向补查 |
| 长规范完整性 | 前后均拒绝完整性推断，无新增行为收益 |
| 代码/表格选行 | 未把缺失当不存在，但未完成必要的定向补查 |

长规范工具封套1077→702字符，但整会话 totalTokens3434→3659；当时工具声明增加553字符。整请求usage含系统提示、历史、缓存等，不能归因于工具输出；不支持的payload测量记未知而非0。**离线去重有效，不等于端到端token节省或模型行为改善。** 本轮简化说明和新reader亦没有新的模型成功保证。

## 后续边界

撤回的 mode 双Reader候选另见 [dual-reader-results.json](https://github.com/onedotmint/Siftpath/blob/main/docs/dual-reader-results.json)：显式选到Firecrawl也未解决RFC长文目标被本地预算裁掉，未通过保留门禁，patch/harness不再维护；现由reader接口替代，但不能沿用其历史实验宣称新接口收益。

保留失败证据，不加outline、分页、快照或推理层来掩盖未知。今后若有授权，应先保存完整失败样本并验证真实证据覆盖和必要补查成本；本次不新研究、不保证16000字符内解决长规范。
