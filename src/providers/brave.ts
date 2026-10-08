import { ProviderError } from '../core/errors.js';
import { JsonHttp } from '../core/http.js';
import type { SearchProvider } from '../core/types.js';
import { candidate, object, rows, strings } from './normalize.js';

export function brave(apiKey: string, http = new JsonHttp()): SearchProvider {
  return {
    id: 'brave', priority: 40,
    capabilities: { search: true, freshness: true, dateFilter: true, domainFilter: true, news: true, highlights: true },
    async search(request, context) {
      const url = new URL('https://api.search.brave.com/res/v1/web/search');
      const sites = request.domains?.map(domain => `site:${domain}`).join(' OR ');
      url.searchParams.set('q', `${request.query}${sites ? ` (${sites})` : ''}`);
      url.searchParams.set('count', String(request.maxResults)); url.searchParams.set('extra_snippets', 'true');
      if (request.since) url.searchParams.set('freshness', `${request.since.slice(0, 10)}to${new Date().toISOString().slice(0, 10)}`);
      const response = object(await http.request({ url: url.href, method: 'GET', headers: { 'X-Subscription-Token': apiKey } }, context));
      // Brave legitimately omits the web section when no web results are found.
      if (response.web === undefined) {
        if (response.query === undefined && response.type === undefined) throw new ProviderError('INVALID_RESPONSE', 'Missing Brave response fields.');
        return { items: [] };
      }
      return rows('brave', object(response.web).results, (row, rank) => candidate('brave', rank, {
        ...row, url: row.url, excerpts: [row.description, ...strings(row.extra_snippets)], publishedAt: row.page_age,
      }));
    },
  };
}
