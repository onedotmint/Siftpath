import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { WebRuntime } from '@deepseek-ai/dsh-web';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import { bindScopeParent } from '@deepseek-ai/dsh-scope';
import { updateVolatile } from '@deepseek-ai/cosmokit';
import adapter, { Config, consumer, SiftpathRuntime } from '../lib/index.js';
import { coreConfiguration, defaultSettings, validateSettings, fields } from '../lib/config.js';

const evidence = { provider: 'jina', tool: 'read_url', retrievedAt: '2026-01-01T00:00:00Z', content: 'untrusted evidence', sources: [{ url: 'https://example.com', title: 'Example' }], truncated: true, sourcesTruncated: false, warnings: [{ code: 'UNTRUSTED_WEB_CONTENT' }] };
const settings = () => structuredClone(defaultSettings);
const signal = () => new AbortController().signal;
const tick = () => new Promise(resolve => setImmediate(resolve));
async function harness(Router) {
  const ctx = new Context();
  let value = settings(), key = 'first-key', pending, failingRef;
  const lookups = [];
  ctx.provide('credentials', { resolve: async ref => { lookups.push(ref); if (ref === failingRef) throw new Error('credential backend failure'); return pending ? pending : key ? { value: key, source: 'test' } : undefined; } });
  const fiber = ctx.plugin({ inject: ['credentials'], apply(c) { new SiftpathRuntime(c, { settings: { get: () => value } }, Router); } });
  await fiber.await();
  return { ctx, fiber, lookups, failRef: ref => { failingRef = ref; }, set: next => { value = next; }, rotate: next => { key = next; }, wait: promise => { pending = promise; } };
}

test('references-only native configuration reuses core presets and rejects unsafe/unsupported edits', () => {
  assert.ok(Config({}).settings.get());
  assert.ok(Config['~standard'].validate({ credentials: { API_KEY: 'raw-secret' } }).issues);
  assert.ok(Config['~standard'].validate({ settings: { Authorization: 'Bearer raw-secret' } }).issues);
  const wireSchema = new Schema(JSON.parse(JSON.stringify(Config)));
  assert.ok(wireSchema({ settings: settings() }).settings.get());
  assert.ok(!JSON.stringify(Config).includes('callback'));
  for (const patch of [{ tavilyCredentialRef: 'Bearer raw-key' }, { searchProvider: 'jina' }, { readProvider: 'deepseek' }, { exaEnabled: false }, { maxOutputChars: 1 }, { timeoutMs: 100.5 }]) assert.throws(() => validateSettings({ ...settings(), ...patch }));
  const config = coreConfiguration(settings());
  assert.deepEqual(config.credentials, {});
  assert.deepEqual(config.routes.searchFallback, []);
  assert.deepEqual(config.routes.readFallback, []);
  assert.equal(config.providers.deepseek, undefined);
  assert.ok(fields.some(f => f.field === 'deepseekCredentialRef'));
  assert.ok(JSON.stringify(Config).includes('credential-ref'));
});

