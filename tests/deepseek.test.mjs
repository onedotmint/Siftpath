import test from 'node:test';
import assert from 'node:assert/strict';
import { deepseekSearch } from '../dist/deepseek.js';
import { Siftpath } from '../dist/router.js';
import { McpClients } from '../dist/client.js';
import { parseConfiguration, providerStatus, readConfiguration } from '../dist/config.js';
import { providerPresets, defaultRoutes } from '../dist/defaults.js';
import { providerTest, testReport } from '../dist/diagnostics.js';
import { normalize } from '../dist/output.js';
import { applySelection, applyRecommendedRoutes, readyFor } from '../dist/setup-plan.js';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const key = 'offline-secret-never-print';
const preset = providerPresets.deepseek;
const row = { title: 'Native title', url: 'https://example.com/page?q=1#section', snippet: 'snippet', summary: 'native summary', content: '', rerank_score: 2.4, authority: 3, site_name: null, site_icon: null, date: null };
const configuration = (extra = {}) => parseConfiguration({ providers: { deepseek: preset }, credentials: { DEEPSEEK_API_KEY: key },
  routes: { search: 'deepseek', intents: {} }, ...extra });
const response = (data = { results: [row] }, init = {}) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' }, ...init });
const call = (args = { query: 'query', count: 5 }, config = configuration(), signal = new AbortController().signal, name = 'deepseek_search', env = {}) =>
  deepseekSearch('deepseek', name, args, config, env, signal);
const stub = (t, fn = () => { throw new Error('Unexpected network dispatch'); }) => t.mock.method(globalThis, 'fetch', fn);
const code = expected => error => { assert.equal(error.code, expected); assert.ok(!JSON.stringify(error).includes(key)); assert.ok(!error.message.includes(key)); return true; };
const keepAlive = t => { const timer = setInterval(() => {}, 1000); t.after(() => clearInterval(timer)); };

