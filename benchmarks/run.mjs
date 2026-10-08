#!/usr/bin/env node
/** Functional replay, not a substitute for labeled live retrieval evaluation. */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { EvidenceEngine, createEngine, readConfiguration } from '../dist/index.js';
import { sourceId, domainKey } from '../dist/core/urls.js';

export async function loadCases() {
  return JSON.parse(await readFile(new URL('./fixtures/evidence-cases.json', import.meta.url), 'utf8')).cases;
}
export function replayEngine(item) {
  const candidates = id => item.sources.map((s, rank) => ({
    id: sourceId(s.url), url: s.url, title: s.title, provider: id, retrievedAt: item.asOf,
    publishedAt: s.publishedAt, excerpts: [s.excerpt], origins: [{ provider: id, url: s.url, rank: rank + 1 }],
  }));
  const search = id => ({ id, capabilities: { search: true }, async search() { return { items: candidates(id) }; } });
  const extractor = (id, fallback) => ({ id, priority: fallback ? 20 : 10,
    capabilities: { fetch: true, pdf: fallback, hardPages: fallback },
    async fetch(request) {
      const requested = item.sources.filter(s => request.urls.includes(s.url));
      return { items: requested.filter(s => fallback || !s.hardPage && !s.pdf).map(s => ({
        url: s.url, title: s.title, text: s.text, provider: id, retrievedAt: item.asOf, publishedAt: s.publishedAt,
      })), warnings: requested.filter(s => !fallback && s.hardPage).map(s => ({ code: 'EXTRACT_FAILED', provider: id, sourceId: sourceId(s.url) })) };
    },
  });
  return new EvidenceEngine({ providers: { search: [search('replay-one'), search('replay-two')],
    fetch: [extractor('replay-primary', false), extractor('replay-fallback', true)] } });
}
export function evaluate(item, search, pack) {
  const relevant = new Set(item.sources.filter(s => s.relevant).map(s => sourceId(s.url)));
  const authority = new Set(item.sources.filter(s => s.authoritative).map(s => sourceId(s.url)));
  const text = pack.evidence.map(e => e.text.toLowerCase()).join('\n');
  const coverage = item.expectedFacts.filter(fact => text.includes(fact.toLowerCase())).length / item.expectedFacts.length;
  const fresh = pack.sources.filter(s => s.publishedAt && new Date(item.asOf) - new Date(s.publishedAt) >= 0 && new Date(item.asOf) - new Date(s.publishedAt) <= 7 * 86400000).length;
  return { retrievalRelevance: search.results.filter(s => relevant.has(s.id)).length / Math.max(1, search.results.length),
    evidencePrecision: pack.evidence.filter(e => relevant.has(e.sourceId)).length / Math.max(1, pack.evidence.length),
    evidenceCoverage: coverage, sourceDiversity: new Set(pack.sources.map(s => domainKey(s.url))).size,
    authoritativeSourceHit: pack.sources.some(s => authority.has(s.id)), freshnessFraction: fresh / Math.max(1, pack.sources.length),
    outputTokens: pack.usage.outputTokens, coveragePer1000Tokens: coverage * 1000 / Math.max(1, pack.usage.outputTokens),
    latencyMs: pack.usage.durationMs, failureRate: 0, reportedCostUSD: pack.usage.reportedCostUSD ?? null };
}
export async function runReplay() {
  const results = [];
  for (const item of await loadCases()) for (const mode of ['fast', 'quality']) {
    const engine = replayEngine(item), maxTokens = mode === 'fast' ? 2200 : 6000;
    try {
      const search = await engine.search({ query: item.query, mode });
      const pack = await engine.gather({ query: item.query, mode, maxTokens });
      results.push({ id: item.id, mode, ...evaluate(item, search, pack), withinBudget: pack.usage.outputTokens <= maxTokens });
    } catch (error) { results.push({ id: item.id, mode, failureRate: 1, error: error.code ?? 'UNEXPECTED_ERROR' }); }
  }
  return { kind: 'synthetic-functional-replay', note: 'Annotations measure pipeline retention, not real provider quality. No provider priority is justified by these results.', results };
}
async function main() {
  if (process.argv.includes('--live')) {
    const i = process.argv.indexOf('--query'), query = process.argv[i + 1];
    if (i < 0 || !query || query.startsWith('--')) throw new Error('Explicit potentially billable live run: --live --query "your query"');
    const engine = createEngine(await readConfiguration());
    const pack = await engine.gather({ query, mode: 'quality' });
    console.log(JSON.stringify({ kind: 'live-ungraded', note: 'No relevance labels supplied; human review required.', pack }, null, 2));
    return;
  }
  const report = await runReplay(); console.log(JSON.stringify(report, null, 2));
  if (report.results.some(r => r.failureRate || !r.withinBudget || r.evidenceCoverage < 0.66 || r.evidencePrecision < 0.5)) process.exitCode = 1;
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