test('real Cordis web/tools register once, inherit into scopes, preserve evidence, forward signals, and dispose', async () => {
  const ctx = new Context();
  const calls = [];
  const prompt = ctx.plugin(SystemPrompt); await prompt.await();
  const tools = ctx.plugin(ToolRuntime); await tools.await();
  const web = ctx.plugin(WebRuntime, { searchProvider: 'existing-provider' }); await web.await();
  ctx.provide('siftpath', { available: () => true, invoke: async (...args) => { calls.push(args); return evidence; } });
  const fiber = ctx.plugin(consumer); await fiber.await();
  assert.equal(ctx.get('web').config.searchProvider.get(), 'existing-provider');
  await assert.rejects(ctx.get('web').search({ query: 'not silently selected' }), { code: 'WEB_PROVIDER_CONFIGURED_MISSING' });
  const selected = ctx.get('web').searchProviders.get('siftpath');
  const abort = signal();
  const searched = await selected.search({ query: 'query', maxResults: 3 }, abort);
  assert.deepEqual(JSON.parse(searched.content), evidence);
  assert.deepEqual(searched.sources, evidence.sources);
  assert.equal(searched.truncated, false);
  assert.equal(calls[0][0], 'search'); assert.equal(calls[0][2], abort);
  const parent = {}, child = {}; bindScopeParent(child, parent);
  assert.ok(ctx.get('tools').get('siftpath_read', parent));
  assert.ok(ctx.get('tools').get('siftpath_read', child));
  assert.equal(ctx.get('tools').get('web_read'), undefined);
  const result = await ctx.get('tools').execute({ callId: 'read-1', name: 'siftpath_read', arguments: { url: 'https://example.com', reader: 'jina', focus: 'API conditions' }, signal: abort });
  assert.equal(result.isError, false);
  assert.deepEqual(result.value, evidence);
  assert.deepEqual(JSON.parse(result.content[0].text), evidence);
  assert.deepEqual(calls[1].slice(0, 2), ['read', { url: 'https://example.com', reader: 'jina', focus: 'API conditions' }]);
  assert.ok(calls[1][2] instanceof AbortSignal);
  await fiber.dispose();
  assert.equal(ctx.get('tools').get('siftpath_read'), undefined);
  assert.equal(ctx.get('web').searchProviders.has('siftpath'), false);
  await web.dispose(); await tools.dispose(); await prompt.dispose();
});

test('runtime resolves credentials per call, ignores ambient core keys, and retires snapshots gracefully', async () => {
  const routers = [];
  let finish;
  class Router {
    constructor(config, env) { this.config = config; this.env = env; routers.push(this); }
    async read(args, options) { this.args = args; this.signal = options.signal; if (args.focus === 'hold') return new Promise(resolve => { finish = () => resolve(evidence); }); return evidence; }
    async close() { this.closed = true; }
  }
  const h = await harness(Router);
  const runtime = h.ctx.get('siftpath');
  const first = runtime.invoke('read', { url: 'https://example.com', focus: 'hold' }, signal());
  while (!finish) await tick();
  h.rotate('rotated-key');
  await runtime.invoke('read', { url: 'https://example.com' }, signal());
  assert.equal(routers.length, 2);
  assert.equal(routers[0].closed, undefined);
  assert.equal(routers[0].config.credentials.JINA_API_KEY, 'first-key');
  assert.equal(routers[1].config.credentials.JINA_API_KEY, 'rotated-key');
  assert.deepEqual(routers[1].env, {});
  finish(); await first;
  assert.equal(routers[0].closed, true);
  const next = settings(); next.maxOutputChars = 12000; h.set(next);
  await runtime.invoke('read', { url: 'https://example.com' });
  assert.equal(routers[1].closed, true);
  await h.fiber.dispose();
  assert.ok(routers.every(r => r.closed));
});

test('unload closes active retired routers and cancellation drains late credential rejection', async () => {
  const routers = [];
  class Router { constructor() { routers.push(this); } async read(_args, { signal }) { return new Promise(resolve => signal.addEventListener('abort', () => resolve(evidence), { once: true })); } async close() { this.closed = true; } }
  const h = await harness(Router), runtime = h.ctx.get('siftpath');
  const first = runtime.invoke('read', { url: 'https://example.com' }); await tick();
  h.rotate('changed'); const second = runtime.invoke('read', { url: 'https://example.com' }); await tick();
  const done = Promise.allSettled([first, second]);
  await h.fiber.dispose(); await done;
  assert.ok(routers.every(r => r.closed));
  const waiting = await harness(Router);
  let reject;
  waiting.wait(new Promise((_resolve, no) => { reject = no; }));
  const abort = new AbortController();
  const operation = waiting.ctx.get('siftpath').invoke('read', { url: 'https://example.com' }, abort.signal);
  abort.abort(); await assert.rejects(operation, { code: 'ABORTED' });
  reject(new Error('raw-secret-upstream-error')); await tick();
  await waiting.fiber.dispose();
});

