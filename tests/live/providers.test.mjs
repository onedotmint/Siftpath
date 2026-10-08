import test from 'node:test';
import assert from 'node:assert/strict';
import { configureProviders, readConfiguration } from '../../dist/index.js';

const configuration = await readConfiguration();
const { providers, statuses } = configureProviders(configuration);
const enabled = (process.env.SIFTPATH_LIVE ?? process.env.SMARTSEARCH_LIVE) === '1';
const all = new Map([...providers.search, ...providers.fetch, providers.rerank, providers.decision].filter(Boolean).map(p => [p.id, p]));
for (const status of statuses) for (const role of status.roles) {
  const skip = !enabled ? 'Set SIFTPATH_LIVE=1 to authorize potentially billable HTTP calls.' : status.state !== 'ready' ? `${status.id}: ${status.state}; missing credentials are not a failure.` : false;
  test(`live ${status.id}/${role}`, { skip }, async () => {
    const provider = all.get(status.id);
    const context = { signal: AbortSignal.timeout(20000), recordHttp() {} };
    const query = 'HTTP ETag conditional requests';
    if (role === 'search') {
      const result = await provider.search({ query, mode: 'fast', maxResults: 3 }, context);
      assert.ok(result.items.length > 0, 'Live search returned no usable candidates');
      assert.ok(result.items.every(item => item.url.startsWith('http') && item.provider === status.id));
    } else if (role === 'fetch') {
      const result = await provider.fetch({ urls: ['https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/ETag'], query }, context);
      assert.ok(result.items.some(item => item.text || item.excerpts?.length), 'Live fetch returned no readable content');
    } else {
      const evidence = [{ id: 'e1', sourceId: 's1', text: 'ETag identifies a version of a resource. If-None-Match enables revalidation.', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/ETag', title: 'ETag', provider: 'fixture', retrievedAt: new Date().toISOString() }];
      if (role === 'rerank') {
        const result = await provider.rerank(query, evidence, context);
        assert.ok(result.scores.length > 0); assert.equal(result.scores[0].index, 0);
      } else {
        const result = await provider.decide(query, evidence, context);
        assert.equal(typeof result.sufficient, 'boolean');
        assert.ok(result.confidence >= 0 && result.confidence <= 1);
      }
    }
  });
}
