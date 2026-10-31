#!/usr/bin/env node
/** Verify the tarball two ways: locked production tree, then a real consumer install. Never invokes a provider or model. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { packReports } from './lib/pack-report.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Run with npm run verify:package.');
const cache = execFileSync(process.execPath, [npmCli, 'config', 'get', 'cache'], { encoding: 'utf8' }).trim();
const dir = await mkdtemp(join(tmpdir(), 'siftpath-package-'));
// Allowlist, not process.env spread: no private keys, proxy settings, NODE_OPTIONS or Pi config.
const cleanEnv = overrides => Object.assign(
  Object.fromEntries(['PATH', 'SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT', 'WINDIR']
    .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]])), overrides);
const isolated = home => cleanEnv({
  HOME: home, USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home,
  XDG_CONFIG_HOME: home, XDG_CACHE_HOME: home, XDG_DATA_HOME: home, TMPDIR: home, TMP: home, TEMP: home,
  SIFTPATH_CONFIG: join(home, 'config.json'), npm_config_userconfig: join(home, 'npmrc'),
  // The shared content-addressed cache holds no credentials; --offline needs it warm.
  npm_config_cache: cache,
});
const networkBlock = `--import=${JSON.stringify(pathToFileURL(join(root, 'tests/fixtures/pi-loading-extension.mjs')).href)}`;
const npm = (home, cwd, args, extra) => execFileSync(process.execPath, [npmCli, ...args],
  { cwd, encoding: 'utf8', timeout: 300000, env: Object.assign(isolated(home), extra) });
const head = (() => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch { return 'unknown'; } })();

try {
  const packed = packReports(npm(dir, root, ['pack', '--ignore-scripts', '--json', '--pack-destination', dir]));
  assert.ok(packed.files.some(file => file.path === 'dist/cli.js'), 'Build before verifying the tarball.');
  assert.ok(!packed.files.some(file => /^(?:tests|src|node_modules)\//.test(file.path) || /^docs\/.*\.json$/.test(file.path)));
  for (const name of ['TESTING', 'MODEL-EXPERIENCE', 'SELECTIVE-READING']) assert.ok(!packed.files.some(file => file.path === `docs/${name}.md`));
  const tarball = join(dir, packed.filename);
  execFileSync('tar', ['-xzf', tarball, '-C', dir], { timeout: 15000 });
  const pkg = JSON.parse(await readFile(join(dir, 'package/package.json'), 'utf8'));

  /* Phase 1 — the repository lockfile still reproduces the audited production tree. */
  const installed = join(dir, 'package');
  // The lock is verification input, not a workspace dependency or an npm-shipped file.
  await writeFile(join(installed, 'package-lock.json'), await readFile(join(root, 'package-lock.json')));
  npm(dir, installed, ['ci', '--omit=dev', '--ignore-scripts', '--offline', '--no-audit', '--no-fund']);
  for (const dependency of ['typescript', 'esbuild', '@clack/prompts', '@earendil-works/pi-tui']) {
    await assert.rejects(access(join(installed, 'node_modules', dependency)), { code: 'ENOENT' });
  }
  const env = Object.assign(isolated(dir), { SIFTPATH_PI_LOADING_REPORT: join(dir, 'network-block.json'), NODE_OPTIONS: networkBlock });
  const cli = (...args) => execFileSync(process.execPath, [join(installed, 'dist/cli.js'), ...args], { cwd: installed, env, encoding: 'utf8', timeout: 15000 });
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
    cwd: dir, env: cleanEnv({ ...isolated(dir), SIFTPATH_PI_PACKAGE_DIR: installed,
      ...(process.env.SIFTPATH_PI_BIN ? { SIFTPATH_PI_BIN: process.env.SIFTPATH_PI_BIN } : {}) }),
    stdio: 'inherit', timeout: 120000,
  });

  /* Phase 2 — a real consumer: no repository lockfile, a plain npm install of the tarball. */
  const consumer = join(dir, 'consumer');
  const consumerEnv = Object.assign(isolated(consumer), { SIFTPATH_PI_LOADING_REPORT: join(consumer, 'network-block.json'), NODE_OPTIONS: networkBlock });
  const consumerNpm = (...args) => npm(consumer, consumer, args, { NODE_OPTIONS: '' });
  await mkdir(consumer);
  consumerNpm('init', '--yes');
  // No repository lockfile is copied: npm resolves the registry ranges a published consumer would use.
  consumerNpm('install', '--omit=dev', '--no-audit', '--no-fund', tarball);
  const consumerModules = (...names) => Promise.all(names.map(name => access(join(consumer, 'node_modules', ...name.split('/')))
    .then(() => name, () => null)));
  const present = await consumerModules('@modelcontextprotocol/sdk', 'zod', 'typescript', 'esbuild', '@clack/prompts', '@earendil-works/pi-tui');
  assert.deepEqual(present.filter(Boolean), ['@modelcontextprotocol/sdk', 'zod'], 'Consumers get both runtime dependencies and no development or Pi host packages.');
  const shipped = join(consumer, 'node_modules/@onedotmint/siftpath');
  const consumerPkg = JSON.parse(await readFile(join(shipped, 'package.json'), 'utf8'));
  assert.equal(consumerPkg.version, pkg.version);
  for (const path of ['dist/cli.js', 'dist/index.js', 'extensions/siftpath.mjs']) await access(join(shipped, path));
  for (const path of ['src', 'tests', 'package-lock.json']) {
    await assert.rejects(access(join(shipped, path)), { code: 'ENOENT' }, `Tarball must not ship ${path}.`);
  }
  const win = process.platform === 'win32';
  const bin = (...args) => execFileSync(join(consumer, 'node_modules/.bin', win ? 'siftpath.cmd' : 'siftpath'), args,
    { cwd: consumer, env: consumerEnv, encoding: 'utf8', timeout: 20000, shell: win });
  assert.equal(bin('--version').trim(), consumerPkg.version);
  const help = bin('--help');
  for (const flag of ['--reader', '--focus', '--intent', 'doctor', 'status', 'mcp']) assert.match(help, new RegExp(flag), `Help must advertise ${flag}.`);
  assert.equal(JSON.parse(bin('doctor')).networkChecked, false);
  assert.equal(JSON.parse(bin('status', '--json')).version, consumerPkg.version);
  // Offline stdio MCP server: initialize + tools/list only, no business call.
  const frames = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'consumer', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
  ].map(frame => JSON.stringify(frame)).join('\n') + '\n';
  const mcpOut = execFileSync(join(consumer, 'node_modules/.bin', win ? 'siftpath.cmd' : 'siftpath'), ['mcp'],
    { cwd: consumer, env: consumerEnv, input: frames, encoding: 'utf8', timeout: 20000, shell: win });
  const replies = mcpOut.split('\n').filter(Boolean).map(line => JSON.parse(line));
  assert.equal(replies[0].result.serverInfo.name, 'siftpath');
  const tools = replies.find(reply => reply.id === 2).result.tools;
  assert.deepEqual(tools.map(tool => tool.name), ['web_search', 'web_read']);
  assert.deepEqual(Object.keys(tools[1].inputSchema.properties).sort(), ['focus', 'reader', 'url']);
  assert.equal(tools[1].inputSchema.properties.reader.type, 'string');
  assert.equal(tools[1].inputSchema.properties.reader.enum, undefined, 'Reader must accept configured provider IDs.');
  assert.equal(tools[0].inputSchema.properties.intent.enum.join(','), 'general,semantic,research');
  // ESM resolution from a consumer package, not from a workspace path.
  await writeFile(join(consumer, 'consumer.mjs'), `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Siftpath, parseConfiguration, toolDefinitions } from '@onedotmint/siftpath';
const require = createRequire(import.meta.url);
assert.ok(require.resolve('@modelcontextprotocol/sdk/client/index.js').startsWith(process.cwd() + require('node:path').sep + 'node_modules'), 'SDK must resolve inside the consumer tree.');
assert.deepEqual(toolDefinitions.map(t => t.name), ['web_search', 'web_read']);
const router = new Siftpath(parseConfiguration({ providers: {} }), {});
assert.equal(typeof router.close, 'function');
await router.close();
console.log('consumer-esm-ok');
`);
  assert.match(execFileSync(process.execPath, [join(consumer, 'consumer.mjs')], { cwd: consumer, env: consumerEnv, encoding: 'utf8', timeout: 15000 }), /consumer-esm-ok/);
  // Same Pi RPC registration test, now against the consumer's own installation.
  execFileSync(process.execPath, ['--test', join(root, 'tests/pi-loading.test.mjs')], {
    cwd: consumer, env: cleanEnv({ ...isolated(consumer), SIFTPATH_PI_PACKAGE_DIR: shipped,
      ...(process.env.SIFTPATH_PI_BIN ? { SIFTPATH_PI_BIN: process.env.SIFTPATH_PI_BIN } : {}) }),
    stdio: 'inherit', timeout: 120000,
  });
  // Report what a consumer actually resolves; the production audit gate lives in CI and verify:audit.
  const tree = JSON.parse(consumerNpm('ls', '--omit=dev', '--all', '--json'));
  // --parseable lists each installed package once; the tree repeats a package under every parent.
  const installedPaths = consumerNpm('ls', '--omit=dev', '--all', '--parseable').split('\n').filter(Boolean)
    .filter(path => path.startsWith(join(consumer, 'node_modules')));
  const entries = [];
  const walk = node => {
    for (const [name, dependency] of Object.entries(node.dependencies ?? {})) {
      // A versionless entry is an optional peer or optional dependency npm chose not to install.
      if (dependency.version) entries.push({ name, version: dependency.version });
      walk(dependency);
    }
  };
  walk(tree);
  assert.ok(!entries.some(entry => entry.name === '@earendil-works/pi-tui'), 'The Pi TUI host stays an unmet optional peer for consumers.');
  assert.equal(entries.find(entry => entry.name === 'zod')?.version, consumerPkg.dependencies.zod.replace(/^[^\d]*/, ''), 'A consumer resolves zod inside the declared range.');
  const audit = JSON.parse(consumerNpm('audit', '--omit=dev', '--json'));
  assert.equal(audit.metadata.vulnerabilities.high, 0, 'A consumer install must not resolve a high-severity vulnerability.');
  assert.equal(audit.metadata.vulnerabilities.critical, 0);
  const install = {
    node: process.version,
    npm: execFileSync(process.execPath, [npmCli, '--version'], { encoding: 'utf8' }).trim(),
    consumerLockfile: await stat(join(consumer, 'package-lock.json')).then(() => 'consumer-resolved', () => 'absent'),
    productionPackages: installedPaths.length,
    installedBytes: await dirSize(join(consumer, 'node_modules')),
    mcpSdk: tree.dependencies['@onedotmint/siftpath']?.dependencies?.['@modelcontextprotocol/sdk']?.version,
    zod: entries.find(entry => entry.name === 'zod')?.version,
    bodyParser: entries.find(entry => entry.name === 'body-parser')?.version,
    piTuiInstalled: false,
    vulnerabilities: audit.metadata.vulnerabilities,
    tarballIntegrity: packed.integrity,
    tarballShasum: packed.shasum,
    commit: head,
  };
  await writeFile(join(dir, 'consumer-install.json'), JSON.stringify(install, null, 2));
  console.log(JSON.stringify({ ok: true, package: pkg.name, version: pkg.version,
    tarballFiles: packed.files.length, unpackedBytes: packed.unpackedSize, productionOnly: true,
    providerBusinessCalls: 0, modelPrompts: 0, consumer: install }));
} finally { await rm(dir, { recursive: true, force: true }); }

async function dirSize(directory) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) total += await dirSize(path);
    else if (entry.isFile()) total += (await stat(path)).size;
  }
  return total;
}
