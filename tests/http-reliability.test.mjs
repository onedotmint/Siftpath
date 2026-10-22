import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { Siftpath } from '../dist/index.js';

async function upstream(t, onCall, { onGet, onDelete } = {}) {
  let initializations = 0;
  const server = createServer(async (req, res) => {
    if (req.method === 'GET') { if (onGet) await onGet(req, res); else res.writeHead(405).end(); return; }
    if (req.method === 'DELETE') { if (onDelete) await onDelete(req, res); else res.writeHead(204).end(); return; }
    let body = ''; for await (const chunk of req) body += chunk;
    const message = JSON.parse(body);
    const reply = result => { res.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': `session-${initializations}` }); res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result })); };
    if (message.method === 'initialize') {
      initializations++;
      reply({ protocolVersion: '2025-11-25', serverInfo: { name: 'http-reliability-fixture', version: '1' }, capabilities: { tools: {} } }); return;
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
