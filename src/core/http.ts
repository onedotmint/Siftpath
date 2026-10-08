import { abortable, delay } from './async.js';
import { ProviderError } from './errors.js';
import type { ProviderContext } from './types.js';
export type FetchTransport = typeof globalThis.fetch;
export interface HttpRequest { url: string; method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: unknown }
export class JsonHttp {
  constructor(private readonly transport: FetchTransport = globalThis.fetch,
    private readonly retries = 1, private readonly maxBytes = 4 * 1024 * 1024) {
    if (![0, 1].includes(retries) || !Number.isInteger(maxBytes) || maxBytes < 1)
      throw new ProviderError('INVALID_CONFIG', 'Use zero or one retry and a positive response size limit.');
  }
  async request(request: HttpRequest, context: ProviderContext): Promise<unknown> {
    const url = new URL(request.url);
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new ProviderError('INVALID_ENDPOINT', 'Provider endpoints must use credential-free HTTPS URLs.');
    for (let attempt = 0; ; attempt++) {
      context.signal.throwIfAborted();
      const start = performance.now();
      context.recordHttp({ stage: 'http', attempt: attempt + 1 });
      try {
        const response = await abortable(this.transport(url, {
          method: request.method ?? 'POST', signal: context.signal, redirect: 'error',
          headers: { accept: 'application/json', 'content-type': 'application/json', ...request.headers },
          ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
        }), context.signal);
        if (!response.ok) {
          await response.body?.cancel();
          const status = response.status;
          const retryAfter = response.headers.get('retry-after');
          const seconds = retryAfter ? Number(retryAfter) : NaN;
          const wait = Number.isFinite(seconds) ? seconds * 1000 : retryAfter ? Date.parse(retryAfter) - Date.now() : undefined;
          throw new ProviderError(status === 429 ? 'RATE_LIMITED' : status === 401 || status === 403 ? 'AUTH_FAILED' : 'HTTP_ERROR',
            `Provider HTTP status ${status}.`, status === 429 || status >= 500,
            wait === undefined || !Number.isFinite(wait) ? undefined : Math.max(0, Math.min(wait, 2000)));
        }
        const declared = Number(response.headers.get('content-length') ?? '0');
        if (declared > this.maxBytes) { await response.body?.cancel(); throw new ProviderError('RESPONSE_TOO_LARGE', 'Provider response exceeded the size limit.'); }
        const reader = response.body?.getReader();
        const chunks: Uint8Array[] = []; let size = 0;
        try {
          if (reader) for (;;) {
            const part = await abortable(reader.read(), context.signal);
            if (part.done) break;
            size += part.value.byteLength;
            if (size > this.maxBytes) throw new ProviderError('RESPONSE_TOO_LARGE', 'Provider response exceeded the size limit.');
            chunks.push(part.value);
          }
        } catch (error) { await reader?.cancel().catch(() => undefined); throw error; }
        finally { reader?.releaseLock(); }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown; }
        catch { throw new ProviderError('INVALID_RESPONSE', 'Provider did not return valid JSON.'); }
      } catch (error) {
        context.signal.throwIfAborted();
        const converted = error instanceof ProviderError ? error : new ProviderError('NETWORK_ERROR', 'Provider network request failed.', true);
        if (!converted.retryable || attempt >= this.retries) throw converted;
        context.recordHttp({ stage: 'retry', status: 'retry', attempt: attempt + 1,
          code: converted.code, durationMs: Math.round(performance.now() - start) });
        await delay(converted.retryAfterMs ?? 150 * 2 ** attempt, context.signal);
      }
    }
  }
}
