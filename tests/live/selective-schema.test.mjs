import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { McpClients } from '../../dist/client.js';
import { parseConfiguration } from '../../dist/config.js';
import { anonymousPresets } from '../../dist/defaults.js';
import { safeError } from '../../dist/errors.js';

// Discovery only: explicit opt-in, two anonymous endpoints, one tools/list each.
// No callTool, credentials, REST reader, automatic retry or business operation.
test('DISCOVERY selective reading: current Jina and Firecrawl hosted MCP schemas', {
  skip: process.env.SIFTPATH_SELECTIVE_SCHEMA !== '1', timeout: 55000,
}, async t => {
  const config = parseConfiguration({ providers: {
    jina: anonymousPresets.jina, firecrawl: { ...anonymousPresets.firecrawl, timeoutMs: 20000 },
  }, routes: { search: 'jina', read: 'jina', intents: {}, searchFallback: [], readFallback: [] } });
  const clients = new McpClients(config, {});
  const report = { capturedAt: new Date().toISOString(), access: 'anonymous', businessCalls: 0, results: [] };
  try {
    for (const [id, name] of [['jina', 'read_url'], ['firecrawl', 'firecrawl_scrape']]) {
      try {
        const page = await clients.listTools(id, AbortSignal.timeout(22000));
        const tool = page.tools.find(row => row.name === name);
        report.results.push({ provider: id, endpoint: config.providers[id].connection.url,
          completeToolList: !page.nextCursor, toolNames: page.tools.map(row => row.name), tool: tool ?? null });
        t.diagnostic(id + ': ' + Object.keys(tool?.inputSchema.properties ?? {}).join(', '));
      } catch (error) {
        report.results.push({ provider: id, error: safeError(error).code });
      }
    }
  } finally { await clients.close(); }
  await writeFile(new URL('../../docs/selective-reading-schemas.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  for (const result of report.results) {
    assert.equal(result.error, undefined, result.provider + ' discovery must actually succeed.');
    assert.ok(result.tool?.inputSchema.properties?.url, result.provider + ' must expose its read URL parameter.');
  }
});
