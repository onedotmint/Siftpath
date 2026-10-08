import { input } from './errors.js';
import { publicUrl } from './urls.js';
import type { Mode, SearchInput, SearchRequest } from './types.js';
export function queryText(value: unknown): string {
  input(typeof value === 'string' && value.trim().length > 0 && value.length <= 2000, 'query must contain 1-2000 characters.');
  return value.trim();
}
export function integer(value: unknown, fallback: number, min: number, max: number, name: string): number {
  if (value === undefined) return fallback;
  input(typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max,
    `${name} must be an integer between ${min} and ${max}.`);
  return value;
}
export function modeValue(value: unknown, fallback: Mode = 'fast'): Mode {
  input(value === undefined || value === 'fast' || value === 'quality', 'mode must be fast or quality.');
  return value ?? fallback;
}
export function sinceDate(value: unknown, now = Date.now()): string | undefined {
  if (value === undefined) return;
  input(typeof value === 'string', 'recency must be day, week, month, year, a duration like 7d, or an ISO date.');
  const days: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };
  const duration = value.match(/^(\d{1,3})(h|d|w)$/);
  let delta = days[value] === undefined ? undefined : days[value]! * 86400000;
  if (duration) delta = Number(duration[1]) * ({ h: 3600000, d: 86400000, w: 604800000 }[duration[2]!]!);
  if (delta !== undefined) { input(delta > 0 && delta <= 3 * 365 * 86400000, 'recency duration is out of range.'); return new Date(now - delta).toISOString(); }
  input(/^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z)?$/.test(value) && Number.isFinite(Date.parse(value)), 'recency must be a supported duration or ISO date.');
  const date = new Date(value); input(date.toISOString().slice(0, 10) === value.slice(0, 10), 'recency has an invalid calendar date.'); input(date.getTime() <= now, 'recency cannot start in the future.'); return date.toISOString();
}
export function searchRequest(value: SearchInput): SearchRequest {
  input(value !== null && typeof value === 'object' && !Array.isArray(value), 'search input must be an object.');
  const request: SearchRequest = {
    query: queryText(value.query), mode: modeValue(value.mode),
    maxResults: integer(value.maxResults, 8, 1, 20, 'maxResults'),
  };
  if (value.domains !== undefined) {
    input(Array.isArray(value.domains) && value.domains.length > 0 && value.domains.length <= 10, 'domains must have 1-10 entries.');
    request.domains = [...new Set(value.domains.map(domain => {
      input(typeof domain === 'string' && /^[a-z\d.-]+$/i.test(domain), 'domains must be bare DNS names.');
      return new URL(publicUrl(`https://${domain}`)).hostname.toLowerCase();
    }))];
  }
  const since = sinceDate(value.recency); if (since) request.since = since;
  return request;
}
export function stringArray(value: unknown, name: string, max = 20): string[] {
  if (value === undefined) return [];
  input(Array.isArray(value) && value.length <= max && value.every(x => typeof x === 'string' && x.length > 0), `${name} must contain at most ${max} nonempty strings.`);
  return value as string[];
}
