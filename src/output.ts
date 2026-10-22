import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { SiftpathError } from './errors.js';
import { publicUrl } from './inputs.js';
export interface Source { url: string; title?: string }
export interface WebResult {
  provider: string; tool: string; retrievedAt: string; url?: string;
  content: string; sources: Source[]; truncated: boolean; sourcesTruncated: boolean;
  warnings: { provider?: string; code: string }[];
}
/** Preserve the official tool's text/order. Only collect citation URLs, never score or extract passages. */
export function normalize(result: CallToolResult, provider: string, tool: string, limit: number, url?: string, warnings: WebResult['warnings'] = []): WebResult {
  if (result.isError) throw new SiftpathError('UPSTREAM_ERROR', 'Official MCP tool reported an error.');
  const parts = result.content.flatMap(block => block.type === 'text' ? [block.text] :
    block.type === 'resource_link' ? [block.uri] : block.type === 'resource' && 'text' in block.resource ? [block.resource.text] : []);
  const structured = result.structuredContent ? JSON.stringify(result.structuredContent) : '';
  const duplicatesStructured = structured && parts.some(part => { try { return JSON.stringify(JSON.parse(part)) === structured; } catch { return false; } });
  const content = [...parts, ...(structured && !duplicatesStructured ? [structured] : [])].join('\n\n');
  if (!content.trim()) throw new SiftpathError('EMPTY_RESPONSE', 'Official MCP returned no text.');
  const sources = new Map<string, Source>(); let sourcesTruncated = false;
  const add = (value: string, title?: string) => {
    if (value.length > 4096) return;
    try {
      publicUrl(value);
      if (sources.has(value)) return;
      if (sources.size >= 50) { sourcesTruncated = true; return; }
      sources.set(value, { url: value, ...(title ? { title: title.slice(0, 200) } : {}) });
    } catch { /* Non-public citations are not forwarded as usable sources. */ }
  };
  if (url) add(url);
  const visit = (value: unknown, depth = 0): void => {
    if (!value || typeof value !== 'object' || depth > 12) return;
    if (Array.isArray(value)) { for (const row of value.slice(0, 100)) visit(row, depth + 1); return; }
    const row = value as Record<string, unknown>;
    for (const key of ['url', 'uri', 'link']) if (typeof row[key] === 'string') add(row[key], typeof row.title === 'string' ? row.title : undefined);
    for (const [key, child] of Object.entries(row)) {
      if (key.startsWith('https://') || key.startsWith('http://')) add(key);
      visit(child, depth + 1);
    }
  };
  visit(result.structuredContent);
  for (const part of parts) {
    try { visit(JSON.parse(part)); continue; } catch { /* Official tools may return plain text or Markdown. */ }
    for (const match of part.matchAll(/https?:\/\/[^\s<>"\\`]+/g)) {
      let tail = match[0].length;
      while (tail > 0 && '.,;'.includes(match[0][tail - 1]!)) tail--;
      let candidate = match[0].slice(0, tail);
      for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
        // Count once, rather than rescanning the URL for every trailing delimiter.
        let unmatched = 0, end = candidate.length;
        for (const char of candidate) { if (char === close) unmatched++; else if (char === open) unmatched--; }
        while (unmatched > 0 && candidate[end - 1] === close) { end--; unmatched--; }
        candidate = candidate.slice(0, end);
      }
      add(candidate);
    }
  }
  if (!sources.size) throw new SiftpathError('NO_SOURCES', 'Official MCP returned no traceable public source URL.');
  const output: WebResult = { provider, tool, retrievedAt: new Date().toISOString(), ...(url ? { url } : {}),
    content, sources: [...sources.values()], truncated: false, sourcesTruncated,
    warnings: [{ code: 'UNTRUSTED_WEB_CONTENT' }, ...warnings] };
  return fitOutput(output, limit);
}
/** Bound the entire JSON envelope, including provenance and fallback diagnostics. */
export function fitOutput(output: WebResult, limit: number): WebResult {
  while (JSON.stringify({ ...output, content: '' }).length > limit && output.sources.length > 1) {
    output.sources.pop(); output.sourcesTruncated = true;
  }
  if (JSON.stringify(output).length > limit) {
    output.truncated = true;
    const original = output.content;
    let low = 0, high = original.length;
    // JSON escaping is not one byte/character: choose a prefix using its actual serialized size.
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      output.content = original.slice(0, mid);
      if (JSON.stringify(output).length <= limit) low = mid; else high = mid - 1;
    }
    output.content = original.slice(0, low).replace(/[\uD800-\uDBFF]$/, '');
  }
  if (JSON.stringify(output).length > limit) throw new SiftpathError('OUTPUT_LIMIT', 'Source metadata exceeds maxOutputChars; increase the configured limit.');
  return output;
}
