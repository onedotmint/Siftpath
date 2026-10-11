# Testing and evaluation

All commands and paths below are relative to the repository root. The package is `@onedotmint/siftpath`, the primary CLI is `siftpath`, and project environment variables use `SIFTPATH_*`. These are instructions for a later authorized verification run: this documentation update ran no dependency installation, tests, typecheck, build, packaging, benchmark, validation script, or real API call. Prior delivery outcomes are archived in [history/DELIVERY.md](history/DELIVERY.md), not claimed as fresh results.

## Offline suite

`npm test` compiles all production TypeScript and runs Node's test runner. The suite includes core units, mocked HTTP contracts, reliability, real local transport processes, packaging, and functional replay. There are no API-key requirements and no deliberate skipped assertions in this suite.

Core: canonical/signed URLs, local-address rejection, Unicode/hidden content, decoded injection, code generics, publication-date validation, cache copy/expiry, deterministic routing, conservative deduplication that preserves conflicting numbers, complete serialized-output budgets, custom token counters, and provenance.

Provider contracts: request endpoints/headers/bodies; normalized optional metadata; missing/malformed rows; partial extraction failures; Jina index validation; Clef probability responses; optional configuration failures. Injected HTTP responses exercise actual adapters, not mocked adapter implementations.

Reliability: normal fast/quality fanout, bounded alternate searches, partial/global/provider timeout, non-cooperative provider containment, actual AbortSignal propagation, query-aware batch cache, result-ID lifetime, PDF capability filtering, unresolved-only fallback, absent/failing optional services, one supplementary round, observer errors, request retries/body limits.

Integrations: shared tool schemas, MCP initialization/cancel/progress, an actual child-process stdio server, authenticated local HTTP sessions, Pi's structural tool/command/cancellation contract, private configuration, CLI setup/errors/symlink invocation, manifest contents, canonical skill synchronization, architecture boundaries, and portable lock paths.

These tests do not certify official MCP conformance, Windows behavior, a running Pi UI, or actual third-party host installation.

## Live provider checks

```bash
npm run test:live
SIFTPATH_LIVE=1 npm run test:live
```

Without explicit opt-in, the first command is designed to list ten skipped checks (leave the live opt-in variables unset). The second authorizes potentially billable calls, and runs only configured providers; missing roles remain clearly skipped. The legacy `SMARTSEARCH_LIVE` variable is a compatibility fallback; `SIFTPATH_LIVE` takes precedence. There are four search, four extract, one rerank, and one decision check. A configured provider returning bad data fails; absence of credentials is not disguised as a success. Use the official account's permissions and current model availability.

## Retrieval benchmark

`npm run bench` evaluates nine synthetic categories in fast and quality modes: simple factual, fresh/news, technical, long-tail, official-source, comparison, multi-source, hard-page, and PDF. PDF/hard-page fixtures simulate normalized hosted results; they do not render a real PDF or verify a live anti-bot service.

Metrics: annotated candidate relevance, passage source precision, expected-fact coverage, distinct domain count, authoritative-source hit, freshness fraction, output tokens, latency, failure rate, and reported cost when available. `coveragePer1000Tokens` is explicit. Missing billing information stays null. The evaluator has negative tests; irrelevant or absent evidence does not automatically pass.

The replay checks retention through the actual engine and gates budgets, minimum coverage, and precision. It is **not evidence that one vendor retrieves better sources than another**, nor proof of live authoritative-source coverage. Defaults must be tuned only after human-labeled live measurements.

To collect one live, ungraded pack:

```bash
node benchmarks/run.mjs --live --query "your real comparison"
```

This may incur provider charges. Review actual citations, source independence, publication dates, errors, and cost with a human; add gold labels before making quality claims. The 49-query historical upstream corpus is preserved as seed material, not replayed current facts.

## Agent invocation quality

`benchmarks/fixtures/agent-invocations.json` specifies seven expected host decisions: search for news, fetch a known URL, gather for comparison, no tool for arithmetic, stop after sufficient excerpts, stop after good coverage, and ignore injected instructions.

Run those prompts with the actual intended agent and record JSONL rows:

```json
{"id":"fresh","actualTool":"web_search"}
{"id":"math","actualTool":null}
```

Then run `node scripts/eval-invocations.mjs observations.jsonl`. It reports both accuracy and scenario coverage; missing scenarios are not counted as successes. Namespaced MCP suffixes are accepted. The bundled tests verify the grader and skill contracts, **not an LLM's actual behavior**. No real host invocation score is claimed for this checkout.

## Packaging gates

`npm run build` synchronizes integration assets before compiling. Normal `npm pack` and `npm pack --dry-run` trigger prepack/build; `npm run pack:dry` builds explicitly before a script-disabled dry run. CI definitions synchronize assets and check for generated diffs before the remaining gates. These definitions have not been executed in this documentation update.

When verification is authorized, inspect the pack preview, generate the tarball locally, install it into an isolated prefix, and smoke-test `siftpath` (or invoke the installed `dist/cli.js` with Node). Export source from a committed tree, extract it, run `node scripts/verify-source.mjs`, and inspect for secrets/caches/symlinks. Record commands actually executed and actual artifact hashes; do not assume a tarball already exists or a version is published. Clean `npm ci --ignore-scripts` remains a gate even though the two previously missing lockfile integrity entries have been filled from official npm metadata. See [DEVELOPMENT.md](DEVELOPMENT.md).

## MCP official-client interoperability

The dedicated CI job installs `@modelcontextprotocol/client@2.3.1` **temporarily for tests only** and exercises both protocol eras over authenticated HTTP and stdio. This catches real SDK result-shape/negotiation incompatibilities that self-tests miss; production dependencies and npm lockfile remain unchanged. The test is a narrow smoke check, not the complete MCP conformance suite. In case of failure, do not claim the modern protocol is compatible or merge the draft PR.

## BM25 lexical ranking experiment

`npm run bench:bm25` compares legacy term-hit ranking and opt-in BM25 using the same labeled Chinese/English synthetic passages, then replays the existing nine retrieval categories in both fast/quality modes. It reports top-1, mean reciprocal rank, approximate per-batch CPU time, evidence coverage/precision, and output size. BM25 remains disabled by default and automatically falls back to legacy ranking for large (>512 passages) or unscorable batches. These metrics are **synthetic** and do not establish live quality, latency or cost improvements. Run both modes on human-labeled real retrievals before considering a default change.
