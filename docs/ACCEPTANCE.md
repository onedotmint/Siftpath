# Acceptance status — evidence integrity preview

## Scope and delivery status

This preview keeps Legacy ranking as the default; BM25 is still opt-in. Pi,
CLI and MCP schemas, provider priorities, installation behavior, and package
and lockfile dependencies are unchanged. No retrieval framework, embedding,
model summary or persistent index has been added.

The detailed trial logs, original provider responses, model payloads, temporary
harnesses and private configuration remain outside the repository. This is a
public summary, not an export of those logs.

## Implemented fixes

- Fetched full text remains available even when a provider also returns highlights.
  Duplicate highlights do not consume the full-text processing allowance.
- Evidence budgeting no longer cuts normative units at arbitrary character offsets.
  Selection accounts for source attribution and the complete serialized pack.
  An indivisible unit that cannot fit reports `BUDGET_TOO_SMALL`.
- Code/table boundaries, clipping markers, source synchronization, coverage
  downgrading and diagnostic retention are covered by offline regressions.
- Plain `.txt` documents no longer receive inferred Markdown sections. RFC ABNF
  such as `# element => element * ( OWS "," OWS element )` is not a chapter.
  Explicit provider/caller section metadata is preserved. Markdown headings are
  recognized conservatively, rejecting grammar/code-like headings.

The section fix changes metadata only: evidence text, URLs, source IDs and
citation IDs remain stable. Unknown sections are omitted instead of invented.
Plain TXT numbered headings are not parsed into a new chapter-search feature.

## Offline verification (2026-10-12)

- TypeScript typecheck and production build: passed.
- Full offline suite: **138 passed, 0 failed, 0 skipped**.
- Source/package checks and `git diff --check`: passed.
- 48 fixed RFC full-pipeline cases: complete JSON token counts, usage and source
  associations checked; no per-task coverage regression.
- No paid provider or model requests were made in this final fix round.

The original queries and gold v2 remained fixed. Coverage below is the macro
average of per-task required-fact retention, not model answer accuracy.

| Stored corpus | Budget | Coverage after integrity fixes | After section fix |
|---|---:|---:|---:|
| Exa RFC full text | 3,000 | 65.77% | 65.77% |
| Exa RFC full text | 6,000 | 66.96% | 66.96% |
| Official RFC TXT | 3,000 | 66.96% | 66.96% |
| Official RFC TXT | 6,000 | 66.96% | 66.96% |

Gold SHA-256:
`8cbd6026b505e0e04927ca6a954bf9627dbecbaa08ce207e04b62ac63159453a`.

## Recorded live trial — not rerun by this fix

The preceding trial used real Exa extraction and a real Pi DeepSeek session.
RFC 9110 highlights did not contain the target clauses, but full text did;
the clauses reached the actual model request. Budget replay retained the
selected normative units at 3,000 and 6,000 tokens. The agent correctly
separated ETag/If-None-Match from Last-Modified/If-Modified-Since and completed
without an output-length stop. A subsequent real GPT-6.1-sol review confirmed
these core improvements but did **not** certify the entire answer.

A preserved-data trace found every ordered-precondition clause in raw text and
candidates. The actual final model context included the starts of steps 2 and
4, but not the complete introduction or starts of steps 1, 3, 5 and the final
method-execution step. Saved-corpus replays locate much of this loss before
final budgeting, in the existing query/24-unit selection. Per-agent raw
highlights were not captured, so replay is not asserted to reproduce each
original response byte-for-byte.

“Continue to step 5” does not imply that step 5 is the last step. That was a
model inference error compounded by incomplete coverage, not evidence that
the budget layer damaged an already-delivered complete statement. No ranker
or agent behavior was changed to hide it.

## Remaining limits

- Full RFC section/order coverage is not guaranteed by lexical ranking or URL anchors.
- Native sentence boundaries and basic structure detection do not prove semantic completeness.
- Plain TXT inferred sections are intentionally absent; explicit metadata still
  relies on the provider/caller's correctness.
- Token estimates are not a substitute for a model-specific tokenizer.
- Historical trial usage metadata is not a billing audit. The native trial
  transport's hard-stop interception was not certified.

This branch is appropriate for final review as a conservative preview, not an
unqualified claim of complete original-text verification. CI results must be
checked for the delivered commit; there is no automatic merge or npm release.
