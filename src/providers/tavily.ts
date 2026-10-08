import { JsonHttp } from '../core/http.js';
import type { SearchProvider, FetchProvider } from '../core/types.js';
import { candidate, page, object, rows, failedRows } from './normalize.js';

export function tavily(apiKey: string, http = new JsonHttp()): SearchProvider & FetchProvider {
  const headers = { authorization: `Bearer ${apiKey}` };
  return {
    id: 'tavily', priority: 30,
    capabilities: { search: true, fetch: true, freshness: true, dateFilter: true,
      domainFilter: true, highlights: true, objectiveExtract: true, news: true },
    async search(request, context) {
      const response = object(await http.request({ url: 'https://api.tavily.com/search', headers, body: {
        query: request.query, max_results: request.maxResults,
        search_depth: request.mode === 'fast' ? 'basic' : 'advanced',
        include_answer: false, include_raw_content: false, include_images: false, auto_parameters: false,
        ...(request.domains ? { include_domains: request.domains, include_domains_mode: 'restrict' } : {}),
        ...(request.since ? { start_date: request.since.slice(0, 10), include_published_date: true } : {}),
      } }, context));
      return rows('tavily', response.results, (row, rank) => candidate('tavily', rank, {
        ...row, url: row.url, text: row.content, publishedAt: row.published_date,
      }));
    },
    async fetch(request, context) {
      const response = object(await http.request({ url: 'https://api.tavily.com/extract', headers, body: {
        urls: request.urls, format: 'markdown', extract_depth: 'advanced', include_images: false,
        ...(request.query ? { query: request.query, chunks_per_source: 5 } : {}),
      } }, context));
      const result = rows('tavily', response.results, row => page('tavily', { ...row, url: row.url, text: row.raw_content }));
      return { ...result, warnings: [...result.warnings ?? [], ...failedRows('tavily', response.failed_results)] };
    },
  };
}
