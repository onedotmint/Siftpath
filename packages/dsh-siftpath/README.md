# Native DSH adapter (candidate)

`@onedotmint/dsh-siftpath@2.2.0-dev.0` is a source/tarball candidate, **not a claim of an existing published release**. It depends on the separate `@onedotmint/siftpath@2.2.0-dev.0` core; routing, official presets, provider requests and evidence normalization remain in that core.

Compatibility is pinned to `@deepseek-ai/dsh@0.2.1-rc.5`, rc5 service peers, Cordis `~4.0.5`, and Schemastery `~3.18.5`. Do not substitute npm's stale `latest` tools/web tags.

## Security gate: not release-ready

The 17 adapter functional tests and real pinned DSH CLI profile composition pass, but `verify:dsh` subsequently fails its High/Critical dependency audit. The host pins vulnerable `zod@4.4.3` (`GHSA-mrhx-c7xc-m3w5`) and `undici@8.11.2` (including `GHSA-xjj6-f33q-929c` and other redirect/TLS advisories); moderate MCP/fflate findings also remain. This is not a claim that the adapter exposes every advisory, nor that hundreds of propagated audit entries are independent bugs. No force overrides or suppressed checks are applied. The standalone core audit is clean. An explicit compatible host upgrade and full revalidation are required before release; the commands below are for isolated development only.

## Build and install

Build the sibling core first. The source build reads its public `../../dist/index.js`; `SIFTPATH_CORE_ENTRY` may point to another built candidate entry. The runtime always imports the installed core package. With the adapter's pinned esbuild build dependency available:

```sh
npm run build --prefix packages/dsh-siftpath
npm pack ./packages/dsh-siftpath --ignore-scripts
```

Install **both** core and adapter tarballs into your DSH profile (replace paths with the produced files):

```sh
dsh plugin --profile web add /absolute/path/onedotmint-siftpath-2.2.0-dev.0.tgz /absolute/path/onedotmint-dsh-siftpath-2.2.0-dev.0.tgz
```

The native bundle contributes only the Loader row `siftpath`. It does not delete or replace DSH files, presets, fetch tools, or standard tool names. In the Web Plugins page, open the Siftpath row configuration. Enable providers, choose authenticated or explicitly anonymous access, set credential-reference names and write keys through DSH's credential store. Configure routes and budgets, then save. Route providers must be enabled and support the operation. `unconfigured` disables a default route; blank intent routes inherit default search.

After saving or discarding pending edits, explicitly click **Use Siftpath search** on the native page to use it through existing native `web_search`. This revision-fenced action sets only DSH’s `web.searchProvider` and preserves fetch and other web settings. Installation does not change this selection. Without a pinned provider, DSH may report ambiguity when multiple providers are usable. The existing native fetch provider is untouched. `siftpath_read({ url, reader?, focus? })` can read a public page directly, without any preceding search. An explicit reader and unsupported native focus fail without fallback.

Keys are write-only: blank keeps the stored value, and a separate Remove button removes only the managed credential (DSH ambient layers may become effective again). Reference changes never redirect a staged key. Configuration and credential writes are separate, not atomic: partial saves are reported visibly. Discard/leaving the page clears drafts. Existing standalone configuration, including v1 files, is **not automatically read or migrated**. The adapter never mutates `process.env` or standalone private configuration.

The host owns one live runtime. Each operation captures one safe settings snapshot and resolves DSH credentials afresh; changed settings/keys retire previous routers after in-flight calls finish. Unload closes all routers, including retired active ones. Core ambient credential lookup is disabled by passing an empty environment; configured missing references remain failures.

Native search `content` is the complete serialized core `WebResult` (including evidence, warnings, local content clipping and provenance). Native `sources` are core sources, and native `truncated` reports source-list clipping only. No regex-generated snippets or invented citations are added.

## Offline tests

From the repository root, run `npm run verify:dsh` after the core build. It installs the actual core/adapter tarballs and exact host/test dependencies in an isolated profile, checks the real DSH CLI composition, and runs all adapter tests with provider fetch blocked. For a manually prepared equivalent consumer, copy this directory's `tests` beside the installed `lib` and run:

```sh
node --test tests/*.test.mjs
```

Tests make no provider/model calls. Runtime tests use actual rc5 Cordis, web, tools and system-prompt modules; browser tests materialize the packaged lazy client with platform boundary doubles, then smoke-test the actual rc5 form model/controls using React render and unmount. Only unrelated markdown/icon/highlighting dependencies and CSS are stubbed in that Node smoke; settings controls, model, store and React are real. These tests do not substitute for interactive testing in a real DSH Web profile.

## Integration references

- [Plugin configuration](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/config.md)
- [Publishing a bundle](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md)
- [Tool authoring](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/tool.md)
- [Lifecycle](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/framework/index.md)
- [Client module/build contract](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/modules/README.md)

Published rc5 tarballs, rather than moving documentation alone, were inspected for configuration forms, primitives, credentials, web/tool service signatures and the client loader contract.
