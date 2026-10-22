# Migration to the lightweight router

This is an intentionally breaking rebuild: package version 2.0.0.

Removed: EvidenceEngine/createEngine, EvidencePack, Gather, web_fetch/web_gather, mode/budget/domain/recency engine options, HTTP serving, direct HTTP provider adapters, rerank/sufficiency services, cached result IDs, usage ledger, Pi-specific extension and generated plugin/skill packages. Old tests and benchmarks for removed capabilities were replaced, not reported as current coverage. Git history retains the old code.

Use `new Siftpath(await readConfiguration())`, `search({query,intent?,maxResults?})`, `read({url,focus?})`, and `await close()`. MCP exposes only web_search and web_read. CLI: `search`, `read`, `mcp`, `doctor`, `setup` (quick or advanced), plus offline `status` and explicit no-fallback `test` diagnostics. Remove old host plugins to avoid duplicate/stale tools.

## Upgrading the Pi integration

`npm:@onedotmint/siftpath@2.0.0` is the published release whose Pi extension only printed status. The later source tree registers the packaged MCP server itself, so `pi install` needs no separate CLI, no `pi mcp add` and no manual JSON:

```bash
pi install npm:@onedotmint/siftpath     # once a release containing the registration exists
# today: install this checkout (npm ci has already installed its dependencies)
pi install /absolute/path/to/Siftpath
```

A tarball path is not a package source for Pi; unpack or `npm install` it first if you must use the tarball. Local directory installs get no dependencies from Pi, so the directory must already contain `node_modules`; otherwise the extension reports an incomplete install instead of breaking startup.

After upgrading, restart Pi or run `/reload` once. Credentials, provider choices and routes are kept. Re-registration uses the fixed server name `siftpath`, so upgrading never adds a second copy of the tools. Uninstalling never deletes the configuration file; remove `~/.config/siftpath/` only if you want the stored Keys gone too. Windows and WSL have separate home directories and therefore separate configurations.

The private configuration path, SIFTPATH_CONFIG override and SMARTSEARCH_CONFIG/legacy-path aliases are retained. Version-1 files explicitly marked `version:1` reuse credentials and disabled flags in memory only; old priorities/models/timeouts are deliberately not imported. Normal configuration reads do not move or rewrite files. Unversioned legacy files with old options fail clearly rather than silently changing behavior.

After you confirm and complete interactive `siftpath setup`, it saves version-2 configuration to the selected configuration path. If SMARTSEARCH_CONFIG or the legacy-path fallback selected an old file, setup can overwrite that file; the aliases are not read-only for setup. Back up the old configuration before running the wizard, or set SIFTPATH_CONFIG to a new path. Configure version-2 routes if you need customized routing.

Important: old Jina credentials were used for rerank; the new Jina route is native Reader. Old Parallel/Cloudflare keys may remain privately stored but have no new runtime route. Missing new credentials skip only that provider. See CONFIGURATION.md for a minimal explicit config.
