import { EngineError, input } from './errors.js';
import { cleanText, scanInjection } from './text.js';
import { publicUrl, sourceId } from './urls.js';
import type { HtmlInput, Page } from './types.js';

/** Offline-only HTML ingestion: never follows links, resolves DNS, or runs scripts. */
export async function htmlPage(value: HtmlInput): Promise<Page> {
  input(value !== null && typeof value === 'object' && !Array.isArray(value), 'HTML input must be an object.');
  const url = publicUrl(value.url);
  input(typeof value.html === 'string' && value.html.trim().length > 0 &&
    Buffer.byteLength(value.html, 'utf8') <= 1_048_576, 'HTML input must be 1 byte to 1 MiB of UTF-8.');
  const extractor = value.extractor ?? 'basic';
  input(extractor === 'basic' || extractor === 'readability', 'Unsupported HTML extractor.');
  const titleMarkup = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(value.html)?.[1] ?? '';
  let title = cleanText(titleMarkup);
  const body = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(value.html)?.[1] ?? value.html;
  const warnings = scanInjection(value.html).map(warning => ({ ...warning, provider: 'local-html', sourceId: sourceId(url) }));
  if (body.length > 1_000_000) warnings.push({ code: 'CONTENT_TRUNCATED', provider: 'local-html', sourceId: sourceId(url), message: 'HTML text exceeded the cleanup limit.' });
  let text = cleanText(body);
  if (extractor === 'readability') {
    // These packages are explicitly user-installed, not Siftpath runtime dependencies.
    // Dynamic module specifiers keep CLI/Pi/MCP installations free of a DOM parser.
    let parseHTML: (html: string) => { document: Document };
    let Readability: new (document: Document) => { parse(): { title?: string; content?: string; textContent?: string } | null };
    try {
      const domPackage = 'linkedom', readerPackage = '@mozilla/readability';
      ({ parseHTML } = await import(domPackage) as { parseHTML: typeof parseHTML });
      ({ Readability } = await import(readerPackage) as { Readability: typeof Readability });
    } catch {
      throw new EngineError('OPTIONAL_EXTRACTOR_UNAVAILABLE',
        'For --readability, install @mozilla/readability and linkedom alongside Siftpath. Basic extraction has no dependencies.');
    }
    try {
      const result = new Readability(parseHTML(value.html).document).parse();
      if (!result) throw new Error('No readable article.');
      title = cleanText(result.title ?? '') || title;
      text = cleanText(result.content ?? result.textContent ?? '');
    } catch {
      throw new EngineError('HTML_EXTRACT_FAILED', 'Readability could not extract this HTML. Try the basic extractor.');
    }
  }
  input(text.length > 0, 'No readable text in HTML.');
  return { url, title: title.slice(0, 240) || new URL(url).hostname,
    text, provider: 'local-html', retrievedAt: new Date().toISOString(), ...(warnings.length ? { warnings } : {}) };
}
