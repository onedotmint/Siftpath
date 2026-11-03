import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { providerStatus, resolveSecret, type Configuration } from './config.js';
import { SiftpathError } from './errors.js';
import { publicUrl } from './inputs.js';

const endpoint = 'https://api.deepseek.com/v1/tools/search';
const maxBytes = 4 * 1024 * 1024;
const argumentsSchema = z.strictObject({
  query: z.string().refine(query => query.trim().length > 0 && [...query].length <= 128),
  count: z.number().int().min(1).max(50),
});
const responseSchema = z.looseObject({ results: z.array(z.looseObject({
  title: z.string(),
  url: z.string().max(4096).refine(value => { try { publicUrl(value); return true; } catch { return false; } }),
  snippet: z.string().optional(), summary: z.string().optional(), content: z.string().optional(),
})) }).refine(value => !Object.hasOwn(value, 'error'));

/** Stop waiting even if a fetch implementation or body ignores cancellation. */
function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(new SiftpathError('ABORTED', 'Search cancelled.')); };
    work.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => {
      signal.removeEventListener('abort', abort); reject(error);
    });
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}

/** Fixed official Search API only: no MCP discovery, redirects, retries or original human prompt. */
export async function deepseekSearch(id: string, name: string, args: Record<string, unknown>, config: Configuration,
  env: NodeJS.ProcessEnv, signal: AbortSignal): Promise<CallToolResult> {
  if (name !== 'deepseek_search' || !argumentsSchema.safeParse(args).success)
    throw new SiftpathError('INVALID_UPSTREAM_ARGUMENTS', 'DeepSeek search requires query (1–128 Unicode characters) and count (1–50).');
  const status = providerStatus(id, config, env), connection = config.providers[id]?.connection;
  if (status.code !== 'READY') throw new SiftpathError(status.code, 'Provider is unavailable.', [status]);
  if (config.providers[id]?.read) throw new SiftpathError('UNSUPPORTED_OPERATION', 'DeepSeek supports search only.');
  if (connection?.transport !== 'deepseek') throw new SiftpathError('UNSUPPORTED_OPERATION', 'Connection is not the DeepSeek Search API.');
  const apiKey = resolveSecret(connection.apiKey, config, env);
  if (!apiKey.trim()) throw new SiftpathError('MISSING_CREDENTIALS', 'DeepSeek API Key is missing.');
  if (/[\s\x00-\x1f\x7f]/.test(apiKey)) throw new SiftpathError('INVALID_CONFIG', 'Invalid DeepSeek API Key format.');
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let complete = false;
  try {
    if (signal.aborted) throw new SiftpathError('ABORTED', 'Search cancelled.');
    const pending = globalThis.fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: args.query, count: args.count, need_content: false }), redirect: 'error', signal });
    // A noncooperative fetch can resolve after our deadline; dispose its body without waiting for it.
    void pending.then(response => { if (signal.aborted) void response.body?.cancel().catch(() => {}); }, () => {});
    const response = await abortable(pending, signal);
    if (response.redirected || response.status !== 200) {
      void response.body?.cancel().catch(() => {});
      const code = response.status === 401 ? 'AUTH_FAILED' : response.status === 403 ? 'UPSTREAM_FORBIDDEN'
        : response.status === 429 ? 'RATE_LIMITED' : response.status === 400 ? 'INVALID_UPSTREAM_ARGUMENTS'
        : response.ok ? 'INVALID_UPSTREAM_RESPONSE' : 'UPSTREAM_ERROR';
      throw new SiftpathError(code, 'DeepSeek Search API rejected the request.');
    }
    if (!response.body) throw new SiftpathError('INVALID_UPSTREAM_RESPONSE', 'DeepSeek returned no JSON body.');
    reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let bytes = 0;
    while (true) {
      const chunk = await abortable(reader.read(), signal);
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw new SiftpathError('RESPONSE_TOO_LARGE', 'DeepSeek response exceeded 4 MiB.');
      chunks.push(chunk.value);
    }
    complete = true;
    let text: string, json: unknown;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)); json = JSON.parse(text); }
    catch { throw new SiftpathError('INVALID_UPSTREAM_RESPONSE', 'DeepSeek returned invalid JSON.'); }
    if (!responseSchema.safeParse(json).success) throw new SiftpathError('INVALID_UPSTREAM_RESPONSE', 'DeepSeek returned invalid search results.');
    return { content: [{ type: 'text', text }], structuredContent: json as Record<string, unknown> };
  } catch (error) {
    if (signal.aborted) throw new SiftpathError('ABORTED', 'Search cancelled.');
    if (error instanceof SiftpathError) throw error;
    throw new SiftpathError('UPSTREAM_ERROR', 'DeepSeek Search API request failed.');
  } finally {
    if (reader) {
      if (!complete) void reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
}
