import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { configPath, readConfiguration, siftpathEnv } from '../dist/config.js';
import { packageVersion } from '../dist/version.js';
import { McpSession } from '../dist/mcp/session.js';
import { EvidenceEngine } from '../dist/index.js';

async function directory(t) {
  const root = await mkdtemp(join(tmpdir(), 'siftpath-migration-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}
async function save(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value));
}

test('Siftpath environment names override legacy aliases, including an explicit empty value', () => {
  for (const name of ['CONFIG', 'SERVER_TOKEN', 'ALLOWED_HOSTS', 'ALLOWED_ORIGINS', 'LIVE']) {
    const legacy = { [`SMARTSEARCH_${name}`]: 'old' };
    assert.equal(siftpathEnv(name, legacy), 'old');
    assert.equal(siftpathEnv(name, { ...legacy, [`SIFTPATH_${name}`]: 'new' }), 'new');
    assert.equal(siftpathEnv(name, { ...legacy, [`SIFTPATH_${name}`]: '' }), '');
  }
  assert.equal(configPath({ SIFTPATH_CONFIG: '/new/config.json', SMARTSEARCH_CONFIG: '/old/config.json' }), '/new/config.json');
  assert.equal(configPath({ SMARTSEARCH_CONFIG: '/old/config.json' }), '/old/config.json');
});

test('new users use the Siftpath directory; existing legacy credentials are reused without copying', async t => {
  const root = await directory(t), env = { XDG_CONFIG_HOME: root };
  const current = join(root, 'siftpath', 'config.json'), legacy = join(root, 'smartsearch', 'config.json');
  assert.equal(configPath(env), current);
  await save(legacy, { version: 1, credentials: { EXA_API_KEY: 'legacy-placeholder' } });
  assert.equal(configPath(env), legacy);
  assert.equal((await readConfiguration(configPath(env), env)).credentials.EXA_API_KEY, 'legacy-placeholder');
  await save(current, { version: 1, credentials: { EXA_API_KEY: 'current-placeholder' } });
  assert.equal(configPath(env), current);
  assert.equal((await readConfiguration(configPath(env), env)).credentials.EXA_API_KEY, 'current-placeholder');
  assert.equal(JSON.parse(await readFile(legacy, 'utf8')).credentials.EXA_API_KEY, 'legacy-placeholder');
});

test('an invalid new configuration does not silently fall back to legacy credentials', async t => {
  const root = await directory(t), env = { XDG_CONFIG_HOME: root };
  const current = join(root, 'siftpath', 'config.json');
  await save(join(root, 'smartsearch', 'config.json'), { version: 1 });
  await save(current, { unexpected: true });
  assert.equal(configPath(env), current);
  await assert.rejects(readConfiguration(current, env), { code: 'INVALID_CONFIG' });
});

test('package, CLI and MCP versions agree; old executable names remain aliases', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.name, '@onedotmint/siftpath');
  assert.equal(packageVersion, pkg.version);
  for (const name of ['siftpath', 'smartsearch', 'smart-search']) assert.equal(pkg.bin[name], 'dist/cli.js');
  const cli = spawnSync(process.execPath, ['dist/cli.js', '--version'], { encoding: 'utf8' });
  assert.equal(cli.status, 0); assert.equal(cli.stdout.trim(), pkg.version);
  const session = new McpSession(new EvidenceEngine({ providers: { search: [], fetch: [] } }));
  const response = await session.dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } });
  assert.deepEqual(response.result.serverInfo, { name: 'siftpath', version: pkg.version });
  session.close();
});