test('real core missing DSH credentials fail visibly before any network call', async () => {
  const h = await harness();
  h.rotate(undefined);
  await assert.rejects(h.ctx.get('siftpath').invoke('read', { url: 'https://example.com', reader: 'jina' }), error => {
    assert.equal(error.code, 'MISSING_CREDENTIALS');
    assert.match(error.message, /MISSING_CREDENTIALS/);
    return true;
  });
  await h.fiber.dispose();
});

test('runtime exposes only safe error data, never raw upstream failures', async () => {
  class Router { async read() { throw new Error('Authorization: raw-upstream-key'); } async close() {} }
  const h = await harness(Router);
  await assert.rejects(h.ctx.get('siftpath').invoke('read', { url: 'https://example.com' }), error => {
    assert.equal(error.code, 'INTERNAL_ERROR');
    assert.ok(!error.message.includes('raw-upstream-key'));
    return true;
  });
  await h.fiber.dispose();
});

test('host plugin mounts one shared runtime and volatile native updates retain registrations', async () => {
  const ctx = new Context();
  ctx.provide('credentials', { resolve: async () => undefined });
  const prompt = ctx.plugin(SystemPrompt); await prompt.await();
  const tools = ctx.plugin(ToolRuntime); await tools.await();
  const web = ctx.plugin(WebRuntime, { searchProvider: 'existing' }); await web.await();
  const fiber = ctx.plugin(adapter); await fiber.await(); await tick();
  const runtime = ctx.get('siftpath');
  const definition = ctx.get('tools').get('siftpath_read');
  assert.ok(runtime); assert.ok(definition);
  updateVolatile(fiber.config.settings, Config({ settings: { ...settings(), maxOutputChars: 12000 } }).settings);
  await tick();
  assert.equal(ctx.get('siftpath').shutdown, runtime.shutdown);
  assert.equal(ctx.get('tools').get('siftpath_read'), definition);
  assert.equal(runtime.config.settings.get().maxOutputChars, 12000);
  await fiber.dispose();
  assert.equal(ctx.get('siftpath'), undefined);
  assert.equal(ctx.get('tools').get('siftpath_read'), undefined);
  await web.dispose(); await tools.dispose(); await prompt.dispose();
});

test('availability is cheap route readiness and unrelated credentials/connections are isolated', async () => {
  const routers = [];
  class Router { constructor() { routers.push(this); } async read() { return evidence; } async search() { return evidence; } async close() { this.closed = true; } }
  const h = await harness(Router), runtime = h.ctx.get('siftpath');
  assert.equal(runtime.available(), true); assert.deepEqual(h.lookups, []);
  h.failRef('EXA_API_KEY');
  await runtime.invoke('read', { url: 'https://example.com' });
  assert.deepEqual(h.lookups, ['JINA_API_KEY']);
  await runtime.invoke('search', { query: 'test', intent: 'general' });
  assert.deepEqual(h.lookups, ['JINA_API_KEY', 'TAVILY_API_KEY']);
  await runtime.invoke('read', { url: 'https://example.com' });
  assert.equal(routers.length, 2); assert.ok(routers.every(r => !r.closed));
  const next = settings(); next.searchProvider = 'unconfigured'; next.generalProvider = ''; next.semanticProvider = ''; next.researchProvider = ''; h.set(next);
  assert.equal(runtime.available(), false);
  next.defaultIntent = 'semantic'; next.semanticProvider = 'exa'; h.set(next); assert.equal(runtime.available(), true);
  await h.fiber.dispose();
});

