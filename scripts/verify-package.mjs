#!/usr/bin/env node
/** Verify the actual tarball with only locked production dependencies; never invoke a provider/model. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Run with npm run verify:package.');
const dir = await mkdtemp(join(tmpdir(), 'siftpath-package-'));
const runNpm = (args, cwd) => execFileSync(process.execPath, [npmCli, ...args], { cwd, encoding: 'utf8', timeout: 120000 });
try {
  const [pack] = JSON.parse(runNpm(['pack', '--ignore-scripts', '--json', '--pack-destination', dir], root));
  assert.ok(pack.files.some(file => file.path === 'dist/cli.js'), 'Build before verifying the tarball.');
  assert.ok(!pack.files.some(file => /^(?:tests|src|node_modules)\//.test(file.path) || /^docs\/.*\.json$/.test(file.path)));
  execFileSync('tar', ['-xzf', join(dir, pack.filename), '-C', dir], { timeout: 15000 });
  const installed = join(dir, 'package');
  // The lock is verification input, not a workspace dependency or an npm-shipped file.
  await writeFile(join(installed, 'package-lock.json'), await readFile(join(root, 'package-lock.json')));
  runNpm(['ci', '--omit=dev', '--ignore-scripts', '--offline', '--no-audit', '--no-fund'], installed);
  for (const dependency of ['typescript', 'esbuild', '@clack/prompts', '@earendil-works/pi-tui']) {
    await assert.rejects(access(join(installed, 'node_modules', dependency)), { code: 'ENOENT' });
  }
  const env = Object.fromEntries(['PATH', 'SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT', 'WINDIR']
    .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  Object.assign(env, {
    HOME: dir, USERPROFILE: dir, APPDATA: dir, LOCALAPPDATA: dir,
    XDG_CONFIG_HOME: dir, XDG_CACHE_HOME: dir, XDG_DATA_HOME: dir,
    SIFTPATH_CONFIG: join(dir, 'config.json'), SIFTPATH_PI_LOADING_REPORT: join(dir, 'network-block.json'),
    NODE_OPTIONS: '--import=' + JSON.stringify(pathToFileURL(join(root, 'tests/fixtures/pi-loading-extension.mjs')).href),
  });
  const cli = (...args) => execFileSync(process.execPath, [join(installed, 'dist/cli.js'), ...args], { cwd: installed, env, encoding: 'utf8', timeout: 15000 });
  const pkg = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
  assert.equal(cli('--version').trim(), pkg.version);
  assert.match(cli('--help'), /--reader/);
  cli('setup', '--non-interactive');
  assert.equal(JSON.parse(cli('doctor')).networkChecked, false);
  assert.equal(JSON.parse(cli('status', '--json')).version, pkg.version);
  // Self-import exercises the declared package export, not a workspace-relative module.
  await writeFile(join(installed, 'smoke.mjs'), `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Siftpath, parseConfiguration, toolDefinitions } from '@onedotmint/siftpath';
const require = createRequire(import.meta.url);
assert.ok(require.resolve('@modelcontextprotocol/sdk/client/index.js').startsWith(fileURLToPath(new URL('./node_modules/', import.meta.url))));
assert.deepEqual(toolDefinitions.map(t => t.name), ['web_search', 'web_read']);
assert.equal(toolDefinitions[1].inputSchema.properties.reader.type, 'string');
const router = new Siftpath(parseConfiguration({providers:{}}), {}); await router.close();
console.log('Isolated package export and production dependency resolution passed.');
`);
  execFileSync(process.execPath, [join(installed, 'smoke.mjs')], { cwd: installed, env, stdio: 'inherit', timeout: 15000 });
  // Reuse the genuine no-inference Pi RPC test against the installed package.
  execFileSync(process.execPath, ['--test', join(root, 'tests/pi-loading.test.mjs')], {
    cwd: dir, env: { ...env, NODE_OPTIONS: '', SIFTPATH_PI_PACKAGE_DIR: installed,
      ...(process.env.SIFTPATH_PI_BIN ? { SIFTPATH_PI_BIN: process.env.SIFTPATH_PI_BIN } : {}) },
    stdio: 'inherit', timeout: 60000,
  });
  console.log(JSON.stringify({ ok: true, package: pkg.name, version: pkg.version,
    tarballFiles: pack.files.length, unpackedBytes: pack.unpackedSize, productionOnly: true,
    providerBusinessCalls: 0, modelPrompts: 0 }));
} finally { await rm(dir, { recursive: true, force: true }); }
