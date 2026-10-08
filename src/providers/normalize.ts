import { ProviderError } from '../core/errors.js';
import { cleanText, scanInjection } from '../core/text.js';
import { publicUrl, sourceId } from '../core/urls.js';
import type { Candidate, Page, ProviderResult, Warning } from '../core/types.js';

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ProviderError('INVALID_RESPONSE', 'Expected a provider response object.');
  return value as Record<string, unknown>;
}
export function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new ProviderError('INVALID_RESPONSE', 'Expected a provider response array.');
  return value.slice(0, 100);
}
export function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
export function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(0, 20) : [];
}
export function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function date(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return;
  const day = value.slice(0, 10), calendar = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== day) return;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}
interface DocumentFields {
  url: unknown; title?: unknown; text?: unknown; excerpts?: unknown; publishedAt?: unknown;
  sourceId?: unknown; score?: unknown; section?: unknown; fragment?: unknown;
}
/** Every vendor is normalized here, not in the engine or host integrations. */
export function candidate(provider: string, rank: number, fields: DocumentFields): Candidate {
  const url = publicUrl(text(fields.url));
  const raw = [...strings(fields.excerpts), text(fields.text)].filter(Boolean).slice(0, 4);
  const cleaned = raw.map(value => cleanText(value));
  const warnings = scanInjection([text(fields.title), ...raw, cleanText(text(fields.title)), ...cleaned].join('\n'));
  const publishedAt = date(fields.publishedAt), score = finite(fields.score);
  return {
    id: sourceId(url), url, title: cleanText(text(fields.title)).slice(0, 240) || new URL(url).hostname,
    excerpts: cleaned.map(value => value.slice(0, 2000)).filter(Boolean),
    ...(cleaned.some(value => value.length > 2000) ? { truncated: true } : {}),
    provider, retrievedAt: new Date().toISOString(),
    origins: [{ provider, rank, url, ...(text(fields.sourceId) ? { sourceId: text(fields.sourceId).slice(0, 512) } : {}) }],
    ...(publishedAt ? { publishedAt } : {}), ...(score === undefined ? {} : { score }),
    ...(warnings.length ? { warnings } : {}),
  };
}
export function page(provider: string, fields: DocumentFields): Page {
  const url = publicUrl(text(fields.url));
  const excerpts = strings(fields.excerpts).map(s => s.slice(0, 16000));
  return {
    url, title: text(fields.title).slice(0, 1000) || new URL(url).hostname,
    // Retain raw text for the shared injection scan BEFORE sanitization.
    text: text(fields.text).slice(0, 1_000_000), provider, retrievedAt: new Date().toISOString(),
    ...(excerpts.length ? { excerpts } : {}),
    ...(date(fields.publishedAt) ? { publishedAt: date(fields.publishedAt) } : {}),
    ...(text(fields.sourceId) ? { sourceId: text(fields.sourceId).slice(0, 512) } : {}),
    ...(text(fields.section) ? { section: text(fields.section).slice(0, 240) } : {}),
    ...(text(fields.fragment) || new URL(url).hash ? { fragment: (text(fields.fragment) || new URL(url).hash).slice(0, 512) } : {}),
  };
}
export function rows<T>(provider: string, value: unknown, convert: (row: Record<string, unknown>, rank: number) => T): ProviderResult<T> {
  const items: T[] = [], warnings: Warning[] = [];
  for (const [index, raw] of array(value).entries()) {
    try { items.push(convert(object(raw), index + 1)); }
    catch { warnings.push({ code: 'INVALID_RESULT', provider }); }
  }
  return { items, ...(warnings.length ? { warnings: [{ code: 'INVALID_RESULT', provider, message: `${warnings.length} malformed or unsafe result(s) omitted.` }] } : {}) };
}
export function failedRows(provider: string, value: unknown): Warning[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map(raw => {
    let id: string | undefined;
    try { const row = object(raw); id = sourceId(text(row.url ?? row.id)); } catch { /* Never expose raw provider error bodies. */ }
    return { code: 'EXTRACT_FAILED', provider, ...(id ? { sourceId: id } : {}) };
  });
}
export function reportedCost(response: Record<string, unknown>): number | undefined {
  const costs = response.costDollars;
  if (!costs || typeof costs !== 'object' || Array.isArray(costs)) return;
  const value = finite((costs as Record<string, unknown>).total);
  return value !== undefined && value >= 0 ? value : undefined;
}
