import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { readConfiguration } from '../../dist/config.js';
import { anonymousPresets } from '../../dist/defaults.js';
import { Siftpath } from '../../dist/router.js';
import { safeError } from '../../dist/errors.js';
import { evidenceText } from '../support/reading-quality.mjs';
import { readerPages, checkPage, htmlNoise } from '../support/reader-pages.mjs';

function usageNumbers(value, path = '', depth = 0, found = {}) {
  if (!value || typeof value !== 'object' || depth > 6) return found;
  for (const [key, child] of Object.entries(value)) {
    if (['content', 'markdown', 'text', 'snippets'].includes(key)) continue;
    const next = path ? path + '.' + key : key;
    if (typeof child === 'number' && /token|credit|usage/i.test(next)) found[next] = child;
    else if (child && typeof child === 'object') usageNumbers(child, next, depth + 1, found);
  }
  return found;
}
// No semantic routing, production changes, automatic retries, or fallback. 18 provider calls maximum.
test('COMPARE eight public pages: Jina full/focus vs Firecrawl Markdown', {
  skip: process.env.SIFTPATH_READER_COMPARE !== '1', timeout: 1260000,
}, async t => {
  const config = await readConfiguration();
  assert.ok(config.providers.jina?.connection.transport === 'http' &&
    config.providers.jina.connection.url === 'https://mcp.jina.ai/v1', 'Configure the official Jina reader.');
  const timeoutMs = config.providers.jina.timeoutMs ?? config.providerTimeoutMs;
  const providers = {
    jina: config.providers.jina,
    firecrawl: { ...anonymousPresets.firecrawl, timeoutMs },
  };
  const artifacts = await mkdtemp(join(tmpdir(), 'siftpath-reader-compare-'));
  const report = { version: 1, bodyArtifacts: artifacts, generatedAt: new Date().toISOString(), maxOutputChars: config.maxOutputChars,
    providerTimeoutMs: timeoutMs, operationTimeoutMs: config.timeoutMs, firecrawlAccess: 'official-anonymous',
    notes: 'Single samples; fixed English evidence patterns, not semantic proof. Body length is not billing. Providers may internally fetch more than once.', results: [] };
  let calls = 0;
  for (const [id, provider] of Object.entries(providers)) {
    const router = new Siftpath({ ...config, providers: { [id]: provider }, routes: {
      ...config.routes, read: id, readFallback: [],
    } });
    let raw, requests = 0;
    const call = router.clients.call.bind(router.clients);
    router.clients.call = async (...args) => { requests++; calls++; raw = undefined; raw = await call(...args); return raw; };
    try {
      // Schema discovery only; fail before business calls if native parameter bindings drifted.
      let cursor, tool;
      do {
        const page = await router.clients.listTools(id, AbortSignal.timeout(timeoutMs), cursor);
        tool = page.tools.find(row => row.name === provider.read.name) ?? tool; cursor = page.nextCursor;
      } while (cursor && !tool);
      assert.ok(tool, 'Configured native read tool must exist.');
      for (const key of Object.keys(provider.read.arguments)) assert.ok(Object.hasOwn(tool.inputSchema.properties ?? {}, key), 'Native read parameter missing: ' + key);
      let unavailable;
      const cases = [...readerPages.map(page => ({ page, mode: 'full' })),
        ...(id === 'jina' ? readerPages.filter(page => page.focus).map(page => ({ page, mode: 'focus' })) : [])];
      for (const { page, mode } of cases) {
        if (unavailable) { report.results.push({ provider: id, page: page.id, mode, skipped: unavailable }); continue; }
        const before = requests, start = performance.now();
        let row;
        try {
          const output = await router.read({ url: page.url, ...(mode === 'focus' ? { focus: page.focus } : {}) });
          const rawBody = evidenceText(raw), body = evidenceText(output);
          await writeFile(join(artifacts, id + '-' + page.id + '-' + mode + '-raw.txt'), rawBody, { mode: 0o600 });
          await writeFile(join(artifacts, id + '-' + page.id + '-' + mode + '-output.txt'), body, { mode: 0o600 });
          row = { provider: id, page: page.id, category: page.category, url: page.url, mode,
            rawChecks: checkPage(rawBody, page), outputChecks: checkPage(body, page),
            rawChars: JSON.stringify(raw).length, outputChars: JSON.stringify(output).length,
            rawBodyChars: rawBody.length, outputBodyChars: body.length,
            rawHtmlNoise: htmlNoise(rawBody), outputHtmlNoise: htmlNoise(body),
            truncated: output.truncated, usage: usageNumbers(raw) };
          assert.ok(JSON.stringify(output).length <= config.maxOutputChars);
        } catch (error) {
          const safe = safeError(error);
          row = { provider: id, page: page.id, category: page.category, url: page.url, mode,
            error: safe.code, diagnostics: safe.diagnostics.map(d => d.code) };
          if (safe.diagnostics.some(d => ['AUTH_FAILED', 'RATE_LIMITED', 'MISSING_CREDENTIALS', 'CONNECTION_FAILED'].includes(d.code))) unavailable = 'provider-unavailable';
        }
        Object.assign(row, { requests: requests - before, elapsedMs: Math.round(performance.now() - start) });
        report.results.push(row); t.diagnostic(JSON.stringify(row));
        assert.equal(row.requests, 1, 'No hidden reread or fallback.');
      }
    } finally { await router.close(); }
  }
  report.providerCalls = calls;
  assert.ok(calls <= 18);
  const path = new URL('../../docs/reader-comparison-results.json', import.meta.url);
  await writeFile(path, JSON.stringify(report, null, 2) + '\n');
  t.diagnostic('Public aggregate results saved to docs/reader-comparison-results.json; no credentials or raw configuration.');
});