test('native reader registry preserves real core FOCUS_UNSUPPORTED without fetching or falling back', async () => {
  const h = await harness();
  const prompt = h.ctx.plugin(SystemPrompt); await prompt.await();
  const tools = h.ctx.plugin(ToolRuntime); await tools.await();
  const web = h.ctx.plugin(WebRuntime); await web.await();
  const native = h.ctx.plugin(consumer); await native.await();
  const originalFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async () => { fetches++; throw new Error('No network call is allowed in this test.'); };
  try {
    const result = await h.ctx.get('tools').execute({
      callId: 'explicit-firecrawl-focus', name: 'siftpath_read',
      arguments: { url: 'https://example.com/reference', reader: 'firecrawl', focus: 'return conditions' },
      signal: signal(),
    });
    assert.equal(result.isError, true);
    assert.equal(result.error.info.code, 'FOCUS_UNSUPPORTED');
    assert.equal(JSON.parse(result.error.message).code, 'FOCUS_UNSUPPORTED');
    assert.equal(result.value, undefined);
    const serialized = JSON.stringify(result);
    assert.match(serialized, /FOCUS_UNSUPPORTED/);
    assert.ok(!serialized.includes('first-key'));
    assert.deepEqual(h.lookups, ['FIRECRAWL_API_KEY']);
    assert.equal(fetches, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await native.dispose(); await web.dispose(); await tools.dispose(); await prompt.dispose(); await h.fiber.dispose();
  }
});

test('actual host schema boundary rejects unsafe configuration without echoing credentials', () => {
  const secret = 'private-secret-must-not-appear';
  const invalid = [
    { credentials: { API_KEY: secret } },
    { Authorization: `Bearer ${secret}` },
    { settings: { credentials: { API_KEY: secret } } },
    { settings: { Authorization: `Bearer ${secret}` } },
    { settings: { jinaCredentialRef: `Bearer ${secret}` } },
    { settings: { timeoutMs: 99 } },
    { settings: { timeoutMs: 100.5 } },
    { settings: { providerTimeoutMs: 120001 } },
    { settings: { maxOutputChars: 50001 } },
  ];
  for (const value of invalid) {
    const result = Config['~standard'].validate(value);
    assert.ok(result.issues, 'Host Standard Schema boundary must reject this configuration.');
    assert.ok(!JSON.stringify(result.issues).includes(secret));
  }
});

test('real fiber rejects unsafe updates before replacing runtime or accepted configuration', async () => {
  const ctx = new Context();
  ctx.provide('credentials', { resolve: async () => undefined });
  const prompt = ctx.plugin(SystemPrompt); await prompt.await();
  const tools = ctx.plugin(ToolRuntime); await tools.await();
  const web = ctx.plugin(WebRuntime); await web.await();
  const fiber = ctx.plugin(adapter); await fiber.await(); await tick();
  const runtime = ctx.get('siftpath'), accepted = fiber.config, definition = ctx.get('tools').get('siftpath_read');
  const secret = 'unsafe-update-secret-must-not-appear';
  try {
    for (const value of [
      { credentials: { API_KEY: secret } },
      { settings: { Authorization: `Bearer ${secret}` } },
      { settings: { jinaCredentialRef: `Bearer ${secret}` } },
      { settings: { timeoutMs: 1 } },
    ]) {
      assert.throws(() => fiber.update(value), error => {
        assert.ok(!String(error).includes(secret));
        return /invalid config/i.test(String(error));
      });
      await tick();
      assert.equal(fiber.config, accepted);
      assert.equal(ctx.get('siftpath').shutdown, runtime.shutdown);
      assert.equal(ctx.get('tools').get('siftpath_read'), definition);
      assert.deepEqual(runtime.config.settings.get(), defaultSettings);
    }
  } finally { await fiber.dispose(); await web.dispose(); await tools.dispose(); await prompt.dispose(); }
});

test('published Schemastery rehydrates the serialized native schema without callbacks or module closures', () => {
  // rc5's supported wire constructor is new Schema(serialized), not Config.fromJSON().
  const serialized = JSON.parse(JSON.stringify(Config));
  assert.ok(!JSON.stringify(serialized).includes('callback'));
  const rehydrated = new Schema(serialized);
  const direct = rehydrated({ settings: settings() });
  assert.deepEqual(direct.settings.get(), defaultSettings);
  const standard = rehydrated['~standard'].validate({ settings: settings() });
  assert.equal(standard.issues, undefined);
  assert.deepEqual(standard.value.settings.get(), defaultSettings);
});
