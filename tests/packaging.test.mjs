import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { gradeInvocations } from '../scripts/eval-invocations.mjs';
import { toolDefinitions } from '../dist/tools.js';
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const json = async path => JSON.parse(await read(path));

test('all generated integration skills match the single canonical skill', async () => {
  const source = await read('skills/web-research/SKILL.md');
  for (const client of ['codex', 'cursor', 'claude-code', 'deepseek-harness'])
    assert.equal(await read(`integrations/${client}/skills/web-research/SKILL.md`), source);
  for (const tool of toolDefinitions) assert.ok(source.includes(tool.name));
  assert.match(source, /coverage=good/); assert.match(source, /untrusted/); assert.match(source, /1\+1/);
});
test('plugin manifests and transports use real packaged paths and no embedded credentials', async () => {
  const pkg = await json('package.json');
  const entries = [['codex','plugin.json','mcp.json'],['cursor','.cursor-plugin/plugin.json','mcp.json'],['claude-code','.claude-plugin/plugin.json','.mcp.json']];
  for (const [client, manifest, transport] of entries) {
    const metadata = await json(`integrations/${client}/${manifest}`);
    assert.equal(metadata.name, 'siftpath'); assert.equal(metadata.version, pkg.version);
    const mcp = await json(`integrations/${client}/${transport}`);
    const server = mcp.mcpServers.siftpath;
    assert.equal(server.command, 'siftpath'); assert.deepEqual(server.args, ['mcp']);
    assert.equal(server.env, undefined);
    if (client === 'codex') {
      assert.equal(metadata.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
      assert.equal(mcp.$schema, 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json'); assert.equal(server.type, 'stdio');
    }
  }
  assert.ok((await readdir(new URL('../integrations/pi/', import.meta.url))).includes('index.ts'));
});
test('invocation evaluator reports both mistakes and incomplete host coverage', async () => {
  const result = await gradeInvocations([{ id: 'fresh', actualTool: 'web_search' }, { id: 'math', actualTool: 'web_gather' }]);
  assert.equal(result.accuracy, 0.5); assert.equal(result.scenarioCoverage, 2 / 7);
  assert.equal((await gradeInvocations([])).accuracy, null);
  assert.equal((await gradeInvocations([{ id: 'url', actualTool: 'mcp__siftpath__web_fetch' }])).accuracy, 1);
  assert.equal((await gradeInvocations([{ id: 'url', actualTool: 'mcp__smartsearch__web_fetch' }])).accuracy, 1);
  await assert.rejects(gradeInvocations([{ id: 'invented', actualTool: null }]));
  await assert.rejects(gradeInvocations([{ id: 'math', actualTool: null }, { id: 'math', actualTool: null }]));
});
test('core remains vendor-independent and integrations contain no provider requests', async () => {
  for (const path of await readdir(new URL('../src/core/', import.meta.url))) {
    const content = await read(`src/core/${path}`);
    assert.doesNotMatch(content, /api\.(exa|parallel|tavily|firecrawl|jina)\.|providers\/(exa|brave|tavily|cloudflare)/i, path);
  }
  for (const path of ['src/integrations/pi.ts', 'src/mcp/session.ts', 'src/cli.ts'])
    assert.doesNotMatch(await read(path), /https:\/\/api\./, path);
});
test('portable lockfile does not capture container symlinks', async () => {
  const lock = await json('package-lock.json'), metadata = await json('package.json');
  assert.equal(lock.name, metadata.name); assert.equal(lock.version, metadata.version);
  assert.equal(lock.packages[''].name, metadata.name); assert.equal(lock.packages[''].version, metadata.version);
  assert.deepEqual(lock.packages[''].bin, metadata.bin);
  for (const [path, pkg] of Object.entries(lock.packages)) if (path) {
    assert.equal(pkg.link, undefined); assert.ok(pkg.resolved.startsWith('https://registry.npmjs.org/'));
    assert.match(pkg.integrity, /^sha512-/);
    assert.ok(/^\d+\.\d+\.\d+$/.test(pkg.version));
  }
});
