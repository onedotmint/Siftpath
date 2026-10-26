import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Siftpath, toolDefinitions } from '../dist/index.js';
import { readSchema } from '../dist/inputs.js';
import { parseConfiguration, readConfiguration, providerStatus } from '../dist/config.js';
import { providerPresets } from '../dist/defaults.js';

const url = 'https://example.com/page?signature=a%2Bb#original';
const fixture = resolve('tests/fixtures/official-mcp.mjs');
async function setup(t, customize = config => config) {
  const dir = await mkdtemp(join(tmpdir(), 'siftpath-readers-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const logs = Object.fromEntries(['tavily', 'exa', 'jina', 'firecrawl', 'custom'].map(id => [id, join(dir, id + '.jsonl')]));
  const providers = Object.fromEntries(Object.entries(logs).map(([id, log]) => [id, {
    connection: { transport: 'stdio', command: process.execPath, args: [fixture, '--stdio'], env: { MOCK_LOG: log } },
    ...(id === 'tavily' || id === 'exa' ? { search: { name: 'search', arguments: { q: '$query', count: '$maxResults' } } } : {}),
    ...(id !== 'tavily' ? { read: { name: 'read', arguments: { url: '$url', ...(id === 'firecrawl' ? { formats: ['markdown'], objective: 'Read the requested page.' } : { question: '$focus', topk: 3, chunk_size: 250 }) } } } : {}),
  }]));
  const config = customize({ providers }); const router = new Siftpath(config, {}); t.after(() => router.close());
  return { router, dir, logs, config };
}
const calls = async path => (await readFile(path, 'utf8')).trim().split('\n').map(line => JSON.parse(line));

test('new defaults route three search intents independently, with no generated fallback', async t => {
  const { router, logs } = await setup(t);
  assert.equal((await router.search({ query: 'general' })).provider, 'tavily');
  assert.equal((await router.search({ query: 'research', intent: 'research' })).provider, 'tavily');
  assert.equal((await router.search({ query: 'semantic', intent: 'semantic' })).provider, 'exa');
  assert.equal((await calls(logs.tavily)).length, 2); assert.equal((await calls(logs.exa)).length, 1);
  assert.deepEqual(router.configuration.routes.searchFallback, []); assert.deepEqual(router.configuration.routes.readFallback, []);
});
test('reader schema is optional and accepts custom IDs, never a brand enum or obsolete mode', () => {
  assert.deepEqual(readSchema.parse({ url, reader: 'team-docs_2', focus: ' conditions ' }), { url, reader: 'team-docs_2', focus: 'conditions' });
  for (const reader of ['', 'Jina', '../key', 'a'.repeat(65), null]) assert.equal(readSchema.safeParse({ url, reader }).success, false);
  assert.equal(readSchema.safeParse({ url, mode: 'document' }).success, false);
  assert.deepEqual(toolDefinitions.map(tool => tool.name), ['web_search', 'web_read']);
  assert.equal(toolDefinitions[1].inputSchema.properties.reader.enum, undefined);
});
test('one session switches default/explicit/custom readers without forwarding reader or mutating default', async t => {
  const { router, logs } = await setup(t);
  assert.equal((await router.read({ url, focus: 'specific conditions' })).provider, 'jina');
  const document = await router.read({ url, reader: 'firecrawl' });
  assert.equal(document.provider, 'firecrawl'); assert.equal(document.url, url); assert.equal(document.truncated, false);
  assert.equal((await router.read({ url, reader: 'custom', focus: 'original words' })).provider, 'custom');
  assert.equal((await router.read({ url })).provider, 'jina');
  assert.equal(router.configuration.routes.read, 'jina');
  assert.deepEqual((await calls(logs.firecrawl))[0].args, { url, formats: ['markdown'], objective: 'Read the requested page.' });
  assert.deepEqual((await calls(logs.custom))[0].args, { url, question: 'original words', topk: 3, chunk_size: 250 });
  assert.equal((await calls(logs.jina)).length, 2);
});
for (const state of ['missing', 'disabled', 'key', 'operation', 'focus']) test('explicit Reader diagnoses before business and never falls back: ' + state, async t => {
  const { router, logs } = await setup(t, config => {
    config.routes = { read: 'jina', readFallback: ['custom'] };
    if (state === 'missing') delete config.providers.firecrawl;
    if (state === 'disabled') config.providers.firecrawl.enabled = false;
    if (state === 'key') config.providers.firecrawl.connection.env.KEY = '${MISSING_READER_TEST_KEY}';
    if (state === 'operation') delete config.providers.firecrawl.read;
    return config;
  });
  const expected = { missing: 'NOT_CONFIGURED', disabled: 'DISABLED', key: 'MISSING_CREDENTIALS', operation: 'UNSUPPORTED_OPERATION', focus: 'FOCUS_UNSUPPORTED' }[state];
  await assert.rejects(router.read({ url, reader: 'firecrawl', ...(state === 'focus' ? { focus: 'fact' } : {}) }), error => error.code === expected && error.diagnostics.length === 1 && error.diagnostics[0].provider === 'firecrawl');
  assert.equal(router.clients.connections.size, 0);
  for (const path of Object.values(logs)) await assert.rejects(readFile(path), { code: 'ENOENT' });
});
test('explicit provider error is one request, never a second reader; no automatic authenticated-to-anonymous switch', async t => {
  const { router, logs } = await setup(t, config => { config.routes = { readFallback: ['custom'] }; config.providers.firecrawl.read.name = 'fail'; return config; });
  await assert.rejects(router.read({ url, reader: 'firecrawl' }), error => error.code === 'UPSTREAM_ERROR' && !JSON.stringify(error).includes('PRIVATE_KEY'));
  assert.equal((await calls(logs.firecrawl)).length, 1);
  for (const id of ['custom', 'jina']) await assert.rejects(readFile(logs[id]), { code: 'ENOENT' });
});
test('legacy custom default and configured fallback remain valid without silently ignoring focus', async t => {
  const { router, logs } = await setup(t, config => { config.routes = { read: 'custom', readFallback: ['jina'] }; delete config.providers.custom.read.arguments.question; return config; });
  const result = await router.read({ url, focus: 'fact' });
  assert.equal(result.provider, 'jina'); assert.ok(result.warnings.some(warning => warning.provider === 'custom' && warning.code === 'FOCUS_UNSUPPORTED'));
  await assert.rejects(readFile(logs.custom), { code: 'ENOENT' }); assert.equal((await calls(logs.jina)).length, 1);
  assert.equal((await router.read({ url })).provider, 'custom');
});
test('reader cancellation and shared output budget keep existing safety and never use another service', async t => {
  const { router, logs } = await setup(t, config => { config.providers.firecrawl.read.name = 'slow'; return config; });
  const controller = new AbortController(), pending = router.read({ url, reader: 'firecrawl' }, { signal: controller.signal });
  setTimeout(() => controller.abort(), 350); await assert.rejects(pending, { code: 'ABORTED' });
  await assert.rejects(readFile(logs.jina), { code: 'ENOENT' });
  const clipped = await setup(t, config => { config.maxOutputChars = 2000; config.providers.firecrawl.connection.env.MOCK_READ_CONTENT = JSON.stringify('```python\n    return "中😀"\n```\n'.repeat(80)); return config; });
  const result = await clipped.router.read({ url, reader: 'firecrawl' });
  assert.equal(result.truncated, true); assert.ok(JSON.stringify(result).length <= 2000); assert.equal(result.sources[0].url, url);
  assert.equal((await calls(clipped.logs.firecrawl)).length, 1);
});
test('CLI forwards explicit reader and rejects obsolete/unsupported combinations before requests', async t => {
  const { config, logs, dir } = await setup(t);
  const path = join(dir, 'config.json'); await writeFile(path, JSON.stringify(config));
  const exec = args => promisify(execFile)(process.execPath, ['dist/cli.js', ...args], { env: { ...process.env, SIFTPATH_CONFIG: path }, timeout: 10000 });
  const result = await exec(['read', url, '--reader', 'firecrawl']); assert.equal(JSON.parse(result.stdout).provider, 'firecrawl');
  for (const args of [['read', url, '--reader', 'firecrawl', '--focus', 'fact'], ['read', url, '--mode', 'document'], ['search', 'fact', '--reader', 'jina']]) await assert.rejects(exec(args));
  assert.equal((await calls(logs.firecrawl)).length, 1);
});
test('existing files preserve routes, legacy implicit primaries and credentials without migration writes', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'siftpath-four-config-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'config.json'); assert.equal((await readConfiguration(path, {})).routes.search, 'tavily');
  const old = { version: 2, credentials: { FIRECRAWL_API_KEY: 'fixture-saved-key' }, providers: { firecrawl: {
    connection: { transport: 'stdio', command: 'npx', args: ['-y', 'firecrawl-mcp@3.33.4'], env: { FIRECRAWL_API_KEY: '${FIRECRAWL_API_KEY}' } },
    read: { name: 'firecrawl_scrape', arguments: { url: '$url', formats: ['markdown'] } },
  } } };
  await writeFile(path, JSON.stringify(old)); const text = await readFile(path, 'utf8');
  const config = await readConfiguration(path, {});
  assert.equal(config.routes.search, 'brave'); assert.deepEqual(config.routes.searchFallback, []);
  assert.equal(config.credentials.FIRECRAWL_API_KEY, old.credentials.FIRECRAWL_API_KEY);
  assert.equal(config.providers.firecrawl.connection.transport, 'stdio'); assert.equal(await readFile(path, 'utf8'), text);
  old.routes = { search: 'custom', read: 'custom', defaultIntent: 'research', intents: { general: 'custom', semantic: 'custom', research: 'custom' }, searchFallback: ['brave'], readFallback: ['firecrawl'] };
  await writeFile(path, JSON.stringify(old)); assert.deepEqual((await readConfiguration(path, {})).routes, old.routes);
});
test('Firecrawl hosted preset sends Bearer only in headers and exact native Markdown/objective arguments', async t => {
  const preset = providerPresets.firecrawl;
  assert.equal(preset.connection.url, 'https://mcp.firecrawl.dev/v2/mcp');
  assert.deepEqual(preset.connection.headers, { Authorization: 'Bearer ${FIRECRAWL_API_KEY}' });
  const upstream = new Server({ name: 'firecrawl-contract-fixture', version: '1' }, { capabilities: { tools: {} } });
  const expected = { url, formats: ['markdown'], onlyMainContent: true, objective: 'Read the supplied public webpage as Markdown.' };
  let calls = 0; const body = '```python\ndef f():\n    return 1\n```\n| Value | Meaning |\n| 0 | off |';
  upstream.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [{ name: 'firecrawl_scrape', inputSchema: { type: 'object' } }] }));
  upstream.setRequestHandler(CallToolRequestSchema, async request => {
    assert.equal(request.params.name, 'firecrawl_scrape'); assert.deepEqual(request.params.arguments, expected); calls++;
    const data = { markdown: body, metadata: { sourceURL: url } };
    return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
  });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), enableJsonResponse: true }); await upstream.connect(transport);
  const requests = []; const http = createServer((req, res) => {
    requests.push({ path: req.url, auth: req.headers.authorization });
    if (req.headers.authorization !== 'Bearer fixture-firecrawl-key') { res.writeHead(401).end(); return; }
    void transport.handleRequest(req, res).catch(() => res.destroy());
  });
  http.listen(0, '127.0.0.1'); await once(http, 'listening');
  t.after(async () => { await upstream.close(); http.closeAllConnections(); await new Promise(resolve => http.close(resolve)); });
  const router = new Siftpath({ providers: { firecrawl: { ...preset, connection: { ...preset.connection, url: `http://127.0.0.1:${http.address().port}/mcp` } } } }, { FIRECRAWL_API_KEY: 'fixture-firecrawl-key' }); t.after(() => router.close());
  const result = await router.read({ url, reader: 'firecrawl' });
  assert.equal(calls, 1); assert.equal(JSON.parse(result.content).markdown, body); assert.equal(result.truncated, false);
  assert.ok(requests.every(request => request.path === '/mcp' && request.auth === 'Bearer fixture-firecrawl-key'));
  assert.ok(!JSON.stringify(result).includes('fixture-firecrawl-key'));
});

