import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { CallToolResultSchema, ListToolsResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { providerStatus, resolveSecret, type Configuration } from './config.js';
import { SiftpathError } from './errors.js';
import { packageVersion } from './version.js';

export async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}
interface Connection { client: Client; transport: Transport; ready: Promise<Client> }
/** One lazy connection per configured MCP, shared by all router calls in this process. */
export class McpClients {
  private connections = new Map<string, Connection>();
  private closed = false;
  private closing?: Promise<void>;
  private requestSignal = new AsyncLocalStorage<AbortSignal>();
  private fetch: typeof globalThis.fetch = async (input, init) => {
    const operation = this.requestSignal.getStore();
    const signals = [init?.signal, init?.method === 'GET' ? undefined : operation].filter((s): s is AbortSignal => !!s);
    const response = await globalThis.fetch(input, { ...init, signal: signals.length ? AbortSignal.any(signals) : undefined });
    if (!response.body) return response;
    let bytes = 0;
    const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        bytes += chunk.byteLength;
        if (bytes > 4 * 1024 * 1024) { controller.error(new SiftpathError('RESPONSE_TOO_LARGE', 'Official MCP response exceeded 4 MiB.')); return; }
        controller.enqueue(chunk);
      },
    }));
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
  };
  constructor(private config: Configuration, private env: NodeJS.ProcessEnv = process.env) {}
  private get(id: string): Promise<Client> {
    if (this.closed) throw new SiftpathError('CLOSED', 'Siftpath has been closed.');
    const existing = this.connections.get(id);
    if (existing) return existing.ready;
    const status = providerStatus(id, this.config, this.env);
    if (status.code !== 'READY') throw new SiftpathError(status.code, 'Provider is unavailable.', [status]);
    const provider = this.config.providers[id]!, c = provider.connection;
    const values = (entries: Record<string, string>) => Object.fromEntries(Object.entries(entries).map(([key, val]) => [key, resolveSecret(val, this.config, this.env)]));
    const transport = c.transport === 'stdio'
      ? new StdioClientTransport({ command: c.command, args: c.args, env: { ...getDefaultEnvironment(), ...values(c.env) }, stderr: 'ignore', maxBufferSize: 4 * 1024 * 1024 })
      : new StreamableHTTPClientTransport(new URL(c.url), { fetch: this.fetch, requestInit: { headers: values(c.headers), redirect: 'error' },
        reconnectionOptions: { maxRetries: 0, initialReconnectionDelay: 1000, maxReconnectionDelay: 1000, reconnectionDelayGrowFactor: 1 } });
    const client = new Client({ name: 'siftpath', version: packageVersion });
    client.onerror = () => {}; // Upstream messages may contain credentials; expose only our stable error codes.
    const timeout = provider.timeoutMs ?? this.config.providerTimeoutMs;
    const deadline = AbortSignal.timeout(timeout);
    const ready = abortable(this.requestSignal.run(deadline, () => client.connect(transport, { timeout, signal: deadline })), deadline).then(() => client).catch(async (error) => {
      if (this.connections.get(id)?.client === client) this.connections.delete(id);
      await client.close().catch(() => {});
      const code = deadline.aborted ? 'PROVIDER_TIMEOUT' : error instanceof StreamableHTTPError && [401, 403].includes(error.code ?? 0) ? 'AUTH_FAILED'
        : error instanceof StreamableHTTPError && error.code === 429 ? 'RATE_LIMITED' : 'CONNECTION_FAILED';
      throw new SiftpathError(code, 'Cannot connect to official MCP. Check configuration, credentials and connectivity.');
    });
    this.connections.set(id, { client, transport, ready });
    // The SDK invokes onclose when the underlying transport exits/disconnects.
    client.onclose = () => { if (this.connections.get(id)?.client === client) this.connections.delete(id); };
    return ready;
  }
  async connect(id: string, signal: AbortSignal): Promise<void> {
    await abortable(this.get(id), signal);
  }
  async listTools(id: string, signal: AbortSignal, cursor?: string) {
    const client = await abortable(this.get(id), signal);
    // SDK listTools replaces its metadata cache per page; diagnostics retain and validate the complete list themselves.
    return this.requestSignal.run(signal, () => abortable(client.request({ method: 'tools/list', params: cursor ? { cursor } : {} }, ListToolsResultSchema, { signal,
      timeout: this.config.providers[id]!.timeoutMs ?? this.config.providerTimeoutMs }), signal));
  }
  async call(id: string, name: string, args: Record<string, unknown>, signal: AbortSignal) {
    const client = await abortable(this.get(id), signal);
    signal.throwIfAborted();
    try {
      const result = await this.requestSignal.run(signal, () => abortable(client.callTool({ name, arguments: args }, CallToolResultSchema, { signal,
        timeout: this.config.providers[id]!.timeoutMs ?? this.config.providerTimeoutMs }), signal));
      return CallToolResultSchema.parse(result);
    } catch (error) {
      // Expired HTTP sessions do not emit onclose in the SDK. Reconnect on the next operation, not an automatic billable retry.
      if (error instanceof StreamableHTTPError && error.code === 404) {
        if (this.connections.get(id)?.client === client) this.connections.delete(id);
        await client.close().catch(() => {});
      }
      throw error;
    }
  }
  async close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    const connections = [...this.connections.values()]; this.connections.clear();
    this.closing = Promise.allSettled(connections.map(async ({ client, transport }) => {
      try {
        if (transport instanceof StreamableHTTPClientTransport && transport.sessionId) {
          const deadline = AbortSignal.timeout(2000);
          await this.requestSignal.run(deadline, () => abortable(transport.terminateSession(), deadline));
        }
      } finally { await client.close(); }
    })).then(() => {});
    return this.closing;
  }
}
