# DeepSeek Harness adapter (development candidate)

The optional `@onedotmint/dsh-siftpath` bundle is separate from the core package. It is **not published**. The core remains usable from Pi, CLI, SDK and stdio MCP without installing DSH. A third-party bundle following DSH's official plugin API is not a DeepSeek-maintained or built-in Official plugin.

## Boundaries

- Register a search provider with `ctx.web.registerSearchProvider`; keep DSH's existing `web_search` tool, multi-query orchestration and presentation.
- Register exactly one additional model tool, `siftpath_read({ url, reader?, focus? })`, because DSH's URL-only fetch contract cannot carry Reader selection or a focus question.
- Do not replace DSH source files, hijack an existing tool name, or select Siftpath merely because it was installed. Search selection is an explicit user action.
- Keep the original `web_fetch` available. Its ordinary page-fetch role differs from the Reader tool's question-directed extraction. Tool descriptions distinguish the roles; they cannot guarantee a model chooses correctly.
- Keep cancellation connected to the core SDK and close all owned provider connections on unload. A configuration update must not mutate a router already serving a request.
- A search through DSH uses Siftpath's configured default intent; DSH's provider request has no per-call `intent` parameter. Standalone Siftpath keeps its full tool contract.

## Security release blocker

**Functional implementation is available, but this DSH candidate is not release-ready.** The real `0.2.1-rc.5` profile composes successfully and all 17 packaged adapter tests pass. The subsequent audit of that pinned host/adapter verification consumer fails the High/Critical gate:

