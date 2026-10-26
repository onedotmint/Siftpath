import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Siftpath } from '../dist/index.js';

async function upstream(t, onCall, { onGet, onDelete, onInitialize } = {}) {
  let initializations = 0;
  const server = createServer(async (req, res) => {
    if (req.method === 'GET') { if (onGet) await onGet(req, res); else res.writeHead(405).end(); return; }
    if (req.method === 'DELETE') { if (onDelete) await onDelete(req, res); else res.writeHead(204).end(); return; }
    let body = ''; for await (const chunk of req) body += chunk;
    const message = JSON.parse(body);
    const reply = result => { res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': `session-${initializations}` }); res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result })); };
    if (message.method === 'initialize') {
      initializations++;
      if (onInitialize) await onInitialize({ req, res, message, reply });
      else reply({ protocolVersion: '2025-11-25', serverInfo: { name: 'http-reliability-fixture', version: '1' }, capabilities: { tools: {} } }); return;
    }
    if (message.method.startsWith('notifications/')) { res.writeHead(202).end(); return; }
    if (message.method === 'tools/call') { await onCall({ req, res, message, reply }); return; }
    res.writeHead(400).end();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const config = { providers: { remote: { connection: { transport: 'http', url: `http://127.0.0.1:${server.address().port}/mcp` },
    search: { name: 'search', arguments: { q: '$query' } } } },
    routes: { search: 'remote', read: 'remote', intents: {}, searchFallback: [] }, providerTimeoutMs: 2000 };
  return { config, initializations: () => initializations };
}
async function eventually(check, message) {
  const deadline = Date.now() + 5000;
  while (!await check()) {
    assert.ok(Date.now() < deadline, message);
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}

for (const mode of ['cancel', 'total timeout']) test(`HTTP stalled initialize is stopped on ${mode}`, async t => {
  let started, disconnected = false;
  const ready = new Promise(resolve => started = resolve);
  const u = await upstream(t, () => assert.fail('Unexpected tool call'), { onInitialize: ({ res }) => {
    res.on('close', () => disconnected = true); started();
  } });
  const r = new Siftpath({ ...u.config, providerTimeoutMs: 10000, timeoutMs: mode === 'cancel' ? 10000 : 500 }, {});
  t.after(() => r.close());
  const controller = new AbortController();
  const work = assert.rejects(r.search({ query: 'initialize' }, { signal: controller.signal }),
    error => mode === 'cancel' ? error.code === 'ABORTED' : error.code === 'TIMEOUT');
  await ready;
  if (mode === 'cancel') controller.abort();
  await work;
  assert.equal(r.clients.connections.size, 0);
  await eventually(() => disconnected, 'Initialize HTTP request remained open');
  assert.equal(u.initializations(), 1);
});

test('one cancelled initialization waiter does not cancel another, and ready connections are reused', async t => {
  let started, release;
  const ready = new Promise(resolve => started = resolve), gate = new Promise(resolve => release = resolve);
  let disconnected = false;
  const u = await upstream(t, ({ reply }) => reply(result), { onInitialize: async ({ res, reply }) => {
    res.on('close', () => disconnected = true); started(); await gate;
    reply({ protocolVersion: '2025-11-25', serverInfo: { name: 'fixture', version: '1' }, capabilities: { tools: {} } });
  } });
  const r = new Siftpath(u.config, {}); t.after(() => r.close());
  const controller = new AbortController();
  const first = assert.rejects(r.search({ query: 'cancel' }, { signal: controller.signal }), { code: 'ABORTED' });
  await ready;
  const second = r.search({ query: 'keep' });
  controller.abort(); await first;
  assert.equal(disconnected, false);
  release(); assert.equal((await second).provider, 'remote');
  assert.equal((await r.search({ query: 'reuse' })).provider, 'remote');
  assert.equal(u.initializations(), 1);
});

test('stdio stalled initialize child exits when its last waiter cancels', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'siftpath-initialize-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const marker = join(directory, 'pid');
  const r = new Siftpath({ providers: { local: { connection: { transport: 'stdio', command: process.execPath,
    args: [fileURLToPath(new URL('./fixtures/initialization-mcp.mjs', import.meta.url)), marker], env: {} },
    search: { name: 'search', arguments: { q: '$query' } } } },
    routes: { search: 'local', read: 'local', intents: {}, searchFallback: [] }, providerTimeoutMs: 10000 }, {});
  t.after(() => r.close());
  const controller = new AbortController();
  const work = assert.rejects(r.search({ query: 'stall' }, { signal: controller.signal }), { code: 'ABORTED' });
  let pid;
  await eventually(async () => { try { pid = Number(await readFile(marker, 'utf8')); return !!pid; } catch { return false; } }, 'Child did not initialize');
  controller.abort(); await work;
  assert.equal(r.clients.connections.size, 0);
  await eventually(() => { try { process.kill(pid, 0); return false; } catch (error) { if (error.code === 'ESRCH') return true; throw error; } }, 'Initialization child remained alive');
});

const result = { content: [{ type: 'text', text: 'Original result https://example.com' }] };

test('HTTP expired session is discarded so the next operation reconnects', async t => {
  let expired = false;
  const u = await upstream(t, ({ res, reply }) => {
    if (expired) { expired = false; res.writeHead(404).end('expired private session details'); return; }
    reply(result);
  });
  const r = new Siftpath(u.config, {}); t.after(() => r.close());
  await r.search({ query: 'first' }); expired = true;
  await assert.rejects(r.search({ query: 'expired' }), { code: 'NO_PROVIDER_SUCCEEDED' });
  assert.equal((await r.search({ query: 'reconnected' })).provider, 'remote');
  assert.equal(u.initializations(), 2);
});
test('HTTP cancellation aborts a stalled response body while a concurrent call still succeeds', async t => {
  let disconnected;
  const closed = new Promise(resolve => disconnected = resolve);
  const u = await upstream(t, ({ res, message, reply }) => {
    if (message.params.arguments.q === 'stall') {
      res.on('close', disconnected);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write('{"jsonrpc":"2.0","result":'); return;
    }
    reply(result);
  });
  const r = new Siftpath(u.config, {}); t.after(() => r.close());
  await r.search({ query: 'warm connection' });
  const controller = new AbortController();
  const aborted = assert.rejects(r.search({ query: 'stall' }, { signal: controller.signal }), { code: 'ABORTED' });
  const success = r.search({ query: 'concurrent fast call' });
  const timer = setTimeout(() => controller.abort(), 100); t.after(() => clearTimeout(timer));
  assert.equal((await success).provider, 'remote'); await aborted;
  await Promise.race([closed, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Underlying HTTP response was not cancelled')), 2000); timer.unref(); })]);
});
test('HTTP attempt timeout aborts the actual response, not just router waiting', async t => {
  let disconnected;
  const closed = new Promise(resolve => disconnected = resolve);
  const u = await upstream(t, ({ res }) => {
    res.on('close', disconnected); res.writeHead(200, { 'content-type': 'application/json' }); res.write('{');
  });
  const r = new Siftpath({ ...u.config, providerTimeoutMs: 500 }, {}); t.after(() => r.close());
  await assert.rejects(r.search({ query: 'stall' }), error => error.diagnostics[0].code === 'PROVIDER_TIMEOUT');
  await Promise.race([closed, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Timed out response remained open')), 2000); timer.unref(); })]);
});
test('HTTP upstream response size is bounded before normalization', async t => {
  const u = await upstream(t, ({ reply }) => reply({ content: [{ type: 'text', text: 'https://example.com ' + 'x'.repeat(5 * 1024 * 1024) }] }));
  const r = new Siftpath(u.config, {}); t.after(() => r.close());
  await assert.rejects(r.search({ query: 'large' }), { code: 'NO_PROVIDER_SUCCEEDED' });
});

test('SSE tool responses succeed, interrupted responses time out without replay, and the next call recovers', async t => {
  const calls = [];
  const u = await upstream(t, ({ res, message }) => {
    const query = message.params.arguments.q; calls.push(query);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    if (query.startsWith('interrupt')) {
      res.write('event: message\ndata: {');
      if (query === 'interrupt EOF') res.end(); else setImmediate(() => res.destroy());
      return;
    }
    res.end('event: message\ndata: ' + JSON.stringify({ jsonrpc: '2.0', id: message.id, result }) + '\n\n');
  });
  const r = new Siftpath({ ...u.config, providerTimeoutMs: 700 }, {}); t.after(() => r.close());
  assert.equal((await r.search({ query: 'first' })).provider, 'remote');
  for (const query of ['interrupt abrupt', 'interrupt EOF'])
    await assert.rejects(r.search({ query }), error => error.code === 'NO_PROVIDER_SUCCEEDED' && error.diagnostics[0].code === 'PROVIDER_TIMEOUT');
  assert.equal((await r.search({ query: 'next' })).provider, 'remote');
  assert.deepEqual(calls, ['first', 'interrupt abrupt', 'interrupt EOF', 'next']);
});
test('SSE cancellation closes the actual tool-response stream', async t => {
  let started, disconnected;
  const ready = new Promise(resolve => started = resolve), closed = new Promise(resolve => disconnected = resolve);
  const u = await upstream(t, ({ res }) => {
    res.on('close', disconnected); res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(': waiting\n\n'); started();
  });
  const r = new Siftpath(u.config, {}); t.after(() => r.close());
  const controller = new AbortController();
  const work = assert.rejects(r.search({ query: 'cancel SSE' }, { signal: controller.signal }), { code: 'ABORTED' });
  await ready; controller.abort(); await work;
  await Promise.race([closed, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('SSE response remained open after cancellation')), 2000); timer.unref(); })]);
});
test('notification SSE disconnect does not kill an active POST or replay completed calls', async t => {
  let notifications, opened; let getCount = 0;
  const ready = new Promise(resolve => opened = resolve), calls = [];
  const u = await upstream(t, async ({ message, reply }) => {
    const query = message.params.arguments.q; calls.push(query);
    if (query === 'drop notifications') { await ready; notifications.destroy(); await new Promise(resolve => setTimeout(resolve, 25)); }
    reply(result);
  }, { onGet: (_req, res) => { getCount++; notifications = res; res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write(': ready\n\n'); opened(); } });
  const r = new Siftpath(u.config, {}); t.after(() => r.close());
  await r.search({ query: 'warm' }); await ready;
  await r.search({ query: 'drop notifications' }); await r.search({ query: 'after drop' });
  assert.equal(getCount, 1); assert.equal(u.initializations(), 1);
  assert.deepEqual(calls, ['warm', 'drop notifications', 'after drop']);
});
test('concurrent close calls all wait for one bounded session teardown', async t => {
  let deleting, release; let deletes = 0;
  const started = new Promise(resolve => deleting = resolve), gate = new Promise(resolve => release = resolve);
  const u = await upstream(t, ({ reply }) => reply(result), { onDelete: async (_req, res) => { deletes++; deleting(); await gate; res.writeHead(204).end(); } });
  const r = new Siftpath(u.config, {}); t.after(() => r.close()); await r.search({ query: 'warm' });
  const first = r.close(); await started;
  let settled = false; const second = r.close().then(() => settled = true);
  try { await new Promise(resolve => setTimeout(resolve, 30)); assert.equal(settled, false); }
  finally { release(); await Promise.all([first, second]); }
  assert.equal(deletes, 1); await r.close();
  await assert.rejects(r.search({ query: 'closed' }), { code: 'CLOSED' });
});

test('concurrent close stays bounded when the remote session DELETE never replies', async t => {
  let deleting; let deletes = 0;
  const started = new Promise(resolve => deleting = resolve);
  const u = await upstream(t, ({ reply }) => reply(result), { onDelete: () => { deletes++; deleting(); } });
  const r = new Siftpath(u.config, {}); t.after(() => r.close()); await r.search({ query: 'warm' });
  const at = performance.now(), first = r.close(); await started;
  await Promise.race([Promise.all([first, r.close()]), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('close exceeded bounded cleanup deadline')), 5000); timer.unref(); })]);
  assert.equal(deletes, 1); assert.ok(performance.now() - at >= 1900); assert.equal(r.clients.connections.size, 0);
});
