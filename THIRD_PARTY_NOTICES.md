# Third-party notices

The repository's MIT LICENSE is preserved from SmartSearch at `a6e310d8c51d1fb9eb454d27afbbc3f81cc2e61a`, including Copyright (c) 2025 GuDaStudio.

This rebuild retains and adapts the project's private JSON configuration storage, hidden credential entry, public URL guard, CLI conventions and package-version reader. The old evidence engine and historical evaluation fixtures are no longer distributed.

Runtime npm dependencies are @modelcontextprotocol/sdk (MIT) and Zod (MIT), with transitive dependencies installed from their registries; inspect package-lock.json and the installed packages' licenses. TypeScript (Apache-2.0), @types/node (MIT), undici-types (MIT) are development dependencies. Official provider MCP packages are launched separately on demand and retain their own licenses/terms.

Official provider source and web-search-plus-mcp/agntn-web were interface/design references, not vendored implementation. Precise links and inspected revisions: docs/PROVIDERS.md. No upstream search/reader/ranking implementation is copied into Siftpath.

## Bundled interactive setup

The lazily loaded `dist/setup-ui.js` bundles @clack/prompts 1.8.1, @clack/core 1.5.1, sisteransi 1.0.5, fast-wrap-ansi 0.2.2, fast-string-width 3.0.2 and fast-string-truncated-width 3.0.3 (all MIT). Clack and esbuild 0.25.12 are build-only dependencies, not runtime package requirements.

Copyright notices for bundled MIT code:

- Copyright (c) 2025-Present Bombshell contributors (https://bomb.sh/team) — Clack
- Copyright (c) 2018 Terkel Gjervig Nielsen — sisteransi
- Copyright (c) 2024-present Fabio Spampinato — fast-string-width / fast-string-truncated-width
- Copyright (c) 2025 James Garbutt; Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com) — fast-wrap-ansi

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
