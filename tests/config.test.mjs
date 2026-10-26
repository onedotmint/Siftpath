import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, symlink, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configPath, readConfiguration, parseConfiguration, writePrivateJson, diagnostics, resolveSecret, configurationMaxBytes } from '../dist/config.js';

test('private config writes atomically with private permissions, rejects symlinks and malformed JSON', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'siftpath-private-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'config.json');
  await writePrivateJson(path, { version: 2, credentials: { BRAVE_API_KEY: 'saved-test-key' } });
  if (process.platform !== 'win32') assert.equal((await stat(path)).mode & 0o777, 0o600);
  const c = await readConfiguration(path, { BRAVE_API_KEY: 'env-test-key' });
  assert.equal(resolveSecret('${BRAVE_API_KEY}', c, { BRAVE_API_KEY: 'env-test-key' }), 'env-test-key');
  const report = JSON.stringify(diagnostics(c, {}));
  assert.ok(!report.includes('saved-test-key') && !report.includes('env-test-key'));
  const link = join(dir, 'link.json');
  try { await symlink(path, link); }
  catch (error) { if (process.platform === 'win32' && error.code === 'EPERM') { t.diagnostic('Windows symlink permission unavailable; remaining checks still run.'); } else throw error; }
  if (await stat(link).catch(() => false)) {
    await assert.rejects(writePrivateJson(link, {}), { code: 'UNSAFE_CONFIG_PATH' });
    await assert.rejects(readConfiguration(link), { code: 'INVALID_CONFIG' });
  }
  await writePrivateJson(path, { version: 2, providerTypo: true });
  await assert.rejects(readConfiguration(path), { code: 'INVALID_CONFIG' });
});
test('legacy v1 credentials/disabled flags are read without moving files or retaining old engine options', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'siftpath-legacy-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const env = { XDG_CONFIG_HOME: dir };
  assert.equal(configPath(env), join(dir, 'siftpath', 'config.json'));
  const legacy = join(dir, 'smartsearch', 'config.json');
  await writePrivateJson(legacy, { version: 1, credentials: { EXA_API_KEY: 'legacy-test' }, disabled: ['brave'], jinaModel: 'old-reranker' });
  assert.equal(configPath(env), legacy);
  const c = await readConfiguration(legacy, {});
  assert.equal(c.version, 2); assert.equal(c.credentials.EXA_API_KEY, 'legacy-test'); assert.equal(c.providers.brave.enabled, false);
  assert.equal(c.providers.tavily.enabled, false); assert.equal(c.providers.firecrawl.enabled, false);
  assert.equal(c.jinaModel, undefined); assert.equal(JSON.parse(await readFile(legacy, 'utf8')).version, 1);
  assert.equal(configPath({ ...env, SIFTPATH_CONFIG: '/explicit/new', SMARTSEARCH_CONFIG: '/old' }), '/explicit/new');
});
test('provider-specific credentials are skipped independently and config values are not echoed on error', () => {
  const c = parseConfiguration({});
  const statuses = diagnostics(c, {}).providers;
  assert.equal(statuses.find(s => s.provider === 'brave').code, 'DISABLED');
  assert.equal(statuses.find(s => s.provider === 'tavily').code, 'MISSING_CREDENTIALS');
  assert.equal(statuses.find(s => s.provider === 'firecrawl').code, 'MISSING_CREDENTIALS');
  assert.equal(statuses.find(s => s.provider === 'exa').code, 'MISSING_CREDENTIALS');
  assert.equal(statuses.find(s => s.provider === 'jina').code, 'MISSING_CREDENTIALS');
  assert.throws(() => parseConfiguration({ credentials: { BRAVE_API_KEY: 'SECRET\nvalue' } }), error => !error.message.includes('SECRET'));
});

test('omitted, empty and partial routes share the same defaults without changing explicit fallback order', () => {
  const defaults = parseConfiguration({}).routes;
  assert.deepEqual(parseConfiguration({ routes: {} }).routes, defaults);
  assert.deepEqual(parseConfiguration({ routes: { read: 'jina' } }).routes, defaults);
  assert.deepEqual(parseConfiguration({ routes: { defaultIntent: 'research' } }).routes.searchFallback, defaults.searchFallback);
  assert.deepEqual(parseConfiguration({ routes: { searchFallback: ['exa', 'brave'] } }).routes.searchFallback, ['exa', 'brave']);
});

