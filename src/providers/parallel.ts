import { JsonHttp } from '../core/http.js';
import type { SearchProvider, FetchProvider } from '../core/types.js';
import { candidate, page, object, rows, failedRows, text, strings } from './normalize.js';

export function parallel(apiKey: string, http = new JsonHttp()): SearchProvider & FetchProvider {
  const headers = { 'x-api-key': apiKey };
  return {
    id: 'parallel', priority: 20,
    capabilities: { search: true, fetch: true, semanticSearch: true, highlights: true,
      objectiveExtract: true, domainFilter: true, dateFilter: true, freshness: true, pdf: true },
    async search(request, context) {
      const response = object(await http.request({ url: 'https://api.parallel.ai/v1/search', headers, body: {
        search_queries: [request.query], objective: request.query,
        mode: request.mode === 'fast' ? 'fast' : 'advanced', max_chars_total: 18000,
        advanced_settings: { max_results: request.maxResults, ...(request.domains || request.since ? {
          source_policy: { ...(request.domains ? { include_domains: request.domains } : {}),
            ...(request.since ? { after_date: request.since.slice(0, 10) } : {}) },
        } : {}) },
      } }, context));
      const result = rows('parallel', response.results, (row, rank) => candidate('parallel', rank, {
        ...row, url: row.url, publishedAt: row.publish_date,
      }));
      if (Array.isArray(response.warnings) && response.warnings.length)
        result.warnings = [...result.warnings ?? [], { code: 'PROVIDER_WARNING', provider: 'parallel' }];
      return result;
    },
    async fetch(request, context) {
      const response = object(await http.request({ url: 'https://api.parallel.ai/v1/extract', headers, body: {
        urls: request.urls, max_chars_total: 48000,
        ...(request.query ? { objective: request.query, search_queries: [request.query] } : {}),
        advanced_settings: { full_content: !request.query },
      } }, context));
      const result = rows('parallel', response.results, row => page('parallel', {
        ...row, url: row.url, text: text(row.full_content) || strings(row.excerpts).join('\n\n'), excerpts: request.query ? row.excerpts : undefined,
        publishedAt: row.publish_date,
      }));
      return { ...result, warnings: [...result.warnings ?? [], ...failedRows('parallel', response.errors)] };
    },
  };
}
