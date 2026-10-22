# Architecture

One npm package, TypeScript, Node.js 22+.

```text
src/inputs.ts       strict shared Zod inputs + public URL guard
src/defaults.ts     five official MCP definitions (Brave, Exa, Tavily, Jina, Firecrawl), no vendor branches in Router
src/config.ts       JSON config, private storage, credential references, diagnostics
src/diagnostics.ts  CLI-only phased provider probes, private latest-test records and summaries
extensions/siftpath.mjs  optional Pi slash command; invokes CLI JSON only
src/client.ts       official SDK Client, lazy/reused stdio or Streamable HTTP
src/router.ts       choose one provider, map arguments, sequential fallback
src/output.ts       official text + citation envelope + serialized character bound
src/tools.ts        exactly web_search and web_read, shared CLI/MCP dispatcher
src/mcp/stdio.ts    official SDK Server + StdioServerTransport
src/cli.ts         mcp / search / read / doctor / setup / status / test
src/setup.ts       private config orchestration + opt-in existing diagnostics
src/setup-ui.ts    historically reused Clack prompts, separately bundled and lazy-loaded
src/version.ts     package version
src/index.ts       public TypeScript SDK exports
```

No HTTP server, HTTP API adapters, parsing, fusion, RRF, cache, local ranking, sufficiency judgment, Gather, LLM router or agent planner remains. The runtime directly depends only on the official MCP SDK and Zod (the SDK has its own transitive dependencies).

Each operation gets an overall deadline (60s default), each provider attempt gets a deadline (20s default, including first connection), and cancellation is forwarded through the official SDK. Configuration limits both to 120s. No automatic retry or parallel provider fan-out; each configured fallback is tried once. In-flight calls share a lazy initialization promise and successful connections. On disconnection or an HTTP 404 expired session the client removes the cached connection; the next operation can reconnect. HTTP cancellation reaches the actual fetch/body, with a 4 MiB response bound; shutdown sends a best-effort session DELETE bounded to 2s, then always closes locally.

`content` preserves the official tool output and ordering, including available dates/authors/metadata. `sources` indexes public URLs present in structured results, JSON text, Markdown or plain text; it is not a semantic citation verifier. Siftpath does not claim every outgoing link supports the query. Read results always include the exact requested URL. Long text is cut, never summarized or rearranged. The entire returned JSON is bounded by maxOutputChars, not an estimated model token count.

Shutdown on stdin EOF, SIGINT/SIGTERM or transport close aborts the Router and closes upstream SDK connections/stdio children. SDK users must call `close()` in `finally`. Official stdio processes are children of this process, not separately managed daemons.

Output is normalized and budgeted once after the Router has assembled all warnings. URL delimiter cleanup counts unmatched brackets in linear scans rather than repeatedly rescanning each shortened URL. Concurrent calls to `close()` all await the same teardown, including the bounded HTTP session DELETE.

Diagnostics deliberately perform stricter discovery/output-contract checks than normal business calls. Their per-config history files do not share provider records across neighboring configuration files; see DIAGNOSTICS.md. SSE response interruption is bounded by the existing provider deadline without automatic replay; a notification GET disconnect does not cancel unrelated POST work.
