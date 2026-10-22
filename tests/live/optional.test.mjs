import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseConfiguration } from '../../dist/config.js';
import { anonymousPresets, providerPresets } from '../../dist/defaults.js';
import { providerTest } from '../../dist/diagnostics.js';

for (const id of ['tavily', 'firecrawl']) test(`LIVE official ${id}: configured MCP search/read (no fallback)`,
  { skip: process.env.SIFTPATH_OPTIONAL_LIVE !== '1' ? 'Set SIFTPATH_OPTIONAL_LIVE=1 for one real request per optional provider.' : false, timeout: 90000 }, async t => {
    const keyName = id.toUpperCase() + '_API_KEY', key = process.env[keyName];
    const provider = key ? providerPresets[id] : anonymousPresets[id];
    const config = parseConfiguration({ providers: { [id]: provider }, timeoutMs: 80000, providerTimeoutMs: 60000 });
    // Official stdio packages may auto-load .env: isolate cwd rather than silently borrowing unrelated credentials.
    const dir = await mkdtemp(join(tmpdir(), 'siftpath-optional-live-')), previous = process.cwd();
    process.chdir(dir);
    try {
      const result = await providerTest(id, config, key ? { [keyName]: key } : {});
      assert.equal(result.outcome, 'passed', JSON.stringify(result));
      assert.deepEqual(result.stages, { connection: 'passed', discovery: 'passed', request: 'passed' });
      t.diagnostic(JSON.stringify({ provider: id, credential: key ? 'account' : 'anonymous', ...result }));
    } finally { process.chdir(previous); await rm(dir, { recursive: true, force: true }); }
  });
