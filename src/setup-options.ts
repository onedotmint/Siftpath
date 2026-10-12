/** Minimal shared metadata for both setup logic and the bundled TUI. */
export const setupOptions = [
  { id: 'exa', label: 'Exa', hint: 'Recommended - search and fetch',
    keys: ['EXA_API_KEY'], url: 'https://dashboard.exa.ai/api-keys' },
  { id: 'tavily', label: 'Tavily', hint: 'Search and fetch',
    keys: ['TAVILY_API_KEY'], url: 'https://app.tavily.com/' },
  { id: 'parallel', label: 'Parallel', hint: 'Search and fetch',
    keys: ['PARALLEL_API_KEY'], url: 'https://platform.parallel.ai/' },
  { id: 'brave', label: 'Brave', hint: 'Search only',
    keys: ['BRAVE_API_KEY'], url: 'https://api-dashboard.search.brave.com/' },
  { id: 'firecrawl', label: 'Firecrawl', hint: 'Fetch only',
    keys: ['FIRECRAWL_API_KEY'], url: 'https://www.firecrawl.dev/' },
  { id: 'jina', label: 'Jina', hint: 'Optional reranking',
    keys: ['JINA_API_KEY'], url: 'https://jina.ai/' },
  { id: 'cloudflare', label: 'Cloudflare', hint: 'Optional sufficiency decision',
    keys: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'], url: 'https://dash.cloudflare.com/' },
] as const;
export type SetupProviderName = typeof setupOptions[number]['id'];
/** Keep the pure selector for existing integrations and non-interactive tests. */
export function setupProviders(answer: string, alreadyReady: boolean): SetupProviderName[] {
  const requested = answer.trim().toLowerCase() || (alreadyReady ? '' : 'exa');
  if (!requested) return [];
  const providers = requested.split(',').map(item => item.trim()).filter(Boolean);
  if (providers.some(id => !setupOptions.some(provider => provider.id === id)))
    throw Object.assign(new Error('Choose exa, tavily, parallel, brave or an advanced provider.'), { code: 'INVALID_INPUT' });
  return [...new Set(providers)] as SetupProviderName[];
}