test('native focus capability and argument mapping support nested custom bindings without forwarding reader', async t => {
  const { router, logs } = await setup(t, config => {
    config.providers.custom.read.arguments = { url: '$url', queryOptions: { prompt: '$focus' }, formats: ['query'] };
    return config;
  });
  await router.read({ url, reader: 'custom', focus: 'exact conditions' });
  assert.deepEqual((await calls(logs.custom))[0].args, { url, queryOptions: { prompt: 'exact conditions' }, formats: ['query'] });
  await assert.rejects(readFile(logs.jina), { code: 'ENOENT' });
});

test('a focus-named key or embedded text is not a native focus mapping', async t => {
  for (const args of [{ url: '$url', '$focus': 'not-a-mapping' }, { url: '$url', question: 'prefix $focus' }]) {
    const { router, logs } = await setup(t, config => { config.providers.custom.read.arguments = args; return config; });
    await assert.rejects(router.read({ url, reader: 'custom', focus: 'fact' }), { code: 'FOCUS_UNSUPPORTED' });
    assert.equal(router.clients.connections.size, 0);
    await assert.rejects(readFile(logs.custom), { code: 'ENOENT' });
  }
});

test('existing minimal v2 files keep the old enabled set as well as the old primary', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'siftpath-minimal-v2-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'config.json');
  for (const saved of [{ version: 2 }, { version: 2, credentials: { BRAVE_API_KEY: 'fixture-brave-key' } }]) {
    const text = JSON.stringify(saved); await writeFile(path, text);
    const config = await readConfiguration(path, { BRAVE_API_KEY: 'fixture-env-key' });
    assert.equal(config.routes.search, 'brave');
    assert.deepEqual(Object.entries(config.providers).filter(([, provider]) => provider.enabled).map(([id]) => id).sort(), ['brave', 'exa', 'jina']);
    assert.equal(providerStatus('brave', config, {}).code, 'READY');
    assert.equal(await readFile(path, 'utf8'), text);
  }
});
