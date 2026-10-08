# Third-party notices

The repository's MIT LICENSE is preserved from SmartSearch at
`a6e310d8c51d1fb9eb454d27afbbc3f81cc2e61a`, including
Copyright (c) 2025 GuDaStudio.

The sanitized duplicate-URL fixture and 49-query historical corpus originate in that
same MIT-licensed repository. Their content is redistributed with this notice and
LICENSE. Fixture JSON formatting/path may differ; the data is retained.

EvidenceKit, OpenDeepSearch, Exa MCP, Tavily MCP, mcp-omnisearch, and Trawl were
README-level design references only. No external donor implementation source is
vendored or represented as copied. See docs/REFERENCES.md for precise scope.

The built runtime has no third-party npm dependencies. Development dependencies
TypeScript (Apache-2.0), @types/node (MIT), and undici-types (MIT) are installed
separately from their registries; their source/binaries are not bundled into the
source archive. Pi supplies its own host API/Type factory at runtime.
