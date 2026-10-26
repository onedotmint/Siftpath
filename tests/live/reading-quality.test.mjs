import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { readConfiguration, providerStatus } from '../../dist/config.js';
import { Siftpath } from '../../dist/router.js';
import { safeError } from '../../dist/errors.js';
import { readingFacts, sqliteRead, completeFacts } from '../support/reading-quality.mjs';

// Explicit opt-in: three reads total, current Jina credentials, no retries or other providers.
test('SQLite reading quality: old vs 3x250 vs 4x160, raw evidence and final output', {
  skip: process.env.SIFTPATH_READ_QUALITY !== '1', timeout: 370000,
}, async t => {
  const config = await readConfiguration();
  const provider = config.providers.jina;
  assert.equal(providerStatus('jina', config, process.env).code, 'READY', 'Configure Jina before opting into quality reads.');
  assert.equal(provider?.connection.transport, 'http');
  assert.ok(provider.connection.url === 'https://mcp.jina.ai/v1', 'This acceptance targets the official Jina reader.');
  assert.ok(provider.read?.name === 'read_url', 'Configure the official read_url binding.');
  const reports = [];
  for (const window of [{ name: 'old', topk: 1, chunk_size: 100 }, { name: '3x250', topk: 3, chunk_size: 250 }, { name: '4x160', topk: 4, chunk_size: 160 }]) {
    const router = new Siftpath({ ...config, providers: { jina: { ...provider, read: {
      name: 'read_url', arguments: { url: '$url', question: '$focus', topk: window.topk, chunk_size: window.chunk_size },
    } } }, routes: { ...config.routes, read: 'jina', readFallback: [] } });
    let requests = 0, raw;
    const call = router.clients.call.bind(router.clients);
    router.clients.call = async (...args) => { requests++; raw = await call(...args); return raw; };
    const start = performance.now();
    let report;
    try {
      const output = await router.read(sqliteRead);
      report = { window: window.name, requests, elapsedMs: Math.round(performance.now() - start),
        rawFacts: readingFacts(raw), outputFacts: readingFacts(output),
        rawChars: JSON.stringify(raw).length, outputChars: JSON.stringify(output).length,
        truncated: output.truncated, maxOutputChars: config.maxOutputChars };
    } catch (error) {
      report = { window: window.name, requests, elapsedMs: Math.round(performance.now() - start), error: safeError(error).code };
    } finally { await router.close(); }
    reports.push(report); t.diagnostic(JSON.stringify(report));
  }
  assert.ok(reports.every(row => row.requests === 1), 'Each candidate must make exactly one provider request.');
  const recommended = reports.find(row => row.window === '3x250');
  assert.equal(recommended.error, undefined, 'Recommended window must complete, not merely connect.');
  assert.deepEqual(recommended.rawFacts, completeFacts, 'Provider must return all three facts; question echoes do not count.');
  assert.deepEqual(recommended.outputFacts, completeFacts, 'Siftpath must retain all three facts.');
  assert.equal(recommended.truncated, false, 'Recommended window must fit the actual configured budget.');
  assert.ok(recommended.outputChars <= config.maxOutputChars);
});
