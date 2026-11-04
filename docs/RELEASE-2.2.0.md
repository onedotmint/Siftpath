# Siftpath 2.2.0 release notes

Backward-compatible feature release from 2.1.1. Publication is confirmed by the npm registry and Git release, not this source version. Releases require final candidate CI, package artifact/hash checks, npm authentication and explicit maintainer confirmation.

## New providers

- Add an opt-in direct DeepSeek Search API backend (`connection.transport: 'deepseek'`). It stays disabled by default and does not change saved routes, enable services or switch any intent. No anonymous mode; a query outside the documented limits is rejected rather than rewritten or forwarded to a fallback provider.
- Ship a separately packaged native DeepSeek Harness bundle that registers one search provider and `siftpath_read({ url, reader?, focus? })` without replacing DSH source files, hijacking a tool name or selecting Siftpath on installation. **The bundle is not published**: its pinned host dependency audit fails the High/Critical gate. See [DSH](DSH.md#security-release-blocker).
- Keep the two model-facing MCP tools, the Pi extension, the default routes and the 16,000-character default output budget unchanged.

## Output and diagnostics

- Report `omittedChars` whenever the budget clips a body. An agent can tell it holds a prefix and how much of the end was cut instead of guessing; the count is settled together with the prefix so it can never overflow `maxOutputChars`.
- Classify an observable upstream 402 as `BALANCE_EXHAUSTED` and an observable 429 as `RATE_LIMITED` rather than folding both into `UPSTREAM_ERROR`. Only a status code is read — `structuredContent.error.status`, or an `HTTP <code>` prefix in a text block. Provider wording is never scanned, so no ban, plan or entitlement is inferred, consistent with the existing 403 rule.
- Stop `status` from contradicting itself. A recorded provider failure now appears in `Next:` as `Last test failed: <provider>(<code>)`, and an untested or failing service is no longer summarised as healthy. A failure recorded before a package upgrade or configuration change is still listed but labelled with why it may no longer describe the current setup.
- Name every attempt when no provider succeeds: `Each attempt failed: jina(BALANCE_EXHAUSTED), jina-backup(AUTH_FAILED).` A single generic sentence made users re-check everything when the actionable cause was already known.
- Document multi-account redundancy as configuration rather than a feature: a second account is another provider plus a fallback entry, keeping the failing account visible in `warnings`. No automatic account rotation and no balance polling are added — whether a 402 means transient throttling, an exhausted plan or genuine non-payment is decided by the operator, not guessed locally.
- Document what Siftpath cannot see, because it forwards reader responses instead of fetching pages itself: a 404 body, an anti-bot block or empty boilerplate still arrives as `isError: false`; raw HTML is passed through uncleaned; a focus miss is not a `NOT_FOUND`.

## Compatibility and upgrade

The `web_search` / `web_read` inputs, default routes, explicit Reader selection and fallback rules are unchanged. Saved Keys, custom bindings, routes and legacy configuration compatibility remain; no configuration rewrite or setup rerun is required. Upgrade the package, then restart Pi or `/reload`.

Consumers matching output fields or error codes should handle the additive `omittedChars` field and the new `BALANCE_EXHAUSTED` / `RATE_LIMITED` codes where a generic `UPSTREAM_ERROR` could previously appear. `omittedChars` is present only when the body was actually clipped. Do not parse human-readable error messages as an API. See [diagnostics](DIAGNOSTICS.md) and [migration](MIGRATION.md).

## Known limits and acceptance

- The default serialized JSON budget remains **16,000 characters**, not tokens. Long bodies can lose decisive evidence; `truncated` describes local clipping only, not upstream completeness, and `omittedChars` quantifies the cut without recovering it.
- A supported focus binding, an untruncated response or a successful call does not guarantee complete evidence or an accurate model answer. Source indexes can contain unfetched outgoing links.
- Reader-side failures stay invisible by design. Because no local fetch is performed, Siftpath cannot report an HTTP status the provider never sent.
- The shipped Jina focus window stays at `topk: 3, chunk_size: 250`. Narrower windows return fewer characters but were observed to drop the sentence answering a single-fact focus while still reporting no clipping; see [selective reading](https://github.com/onedotmint/Siftpath/blob/main/docs/SELECTIVE-READING.md).
- Current candidate checks and historical evidence are recorded separately in [testing](https://github.com/onedotmint/Siftpath/blob/main/docs/TESTING.md).
- Live acceptance for this candidate covers provider connectivity, a successful read from each configured Reader, `omittedChars` accuracy on a real clipped page, and the Jina focus-window comparison. It does not include a model-driven agent session: whether a model uses `omittedChars` or `focus` correctly is still unverified.
