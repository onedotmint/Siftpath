import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'node:crypto';
import { Siftpath } from '../dist/index.js';
import { mockServer } from './fixtures/official-mcp.mjs';
const fixture = resolve('tests/fixtures/official-mcp.mjs');
const provider = { connection: { transport: 'stdio', command: process.execPath, args: [fixture, '--stdio'] },
  search: { name: 'search', arguments: { q: '$query', count: '$maxResults' } }, read: { name: 'read', arguments: { url: '$url', question: '$focus' } } };
const config = { providers: { brave: provider, jina: provider }, routes: { search: 'brave', read: 'jina', intents: {}, searchFallback: [] } };

test('remote Streamable HTTP connects with secret header and reuses a session', async t => {
  const upstream = mockServer(), transport = new StreamableHTTPServerTransport({ sessionIdGenerator: () => randomUUID(), enableJsonResponse: true });
  await upstream.connect(transport);
  const seen = [];
  const http = createServer((req, res) => {
    seen.push({ method: req.method, auth: req.headers.authorization, session: req.headers['mcp-session-id'], url: req.url });
    if (req.headers.authorization !== 'Bearer test-only') { res.writeHead(401).end(); return; }
    void transport.handleRequest(req, res).catch(() => res.destroy());
  });
  http.listen(0, '127.0.0.1'); await once(http, 'listening');
  t.after(async () => { await upstream.close(); http.closeAllConnections(); await new Promise(r => http.close(r)); });
  const url = `http://127.0.0.1:${http.address().port}/mcp`;
  const r = new Siftpath({ providers: { remote: { ...provider, connection: { transport: 'http', url, headers: { Authorization: 'Bearer ${REMOTE_KEY}' } } } },
    routes: { search: 'remote', read: 'remote', intents: {}, searchFallback: [] } }, { REMOTE_KEY: 'test-only' });
  t.after(() => r.close());
  assert.equal((await r.search({ query: 'x' })).provider, 'remote');
  assert.match((await r.read({ url: 'https://example.com', focus: 'native question' })).content, /native question/);
  assert.ok(seen.every(row => row.auth === 'Bearer test-only' && row.url === '/mcp'));
  assert.ok(seen.some(row => row.session));
  await r.close();
  assert.ok(seen.some(row => row.method === 'DELETE' && row.session));
});

test('real stdio MCP client sees only two tools and exercises search/read/errors end to end', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'siftpath-mcp-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'config.json'); await writeFile(path, JSON.stringify(config));
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('dist/cli.js'), 'mcp'], env: { SIFTPATH_CONFIG: path }, stderr: 'pipe' });
  let stderr = ''; transport.stderr.on('data', data => stderr += data);
  const client = new Client({ name: 'agent-test', version: '1' }); t.after(() => client.close());
  await client.connect(transport);
  const tools = (await client.listTools()).tools;
  assert.deepEqual(tools.map(tool => tool.name), ['web_search', 'web_read']);
  assert.ok(tools.every(tool => tool.inputSchema.additionalProperties === false));
  assert.ok(!JSON.stringify(tools).match(/apiKey|providerTimeout|baseUrl/));
  const search = await client.callTool({ name: 'web_search', arguments: { query: 'actual MCP protocol', maxResults: 1 } });
  assert.equal(search.isError, false); assert.equal(JSON.parse(search.content[0].text).provider, 'brave');
  assert.ok(JSON.parse(search.content[0].text).sources.length);
  const read = await client.callTool({ name: 'web_read', arguments: { url: 'https://example.com', focus: 'page title' } });
  assert.match(JSON.parse(read.content[0].text).content, /page title/);
  for (const params of [{ name: 'web_search', arguments: { query: '', apiKey: 'secret' } }, { name: 'web_read', arguments: { url: 'file:///etc/passwd' } }, { name: 'web_gather', arguments: { query: 'x' } }]) {
    const error = await client.callTool(params); assert.equal(error.isError, true);
    assert.ok(['INVALID_INPUT', 'UNKNOWN_TOOL'].includes(JSON.parse(error.content[0].text).code));
  }
  assert.equal(stderr, '');
  await client.close();
});

