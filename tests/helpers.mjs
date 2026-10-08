import { sourceId } from '../dist/core/urls.js';
export const now = '2026-10-08T00:00:00.000Z';
export const ctx = () => ({ signal: new AbortController().signal, recordHttp() {} });
export function candidate(url, provider = 'fixture', text = 'alpha beta factual evidence', rank = 1) {
  return { id: sourceId(url), url, title: new URL(url).hostname, provider, retrievedAt: now,
    excerpts: [text], origins: [{ provider, rank, url }] };
}
export function page(url, provider = 'fixture', text = 'alpha beta factual evidence') {
  return { url, title: new URL(url).hostname, text, provider, retrievedAt: now };
}
export function fixtureProvider(id = 'fixture', urls = ['https://alpha.test/a', 'https://beta.test/b', 'https://gamma.test/c']) {
  const calls = { search: 0, fetch: 0, signals: [] };
  return { id, capabilities: { search: true, fetch: true, pdf: true, domainFilter: true, freshness: true }, calls,
    async search(_request, context) { calls.search++; calls.signals.push(context.signal); return { items: urls.map((url, i) => candidate(url, id, `alpha beta evidence from ${new URL(url).hostname} source ${i}: verified fixture details.`, i + 1)) }; },
    async fetch(request, context) { calls.fetch++; calls.signals.push(context.signal); return { items: request.urls.map((url, i) => page(url, id, `alpha beta evidence from ${new URL(url).hostname}: detail ${i}.\n\nMore useful alpha evidence for comparison.`)) }; },
  };
}
export const providers = (search = [], fetch = [], extra = {}) => ({ search, fetch, ...extra });
export function mockTransport(handler) {
  const calls = [];
  const transport = async (url, init) => {
    const request = { url: String(url), method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined, signal: init.signal, redirect: init.redirect };
    calls.push(request);
    const response = await handler(request, calls.length);
    return response instanceof Response ? response : new Response(JSON.stringify(response), { headers: { 'content-type': 'application/json' } });
  };
  return { transport, calls };
}
