import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Siftpath, parseConfiguration, readConfiguration } from '../../dist/index.js';

const enabled = process.env.SIFTPATH_LIVE === '1';
const anonymous = parseConfiguration(JSON.parse(await readFile(new URL('../../examples/anonymous.json', import.meta.url), 'utf8'))).providers;
// Opt-in only: each test makes one upstream tool call, which may consume account/free-tier quota.
for (const id of ['brave', 'exa', 'jina']) {
  const key = process.env[`${id.toUpperCase()}_API_KEY`];
  test(`LIVE official ${id}: ${id === 'jina' ? 'read' : 'search'} (${key ? 'account credential' : 'anonymous'})`,
    { skip: !enabled ? 'Set SIFTPATH_LIVE=1 to allow network/quota usage.' : id === 'brave' && !key ? 'BRAVE_API_KEY is absent; no real Brave search verified.' : false, timeout: 90000 }, async t => {
      const defaults = parseConfiguration({});
      const provider = key ? defaults.providers[id] : anonymous[id];
      const r = new Siftpath({ providers: { [id]: { ...provider, enabled: true } }, providerTimeoutMs: 60000, timeoutMs: 80000,
        routes: { search: id, read: id, intents: {}, searchFallback: [], readFallback: [] } });
      t.after(() => r.close());
      const result = id === 'jina' ? await r.read({ url: 'https://example.com', ...(key ? { focus: 'What is this domain for?' } : {}) })
        : await r.search({ query: 'Node.js official documentation', maxResults: 1 });
      assert.equal(result.provider, id); assert.ok(result.content.length > 20); assert.ok(result.sources.length);
      assert.ok(JSON.stringify(result).length <= r.configuration.maxOutputChars);
      if (id === 'jina') assert.match(result.content, /Example Domain|documentation examples/i);
      t.diagnostic(JSON.stringify({ verified: true, provider: id, tool: result.tool, credential: key ? 'account' : 'anonymous',
        sources: result.sources.map(s => s.url), outputChars: JSON.stringify(result).length, truncated: result.truncated }));
    });
}

test('LIVE configured Siftpath stdio: search + read through the two model-facing tools',
  { skip: !enabled || process.env.SIFTPATH_LIVE_STDIO !== '1' ? 'Additional two calls require SIFTPATH_LIVE_STDIO=1.' : false, timeout: 120000 }, async t => {
    const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
    const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
    const config = await readConfiguration();
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os'); const { join, resolve } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'siftpath-live-')); t.after(() => rm(dir, { recursive: true, force: true }));
    for (const id of ['exa', 'jina']) if (!process.env[`${id.toUpperCase()}_API_KEY`]) config.providers[id] = structuredClone(anonymous[id]);
    config.providerTimeoutMs = 45000; config.timeoutMs = 55000;
    const path = join(dir, 'config.json'); await writeFile(path, JSON.stringify(config), { mode: 0o600 });
    const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('dist/cli.js'), 'mcp'], env: { SIFTPATH_CONFIG: path }, stderr: 'pipe' });
    const client = new Client({ name: 'live-agent-protocol-check', version: '1' }); t.after(() => client.close());
    await client.connect(transport); assert.deepEqual((await client.listTools()).tools.map(x => x.name), ['web_search', 'web_read']);
    for (const params of [{ name: 'web_search', arguments: { query: 'Node.js documentation', intent: 'semantic', maxResults: 1 } },
      { name: 'web_read', arguments: { url: 'https://example.com' } }]) {
      const result = await client.callTool(params, undefined, { timeout: 60000 });
      assert.equal(result.isError, false, result.content[0].text);
      const value = JSON.parse(result.content[0].text); assert.ok(value.sources.length);
      t.diagnostic(JSON.stringify({ verified: true, entry: 'stdio', tool: params.name, upstream: value.provider, sources: value.sources.map(s => s.url) }));
    }
  });