function cli(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['dist/cli.js', ...args], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', d => stdout += d); child.stderr.on('data', d => stderr += d);
    child.once('error', reject); child.once('exit', code => resolve({ code, stdout, stderr }));
  });
}
test('CLI search/read/doctor/help, noninteractive setup and private config work without a server process', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'siftpath-cli-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'config.json'), env = { SIFTPATH_CONFIG: path };
  assert.equal((await cli(['--help'], env)).code, 0);
  assert.equal((await cli(['setup', '--non-interactive'], env)).code, 0);
  assert.equal(JSON.parse(await readFile(path, 'utf8')).version, 2);
  await writeFile(path, JSON.stringify(config));
  const search = await cli(['search', 'hello', '--max-results', '1'], env);
  assert.equal(search.code, 0, search.stderr); assert.equal(JSON.parse(search.stdout).provider, 'brave');
  const read = await cli(['read', 'https://example.com', '--focus', 'Question'], env);
  assert.equal(read.code, 0, read.stderr); assert.match(JSON.parse(read.stdout).content, /Question/);
  assert.equal(JSON.parse((await cli(['doctor'], env)).stdout).networkChecked, false);
  assert.equal((await cli(['gather', 'removed'], env)).code, 1);
});

test('stdio EOF closes downstream children instead of leaving a background process', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'siftpath-eof-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'config.json'); await writeFile(path, JSON.stringify(config));
  const child = spawn(process.execPath, ['dist/cli.js', 'mcp'], { env: { ...process.env, SIFTPATH_CONFIG: path }, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  const exit = once(child, 'exit');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'EOF-test', version: '1' } } }) + '\n');
  await once(child.stdout, 'data');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'web_search', arguments: { query: 'x' } } }) + '\n');
  await once(child.stdout, 'data');
  child.stdin.end();
  const [code] = await exit; assert.equal(code, 0);
});

test('MCP tools/call cancellation reaches upstream and the stdio server remains usable', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'siftpath-cancel-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'config.json');
  const slow = { ...provider, search: { ...provider.search, name: 'slow' } };
  await writeFile(path, JSON.stringify({ ...config, providers: { brave: slow, jina: provider } }));
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('dist/cli.js'), 'mcp'], env: { SIFTPATH_CONFIG: path }, stderr: 'pipe' });
  const client = new Client({ name: 'cancellation-test', version: '1' }); t.after(() => client.close());
  await client.connect(transport);
  const controller = new AbortController();
  const work = assert.rejects(client.callTool({ name: 'web_search', arguments: { query: 'slow query' } }, undefined, { signal: controller.signal }));
  const timer = setTimeout(() => controller.abort(), 500); t.after(() => clearTimeout(timer));
  await work;
  assert.deepEqual((await client.listTools()).tools.map(tool => tool.name), ['web_search', 'web_read']);
  const read = await client.callTool({ name: 'web_read', arguments: { url: 'https://example.com' } });
  assert.equal(read.isError, false);
});

test('a saved configuration takes effect on the next call without restarting the MCP server', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'siftpath-reload-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'config.json'), log = join(dir, 'calls.jsonl');
  const logged = { ...provider, connection: { ...provider.connection, env: { MOCK_LOG: log } } };
  const routes = { search: 'brave', read: 'jina', intents: {}, searchFallback: [] };
  const write = value => writeFile(path, JSON.stringify(value));
  const settle = () => new Promise(resolve => setTimeout(resolve, 25));
  await write({ providers: { brave: logged, jina: provider }, routes });
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('dist/cli.js'), 'mcp'], env: { SIFTPATH_CONFIG: path }, stderr: 'pipe' });
  const client = new Client({ name: 'reload-test', version: '1' }); t.after(() => client.close());
  await client.connect(transport);
  assert.equal(JSON.parse((await client.callTool({ name: 'web_search', arguments: { query: 'one' } })).content[0].text).provider, 'brave');

  await settle(); // same-millisecond writes must not be confused with a reload
  await write({ providers: { brave: { ...logged, search: { name: 'read', arguments: { url: 'https://example.com', question: '$query' } } }, jina: provider }, routes });
  const rebound = await client.callTool({ name: 'web_search', arguments: { query: 'two' } });
  assert.match(JSON.parse(rebound.content[0].text).content, /Native reader text/);

  await settle();
  await write({ providers: { brave: { ...logged, enabled: false }, jina: provider }, routes });
  const disabled = await client.callTool({ name: 'web_search', arguments: { query: 'three' } });
  assert.equal(disabled.isError, true);
  assert.equal(JSON.parse(disabled.content[0].text).code, 'NO_PROVIDER_SUCCEEDED');

  await settle();
  await write({ version: 2, providerTypo: true });
  const broken = await client.callTool({ name: 'web_search', arguments: { query: 'four' } });
  assert.equal(JSON.parse(broken.content[0].text).code, 'INVALID_CONFIG');
  assert.match(JSON.parse(broken.content[0].text).hint, /configuration file/);

  await settle();
  await write({ providers: { brave: provider, jina: provider }, routes });
  const recovered = await client.callTool({ name: 'web_search', arguments: { query: 'five' } });
  assert.equal(recovered.isError, false);
  await client.close();
});