test('DeepSeek preserves original JSON and native order, maps only explicit query/count, and indexes citations', async t => {
  const native = { results: [row, { ...row, title: 'Second', url: 'https://example.org/two', summary: 'second' }], future_field: { keep: true } };
  const text = JSON.stringify(native, null, 2) + '\n';
  const fetch = stub(t, async (url, init) => {
    assert.equal(url, 'https://api.deepseek.com/v1/tools/search');
    assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${key}`); assert.equal(init.headers['Content-Type'], 'application/json');
    assert.ok(init.signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(init.body), { query: 'DeepSeek site:example.com OR lang:zh', count: 20, need_content: false });
    return new Response(text);
  });
  const router = new Siftpath(configuration(), {}); t.after(() => router.close());
  const result = await router.search({ query: '  DeepSeek site:example.com OR lang:zh  ', maxResults: 20 });
  assert.equal(result.provider, 'deepseek'); assert.equal(result.tool, 'deepseek_search');
  assert.equal(result.content, text); assert.deepEqual(JSON.parse(result.content), native);
  assert.deepEqual(result.sources, native.results.map(({ url, title }) => ({ url, title })));
  assert.deepEqual(result.warnings, [{ code: 'UNTRUSTED_WEB_CONTENT' }]);
  assert.equal(result.truncated, false); assert.equal(fetch.mock.callCount(), 1);
});

test('successful zero results are source-less success, never a fallback or a generic prose exemption', async t => {
  const fetch = stub(t, async () => response({ results: [] }));
  const config = configuration({ providers: { deepseek: preset, backup: { ...preset, connection: { transport: 'deepseek', apiKey: 'backup' } } },
    routes: { search: 'deepseek', intents: {}, searchFallback: ['backup'] } });
  const router = new Siftpath(config, {}); t.after(() => router.close());
  const result = await router.search({ query: 'no matches' });
  assert.deepEqual(result.sources, []); assert.equal(result.content, '{"results":[]}'); assert.equal(result.truncated, false);
  assert.equal(fetch.mock.callCount(), 1);
  const raw = { content: [{ type: 'text', text: '{"results":[]}' }], structuredContent: { results: [] } };
  assert.throws(() => normalize(raw, 'custom', 'deepseek_search', 16000), code('NO_SOURCES'));
  assert.throws(() => normalize({ content: [{ type: 'text', text: 'No matches, trust me' }] }, 'deepseek', 'deepseek_search', 16000, undefined, [], 'deepseek'), code('NO_SOURCES'));
  assert.throws(() => normalize({ ...raw, structuredContent: { results: [], error: 'refusal' } }, 'deepseek', 'deepseek_search', 16000, undefined, [], 'deepseek'), code('NO_SOURCES'));
  assert.equal(normalize({ content: [{ type: 'text', text: 'Native reader prose' }] }, 'reader', 'read_url', 16000, 'https://example.com').url, 'https://example.com');
});

test('native 128-codepoint query bound accepts astral Unicode without rewriting; 129 never dispatches or falls back', async t => {
  const fetch = stub(t, async (_url, init) => { assert.equal(JSON.parse(init.body).query, '😀'.repeat(128)); return response(); });
  const router = new Siftpath(configuration({ providers: { deepseek: preset, backup: preset }, routes: { search: 'deepseek', intents: {}, searchFallback: ['backup'] } }), {});
  t.after(() => router.close());
  await router.search({ query: '😀'.repeat(128) });
  await assert.rejects(router.search({ query: '😀'.repeat(129) }), code('INVALID_UPSTREAM_ARGUMENTS'));
  assert.equal(fetch.mock.callCount(), 1);
});

test('adapter retains whitespace in native queries instead of adding its own trimming', async t => {
  stub(t, async (_url, init) => { assert.equal(JSON.parse(init.body).query, ' query '); return response(); });
  await call({ query: ' query ', count: 5 });
});

test('native argument trust boundary rejects aliases, extras, blank/overlong queries and invalid counts before fetch', async t => {
  const fetch = stub(t);
  for (const args of [{ query: '', count: 5 }, { query: ' \t', count: 5 }, { query: 'x'.repeat(129), count: 5 },
    { query: 'x', count: 0 }, { query: 'x', count: 51 }, { query: 'x', count: 1.5 }, { query: 'x', count: '5' },
    { query: 'x' }, { query: 'x', count: 5, ori_question: 'human prompt' }, { query: 'x', count: 5, need_content: true }, { query: 'x', count: 5, url: 'https://other.example' }])
    await assert.rejects(call(args), code('INVALID_UPSTREAM_ARGUMENTS'));
  await assert.rejects(call(undefined, undefined, undefined, 'search'), code('INVALID_UPSTREAM_ARGUMENTS'));
  const router = new Siftpath(configuration(), {}); t.after(() => router.close());
  assert.throws(() => router.search({ query: 'x', maxResults: 21 }), code('INVALID_INPUT'));
  assert.throws(() => router.search({ query: 'x', ori_question: 'human prompt' }), code('INVALID_INPUT'));
  assert.equal(fetch.mock.callCount(), 0);
});

test('native count supports 1..50 while the public default is 5 and public maximum remains 20', async t => {
  const counts = [], fetch = stub(t, async (_url, init) => { counts.push(JSON.parse(init.body).count); return response(); });
  await call({ query: 'query', count: 1 }); await call({ query: 'query', count: 50 });
  const router = new Siftpath(configuration(), {}); t.after(() => router.close());
  await router.search({ query: 'query' }); await router.search({ query: 'query', maxResults: 1 });
  assert.deepEqual(counts, [1, 50, 5, 1]); assert.equal(fetch.mock.callCount(), 4);
});

test('config accepts only fixed-endpoint search binding and preserves http as MCP', t => {
  const fetch = stub(t);
  for (const provider of [
    { ...preset, read: { name: 'deepseek_search', arguments: { query: '$query', count: '$maxResults' } } },
    { ...preset, search: { ...preset.search, name: 'search' } },
    { ...preset, search: { ...preset.search, arguments: { query: '$query' } } },
    { ...preset, search: { ...preset.search, arguments: { query: '$query', count: '$maxResults', ori_question: '$query' } } },
    { ...preset, search: { ...preset.search, arguments: { query: 'constant', count: '$maxResults' } } },
    { ...preset, search: { ...preset.search, minResults: 5 } },
    { ...preset, search: undefined },
    { ...preset, connection: { ...preset.connection, url: 'https://evil.example/search' } },
    { ...preset, connection: { ...preset.connection, headers: { Authorization: 'other' } } },
  ]) assert.throws(() => configuration({ providers: { deepseek: provider } }), code('INVALID_CONFIG'));
  const config = configuration({ providers: { custom: { connection: { transport: 'http', url: 'https://api.deepseek.com/v1/tools/search' }, search: { name: 'custom', arguments: {} } } } });
  assert.equal(config.providers.custom.connection.transport, 'http'); assert.equal(fetch.mock.callCount(), 0);
});

test('missing/disabled credentials make zero preflight requests; environment takes precedence, no anonymous recovery', async t => {
  const fetch = stub(t);
  const missing = configuration({ credentials: {} });
  assert.equal(providerStatus('deepseek', missing, {}).code, 'MISSING_CREDENTIALS');
  await assert.rejects(call(undefined, missing), code('MISSING_CREDENTIALS'));
  const probe = await providerTest('deepseek', missing, {});
  assert.equal(probe.outcome, 'skipped'); assert.equal(probe.code, 'MISSING_CREDENTIALS');
  assert.deepEqual(probe.stages, { connection: 'not_tested', discovery: 'not_tested', request: 'not_tested' });
  const router = new Siftpath(missing, {}); t.after(() => router.close());
  await assert.rejects(router.search({ query: 'query' }), error => error.diagnostics?.[0]?.code === 'MISSING_CREDENTIALS');
  await assert.rejects(call(undefined, configuration({ providers: { deepseek: { ...preset, enabled: false } } })), code('DISABLED'));
  await assert.rejects(call(undefined, configuration({ providers: { deepseek: { ...preset, connection: { transport: 'deepseek', apiKey: ' ' } } } })), code('MISSING_CREDENTIALS'));
  await assert.rejects(call(undefined, configuration({ credentials: { DEEPSEEK_API_KEY: 'Bearer bad' } })), code('INVALID_CONFIG'));
  assert.equal(fetch.mock.callCount(), 0);
  fetch.mock.mockImplementation(async (_url, init) => { assert.equal(init.headers.Authorization, 'Bearer environment-only'); return response(); });
  await call(undefined, undefined, undefined, undefined, { DEEPSEEK_API_KEY: ' environment-only ' });
  assert.equal(fetch.mock.callCount(), 1);
});

test('explicit DeepSeek reader is unsupported and never invokes the Search API or read fallback', async t => {
  const fetch = stub(t), router = new Siftpath(configuration({ routes: { search: 'deepseek', readFallback: ['deepseek'], intents: {} } }), {});
  t.after(() => router.close());
  await assert.rejects(router.read({ url: 'https://example.com', reader: 'deepseek' }), code('UNSUPPORTED_OPERATION'));
  assert.equal(fetch.mock.callCount(), 0);
});

test('McpClients explicitly rejects direct API transports without discovery or fetch', async t => {
  const fetch = stub(t), clients = new McpClients(configuration(), {}); t.after(() => clients.close());
  for (const operation of [() => clients.connect('deepseek', new AbortController().signal),
    () => clients.listTools('deepseek', new AbortController().signal),
    () => clients.call('deepseek', 'deepseek_search', { query: 'x', count: 1 }, new AbortController().signal)])
    await assert.rejects(operation(), code('UNSUPPORTED_OPERATION'));
  assert.equal(fetch.mock.callCount(), 0);
});

test('new/missing and existing config leave DeepSeek disabled and keep legacy/default route priorities', async t => {
  const fetch = stub(t), directory = await mkdtemp(join(tmpdir(), 'siftpath-deepseek-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'config.json');
  const fresh = await readConfiguration(path, { DEEPSEEK_API_KEY: key });
  assert.equal(fresh.providers.deepseek.enabled, false); assert.deepEqual(fresh.routes, defaultRoutes);
  await writeFile(path, JSON.stringify({ version: 2 }));
  const saved = await readConfiguration(path, { DEEPSEEK_API_KEY: key });
  assert.equal(saved.providers.deepseek.enabled, false); assert.equal(saved.routes.search, 'brave');
  let enabled = applySelection(fresh, { id: 'deepseek', mode: 'key', key });
  assert.equal(enabled.providers.deepseek.enabled, true); assert.equal(enabled.providers.deepseek.read, undefined);
  enabled = applySelection(enabled, { id: 'brave', mode: 'key', key: 'brave-key' });
  assert.ok(readyFor(enabled, {}, 'search').indexOf('brave') < readyFor(enabled, {}, 'search').indexOf('deepseek'));
  assert.equal(applyRecommendedRoutes(enabled, {}).routes.search, 'brave');
  assert.equal(fetch.mock.callCount(), 0);
});

for (const [status, expected] of [[401, 'AUTH_FAILED'], [403, 'UPSTREAM_FORBIDDEN'], [429, 'RATE_LIMITED'], [400, 'INVALID_UPSTREAM_ARGUMENTS'], [402, 'UPSTREAM_ERROR'], [500, 'UPSTREAM_ERROR'], [302, 'UPSTREAM_ERROR'], [204, 'INVALID_UPSTREAM_RESPONSE']]) {
  test(`HTTP ${status} is sanitized and classified as ${expected}, without retries`, async t => {
    const fetch = stub(t, async () => status === 204 ? new Response(null, { status }) : new Response(key, { status, statusText: key, headers: { Location: 'https://evil.example' } }));
    await assert.rejects(call(), code(expected)); assert.equal(fetch.mock.callCount(), 1);
  });
}

test('redirects are rejected and fetch exceptions never expose secrets or upstream messages', async t => {
  const fetch = stub(t, async (_url, init) => { assert.equal(init.redirect, 'error'); throw new Error(`${key}: redirect to secret-url`); });
  await assert.rejects(call(), code('UPSTREAM_ERROR'));
  // A fetch shim may claim it followed a redirect despite redirect:error.
  fetch.mock.mockImplementation(async () => { const r = response(); Object.defineProperty(r, 'redirected', { value: true }); return r; });
  await assert.rejects(call(), code('INVALID_UPSTREAM_RESPONSE'));
  assert.equal(fetch.mock.callCount(), 2);
});

test('malformed JSON, result envelopes, rows and unsafe/malformed URLs are rejected, not normalized as prose', async t => {
  const fetch = stub(t);
  for (const data of [null, [], {}, { results: null }, { results: {} }, { results: [null] }, { results: ['text'] },
    { results: [{ title: 'title' }] }, { results: [{ ...row, title: 42 }] }, { results: [{ ...row, summary: {} }] }, { results: [], error: { message: key } },
    ...['not a URL', 'javascript:alert(1)', 'file:///etc/passwd', 'https://user:pass@example.com', 'https://localhost', 'http://127.0.0.1', 'https://private.internal'].map(url => ({ results: [{ ...row, url }] }))]) {
    fetch.mock.mockImplementation(async () => response(data));
    await assert.rejects(call(), code('INVALID_UPSTREAM_RESPONSE'));
  }
  for (const text of [key, '<html>upstream failure</html>', '{"results":', '']) {
    fetch.mock.mockImplementation(async () => new Response(text));
    await assert.rejects(call(), code('INVALID_UPSTREAM_RESPONSE'));
  }
  fetch.mock.mockImplementation(async () => new Response(new Uint8Array([0xff])));
  await assert.rejects(call(), code('INVALID_UPSTREAM_RESPONSE'));
});

test('streamed response cap counts bytes, cancels the body and never awaits a noncooperative cancel', async t => {
  let cancelled = false;
  const fetch = stub(t, async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(4 * 1024 * 1024)); controller.enqueue(new Uint8Array([0])); },
    cancel() { cancelled = true; return new Promise(() => {}); },
  })));
  await assert.rejects(call(), code('RESPONSE_TOO_LARGE')); assert.equal(cancelled, true); assert.equal(fetch.mock.callCount(), 1);
  // A multibyte JSON body can fit in UTF-16 characters but still exceed the byte budget.
  fetch.mock.mockImplementation(async () => response({ results: [{ ...row, summary: '界'.repeat(1500000) }] }));
  await assert.rejects(call(), code('RESPONSE_TOO_LARGE'));
});

test('exactly 4 MiB of valid JSON is accepted, including Unicode split between stream chunks', async t => {
  const text = JSON.stringify({ results: [{ ...row, summary: '界' }] });
  const bytes = Buffer.from(text + ' '.repeat(4 * 1024 * 1024 - Buffer.byteLength(text)));
  const split = bytes.indexOf(Buffer.from('界')) + 1;
  stub(t, async () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(bytes.subarray(0, split)); controller.enqueue(bytes.subarray(split)); controller.close();
  } })));
  const raw = await call(); assert.equal(raw.structuredContent.results[0].summary, '界');
  assert.equal(Buffer.byteLength(raw.content[0].text), 4 * 1024 * 1024);
});

test('pre-aborted calls never dispatch; caller cancellation bounds noncooperative fetch and disposes late bodies', async t => {
  const controller = new AbortController(); controller.abort(new Error(key));
  const fetch = stub(t);
  await assert.rejects(call(undefined, undefined, controller.signal), code('ABORTED')); assert.equal(fetch.mock.callCount(), 0);
  let resolveFetch, cancelled = false;
  fetch.mock.mockImplementation(() => new Promise(resolve => { resolveFetch = resolve; }));
  const active = new AbortController(), pending = call(undefined, undefined, active.signal); active.abort(new Error(key));
  await assert.rejects(pending, code('ABORTED'));
  resolveFetch(new Response(new ReadableStream({ cancel() { cancelled = true; } })));
  await new Promise(resolve => setImmediate(resolve)); assert.equal(cancelled, true);
});

test('body cancellation is bounded even when a reader and cancel ignore the signal', async t => {
  let cancelled = false;
  const fetch = stub(t, async () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { cancelled = true; return new Promise(() => {}); } })));
  const controller = new AbortController(), pending = call(undefined, undefined, controller.signal);
  await new Promise(resolve => setImmediate(resolve)); controller.abort(new Error(key));
  await assert.rejects(pending, code('ABORTED')); assert.equal(cancelled, true); assert.equal(fetch.mock.callCount(), 1);
});

test('provider timeout bounds noncooperative fetch and never dispatches a fallback after overall timeout', async t => {
  keepAlive(t);
  const fetch = stub(t, () => new Promise(() => {}));
  const router = new Siftpath(configuration({ timeoutMs: 100, providerTimeoutMs: 100, providers: { deepseek: preset, backup: preset },
    routes: { search: 'deepseek', intents: {}, searchFallback: ['backup'] } }), {}); t.after(() => router.close());
  await assert.rejects(router.search({ query: 'query' }), code('TIMEOUT')); assert.equal(fetch.mock.callCount(), 1);
});

test('provider-only timeout bounds stalled body and is classified without retries', async t => {
  keepAlive(t); let cancelled = false;
  const fetch = stub(t, async () => new Response(new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { cancelled = true; } })));
  const router = new Siftpath(configuration({ timeoutMs: 1000, providerTimeoutMs: 100 }), {}); t.after(() => router.close());
  await assert.rejects(router.search({ query: 'query' }), error => error.diagnostics?.[0]?.code === 'PROVIDER_TIMEOUT');
  assert.equal(cancelled, true); assert.equal(fetch.mock.callCount(), 1);
});

test('router close/caller abort stop in-flight direct work and close is idempotent', async t => {
  const fetch = stub(t, () => new Promise(() => {}));
  const router = new Siftpath(configuration(), {}), pending = router.search({ query: 'query' });
  await router.close(); await router.close(); await assert.rejects(pending, code('CLOSED'));
  await assert.rejects(router.search({ query: 'query' }), code('CLOSED'));
  const second = new Siftpath(configuration(), {}); t.after(() => second.close());
  const controller = new AbortController(), request = second.search({ query: 'query' }, { signal: controller.signal }); controller.abort(new Error(key));
  await assert.rejects(request, code('ABORTED')); assert.equal(fetch.mock.callCount(), 2);
});

test('diagnostics make exactly one real search and report no fabricated MCP stages, including empty success', async t => {
  const fetch = stub(t, async (_url, init) => { assert.deepEqual(JSON.parse(init.body), { query: 'example.com', count: 5, need_content: false }); return response({ results: [] }); });
  const result = await providerTest('deepseek', configuration(), {});
  assert.equal(result.outcome, 'passed'); assert.deepEqual(result.stages, { connection: 'not_tested', discovery: 'not_tested', request: 'passed' });
  assert.equal(result.operations.length, 1); assert.equal(result.operations[0].operation, 'search'); assert.equal(result.operations[0].state, 'passed');
  assert.equal(fetch.mock.callCount(), 1);
  const directory = await mkdtemp(join(tmpdir(), 'siftpath-deepseek-probe-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const report = await testReport(configuration(), 'deepseek', join(directory, 'config.json'), {});
  assert.equal(report.networkChecked, true); assert.equal(report.ok, true); assert.equal(fetch.mock.callCount(), 2);
});

test('failed/cancelled diagnostic marks request failure but never claims MCP connected/discovered', async t => {
  keepAlive(t);
  const fetch = stub(t, async () => new Response(key, { status: 403 }));
  const failed = await providerTest('deepseek', configuration(), {});
  assert.equal(failed.code, 'UPSTREAM_FORBIDDEN'); assert.equal(failed.operations[0].code, 'UPSTREAM_FORBIDDEN');
  assert.deepEqual(failed.stages, { connection: 'not_tested', discovery: 'not_tested', request: 'failed' });
  fetch.mock.mockImplementation(() => new Promise(() => {}));
  const timed = await providerTest('deepseek', configuration({ providerTimeoutMs: 100 }), {});
  assert.equal(timed.code, 'PROVIDER_TIMEOUT');
  const controller = new AbortController(), pending = providerTest('deepseek', configuration(), {}, controller.signal); controller.abort(new Error(key));
  const cancelled = await pending; assert.equal(cancelled.code, 'ABORTED');
  assert.equal(cancelled.stages.discovery, 'not_tested'); assert.equal(fetch.mock.callCount(), 3);
});