test('bounded private config save rejects expanded JSON before touching the original file', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'siftpath-config-size-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'config.json');
  const config = parseConfiguration({ providers: { custom: { connection: { transport: 'http', url: 'https://custom.example/mcp' },
    search: { name: 'search', arguments: { domains: Array(4000).fill('a.co') } } } } });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path, JSON.stringify(config));
  assert.ok((await stat(path)).size < configurationMaxBytes);
  assert.ok(Buffer.byteLength(JSON.stringify(config, null, 2) + '\n') > configurationMaxBytes);
  const before = await readFile(path, 'utf8'); await readConfiguration(path, {});
  await assert.rejects(writePrivateJson(path, config, configurationMaxBytes), { code: 'CONFIG_TOO_LARGE' });
  assert.equal(await readFile(path, 'utf8'), before); await readConfiguration(path, {});
});


test('old official Jina bindings upgrade narrowly in memory without changing private files', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'siftpath-jina-upgrade-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'config.json');
  for (const headers of [{}, { Authorization: 'Bearer ${JINA_API_KEY}' }]) {
    const old = { version: 2, credentials: { JINA_API_KEY: 'saved-jina-test' }, providers: { jina: {
      enabled: false, timeoutMs: 45000, connection: { transport: 'http', url: 'https://mcp.jina.ai/v1', headers },
      read: { name: 'read_url', arguments: { question: '$focus', url: '$url' } },
    } }, routes: { read: 'jina', readFallback: [] } };
    await writePrivateJson(path, old); const before = await readFile(path, 'utf8');
    const config = await readConfiguration(path, {});
    assert.deepEqual(config.providers.jina.read.arguments, { url: '$url', question: '$focus', topk: 3, chunk_size: 250 });
    assert.equal(config.providers.jina.enabled, false); assert.equal(config.providers.jina.timeoutMs, 45000);
    assert.deepEqual(config.providers.jina.connection, old.providers.jina.connection);
    assert.deepEqual(config.credentials, old.credentials); assert.deepEqual(config.routes.readFallback, []);
    assert.equal(await readFile(path, 'utf8'), before); assert.deepEqual(JSON.parse(before), old);
    assert.deepEqual(parseConfiguration(config), config);
  }
});
test('custom Jina endpoints, headers, bindings, IDs and explicit snippet choices are never migrated', () => {
  const original = { connection: { transport: 'http', url: 'https://mcp.jina.ai/v1', headers: {} },
    read: { name: 'read_url', arguments: { url: '$url', question: '$focus' } } };
  const cases = [
    { ...original, connection: { ...original.connection, url: 'https://custom.example/mcp' } },
    { ...original, connection: { ...original.connection, headers: { 'X-Custom': 'keep' } } },
    { ...original, read: { ...original.read, name: 'custom_read' } },
    ...[{ topk: 1, chunk_size: 100 }, { topk: 4 }, { chunk_size: 160 }, { withAllLinks: true }].map(extra =>
      ({ ...original, read: { ...original.read, arguments: { ...original.read.arguments, ...extra } } })),
    { ...original, search: { name: 'custom', arguments: {} } },
  ];
  for (const candidate of cases) {
    const before = structuredClone(candidate);
    assert.deepEqual(parseConfiguration({ providers: { jina: candidate } }).providers.jina.read, candidate.read);
    assert.deepEqual(candidate, before);
  }
  assert.deepEqual(parseConfiguration({ providers: { custom: original } }).providers.custom.read, original.read);
});
test('new Jina defaults use the expanded window for authenticated and anonymous presets', async () => {
  const { providerPresets, anonymousPresets } = await import('../dist/defaults.js');
  const expected = { url: '$url', question: '$focus', topk: 3, chunk_size: 250 };
  assert.deepEqual(parseConfiguration({}).providers.jina.read.arguments, expected);
  assert.deepEqual(providerPresets.jina.read.arguments, expected);
  assert.deepEqual(anonymousPresets.jina.read.arguments, expected);
});
