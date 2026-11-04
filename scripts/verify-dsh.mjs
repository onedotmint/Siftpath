#!/usr/bin/env node
/** Verify built core/DSH tarballs in an isolated consumer; no inference or provider traffic. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { packReports } from './lib/pack-report.mjs';
import { auditFindings, auditGate } from './lib/audit-gate.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const adapter = join(root, 'packages/dsh-siftpath');
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Run with npm run verify:dsh. Build the core first.');
const temp = await mkdtemp(join(tmpdir(), 'siftpath-dsh-'));
const env = Object.fromEntries(['PATH', 'SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT', 'WINDIR'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
Object.assign(env, { HOME: temp, USERPROFILE: temp, XDG_CONFIG_HOME: temp, npm_config_userconfig: join(temp, 'npmrc') });
// npm's content cache is shared, never the user's npmrc or account credentials.
const cache = execFileSync(process.execPath, [npmCli, 'config', 'get', 'cache'], { encoding: 'utf8' }).trim();
env.npm_config_cache = cache;
const run = (command, args, cwd, overrides = {}) => {
  try { return execFileSync(command, args, { cwd, env: { ...env, ...overrides }, encoding: 'utf8', timeout: 300000 }); }
  catch (error) {
    process.stdout.write(error.stdout ?? '');
    process.stderr.write(error.stderr ?? '');
    throw new Error(`DSH verification command failed (exit ${error.status ?? 'unknown'}).`);
  }
};
const npm = (cwd, args) => run(process.execPath, [npmCli, ...args], cwd);

try {
  run(process.execPath, [join(adapter, 'build.mjs')], root);
  const corePack = packReports(npm(root, ['pack', '--ignore-scripts', '--json', '--pack-destination', temp]));
  const bundlePack = packReports(npm(adapter, ['pack', '--ignore-scripts', '--json', '--pack-destination', temp]));
  const files = bundlePack.files.map(file => file.path);
  for (const file of ['lib/index.js', 'lib/config.js', 'lib/runtime.js', 'lib/client.js', 'cordis.patch.yml', 'README.md', 'LICENSE']) assert.ok(files.includes(file), `Missing bundle artifact: ${file}`);
  assert.ok(!files.some(file => /^(src|tests|node_modules)\//.test(file)), 'Ship artifacts, not source/test trees.');
  const consumer = join(temp, 'profiles', 'verify');
  await mkdir(consumer, { recursive: true });
  await writeFile(join(consumer, 'package.json'), JSON.stringify({ name: 'siftpath-dsh-consumer-check', private: true, type: 'module',
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@onedotmint/dsh-siftpath'] } } }));
  // Explicit test-only modules avoid relying on npm's transitive hoisting or stale dist tags.
  npm(consumer, ['install', '--ignore-scripts', '--no-audit', '--no-fund',
    join(temp, corePack.filename), join(temp, bundlePack.filename), '@deepseek-ai/dsh@0.2.1-rc.5',
    '@deepseek-ai/dsh-system-prompt@0.2.1-rc.5', '@deepseek-ai/dsh-scope@0.2.1-rc.5',
    '@deepseek-ai/dsh-client-ui-primitives@0.2.1-rc.5', '@deepseek-ai/dsh-client-store@0.2.1-rc.5',
    'clsx@2.1.1', 'zustand@4.5.7', 'immer@10.1.1', 'esbuild@0.28.2', 'react@18.3.1', 'react-dom@18.3.1', 'react-test-renderer@18.3.1']);
  const installed = join(consumer, 'node_modules/@onedotmint/dsh-siftpath');
  const pkg = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
  assert.equal(pkg.engines.dsh, '0.2.1-rc.5');
  assert.equal(pkg.dependencies['@onedotmint/siftpath'], corePack.version);
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml');
  const patch = await readFile(join(installed, 'cordis.patch.yml'), 'utf8');
  assert.match(patch, /id: siftpath/);
  assert.match(patch, /name: ['"]?@onedotmint\/dsh-siftpath/);
  assert.doesNotMatch(patch, /searchProvider|fetchProvider|preset-standard|tool-web/);

  const attempts = join(temp, 'network-attempts');
  const guard = join(temp, 'no-network.mjs');
  await writeFile(guard, `import {appendFileSync} from 'node:fs';\nglobalThis.fetch = async () => { appendFileSync(${JSON.stringify(attempts)}, 'blocked\\n'); throw new Error('Provider/network calls are disabled in DSH verification.'); };\n`);
  await cp(join(adapter, 'tests'), join(installed, 'tests'), { recursive: true });
  const dump = run(process.execPath, [join(consumer, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), '--profile', 'verify', '--dump-config'], consumer,
    { DSH_HOME: temp, NODE_OPTIONS: `--import=${pathToFileURL(guard).href}` });
  assert.match(dump, /@onedotmint\/dsh-siftpath/);
  assert.match(dump, /id: siftpath/);
  console.log('Pinned DSH CLI composed the installed native bundle without booting an agent.');
  const tests = (await readdir(join(installed, 'tests'))).filter(file => file.endsWith('.test.mjs')).sort().map(file => join(installed, 'tests', file));
  assert.ok(tests.length, 'No adapter tests found.');
  const output = run(process.execPath, ['--test', ...tests], installed, { NODE_OPTIONS: `--import=${pathToFileURL(guard).href}` });
  process.stdout.write(output);
  assert.equal(await readFile(attempts, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; }), '', 'Verification attempted a network call.');
  let auditOutput;
  try { auditOutput = execFileSync(process.execPath, [npmCli, 'audit', '--omit=dev', '--json'], { cwd: consumer, env, encoding: 'utf8', timeout: 120000 }); }
  catch (error) { if (error.status !== 1 || !error.stdout) throw error; auditOutput = error.stdout; }
  const audit = JSON.parse(auditOutput);
  const gate = auditGate(audit);
  // Print root advisories, not hundreds of repeated propagation entries in the host graph.
  console.log(JSON.stringify({ verificationConsumerAudit: gate.counts,
    findings: auditFindings(audit).filter(finding => finding.advisories.length) }));
  assert.equal(gate.blocked, false, 'Pinned DSH/adapter verification consumer has a High/Critical dependency finding.');
  console.log(JSON.stringify({ ok: true, core: corePack.version, adapter: pkg.version, dsh: pkg.engines.dsh, bundleFiles: files.length, isolatedTarballInstall: true, nativeProfileComposition: true, verificationConsumerAudit: audit.metadata.vulnerabilities, providerBusinessCalls: 0, modelPrompts: 0 }));
} finally {
  await rm(temp, { recursive: true, force: true });
}
