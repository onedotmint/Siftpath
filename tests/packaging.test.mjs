import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { parseConfiguration, toolDefinitions } from '../dist/index.js';

test('npm tarball includes only current runtime/docs/examples and resolves both exposed tools', async () => {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const output = execFileSync(npm, ['pack', '--dry-run', '--ignore-scripts', '--json'], { encoding: 'utf8', shell: process.platform === 'win32' });
  const pack = JSON.parse(output)[0], paths = pack.files.map(file => file.path);
  assert.ok(paths.includes('dist/cli.js')); assert.ok(paths.includes('dist/router.js'));
  assert.ok(paths.includes('extensions/siftpath.mjs')); assert.ok(paths.includes('dist/index.d.ts')); assert.ok(paths.includes('examples/anonymous.json'));
  assert.ok(!paths.some(path => /^(src|tests|node_modules|integrations|skills|benchmarks)\//.test(path)));
  assert.ok(!paths.some(path => path.startsWith('docs/') && path.endsWith('.json')), 'Historical raw reports stay in Git, not the runtime tarball.');
  assert.ok(paths.includes('docs/CONFIGURATION.md')); assert.ok(paths.includes('docs/SECURITY.md'));
  assert.ok(!paths.some(path => /engine|gather|core\/|providers\/|mcp\/http|session/.test(path)));
  assert.deepEqual(toolDefinitions.map(tool => tool.name), ['web_search', 'web_read']);
});
test('package version and dependency lock agree and no old compiled engine survives build', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8')), lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  const { packageVersion } = await import('../dist/version.js');
  assert.equal(packageVersion, pkg.version); assert.equal(lock.version, pkg.version);
  assert.deepEqual(lock.packages[''].bin, pkg.bin);
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['@modelcontextprotocol/sdk', 'zod']);
  assert.deepEqual(Object.keys(pkg.bin), ['siftpath']); assert.deepEqual(pkg.pi.extensions, ['./extensions/siftpath.mjs']);
  assert.ok(JSON.parse(await readFile('package.json', 'utf8')).files.includes('extensions'));
  assert.ok(!(await readdir('dist')).includes('core'));
});
test('the shipped anonymous example is a valid config and does not embed credentials', async () => {
  const raw = JSON.parse(await readFile('examples/anonymous.json', 'utf8'));
  const config = parseConfiguration(raw);
  assert.equal(config.providers.exa.connection.transport, 'http');
  assert.equal(config.providers.jina.connection.headers.Authorization, undefined);
  assert.equal(config.routes.search, 'tavily');
  assert.deepEqual(Object.keys(config.providers), ['tavily', 'exa', 'jina', 'firecrawl']);
  assert.deepEqual(config.routes.searchFallback, []); assert.deepEqual(config.routes.readFallback, []); assert.equal(config.routes.read, 'jina');
});

test('live probes use the shipped anonymous config rather than duplicating hosted provider mappings', async () => {
  const live = await readFile('tests/live/official.test.mjs', 'utf8');
  assert.ok(live.includes('../../examples/anonymous.json'));
  assert.ok(!live.includes('https://mcp.exa.ai') && !live.includes('web_search_exa'));
});

test('Clack is a build-only dependency and only the lazy setup module bundles its terminal code', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(pkg.devDependencies['@clack/prompts'], '1.8.1'); assert.equal(pkg.devDependencies.esbuild, '0.25.12');
  assert.equal(pkg.dependencies['@clack/prompts'], undefined); assert.equal(pkg.dependencies.esbuild, undefined);
  const setup = await readFile('dist/setup.js', 'utf8'), ui = await readFile('dist/setup-ui.js', 'utf8');
  assert.match(setup, /import\(['"]\.\/setup-ui\.js['"]\)/);
  assert.ok(ui.length < 200000); assert.ok(!/from ['"]@clack\//.test(ui));
  assert.ok((await readFile('dist/router.js', 'utf8')).includes('class Siftpath'));
  assert.ok(!(await readFile('dist/router.js', 'utf8')).includes('@clack'));
});

test('Pi terminal helpers come from the host, not standalone runtime dependencies', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8'));
  assert.equal(pkg.devDependencies['@earendil-works/pi-tui'], '1.4.0');
  assert.equal(pkg.peerDependenciesMeta['@earendil-works/pi-tui'].optional, true);
  assert.equal(pkg.dependencies['@earendil-works/pi-tui'], undefined);
});
