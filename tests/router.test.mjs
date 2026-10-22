import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { Siftpath, parseConfiguration, diagnostics } from '../dist/index.js';
import { mapArguments } from '../dist/router.js';
import { normalize } from '../dist/output.js';
const fixture = resolve('tests/fixtures/official-mcp.mjs');
export function provider(tool = 'search', env = {}) {
  return { connection: { transport: 'stdio', command: process.execPath, args: [fixture, '--stdio'], env },
    search: { name: tool, arguments: { q: '$query', count: '$maxResults' } }, read: { name: 'read', arguments: { url: '$url', question: '$focus' } } };
}
export function config(providers = { brave: provider(), exa: provider(), jina: provider() }, extra = {}) {
  return { providers, routes: { search: 'brave', read: 'jina', intents: { semantic: 'exa', research: 'tavily' }, searchFallback: ['exa'], readFallback: [] }, ...extra };
}
async function router(t, value) { const r = new Siftpath(value, {}); t.after(() => r.close()); return r; }

test('argument mapping supports nested constants and omits absent optional focus', () => {
  assert.deepEqual(mapArguments({ q: '$query', list: ['$url'], nested: { question: '$focus', mode: 'native' } }, { query: 'x', url: 'https://example.com' }),
    { q: 'x', list: ['https://example.com'], nested: { mode: 'native' } });
});
test('lazy stdio connection, single-provider routing, semantic/default intent and connection reuse', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'siftpath-route-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const log = join(dir, 'calls.jsonl');
  const r = await router(t, config({ brave: provider('search', { MOCK_LOG: log }), exa: provider(), jina: provider() }));
  await assert.rejects(readFile(log), { code: 'ENOENT' });
  const first = await r.search({ query: 'hello', maxResults: 1 });
  assert.equal(first.provider, 'brave'); assert.equal(first.sources[0].title, 'Example');
  assert.equal(first.sources[0].url, 'https://example.com/a?utm_source=original');
  assert.equal(JSON.parse(first.content.split('\n\n')[0]).received.count, 1);
  await r.search({ query: 'again' });
  assert.equal((await readFile(log, 'utf8')).trim().split('\n').length, 2);
  assert.equal(r.clients.connections.size, 1);
  assert.equal((await r.search({ query: 'semantic', intent: 'semantic' })).provider, 'exa');
  const semantic = await router(t, config(undefined, { routes: { ...config().routes, defaultIntent: 'semantic' } }));
  assert.equal((await semantic.search({ query: 'default intent' })).provider, 'exa');
});
test('native read focus passes unchanged and original requested URL is retained', async t => {
  const r = await router(t, config()); const url = 'https://example.com/page?signature=a%2Bb#original';
  const result = await r.read({ url, focus: 'what changed?' });
  assert.equal(result.provider, 'jina'); assert.equal(result.url, url); assert.equal(result.sources[0].url, url);
  assert.match(result.content, /what changed\?/); assert.ok(result.retrievedAt);
});
test('unsupported native focus is explicit and never implements local extraction', async t => {
  const jina = provider(); delete jina.read.arguments.question;
  const r = await router(t, config({ jina }));
  assert.ok((await r.read({ url: 'https://example.com', focus: 'x' })).warnings.some(w => w.code === 'FOCUS_UNSUPPORTED'));
});
for (const failing of ['fail', 'secret', 'empty', 'malformed', 'slow']) test(`sequential fallback after ${failing}, with sanitized errors`, async t => {
  const r = await router(t, config({ brave: { ...provider(failing), timeoutMs: failing === 'slow' ? 1000 : 5000 }, exa: provider() }));
  const result = await r.search({ query: 'x' });
  assert.equal(result.provider, 'exa'); assert.ok(result.warnings.some(w => w.provider === 'brave'));
  assert.ok(!JSON.stringify(result).includes('PRIVATE_KEY'));
});
test('missing credentials and disabled providers are skipped and diagnosed without connecting', async t => {
  const brave = provider(); brave.connection.env = { KEY: '${MISSING_KEY}' };
  const r = await router(t, config({ brave, exa: provider(), jina: { ...provider(), enabled: false } }));
  assert.equal((await r.search({ query: 'x' })).provider, 'exa');
  assert.equal(diagnostics(r.configuration, {}).providers.find(p => p.provider === 'brave').code, 'MISSING_CREDENTIALS');
  assert.equal(r.clients.connections.size, 1);
  await assert.rejects(r.read({ url: 'https://example.com' }), e => e.code === 'NO_PROVIDER_SUCCEEDED' && e.diagnostics[0].code === 'DISABLED');
});
test('all-provider failure reports stable diagnostics, never upstream error bodies', async t => {
  const r = await router(t, config({ brave: provider('secret') }, { routes: { search: 'brave', read: 'brave', searchFallback: [] } }));
  await assert.rejects(r.search({ query: 'x' }), e => e.code === 'NO_PROVIDER_SUCCEEDED' && !JSON.stringify(e).includes('PRIVATE_KEY'));
});
test('per-operation cancellation does not fall back or poison a reusable connection', async t => {
  const r = await router(t, config({ brave: provider('slow'), exa: provider() }));
  const controller = new AbortController(); const work = r.search({ query: 'x' }, { signal: controller.signal });
  setTimeout(() => controller.abort(), 400);
  await assert.rejects(work, { code: 'ABORTED' });
  assert.ok(!r.clients.connections.has('exa'));
  const already = new AbortController(); already.abort();
  await assert.rejects(r.search({ query: 'x' }, { signal: already.signal }), { code: 'ABORTED' });
});
test('global deadline bounds initialization/call and does not start fallback', async t => {
  const r = await router(t, config({ brave: provider('slow'), exa: provider() }, { timeoutMs: 500 }));
  await assert.rejects(r.search({ query: 'x' }), { code: 'TIMEOUT' });
  assert.ok(!r.clients.connections.has('exa'));
});
test('large Unicode/escaped output is bounded as full serialized JSON and citations survive', async t => {
  const r = await router(t, config({ brave: provider('large') }, { maxOutputChars: 2000 }));
  const result = await r.search({ query: 'x' });
  assert.ok(JSON.stringify(result).length <= 2000); assert.equal(result.truncated, true); assert.equal(result.sources.length, 2); assert.ok(result.content.length > 200);
});
test('structured-only output and original URL metadata survive normalization', () => {
  const output = normalize({ content: [], structuredContent: { results: [{ url: 'https://example.com', title: 'Title' }] } }, 'custom', 'search', 2000);
  assert.equal(output.sources[0].title, 'Title'); assert.match(output.content, /results/);
});
test('public URL and strict SDK input validation reject unsafe/unknown model parameters', async t => {
  const r = await router(t, config());
  for (const url of ['file:///etc/passwd', 'http://127.0.0.1', 'http://2130706433', 'http://[::1]', 'https://x.local', 'https://user:secret@example.com', 'http://localhost']) {
    assert.throws(() => r.read({ url }), { code: 'INVALID_INPUT' });
  }
  for (const input of [{ query: '' }, { query: 'x', intent: 'deep' }, { query: 'x', maxResults: 21 }, { query: 'x', apiKey: 'secret' }]) assert.throws(() => r.search(input), { code: 'INVALID_INPUT' });
  assert.equal(r.clients.connections.size, 0);
});
test('close is idempotent and prevents new calls', async t => {
  const r = await router(t, config()); await r.search({ query: 'x' }); await r.close(); await r.close();
  await assert.rejects(r.search({ query: 'x' }), { code: 'CLOSED' });
});
test('config rejects URL credentials, URL query keys, invalid limits and unknown fields', () => {
  for (const input of [{ timeoutMs: 0 }, { maxOutputChars: 10 }, { llm: true }, { providers: { a: { connection: { transport: 'http', url: 'https://example.com/mcp?apiKey=x' } } } },
    { providers: { a: { connection: { transport: 'http', url: 'http://example.com' } } } }]) assert.throws(() => parseConfiguration(input), { code: 'INVALID_CONFIG' });
});

