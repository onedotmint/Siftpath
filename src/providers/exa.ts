import { JsonHttp } from '../core/http.js';
import type { SearchProvider, FetchProvider } from '../core/types.js';
import { candidate, page, object, rows, failedRows, reportedCost } from './normalize.js';

export function exa(apiKey: string, http = new JsonHttp()): SearchProvider & FetchProvider {
  const headers = { 'x-api-key': apiKey };
  return {
    id: 'exa', priority: 10,
    capabilities: { search: true, fetch: true, semanticSearch: true, highlights: true,
      freshness: true, dateFilter: true, domainFilter: true, pdf: true },
    async search(request, context) {
      const response = object(await http.request({ url: 'https://api.exa.ai/search', headers, body: {
        query: request.query, type: 'auto', numResults: request.maxResults,
        contents: { highlights: true },
        ...(request.domains ? { includeDomains: request.domains } : {}),
        ...(request.since ? { startPublishedDate: request.since } : {}),
      } }, context));
      return { ...rows('exa', response.results, (row, rank) => candidate('exa', rank, {
        ...row, url: row.url, sourceId: row.id, excerpts: row.highlights, publishedAt: row.publishedDate,
      })), costUSD: reportedCost(response) };
    },
    async fetch(request, context) {
      const response = object(await http.request({ url: 'https://api.exa.ai/contents', headers, body: {
        urls: request.urls, text: true,
        ...(request.query ? { highlights: { query: request.query } } : {}),
      } }, context));
      const normalized = rows('exa', response.results, row => page('exa', {
        ...row, url: row.url, sourceId: row.id, excerpts: request.query ? row.highlights : undefined, publishedAt: row.publishedDate,
      }));
      const failures = Array.isArray(response.statuses) ? response.statuses.filter(raw => {
        try { return object(raw).status !== 'success'; } catch { return true; }
      }) : [];
      return { ...normalized, warnings: [...normalized.warnings ?? [], ...failedRows('exa', failures)], costUSD: reportedCost(response) };
    },
  };
}
