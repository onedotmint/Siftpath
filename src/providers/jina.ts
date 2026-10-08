import { ProviderError } from '../core/errors.js';
import { JsonHttp } from '../core/http.js';
import type { RerankProvider } from '../core/types.js';
import { object, array, finite } from './normalize.js';

export function jina(apiKey: string, http = new JsonHttp(), model = 'jina-reranker-v3.5'): RerankProvider {
  return {
    id: 'jina', capabilities: {},
    async rerank(query, evidence, context) {
      const response = object(await http.request({ url: 'https://api.jina.ai/v1/rerank',
        headers: { authorization: `Bearer ${apiKey}` },
        body: { model, query, documents: evidence.map(item => item.text), top_n: evidence.length, return_documents: false },
      }, context));
      const scores = array(response.results).map(raw => {
        const row = object(raw), index = finite(row.index), score = finite(row.relevance_score);
        if (index === undefined || !Number.isInteger(index) || index < 0 || index >= evidence.length || score === undefined)
          throw new ProviderError('INVALID_RESPONSE', 'Invalid rerank index or score.');
        return { index, score };
      });
      if (new Set(scores.map(item => item.index)).size !== scores.length)
        throw new ProviderError('INVALID_RESPONSE', 'Duplicate rerank indices.');
      return { scores };
    },
  };
}
