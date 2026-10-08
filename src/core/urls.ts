import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { input } from './errors.js';
const TRACKING = /^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|_ga|igshid)$/i;
export function publicUrl(value: string): string {
  input(typeof value === 'string' && value.length <= 4096, 'URLs must be strings of at most 4096 characters.');
  let url: URL;
  try { url = new URL(value); } catch { input(false, 'A valid absolute HTTP(S) URL is required.'); }
  const host = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  input(['https:', 'http:'].includes(url.protocol) && !url.username && !url.password, 'Only credential-free HTTP(S) URLs are accepted.');
  // Hosted extractors, never a local arbitrary-URL HTTP client. Reject IP literals and local names too.
  input(isIP(host) === 0 && host.includes('.') && !/(^|\.)(localhost|local|internal|lan|home|invalid)$/.test(host),
    'Only public DNS hostnames are accepted; IP literals and local addresses are blocked.');
  input(!host.endsWith('.arpa'), 'Reverse-DNS targets are not accepted.');
  return url.toString();
}
/** Identity only: fetch the original URL, so signed query strings are never rewritten. */
export function canonicalUrl(value: string): string {
  const url = new URL(publicUrl(value)); url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);
  url.searchParams.sort();
  return url.toString();
}
export function stableId(prefix: string, value: string): string {
  return `${prefix}_${createHash('sha256').update(value).digest('hex').slice(0, 20)}`;
}
export function sourceId(url: string): string { return stableId('s', canonicalUrl(url)); }
export function domainKey(url: string): string {
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  const parts = host.split('.');
  const suffix = parts.slice(-2).join('.');
  // Deliberately conservative grouping, not a public-suffix implementation.
  const multi = /^(co\.uk|org\.uk|ac\.uk|com\.au|co\.jp|com\.cn|com\.br|co\.nz)$/;
  return parts.slice(multi.test(suffix) ? -3 : -2).join('.');
}
export function domainMatches(url: string, domain: string): boolean {
  const host = new URL(url).hostname.toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}
