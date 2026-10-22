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
  assert.equal(statuses.find(s => s.provider === 'brave').code, 'MISSING_CREDENTIALS');
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
