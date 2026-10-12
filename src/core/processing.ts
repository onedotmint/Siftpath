import type { Candidate, Evidence, Page, ProviderBase, SearchRequest, Warning } from './types.js';
import { canonicalUrl, domainKey, sourceId, stableId } from './urls.js';
import { cleanText, passages, relevance, scanInjection } from './text.js';
import { bm25Scores } from './bm25.js';
export function selectProviders<T extends ProviderBase>(providers: T[], request: SearchRequest, limit: number): T[] {
  return providers.filter(provider => (!request.domains?.length || provider.capabilities.domainFilter) &&
    (!request.since || provider.capabilities.freshness || provider.capabilities.dateFilter))
    .slice().sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50) ||
      (request.mode === 'quality' ? (b.qualityScore ?? 0) - (a.qualityScore ?? 0) : 0) ||
      (a.latencyMs ?? Infinity) - (b.latencyMs ?? Infinity) || a.id.localeCompare(b.id)).slice(0, limit);
}
export function diverse<T>(items: T[], url: (item: T) => string, limit: number, perDomain = Infinity): T[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = domainKey(url(item)); const group = groups.get(key) ?? [];
    if (group.length < perDomain) group.push(item); groups.set(key, group);
  }
  const output: T[] = [];
  while (output.length < limit) {
    let added = false;
    for (const group of groups.values()) {
      const item = group.shift(); if (item !== undefined) { output.push(item); added = true; }
      if (output.length === limit) break;
    }
    if (!added) break;
  }
  return output;
}
function nearlySame(a: string, b: string): boolean {
  // Cosmetic duplicates only. Do not collapse contradictory passages that differ by a number or "not".
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
  return a.length >= 80 && normalize(a) === normalize(b);
}
export function fuseCandidates(items: Candidate[]): Candidate[] {
  const result: Candidate[] = []; const byUrl = new Map<string, Candidate>();
  for (const original of items) {
    const candidate = structuredClone(original);
    const key = canonicalUrl(candidate.url);
    const existing = byUrl.get(key) ?? result.find(item => nearlySame(item.excerpts.join(' '), candidate.excerpts.join(' ')));
    const score = candidate.origins.reduce((sum, origin) => sum + 1 / (60 + (origin.rank ?? 1)), 0);
    if (existing) {
      const origins = [...existing.origins, ...candidate.origins];
      existing.origins = origins.filter((origin, i) => origins.findIndex(other => other.provider === origin.provider && other.sourceId === origin.sourceId && other.url === origin.url) === i);
      existing.score = (existing.score ?? 0) + score;
      existing.warnings = uniqueWarnings([...existing.warnings ?? [], ...candidate.warnings ?? []]);
      byUrl.set(key, existing);
      if (canonicalUrl(existing.url) === key) existing.excerpts = [...new Set([...existing.excerpts, ...candidate.excerpts])].slice(0, 4);
    } else { candidate.score = score; result.push(candidate); byUrl.set(key, candidate); }
  }
  return result.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.id.localeCompare(b.id));
}
export function pageEvidence(page: Page, query: string, rank?: number): Evidence[] {
  // Put bounded full text first so highlights cannot consume its cleanup allowance.
  const excerpts = page.excerpts ?? [];
  const body = page.text.slice(0, 1_000_000);
  const auxiliary = [...new Set(excerpts.slice(0, 20).map(text => text.slice(0, 16000)))].filter(text => !body.includes(text));
  const raw = [body, ...auxiliary].join('\n\n');
  const clipped = page.text.length > 1_000_000 || excerpts.length > 20 || excerpts.some(text => text.length > 16000) || raw.length > 1_000_000;
  const warnings = uniqueWarnings([...page.warnings ?? [], ...(clipped ? [{ code: 'CONTENT_TRUNCATED', provider: page.provider, sourceId: sourceId(page.url),
    message: 'Only bounded page content was processed; this is not a complete-page extraction.' }] : []), ...scanInjection(page.title + '\n' + raw)]);
  const truncated = clipped || warnings.some(warning => warning.code === 'CONTENT_TRUNCATED');
  // Plain TXT has no reliable Markdown structure; omit inferred sections rather than label ABNF as a chapter.
  return passages(cleanText(raw), 1600, !new URL(page.url).pathname.toLowerCase().endsWith('.txt')).map((passage, index) => {
    const localWarnings = scanInjection(passage.text);
    const all = uniqueWarnings([...warnings, ...localWarnings]);
    return {
      id: stableId('e', `${canonicalUrl(page.url)}\n${passage.text}`), sourceId: sourceId(page.url),
      url: page.url, title: cleanText(page.title).slice(0, 240), text: passage.text,
      provider: page.provider, retrievedAt: page.retrievedAt,
      ...(page.publishedAt ? { publishedAt: page.publishedAt } : {}),
      ...(page.sourceId ? { providerSourceId: page.sourceId } : {}),
      ...(page.section ?? passage.section ? { section: page.section ?? passage.section } : {}),
      ...(page.fragment ? { fragment: page.fragment } : {}),
      ...(rank === undefined ? {} : { sourceRank: rank }),
      relevance: relevance(query, passage.text) + Math.max(0, 0.05 - index / 1000),
      ...(truncated || passage.truncated ? { truncated: true } : {}),
      ...(all.length ? { warnings: all } : {}),
    };
  }).sort((a, b) => b.relevance! - a.relevance!);
}
/** Experimental query-aware evidence ranking, preserving the existing ranker as default. */
export function rankEvidence(items: Evidence[], query: string, ranking: 'legacy' | 'bm25' = 'legacy'): Evidence[] {
  const legacy = () => items.slice().sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0));
  if (ranking !== 'bm25') return legacy();
  const scores = bm25Scores(query, items.map(item => item.section ? item.section + '\n' + item.text : item.text));
  if (!scores) return legacy();
  const maxScore = Math.max(...scores);
  if (!Number.isFinite(maxScore) || maxScore <= 0) return legacy();
  // Keep scores within [0,1] for existing consumers, but never interpret them as confidence.
  return items.map((item, index) => ({ item, index, score: scores[index]! }))
    .sort((a, b) => b.score - a.score || (b.item.relevance ?? 0) - (a.item.relevance ?? 0) || a.index - b.index)
    .map(({ item, score }) => ({ ...item, relevance: score / maxScore }));
}
export function uniqueEvidence(items: Evidence[]): Evidence[] {
  const result: Evidence[] = []; const seen = new Set<string>();
  for (const item of items) {
    const key = item.text.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key); result.push(item);
  }
  return result;
}
export function uniqueWarnings(warnings: Warning[]): Warning[] {
  const unique = warnings.filter((warning, i) => warnings.findIndex(other =>
    other.code === warning.code && other.provider === warning.provider && other.sourceId === warning.sourceId) === i);
  if (unique.length > 12) unique.sort((a, b) => Number(b.code === 'PROMPT_INJECTION') - Number(a.code === 'PROMPT_INJECTION'));
  return unique.length <= 12 ? unique : [...unique.slice(0, 11), { code: 'WARNINGS_TRUNCATED', message: `${unique.length - 11} additional warnings; enable trace for provider diagnostics.` }];
}
