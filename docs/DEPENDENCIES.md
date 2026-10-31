# MCP TypeScript SDK v2: migration assessment (not executed)

Siftpath 2.1.0 uses `@modelcontextprotocol/sdk` v1. This note records what a v2
move would cost. **No migration is part of the dependency-security work, and no
transport, provider-routing, cancellation or credential code is changed by it.**

## Current v1 status

v1 is still maintained and is the version the current security work targets.
`1.32.2` is the latest v1 release; the advisories that affected Siftpath's
dependency tree are fixed at or before it:

| Advisory | Affects | Siftpath exposure |
|---|---|---|
| GHSA-6qxp-vccf-f47h (OAuth client sends credentials to the server-chosen authorization server) | `<1.31.0` | Not reachable: Siftpath has no interactive OAuth flow and uses provisioned bearer/header credentials only. Fixed in the pinned range. |
| GHSA-22jm-h49p-29qw (experimental tasks not bound to the creating session) | `1.24.0 – <1.32.0` | Not used: Siftpath does not use the experimental tasks API. |
| GHSA-6prh-2h8m-c8cw (HTTP client transports and OAuth followed cross-origin redirects, re-sending headers/bodies) | `<1.32.0` | **Relevant.** This one touches Siftpath's real Streamable HTTP client path. Fixed by the `1.32.1` range plus the explicit redirect rejection Siftpath already applies to credential-bearing requests. |
| GHSA-46jr-4wx8-v453 (one request within the size limit could exhaust server memory during validation) | `1.3.0 – <1.32.0` | Server side only; Siftpath runs the stdio server, not the SDK HTTP server. Bounded by not exposing one. |
| GHSA-rvq5-wwqv-78pq (server bearer auth accepted tokens issued for another service) | `1.6.0 – <1.32.0` | Not reachable: Siftpath's own stdio server performs no bearer authentication; provider auth is provider-owned. |
| GHSA-f897-62hf-6gxq (HTTP server transports and handlers did not limit request body size or batch length) | `1.10.0 – <1.30.1` | Not reachable for the same reason: no SDK HTTP server is instantiated. |

The remaining v1 High/Moderate advisories are confined to SDK code paths Siftpath
does not instantiate (HTTP server, OAuth). The relevant one — the HTTP client
redirect issue — is fixed inside v1. Nothing in v1 currently forces a v2 move.

## What v2 changes

v2 splits the single `@modelcontextprotocol/sdk` package into
`@modelcontextprotocol/core`, `@modelcontextprotocol/client` and
`@modelcontextprotocol/server`, each with its own subpath exports. The classes
Siftpath uses still exist, but move:

| Siftpath import (v1) | v2 package and subpath |
|---|---|
| `@modelcontextprotocol/sdk/client/index.js` → `Client` | `@modelcontextprotocol/client` |
| `@modelcontextprotocol/sdk/client/stdio.js` → `StdioClientTransport`, `getDefaultEnvironment` | `@modelcontextprotocol/client/stdio` |
| `@modelcontextprotocol/sdk/client/streamableHttp.js` → `StreamableHTTPClientTransport` | `@modelcontextprotocol/client` |
| `@modelcontextprotocol/sdk/server/index.js` → `Server` | `@modelcontextprotocol/server` |
| `@modelcontextprotocol/sdk/server/stdio.js` → `StdioServerTransport` | `@modelcontextprotocol/server/stdio` |
| `@modelcontextprotocol/sdk/shared/transport.js` → `Transport` type | `@modelcontextprotocol/core` |
| `@modelcontextprotocol/sdk/types.js` → schemas and result types | `@modelcontextprotocol/core` |
| `@modelcontextprotocol/sdk/validation/ajv` → `AjvJsonSchemaValidator` | `@modelcontextprotocol/{client,server}/validators/ajv` |
| `StreamableHTTPError` | `SdkHttpError` |

Beyond the rename, v2 introduces protocol-era negotiation, response caching and
the input-required flow, and its `zod` peer range must be reconciled with
Siftpath's `zod@^4`. Those are behavioural changes, not import changes.

## Assessment

The mechanical part is small and contained: `src/client.ts`,
`src/mcp/stdio.ts`, `src/diagnostics.ts`, `src/output.ts` and the transport type
imports — roughly nine import sites in five files, plus the `validateToolSchema`
call that uses `AjvJsonSchemaValidator`, plus a dependency swap from one package
to three.

The expensive part is verification, not editing. Siftpath's guarantees — session
reuse and invalidation, cancellation that never starts a fallback, config hot
reload retiring the old router, redirect rejection on credential-bearing HTTP,
bounded bodies, stdio EOF and concurrent close — are all asserted against the v1
transport behaviour in `tests/integration.test.mjs` and
`tests/http-reliability.test.mjs`. Those tests are the real migration cost, and
they must keep passing unchanged rather than be rewritten to fit v2.

## Recommendation

Stay on v1 `^1.32.1`. Track v2 as a separate, deliberate change with its own
branch, its own security review and the full offline matrix including Windows,
so a protocol-era regression cannot arrive mixed into a dependency-security PR.
Revisit when v1 stops receiving security fixes, or if an advisory appears that
affects the client transports Siftpath actually uses and has no v1 fix.
