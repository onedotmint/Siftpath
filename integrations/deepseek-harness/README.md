# Siftpath for deepseek-harness

Install Siftpath from source or a maintainer-provided npm tarball, then run `siftpath setup` once. This package uses `siftpath mcp` from PATH and includes the shared web-research skill. It contains no provider keys and no duplicate retrieval implementation.

The package is `@onedotmint/siftpath`; the CLI and integration ID are `siftpath`. Legacy CLI aliases remain available; see the migration guide.

This is a generic MCP example and a portable skill, not a claimed native Harness plugin. Apply the server entry using the installed Harness version's MCP settings.

See ../../docs/INTEGRATIONS.md for installation, host-specific limitations, and remote ChatGPT deployment. Generated files are refreshed with `node scripts/sync-integrations.mjs` from the source repository.