test('escaped-dense output keeps the largest usable nonempty prefix', () => {
  const output = normalize({ content: [{ type: 'text', text: 'https://example.com\n' + '"'.repeat(10000) }] }, 'test', 'search', 2000);
  assert.ok(output.content.length > 700); assert.ok(JSON.stringify(output).length <= 2000); assert.ok(output.truncated);
});
test('parenthesized original URLs survive JSON/Markdown without a fake duplicate', () => {
  const url = 'https://en.wikipedia.org/wiki/Function_(mathematics)';
  for (const text of [JSON.stringify({ url, title: 'Function' }), '[Function](' + url + ')', 'URL: ' + url]) {
    const result = normalize({ content: [{ type: 'text', text }] }, 'test', 'search', 2000);
    assert.deepEqual(result.sources.map(s => s.url), [url]);
  }
});
test('summary text cannot discard useful structured content', () => {
  const result = normalize({ content: [{ type: 'text', text: 'Found 1 result' }], structuredContent: {
    results: [{ url: 'https://example.com', title: 'Real title', text: 'Actual official search content' }],
  } }, 'test', 'search', 2000);
  assert.match(result.content, /Actual official search content/); assert.match(result.content, /Found 1 result/);
});
test('simultaneous operations share initialization and closing aborts pending work', async t => {
  const r = await router(t, config());
  const results = await Promise.all([r.search({ query: 'one' }), r.search({ query: 'two' })]);
  assert.equal(r.clients.connections.size, 1); assert.equal(results.length, 2);
  const slow = await router(t, config({ brave: provider('slow') }));
  const work = assert.rejects(slow.search({ query: 'cancel on close' }), { code: 'CLOSED' });
  await new Promise(resolve => setTimeout(resolve, 300)); await slow.close();
  await work;
});

