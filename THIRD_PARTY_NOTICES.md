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

The published package has no external runtime *installation* dependencies. Its
`dist/setup-ui.js` bundles interactive-prompt implementation from Clack
(`@clack/prompts`, `@clack/core`) and their small supporting dependencies,
compiled using esbuild at build time. Clack is MIT-licensed:

Copyright (c) 2025-Present Bombshell contributors (https://bomb.sh/team)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Build-only dependencies include TypeScript (Apache-2.0), @types/node (MIT),
undici-types (MIT), and esbuild (MIT). Supporting transitive Clack packages
are bundled only for the setup UI and retain their respective licenses.
Pi supplies its own host API/Type factory at runtime.
