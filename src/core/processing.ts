import type { Candidate, Evidence, Page, ProviderBase, SearchRequest, Warning } from './types.js';
import { canonicalUrl, domainKey, sourceId, stableId } from './urls.js';
import { cleanText, passages, relevance, scanInjection } from './text.js';
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
  const raw = (page.excerpts?.length ? page.excerpts.join('\n\n') : page.text);
  const warnings = uniqueWarnings([...page.warnings ?? [], ...scanInjection(page.title + '\n' + raw)]);
  return passages(cleanText(raw)).map((passage, index) => {
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
      ...(all.length ? { warnings: all } : {}),
    };
  }).sort((a, b) => b.relevance! - a.relevance!);
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
  return unique.length <= 12 ? unique : [...unique.slice(0, 11), { code: 'WARNINGS_TRUNCATED', message: `${unique.length - 11} additional warnings; enable trace for provider diagnostics.` }];
}