test('read failure uses its own fallback chain without calling a search provider', async t => {
  const failedReader = provider(); failedReader.read.name = 'fail';
  const backup = provider(); delete backup.read.arguments.question;
  const r = await router(t, config({ jina: failedReader, backup, brave: provider() }, {
    routes: { ...config().routes, readFallback: ['backup'] },
  }));
  const result = await r.read({ url: 'https://example.com/page', focus: 'native focus' });
  assert.equal(result.provider, 'backup'); assert.equal(result.url, 'https://example.com/page');
  assert.ok(result.warnings.some(w => w.provider === 'jina' && w.code === 'UPSTREAM_ERROR'));
  assert.ok(result.warnings.some(w => w.code === 'FOCUS_UNSUPPORTED'));
  assert.ok(!r.clients.connections.has('brave'));
});

test('long trailing URL punctuation is processed without quadratic blocking', async () => {
  const worker = new Worker(`const {parentPort, workerData} = require('node:worker_threads');
    import(workerData).then(({normalize}) => {
      const urls = ['https://example.com/a(b)' + ')'.repeat(100000), ...['.', ',', ';'].map(char => 'https://example.com/' + char.repeat(100000) + ') https://safe.example/')];
      parentPort.postMessage(urls.map(text => normalize({content:[{type:'text', text}]}, 'fixture', 'search', 2000).sources));
    });`,
    { eval: true, workerData: new URL('../dist/output.js', import.meta.url).href });
  let timer;
  try {
    const sources = await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('URL cleanup exceeded 5 seconds for a 100 KB response')), 5000);
      worker.once('message', resolve); worker.once('error', reject);
    });
    assert.deepEqual(sources.map(rows => rows.map(source => source.url)), [['https://example.com/a(b)'], ['https://safe.example/'], ['https://safe.example/'], ['https://safe.example/']]);
  } finally { clearTimeout(timer); await worker.terminate(); }
});
test('fallback diagnostics are included before the single final output trim', async t => {
  const missing = Array.from({ length: 8 }, (_, i) => 'missing' + i);
  const r = await router(t, config({ brave: provider('search', { MOCK_LONG_SOURCES: '1' }) }, {
    maxOutputChars: 2000, routes: { search: missing[0], read: 'brave', intents: {}, searchFallback: [...missing.slice(1), 'brave'] },
  }));
  const result = await r.search({ query: 'x' });
  assert.equal(result.warnings.filter(w => w.code === 'NOT_CONFIGURED').length, 8);
  assert.equal(result.sourcesTruncated, true); assert.equal(result.truncated, true);
  assert.ok(result.content.length > 300); assert.ok(JSON.stringify(result).length > 1900);
  assert.ok(JSON.stringify(result).length <= 2000);
});

test('a provider minimum raises too-small result requests and says so, without touching other providers', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'siftpath-min-results-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const log = join(dir, 'calls.jsonl'), tavily = provider('search', { MOCK_LOG: log });
  tavily.search.minResults = 5;
  const r = await router(t, config({ tavily }, { routes: { search: 'tavily', read: 'tavily', intents: {}, searchFallback: [] } }));
  const raised = await r.search({ query: 'x', maxResults: 1 });
  assert.ok(raised.warnings.some(warning => warning.code === 'MAX_RESULTS_RAISED'));
  assert.equal(JSON.parse((await readFile(log, 'utf8')).trim().split('\n')[0]).args.count, 5);
  const exact = await r.search({ query: 'y', maxResults: 5 });
  assert.ok(!exact.warnings.some(warning => warning.code === 'MAX_RESULTS_RAISED'));
  const plain = await router(t, config());
  assert.ok(!(await plain.search({ query: 'z', maxResults: 1 })).warnings.some(warning => warning.code === 'MAX_RESULTS_RAISED'));
});

test('retiring a router after a configuration change lets in-flight calls finish instead of aborting them', async t => {
  const r = new Siftpath(config({ brave: { ...provider('slow'), timeoutMs: 8000 } }), {});
  const work = r.search({ query: 'in flight' });
  await new Promise(resolve => setTimeout(resolve, 100));
  r.retire();
  const result = await work;
  assert.equal(result.provider, 'brave');
  await new Promise(resolve => setTimeout(resolve, 50));
  await assert.rejects(r.search({ query: 'after retirement' }), { code: 'CLOSED' });
});
