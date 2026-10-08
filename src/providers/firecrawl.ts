import { mapLimit } from '../core/async.js';
import { ProviderError, toWarning } from '../core/errors.js';
import { JsonHttp } from '../core/http.js';
import { sourceId } from '../core/urls.js';
import type { FetchProvider, Page, Warning } from '../core/types.js';
import { page, object } from './normalize.js';

export function firecrawl(apiKey: string, http = new JsonHttp()): FetchProvider {
  return {
    id: 'firecrawl', priority: 90, capabilities: { fetch: true, hardPages: true, pdf: true },
    async fetch(request, context) {
      const warnings: Warning[] = [];
      const results = await mapLimit(request.urls, 3, async url => {
        try {
          context.signal.throwIfAborted();
          const response = object(await http.request({ url: 'https://api.firecrawl.dev/v2/scrape',
            headers: { authorization: `Bearer ${apiKey}` },
            body: { url, formats: ['markdown'], onlyMainContent: true },
          }, context));
          if (response.success !== true) throw new ProviderError('EXTRACT_FAILED', 'Firecrawl did not return success.');
          const data = object(response.data), metadata = data.metadata ? object(data.metadata) : {};
          return page('firecrawl', { url, text: data.markdown, title: metadata.title,
            publishedAt: metadata.publishedTime, sourceId: metadata.sourceURL });
        } catch (error) {
          context.signal.throwIfAborted();
          warnings.push({ ...toWarning(error, 'firecrawl'), sourceId: sourceId(url) });
          return undefined;
        }
      });
      return { items: results.filter((item): item is Page => item !== undefined), warnings };
    },
  };
}
