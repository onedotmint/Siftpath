# Agent evidence quality diagnosis (offline follow-up)

Archive notice: the maintainer has accepted model reasoning/upstream coverage as documented limits, not further adapter work or a new publication blocker. Historical hold/proposal statements below describe their original stage. Runtime regressions now check preservation, warnings and clipping, not model answers or SQLite API semantics.

**Publication remains on hold.** Base is the traceable, already-CI-verified RC `6029a7a16ca7a8cc7ab22b96bcdcceb93f37a2e8`. This uncommitted follow-up is not the old release artifact and has no new live quality pass. No new model, provider business or remote source request was made. Old cache reports/tarball remain unchanged.

## Evidence chain and provenance

Recorded session: `~/.cache/siftpath-release/2.1.0/pool-acceptance-20261026T072207Z/`, task about SQLite WAL automatic checkpoint. Three model responses and three authenticated Jina reads completed, no search. The original public final answer is retained, not corrected after the fact.

Durable regression input is [wal-agent-evidence.json](https://github.com/onedotmint/Siftpath/blob/main/tests/fixtures/wal-agent-evidence.json) in `tests/fixtures/` (local uncommitted file until reviewed). It contains only the three public native MCP results, corresponding actual Agent tool-result envelopes, input parameters and public final answer; no credentials, hidden reasoning or whole request body. Native results came from parsing saved SSE `data:` records, not reconstructing a hypothetical vendor response. The event-log hash anchors extraction provenance.

The raw native text equals the Siftpath normalized content equals the Agent-delivered tool content byte for byte:

| Source / native text characters | UTF-8 SHA-256 |
|---|---|
| `walformat.html` / 5558 | `c4606d5901bf53341a4928b4fd80691226eb5458211066f0c434375918aa1c7d` |
| `wal.html` / 5400 | `4e07f1d2ab6c3a05d9b6dad0bc034afdb7f28cc539b4652939f1d1e486831e96` |
| `c3ref/wal_hook.html` / 4567 | `7af8801a70a843ed728b4245c66c92d2190f9119a07cc26e4773283146c07558` |

Normalized serialized tool texts were5978/5803/5010 characters; all under16000, `truncated=false`, `sourcesTruncated=false`, exact requested URL, UNTRUSTED_WEB_CONTENT and FOCUS_MAY_OMIT_CONTENT retained. Subsequent complete model HTTP bodies were not saved, only hashes/lengths: this verifies Agent tool delivery, not a byte-reconstruction of remote model context. Final answers quoting passages corroborate use but do not prove perfect attention to all evidence.

A separate offline reviewer reference, `tests/fixtures/sqlite-checkpoint-reference.json`, preserves installed SQLite **3.46.1** C API comments from `/usr/include/sqlite3.h`, source hash and original line ranges. It was **not** visible to the recorded Agent, is not a new hosted-page fetch, and must not be counted as successful model retrieval. Public source URLs are identifiers for the corresponding APIs, not evidence that this round fetched them.

## Per-error attribution

A = necessary detail absent from this upstream response (not necessarily absent from the official site); B = Siftpath loss/mislabel; C = sufficient returned evidence misread; D = mixture.

### 1. nBackfill and reset — C, not B

The native `walformat` snippet says:

> nBackfill is changed to zero during a WAL reset

It also distinguishes `nBackfill == mxFrame` (all content backfilled) from the next writer being allowed to reset only when no `WAL_READ_LOCK(N)` for `N>0` is held. These exact conditions survived normalization. The final answer nevertheless calls nBackfill “只增不减地逼近 mxFrame”. That unqualified statement is wrong; increase during a WAL cycle is not increase across resets. No missing text or clipping explains this error.

### 2. Long readers — primarily C, with broad upstream summary contributing

The precise native `walformat` evidence includes:

- `WAL_READ_LOCK(0)` means ignore the WAL and read from the main database.
- For another held reader mark with `mxFrame > read-mark[N]`, checkpoint cannot run to completion.
- Reset must wait until there are no `N>0` read locks using that WAL.

The answer omits those boundaries and states too broadly that long readers always prevent complete backfill/reset/truncation. A reader can limit progress; a long duration alone is not the complete condition. The higher-level `wal.html` excerpt itself uses more sweeping starvation language. The precise returned explanation should have constrained that summary; this is not an excuse to discard upstream text or hardcode lock rules in Siftpath.

### 3. Disabling automatic checkpoint — D (A plus overgeneralization)

Recorded snippets mention commit-time threshold checkpoint, last-connection-close checkpoint, manual checkpoint and disabling automatic checkpoint, but no exact numeric `N<=0` contract or close-time override. The final answer asserts `N=0` “完全关闭” and WAL “会一直增长”. The installed versioned API reference states that `sqlite3_wal_autocheckpoint(D,N)` controls that connection's post-commit threshold mechanism; zero/negative disables it, and it uses PASSIVE. A separate `SQLITE_DBCONFIG_NO_CKPT_ON_CLOSE` controls normal last-connection-close behavior. Manual checkpoint or application/custom-hook behavior remains possible; disabled threshold checks do not prove perpetual growth or no possible checkpoint.

These conditions were not removed by Siftpath: they were never in the three snippets. The Agent spent its third call on hook timing instead of the exact auto-checkpoint API and then used absolute language. A narrower API-focused read asking about disable/close exceptions would be more relevant than repeating a broad overview.

### 4. PASSIVE/FULL/RESTART/TRUNCATE — A/D, no B

The recorded `wal.html` snippet supports PASSIVE doing available work without interference and potentially not completing. It names FULL, and its high-level starvation discussion says RESTART/TRUNCATE ensure completion before returning, but does not include busy-handler/error qualifications. The final answer repeats the high-level guarantee without them.

The installed official API comments supply the missing contract (separate reviewer evidence):

| Mode | Conditions and success limits |
|---|---|
| PASSIVE | Copy as many frames as possible without waiting for readers/writers; no busy-handler invocation; may remain incomplete. |
| FULL | Through the busy handler wait for no writer and readers on the latest snapshot; then checkpoint all frames and sync; blocks new writers while pending, not new readers. |
| RESTART | FULL plus wait until readers use only the database file; successful completion permits next writer to restart the log. |
| TRUNCATE | RESTART plus truncate WAL to zero **just prior to a successful return**. |

A competing checkpoint can return `SQLITE_BUSY` without invoking the busy handler. If waiting for the writer/readers ends because busy handler returns0, proceed like PASSIVE and return `SQLITE_BUSY`. These are not unconditional always-success guarantees. The answer itself identifies the detailed checkpoint API URL as not fetched, so it cannot silently borrow its unverified exceptions. Full/checkpoint success, reset eligibility and actual truncation must not be conflated.

### Thread statement evidence boundary

Hook evidence directly says after commit and write-lock release, gives the same database handle and propagates errors into the calling statement. The same-thread conclusion follows the mechanism but the current snippet bodies do not explicitly state “thread”; that word is in the question, not evidence. No claim that this session directly read the explicit thread statement. A future test must retrieve direct support or clearly mark inference; no need for a new Siftpath inference layer.

## Reader strategy

All three calls omitted `reader`, so default routing selected Jina. The old description explicitly preferred Jina+focus; no record proves the model compared two Readers. The focuses were broad, spanning threshold/thread/starvation/modes, and did not explicitly ask reset/zero, read-lock exceptions or failure/BUSY semantics. Yet the `walformat` response did return important exceptions, demonstrating that more retrieval alone cannot repair every reasoning error.

The hook result contains1791 characters of navigation/JavaScript noise (~39.2% of its4567 characters), and its native text ends at `To re-enable the default behavi` before `snippet_source: content`. Both artifacts were already upstream and passed through unchanged. Thus local `truncated=false` is accurate and **not** upstream completeness. Existing focus warning was present; no factual-evidence-loss bug in `output.ts` was reproduced.

Better decisions using existing capabilities:

- For exact semantics, ask a narrow focus on the specific API, including failure/exception conditions; do not assume a multi-topic focus guarantees every clause.
- When returned text is noisy, stops mid-sentence or requires surrounding context, a targeted different page or explicit `reader:"firecrawl"` **without focus** may be appropriate. The saved/new Firecrawl preset does not map focus and would correctly reject it. It is not guaranteed to return complete text or fit the unchanged16k budget.
- No evidence that Firecrawl would have fixed this WAL run: it was not called. Do not require it routinely or refetch adequate evidence merely to exercise a brand.
- If evidence remains missing within budget, qualify the answer. Never replace a missing error condition with an unconditional promise.

## Search diagnosis

The task used a widely known authoritative documentation set. The model supplied plausible SQLite official URLs itself, successfully read them, and did not need discovery to locate these pages. Zero search is **uncovered search behavior**, not proven search incapability. It failed the old explicit search gate, but forcing an unnecessary search in production would not improve this reading error.

`web_search` already advertises Tavily general/research and Exa semantic discovery; its intent enum accepts exactly general/semantic/research and existing routes apply if omitted. No intent mapping, search tool or forced-first-search change is justified. A distinct discovery task below is needed.

## Minimal implementation change

Only `src/tools.ts` read description changes: remove blanket “Prefer Jina”, mention upstream snippets may omit exceptions/end mid-sentence, ask for exceptions and failure/return conditions, prohibit turning qualified claims into guarantees, and suggest targeted API/section follow-up or explicit uncertainty. Reader/focus schema, bindings, output shape/budget, routes and two-tool count are unchanged. Architecture wording is aligned.

This addresses a demonstrable guidance gap, not the model's incorrect nBackfill reasoning itself. String assertions verify what is advertised, **not** improved model compliance. No SQLite-specific runtime rule, planner, hidden retry, automatic provider selection or local summarizer added. `output.ts` deliberately unchanged because the raw-to-visible replay passes.

## Offline regression and validation boundary

`tests/agent-evidence.test.mjs` replays the actual three native MCP results and compares every normalized envelope except nondeterministic retrievedAt to what the Agent actually received. It checks preserved reset/lock exceptions, absent mode/disable conditions, native half-word/script noise, provenance/locality warnings, and local clipping at a smaller test budget. Saved answer/error assertions preserve the failure rather than sanitizing it. API-reference tests distinguish reviewer-known exceptions from Agent-visible evidence. The fixture is only test input; package files exclude `tests/`.

`tests/model-experience.test.mjs` checks the short updated description contract and explicitly labels it **not proof of model compliance**. No live calls authorized or executed. Current results and limits are recorded in the cache diagnosis report, not backfilled into old RC CI claims.

## Proposed live acceptance — requires new authorization

Two independently scored single-session tasks; no extra model probe. Before a new authorized execution, freeze an isolated snapshot of this exact uncommitted diff/fixture hashes and build output, and bind a fresh execution manifest to it. The old release harness deliberately requires a clean RC tree and old source hashes, so **it must not be reused unchanged** against this modified tree or weakened silently. No source commit is required or authorized by this proposal; a snapshot-specific preflight must again prove actual-dispatch limits and the two real tool schemas before live. Reviewer notes/answer keys must stay outside the model's resources. Retain current DeepSeek model/config, normal production tools, bounded Pool gate, no anonymous/retry/fallback. Final transport caps apply, not prompt-only counting. Each scenario: **at most1 session,4 model sends,8192 output tokens/send including reasoning (32768 total),3 business sends including failures,256KiB model request body,90s model/60s business/600s session ceilings**, while respecting shorter existing provider deadlines. Optional handshake/discovery traffic is recorded separately. Per2 scenarios combined upper bounds:2 sessions,8 model sends,65536 output tokens,6 business attempts. Input tokens, supplier credits/cache and actual currency bill remain unknown; output caps are not a monetary ceiling. Authorize scenarios separately if preferred; failure never opens a second session.

### A. Conditional reading and reasoning

Task text (no URLs, providers or tools specified):

> 请核对 SQLite WAL 的边界行为：nBackfill 在 checkpoint 与 WAL reset 后如何变化；长期读事务何时限制回填或重置；关闭自动 checkpoint 后是否仍可能发生 checkpoint；四种 checkpoint 模式在成功、繁忙与失败时分别保证什么。用实际读过的原始资料区分有条件成立与无条件成立，无法核实的细节请明确保留。

Search is optional here. At least one successful read and primary evidence for every required boundary; no universal nBackfill monotonicity/no-checkpoint/no-BUSY promise. Missing decisive conditions means not passed even if other parts are correct; accurately reported uncertainty is honest but does not meet complete-answer coverage. A source link is not a read, question echo is not evidence. Explicit same-thread claims require support. Two or three focused API/format reads may suffice; no forced Firecrawl/fulltext.

### B. Autonomous discovery (frozen unfamiliar reference, no seeded URL)

Task text:

> 请找到 Ubuntu 为 curl 8.18.0-1ubuntu2.8 提供的一项涉及 GnuTLS 发送路径的安全修复，查明漏洞编号、使错误成立的异常条件、修复采取的边界检查以及对应代码文件。请用实际核对过的原始公告或维护者变更记录说明，不以二手摘要代替；发行版补丁与上游版本不能混为一谈。

A reviewer-only answerability key is frozen in the separate cache diagnosis directory using the already-installed Ubuntu package maintainer changelog (`/usr/share/doc/curl/changelog.Debian.gz`, SHA-256 and exact excerpt retained). It identifies the specific versioned patch, anomalous API return condition, rejection check and source file. This is not a guessed advisory chronology, fresh network fetch or preseeded Agent evidence. Do not give that file, its expected ID or reference text to the Agent; its isolated execution directory must not load reviewer notes. The exact package/patch condition is sufficiently specific to demand discovery rather than ordinary WAL knowledge. Current public source availability remains unknown until the authorized search.

Pass: actual autonomous search results must materially help locate the original Ubuntu maintainer record or original advisory/patch, followed by a successful read supporting ID, abnormal condition, boundary action and file. Compare query/result URL/chosen read provenance against the independent versioned key, and do not mistake a distro patch version for the first upstream fixed version. Search snippets or guessed known URLs alone cannot prove discovery. No genuine search means this coverage target is unverified, not grounds for production forced-search. If the bounded calls cannot retrieve primary evidence, stop and report not met, rather than supply the answer key, expand the budget or substitute a task mid-session.

## Current gate

Ready to propose two newly authorized behavior evaluations after local checks: **A** has saved SQLite boundary references; **B** has a frozen independent maintainer-record answer key. Neither live result is presumed available or successful; description effectiveness and autonomous discovery remain unproven. Overall quality acceptance and formal release remain on hold. New description changes distributed content: old CI/tarball hash applies only to RC6029a7a, not this working tree. Do not reuse old artifact integrity as evidence for the modified code.

## 后续：固定证据对照与两个独立受控场景（均已执行，未发布）

本节更新上面的“尚待授权”状态，不覆盖旧结果。当前用户明确授权了最多两次独立模型对照，以及 A/B 各一个 Pi 会话、四次模型请求、三次供应商业务；实际严格按离线诊断 → 对照 → 最小修改 → A → 评价/细化 → B 执行，失败不重试。完整本地记录在 `~/.cache/siftpath-release/2.1.0/evidence-quality-followup/`；持久脱敏结果、公开答案、用量及一份短原始阅读响应在 [evidence-quality-followup.json](evidence-quality-followup.json)。两份 fixture 都不进 npm 包。

### 原会话决策链的补充定位

| 用户需求 / 最后断言 | 模型选择与官方返回 | Siftpath 交付 | 错误发生位置 |
|---|---|---|---|
| 自动 checkpoint 触发、线程、长期读事务；答案扩展到回填/reset | 首轮并行读 `wal.html`、`walformat.html`；focus 分别跨阈值/线程/饥饿/四模式，以及字段/读锁。格式页实际返回 reset 清零与读锁例外 | 与 native 逐字一致，警告及 `truncated=false` 均保留 | 归纳把 reset 清零写成“只增不减”，把有条件的读锁限制写成普遍规律；属于充分证据被误读 |
| 线程/回调条件 | 最后一个业务名额读 `wal_hook.html`，问时机、线程/连接、回调限制；返回写锁释放后的回调机制，但无明确线程原句，末尾半词且有脚本噪声 | 半词、噪声及 focus 风险照传；未发生本地裁剪 | 此补读与任务有关，不能说无用；但没有解决模式失败、关闭机制缺口 |
| 关闭机制、四模式保证 | 概述有“完成”强语气，但没有完整 busy/失败契约或关闭机制边界；未读具体 checkpoint/auto-checkpoint API | 没有删除缺失的条件，它们本来未在三个片段中 | 把概述当完整契约，再作绝对断言；仅声明额外链接没读，未限定对应具体结论 |

**预算纠正**：第三次业务派发前剩一次，之后剩零；第三次模型请求被设置 `tool_choice:none`。因此“第三次结果明显不完整却没再读”并不能证明有额度下主动放弃。可观察问题是最后一个名额的优先级和无额度时的回答范围。没有公开行为能证明模型内部是否注意了半句，不能把“未输出保留”解释成已知的注意力机制。

Jina 既有固定源码表明 `question/topk/chunk_size` 是选段，不是逐子问题问答；当前绑定为 3×250。宽 focus 与小片段窗口构成覆盖风险，但不是唯一原因：关键 reset 条件事实上已返回。未新请求同页不同 focus 的受控上游实验，所以不宣称已证明何种窗口/Reader 必定补齐。保留原生噪声，既不本地删改也不自动切换供应商。

### 固定证据 A/B：只变核验指令

- 同一 `deepseek/deepseek-flash`、`openai-responses`、实际 `reasoning=minimal`；每组一个独立请求，最多 8192 输出 token，90 秒请求/100 秒总期限，关闭重试，无工具/供应商。
- 任务与原会话一致。把实际交付过的三个 `input + modelVisibleResult` 作为固定 JSON 资料，SHA-256 为 `a01094c19a1ca8b18a78d56c04bb688f5d17916fa14c8bc3002647b55188867a`。两组请求脚本相同，B 去掉新增核验文字后与 A 的提示逐字相同；没有塞入 reviewer API 参考或原错误答案。
- B 仅增加区分一般规律/例外、核对成功/失败/繁忙/reset、证据不足保留、避免有条件结论绝对化的要求。两次均 HTTP 200、正常 stop。
- **限制**：这是固定资料单轮重放，不是重建旧 Agent 的全部系统消息、工具历史、隐藏状态或随机采样；只能评价同资料下的这一对指令，不是旧错误的确定复现。

| 观察 | A 原始资料 | B 同资料加强核验 | 支持什么 |
|---|---|---|---|
| reset 清零 | 正确写出 | 正确写出 | 原“只增不减”这次不复现；不能据此归因于 B |
| 长读者例外 | 有精确 read-mark 机制，但概述/总结仍泛化 | 仍混用概述与精确条件，未明确 lock(0) 例外 | 不支持已稳定解决 |
| RESTART/TRUNCATE 保证 | 无条件“返回前完成” | 明知缺少 busy/返回码证据，另一段仍写“返回前完成” | 核验要求能增加保留语句，但不足以消除冲突断言 |
| 线程证据 | 没有捏造明确同线程原句 | 更明确区分推断与原文 | 局部改善，不是全面准确率证明 |

结论不是“A 错 B 全对”。两者都有条件性错误，B 有局部保留改善；不能从一次对照宣称核验指令有效解决，更不能继续给适配层加事实核查 Agent。

### 最小描述修复与实际 A

在既有未提交 `web_read` 修改上，仅补充“focus 请求不是逐项覆盖证明”和“证据/预算不足时限定受影响的具体结论，而非通用免责声明”。`web_search`、输入 Schema、路由、绑定、16k 预算和输出代码不动。现有描述测试只检查实际广告契约，不冒充模型遵从证明。

A 使用此前冻结的 SQLite 边界任务，无 URL/Reader/工具指定。当前未提交源码和构建以 SHA-256 快照绑定；复用已有并发已修复的 Pool 闸门，但以精确脏工作树快照代替旧的 clean-tree 限制，旧门禁/授权/包不修改。离线 37 组检查和实际序列化工具描述对照通过，零远端；共享 dispatcher 在实际发送前扣除预算，第四业务/第五模型、内部重发、匿名和后备均拒绝。一个独立会话正常结束，**3 模型/3 业务**：

1. 默认 Jina 读 `wal.html`，无 focus；
2. 默认 Jina 读 `pragma.html#pragma_wal_checkpoint`，无 focus；
3. 发现前两次裁剪后，自主对 `wal.html` 选择 `reader:"firecrawl"`，**不带 focus**。

前三步均业务 HTTP 200；Jina 原生文本分别 43651/144419 字符（后者含原始 HTML），Firecrawl 原生文本 38455 字符。离线重新 normalize 后与三个实际交付封套逐字段一致，只有 retrievedAt 忽略。最终 Jina 正文分别 14917/14743 字符、Firecrawl 15261 字符，三个封套均 16000 且 `truncated=true`。这与**旧**聚焦会话无本地裁剪是不同事实，不能混称本轮也无裁剪。Firecrawl 保留 `creditsUsed:1, cacheState:"hit"`，并没有补到晚于前缀的关键内容。模型笼统称相同片段，实际不是逐字相同，只是均缺关键后文。

A 明确列出了大部分未核实项，有自主识别裁剪和更换 Reader 的行为；但最后名额用在另一种长页前缀，而不是关键 API/字段页。它仍在“待核实记忆草稿”中把 FULL 写成不等待读者，并把部分长期读事务限制概括过宽。**不通过完整准确验收**；免责声明不使错误草稿变成正确结论。

据此只再细化同一 read 描述：具体问题针对 API/章节窄 focus，而非长页无 focus；URL fragment 不保证章节抽取。这不强制品牌或每页都 focus，也不新增锚点解析/分页。**该细化后没有重跑 A**，其 A 场景行为效果仍未验证。B 是另一任务，不构成这次细化的因果对照。

### 独立 B：可答性、搜索决策与错误分开判

执行前，对 reviewer-only 冻结键所对应的 Ubuntu 原始 changelog、官方 CVE 页各直接 HTTP GET 一次（共两次，非模型/供应商，不给 Agent）。均 HTTP 200，公开 changelog 前九行与离线键逐字相同；无偷偷更换题目/答案。HTTP 可达不当成搜索收录证明。

B 原任务无 URL、Provider、CVE 编号、工具提示；不加载工作区资料/reviewer 文件，只启用生产两个 direct 工具。离线预检再次确认它们在真实模型请求中可见、Schema 和描述与当前构建一致。一个独立会话正常结束，**3 模型/3 业务**：

1. 模型自主并行两个 `intent:"research",maxResults:10` 搜索：`Ubuntu curl 8.18.0-1ubuntu2.8 GnuTLS send CVE`；`curl GnuTLS send path CVE boundary check 8.18.0`。
2. 两次由配置路由到 Tavily，实际发现 Ubuntu USN-8927-1 和 Launchpad 维护者记录入口，均未裁剪。
3. 随后自主读 curl 原始 CVE 公告，默认 Jina、无 focus；短页 2465 字符、未裁剪，取回异常返回值、EAGAIN/PONG 条件和上游 fixed-in 提交链接。具体 curl CVE URL 是根据发现的 ID 构造的，不能假称它逐字出现在搜索 URL 列表；实际搜索确实帮助定位了 ID 和原始来源。

**发现/选择链路有真实支持**：任务需要陌生版本精确信息，模型确实自主搜索并读原始公告。因此“搜索未注册/不可见/不会选”在此样本被否定；原 SQLite 零搜索不构成搜索故障。不改搜索描述、不硬编码搜索优先。

**整体质量仍未通过**：两次搜索用掉两个名额，只剩一次读公告，未读确认补丁边界检查/文件的维护者记录或提交。最后答案把“拒绝越界返回值”说成“校验/钳制”，`lib/vtls/gtls.c` 是未核实推断；把只在搜索摘要出现的 Ubuntu 公告写成已核实。更重要的是，已阅读的 curl 公告明确列出 8.20.X/8.16.X/8.14.X 的已修维护分支（>=8.20.2、>=8.16.2、>=8.14.3），答案仍把 7.86.0–8.22.0 整段写成受影响。此处再次是**足够证据中的例外被模型漏掉**，不是 Siftpath 裁剪或上游遗漏。

### 用量、可追溯性与停止边界

| 阶段 | 实际模型请求 | input | output（含 reasoning） | cacheRead | totalTokens | 业务 |
|---|---:|---:|---:|---:|---:|---:|
| 固定资料 A | 1 | 4658 | 5693 | 0 | 10351 | 0 |
| 固定资料 B | 1 | 4694 | 7089 | 0 | 11783 | 0 |
| Pi A | 3 | 28378 | 11472 | 4608 | 44458 | 3 |
| Pi B | 3 | 20610 | 5058 | 2688 | 28356 | 3 |
| 合计 | 8 | 58340 | 29312 | 7296 | 94948 | 6 |

cacheWrite 均零，reasoning 已计入 output，不能再相加。每场预算独立，没有共享未用模型次数、追加会话或失败重试。六次业务为 Jina 三次、Firecrawl 一次、Tavily 两次。Firecrawl 原生/最终元数据同一笔 **1 credit、hit**，不是免费；其余本次 Jina/Tavily 响应未报告可用 token/credit/金额。Pi 配置价格缺失而报告 cost=0，实际模型/供应商货币账单**未知**。两次 reviewer 原站 GET 单独列账，不冒充 Agent 取证，也没有额外搜索/Reader 供应商业务。网关/供应商内部执行与计费不可见。

原 RC `6029a7a`、旧 tarball 与上轮 diagnosis 文件保持不变；初始脏工作树 patch/hash、各场新源码/build snapshot、脚本 hash、一次性授权锁、事件与公开工具结果均单独保存。A/B 的实际源码快照不同（A 后仅细化 read 描述），不混记同版本效果。私有配置/凭据前后字节哈希不变，子进程退出，无提交/推送/合并/Tag/Release/npm 发布。

**停止在适配层加复杂度**：本轮未发现新的源码适配缺陷。保留最小通用指导，已有原生能力可用于窄 API 补读/必要时 Markdown Reader；不加编排器、隐藏补查、多 Provider 串联、自动事实判定或默认扩预算。下一步若继续质量工作，应在 Pi 任务指令中逐结论绑定证据/例外、避免未核实草稿，或另获授权比较更合适模型；本轮对照不证明这必然有效。完整 Agent 质量与正式发布门禁仍是未通过/待维护者决定，不用工程检查绿灯替代。
