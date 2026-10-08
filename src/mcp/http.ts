import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { TraceEvent } from '../core/types.js';
import type { EvidenceEngine } from '../core/engine.js';
import { EngineError } from '../core/errors.js';
import { McpSession, protocolVersions, rpcError } from './session.js';

export interface HttpServerOptions {
  createEngine: () => EvidenceEngine; token: string; host?: string; port?: number;
  allowedOrigins?: string[]; allowedHosts?: string[]; idleMs?: number; maxSessions?: number; onTrace?: (event: TraceEvent) => void;
}
interface Entry { session: McpSession; touched: number }
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
/** Single-tenant Streamable HTTP, JSON response mode. TLS/OAuth belong at the deployment boundary. */
export async function serveHttp(options: HttpServerOptions) {
  if (typeof options.token !== 'string' || options.token.length < 24 || /[\r\n]/.test(options.token))
    throw new EngineError('INVALID_CONFIG', 'Set SIFTPATH_SERVER_TOKEN to a random secret of at least 24 characters.');
  const host = options.host ?? '127.0.0.1', sessions = new Map<string, Entry>();
  const tokenHash = digest(`Bearer ${options.token}`), idleMs = options.idleMs ?? 900000;
  const maxSessions = options.maxSessions ?? 64;
  let port = options.port ?? 7337;
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
      const version = request.headers['mcp-protocol-version'];
      if (version !== undefined && !(protocolVersions as readonly unknown[]).includes(version)) { respond(response, 400); return; }
      const id = request.headers['mcp-session-id'];
      let entry = typeof id === 'string' ? sessions.get(id) : undefined;
      if (typeof id === 'string' && !entry) { respond(response, 404); return; }
      if (entry) entry.touched = Date.now();
      if (request.method === 'DELETE') {
        if (typeof id !== 'string' || !entry) { respond(response, 400); return; }
        entry.session.close(); sessions.delete(id); respond(response, 200); return;
      }
      if (request.method !== 'POST') { response.setHeader('allow', 'POST, DELETE'); respond(response, 405); return; }
      if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) { respond(response, 415); return; }
      if (request.headers.accept && !/application\/json|\*\/\*/.test(request.headers.accept)) { respond(response, 406); return; }
      let value: unknown;
      try { value = await body(request); }
      catch (error) { respond(response, error instanceof EngineError ? 413 : 400, rpcError(null, -32700, 'Invalid or oversized JSON body.')); return; }
      const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
      let createdId: string | undefined;
      if (!entry) {
        if (record?.method !== 'initialize') { respond(response, 400, rpcError(null, -32002, 'Session initialization required.')); return; }
        if (sessions.size >= maxSessions) { respond(response, 503); return; }
        createdId = randomUUID(); entry = { session: new McpSession(options.createEngine(), options.onTrace), touched: Date.now() };
        sessions.set(createdId, entry); response.setHeader('mcp-session-id', createdId);
      }
      const controller = new AbortController();
      const disconnected = () => { if (!response.writableEnded) controller.abort(); };
      response.once('close', disconnected);
      try {
        const result = await entry.session.dispatch(value, undefined, controller.signal);
        if (createdId && (!result || result.error)) { entry.session.close(); sessions.delete(createdId); response.removeHeader('mcp-session-id'); }
        respond(response, result ? 200 : 202, result);
      } finally { response.off('close', disconnected); }
    })().catch(() => respond(response, 500, rpcError(null, -32603, 'Internal server error.')));
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000;
  // A bounded socket inactivity timeout also handles a sender that never finishes its JSON body.
  server.setTimeout(35000, socket => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject); server.listen(port, host, () => { server.off('error', reject); resolve(); });
  });
  port = (server.address() as AddressInfo).port;
  const sweep = setInterval(() => {
    for (const [id, entry] of sessions) if (Date.now() - entry.touched >= idleMs) { entry.session.close(); sessions.delete(id); }
  }, Math.min(idleMs, 60000)); sweep.unref();
  let closing: Promise<void> | undefined;
  return { server, host, port,
    close(): Promise<void> {
      return closing ??= new Promise<void>((resolve, reject) => {
        clearInterval(sweep); for (const entry of sessions.values()) entry.session.close(); sessions.clear();
        server.close(error => error ? reject(error) : resolve()); server.closeAllConnections();
      });
    },
  };
}
