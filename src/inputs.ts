import { z } from 'zod';
import { isIP } from 'node:net';
import { SiftpathError } from './errors.js';
export const intentSchema = z.enum(['general', 'semantic', 'research']);
const text = z.string().trim().min(1).max(2000);
export const searchSchema = z.strictObject({ query: text, intent: intentSchema.optional(), maxResults: z.number().int().min(1).max(20).optional() });
export const readSchema = z.strictObject({ url: z.string().max(4096),
  reader: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/).describe('Configured Reader ID, e.g. jina, firecrawl or a custom ID. Omit for the default; explicit selection never falls back.').optional(),
  focus: text.describe('Specific evidence sought, including conditions. Requires a native focus binding; unsupported requests fail before reading.').optional() });
export type SearchInput = z.infer<typeof searchSchema>;
export type ReadInput = z.infer<typeof readSchema>;
export type Intent = z.infer<typeof intentSchema>;
export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new SiftpathError('INVALID_INPUT', 'Invalid tool arguments. Check the tool input schema.');
  return parsed.data;
}
/** Page URLs go to hosted readers, never to a local arbitrary-URL fetcher. */
export function publicUrl(value: string): string {
  try {
    const url = new URL(value), host = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || isIP(host) || !host.includes('.') ||
      /(^|\.)(localhost|local|internal|lan|home|invalid|arpa)$/.test(host)) throw new Error();
    return value; // Preserve original signed query strings and fragments.
  } catch { throw new SiftpathError('INVALID_INPUT', 'Only credential-free HTTP(S) URLs with public DNS hostnames are accepted.'); }
}
