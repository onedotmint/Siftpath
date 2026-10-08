import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EvidenceEngine, exa, brave, JsonHttp } from '../dist/index.js';
import { mockTransport } from './helpers.mjs';
import { runReplay, evaluate, loadCases } from '../benchmarks/run.mjs';

test('legacy Brave/Exa fixture retains shared provenance and ignores malformed row', async () => {
  const fixture = JSON.parse(await readFile(new URL('../benchmarks/fixtures/retrieval_replay/brave-exa-shared-url.json', import.meta.url), 'utf8'));
  const raw = Object.fromEntries(fixture.providers.map(p => [p.provider, p.results]));
  const transport = mockTransport(request => request.url.includes('brave') ? { web: { results: raw.brave } } : { results: raw.exa });
  const http = new JsonHttp(transport.transport), engine = new EvidenceEngine({ providers: { search: [brave('test', http), exa('test', http)], fetch: [] } });
  const result = await engine.search({ query: fixture.query, mode: 'quality', domains: ['example.test'], maxResults: 10 });
  assert.equal(result.results.length, 3);
  const shared = result.results.find(r => r.url.includes('/shared'));
  assert.deepEqual(new Set(shared.origins.map(o => o.provider)), new Set(['exa', 'brave']));
  assert.ok(result.warnings.some(w => w.code === 'INVALID_RESULT'));
});
test('historical upstream query corpus has 49 queries and is not presented as fresh evidence', async () => {
  const lines = (await readFile(new URL('../benchmarks/fixtures/legacy/retrieval_queries.jsonl', import.meta.url), 'utf8')).trim().split('\n').map(JSON.parse);
  assert.equal(lines.length, 49); assert.equal(new Set(lines.map(q => q.category)).size, 7);
});
test('nine-category replay preserves annotated evidence within both mode budgets', async () => {
  const report = await runReplay(); assert.equal(report.kind, 'synthetic-functional-replay');
  assert.equal(report.results.length, 18);
  for (const result of report.results) {
    assert.equal(result.failureRate, 0, result.id); assert.equal(result.withinBudget, true, result.id);
    assert.ok(result.evidenceCoverage >= 2 / 3, result.id);
    assert.ok(result.evidencePrecision >= 0.5, result.id);
    assert.equal(result.authoritativeSourceHit, true, result.id);
  }
});
test('evaluator scores missing and irrelevant evidence poorly rather than always passing', async () => {
  const item = (await loadCases())[0], noise = item.sources.find(s => !s.relevant);
  const result = evaluate(item, { results: [{ id: 'irrelevant' }] }, { evidence: [{ text: 'wrong evidence', sourceId: 'irrelevant' }], sources: [{ id: 'irrelevant', url: noise.url }], usage: { outputTokens: 100, durationMs: 1 } });
  assert.equal(result.evidenceCoverage, 0); assert.equal(result.evidencePrecision, 0);
  assert.equal(result.authoritativeSourceHit, false); assert.equal(result.freshnessFraction, 0);
});
