import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { TraceEvent } from '../core/types.js';
import type { EvidenceEngine } from '../core/engine.js';
import { EngineError } from '../core/errors.js';
import { McpSession, rpcError } from './session.js';

export interface HttpServerOptions {
  createEngine: () => EvidenceEngine; token: string; host?: string; port?: number;
  allowedOrigins?: string[]; allowedHosts?: string[]; onTrace?: (event: TraceEvent) => void;
}
const digest = (value: string) => createHash('sha256').update(value).digest();
async function body(request: IncomingMessage): Promise<unknown> {
  let size = 0; const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    size += bytes.length;
    if (size > 1_048_576) throw new EngineError('BODY_TOO_LARGE', 'Maximum request size is 1 MiB.');
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
function respond(response: ServerResponse, status: number, value?: unknown): void {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  response.end(value === undefined ? undefined : JSON.stringify(value));
}
/** Single-tenant modern MCP HTTP only. Older hosts can still use local stdio. */
export async function serveHttp(options: HttpServerOptions) {
  if (typeof options.token !== 'string' || options.token.length < 24 || /[\r\n]/.test(options.token))
    throw new EngineError('INVALID_CONFIG', 'Set SIFTPATH_SERVER_TOKEN to a random secret of at least 24 characters.');
  const host = options.host ?? '127.0.0.1';
  const tokenHash = digest(`Bearer ${options.token}`);
  const engine = options.createEngine(); // Shared bounded in-memory cache, no HTTP sessions.
  let active = 0, port = options.port ?? 7337;
  const server = createServer((request, response) => {
    void (async () => {
      const hosts = new Set([`${host}:${port}`, `localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`, ...options.allowedHosts ?? []]);
      if (!hosts.has(request.headers.host ?? '')) { respond(response, 421); return; }
      const origin = request.headers.origin;
      if (origin && !(options.allowedOrigins ?? []).includes(origin)) { respond(response, 403); return; }
      if (!timingSafeEqual(digest(request.headers.authorization ?? ''), tokenHash)) {
        response.setHeader('www-authenticate', 'Bearer'); respond(response, 401); return;
      }
      if (request.url !== '/mcp') { respond(response, 404); return; }
      if (request.headers['mcp-protocol-version'] !== '2026-07-28') {
        respond(response, 400, rpcError(null, -32022, 'HTTP requires MCP 2026-07-28. Use stdio for legacy clients.'));
        return;
      }
      if (request.headers['mcp-session-id']) { respond(response, 400); return; }
      if (request.method !== 'POST') { response.setHeader('allow', 'POST'); respond(response, 405); return; }
      if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) { respond(response, 415); return; }
      if (!/application\/json|\*\/\*/.test(request.headers.accept ?? '')) { respond(response, 406); return; }
      if (active >= 16) { respond(response, 503); return; }
      active++;
      const controller = new AbortController();
      const disconnected = () => { if (!response.writableEnded) controller.abort(); };
      response.once('close', disconnected);
      const session = new McpSession(engine, options.onTrace);
      try {
        let value: unknown;
        try { value = await body(request); }
        catch (error) {
          respond(response, error instanceof EngineError ? 413 : 400, rpcError(null, -32700, 'Invalid or oversized JSON body.'));
          return;
        }
        const record = value && typeof value === 'object' && !Array.isArray(value)
          ? value as Record<string, unknown> : undefined;
        const params = record?.params && typeof record.params === 'object' && !Array.isArray(record.params)
          ? record.params as Record<string, unknown> : undefined;
        const meta = params?._meta && typeof params._meta === 'object' && !Array.isArray(params._meta)
          ? params._meta as Record<string, unknown> : undefined;
        if (meta?.['io.modelcontextprotocol/protocolVersion'] !== '2026-07-28') {
          respond(response, 400, rpcError(null, -32022, 'Invalid modern MCP protocol envelope.')); return;
        }
        if (request.headers['mcp-method'] !== record?.method ||
            (record?.method === 'tools/call' && request.headers['mcp-name'] !== params?.name) ||
            (record?.method !== 'tools/call' && request.headers['mcp-name'] !== undefined)) {
          respond(response, 400, rpcError(null, -32600, 'MCP standard headers do not match the request.')); return;
        }
        const answer = await session.dispatch(value, undefined, controller.signal);
        respond(response, answer ? 200 : 202, answer);
      } finally { session.close(); active--; response.off('close', disconnected); }
    })().catch(() => respond(response, 500, rpcError(null, -32603, 'Internal server error.')));
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000;
  server.setTimeout(35000, socket => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject); server.listen(port, host, () => { server.off('error', reject); resolve(); });
  });
  port = (server.address() as AddressInfo).port;
  let closing: Promise<void> | undefined;
  return { server, host, port,
    close(): Promise<void> {
      return closing ??= new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    },
  };
}