| Dependency pinned by DSH | Finding | Reference |
|---|---|---|
| `@deepseek-ai/dsh-llm → zod@4.4.3` | High: oversized constrained-collection validation can exhaust memory | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) |
| `@deepseek-ai/dsh-web-fetch-http → undici@8.11.2` | High: affected by response-processing, redirect/cache, TLS and denial-of-service advisories; audit affected range through 8.12.1 | [GHSA-xjj6-f33q-929c](https://github.com/advisories/GHSA-xjj6-f33q-929c), [GHSA-4w7w-5xrc-9h26](https://github.com/advisories/GHSA-4w7w-5xrc-9h26), [GHSA-2m5v-pch6-74hx](https://github.com/advisories/GHSA-2m5v-pch6-74hx), [GHSA-qrxm-fqhp-jwvm](https://github.com/advisories/GHSA-qrxm-fqhp-jwvm) |
| `@deepseek-ai/dsh-mcp-client → @modelcontextprotocol/client@2.2.0` | Moderate: credential-bearing cross-origin redirects | [GHSA-6prh-2h8m-c8cw](https://github.com/advisories/GHSA-6prh-2h8m-c8cw) |
| Host office dependency `fflate` | Moderate, affected range 0.8.0–0.8.2 | [GHSA-px8p-9vwx-vf98](https://github.com/advisories/GHSA-px8p-9vwx-vf98) |

The audit reports 190 high / 7 moderate / 0 critical **affected package entries**, including transitive propagation; these are not 190 independent advisories. npm reports no fix within the pinned host constraints. The core standalone consumer and core production/development audits are clean; it uses its own patched Zod/MCP dependencies, not these host copies. This does not prove every host advisory is reachable through this adapter.

Do not publish or treat this integration as production-accepted until an explicitly reviewed host upgrade supplies compatible patched dependencies and the complete adapter/profile checks are rerun. No `overrides`, `npm audit fix --force`, advisory suppression, or automatic host upgrade is applied. `npm run verify:dsh` intentionally exits nonzero while this blocker remains. The following installation commands are for isolated development evaluation only.

## Build and install

This adapter targets **DSH `0.2.1-rc.5`** and its matching service packages. Do not use stale npm `latest` tags for individual DSH packages. Build both unpublished candidates from this checkout:

```sh
npm ci
npm run build
npm run build:dsh
npm pack --ignore-scripts
npm pack ./packages/dsh-siftpath --ignore-scripts
```

Install both generated tarballs in the DSH profile, replacing the paths below:

```sh
dsh plugin --profile web add /absolute/path/onedotmint-siftpath-2.2.0-dev.0.tgz /absolute/path/onedotmint-dsh-siftpath-2.2.0-dev.0.tgz
```

Open **Plugins → Siftpath → Configure**. Enable the needed providers, choose routes and budgets, and enter Keys into the write-only credential controls. Save settings and credentials, then click **Use Siftpath search**. The action changes only DSH’s `web.searchProvider`, keeps fetch settings intact, and refuses to overwrite a concurrently changed revision. The defaults intentionally match standalone Siftpath; DeepSeek and Brave are off. An intent-specific route overrides the default search, so changing the default alone does not override an existing research/semantic selection. Native DSH settings support the shipped presets; custom standalone provider definitions are not imported. Native fallback lists are empty.

Switch DSH back to a native search provider before disabling/removing the bundle. Do not expect uninstall to rewrite unrelated DSH settings or restore a previously changed selection automatically.

## Credentials and configuration

DSH-owned settings and credential references are the source of truth for the native adapter. Key values belong in DSH's credential service, not in ordinary settings, browser responses, prompts or tool arguments. Saved DSH values outrank environment fallbacks according to DSH's own policy; this does not change standalone Siftpath's environment-first policy.

Installing the bundle does not read, copy, overwrite or migrate `~/.config/siftpath/config.json`. Pi/CLI users keep that file and their existing routes. The adapter must not secretly maintain two synchronized configurations.

Selecting the optional DeepSeek backend uses the official Search API, not an auxiliary model request. DeepSeek's query limit is 128 Unicode code points; an incompatible query fails explicitly rather than being silently shortened. The adapter does not send conversation history or the initiating human prompt. Retrieval may be billed by DeepSeek independently of model usage.

## Failure and lifecycle policy

- No automatic provider switch on install, request failure, disable or uninstall. Explicitly configured Siftpath fallback routes keep their documented behavior.
- Before disabling or removing a selected Siftpath search backend, switch DSH's search selection to an installed native backend. Otherwise DSH should report an unavailable selection, not silently choose a potentially billable replacement.
- Missing credentials and capability errors are configuration failures, not reasons to opt into anonymous access.
- `focus` requires a binding that actually maps `$focus`; unsupported focus fails before the provider business call. Current Firecrawl defaults do not support focus. Explicit `reader` selection tries only that Reader.
- Native output, warnings and local clipping semantics are preserved. Neither `focus`, `truncated: false`, nor a successful tool call proves upstream coverage or final-answer correctness.

## Verification boundary

Offline tests must cover provider registration, tool schema and argument forwarding, focus refusal without a business call, abort propagation, failure results, configuration/credential changes and disposal. Tarball verification must check the bundle manifest, package exports, shipped browser assets and core dependency resolution. No offline result establishes real DSH model behavior, DeepSeek account access, search relevance, latency or billing.

Run `npm run verify:dsh` after building the core. It builds the adapter, installs both actual tarballs in an isolated profile with pinned DSH, verifies the real CLI’s `--dump-config` composition without starting an agent, and runs packaged adapter tests with provider fetch blocked. Browser checks exercise actual rc5 form controls, save fencing and unmount cleanup; unrelated Markdown/icon/highlighting modules and CSS are test doubles, not a complete browser run. npm dependency downloads are allowed; no model is invoked. This is separate from `npm run check`, so ordinary core consumers do not install DSH. A dedicated CI job exercises the adapter. Do not install the unpublished package name from npm expecting this development candidate.

## Official references

- [Plugin packaging](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)
- [Plugin configuration](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/config.md)
- [Tool authoring](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/tool.md)
- [Configuration pages](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/adding-a-settings-card.md)
- [Web provider contract](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/web/web/src/types.ts)
- [Credentials](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/credentials/credentials/README.md)
- [DeepSeek Search API](https://api-docs.deepseek.com/guides/search)
