import type { Provider } from './config.js';
// Official tool names/arguments were checked against upstream definitions; see docs/PROVIDERS.md.
export const providerPresets: Record<string, Provider> = {
  brave: { enabled: true,
    connection: { transport: 'stdio', command: 'npx', args: ['-y', '@brave/brave-search-mcp-server@2.1.4', '--transport', 'stdio'],
      env: { BRAVE_API_KEY: '${BRAVE_API_KEY}', BRAVE_MCP_ENABLED_TOOLS: 'brave_web_search' } },
    search: { name: 'brave_web_search', arguments: { query: '$query', count: '$maxResults' } } },
  exa: { enabled: true,
    connection: { transport: 'stdio', command: 'npx', args: ['-y', 'exa-mcp-server@3.4.2'], env: { EXA_API_KEY: '${EXA_API_KEY}' } },
    search: { name: 'web_search_exa', arguments: { query: '$query', numResults: '$maxResults' } } },
  tavily: { enabled: true, timeoutMs: 60000,
    connection: { transport: 'stdio', command: 'npx', args: ['-y', 'tavily-mcp@0.2.22'], env: { TAVILY_API_KEY: '${TAVILY_API_KEY}' } },
    search: { name: 'tavily_search', arguments: { query: '$query', max_results: '$maxResults', search_depth: 'basic' } } },
  jina: { enabled: true,
    connection: { transport: 'http', url: 'https://mcp.jina.ai/v1', headers: { Authorization: 'Bearer ${JINA_API_KEY}' } },
    read: { name: 'read_url', arguments: { url: '$url', question: '$focus' } } },
  firecrawl: { enabled: true, timeoutMs: 60000,
    connection: { transport: 'stdio', command: 'npx', args: ['-y', 'firecrawl-mcp@3.33.4'], env: { FIRECRAWL_API_KEY: '${FIRECRAWL_API_KEY}' } },
    read: { name: 'firecrawl_scrape', arguments: { url: '$url', formats: ['markdown'] } } },
};
export const anonymousPresets: Record<string, Provider> = {
  exa: { ...providerPresets.exa!, connection: { transport: 'http', url: 'https://mcp.exa.ai/mcp', headers: {} },
    search: { name: 'web_search_exa', arguments: { query: '$query', objective: '$query', numResults: '$maxResults' } } },
  jina: { ...providerPresets.jina!, connection: { transport: 'http', url: 'https://mcp.jina.ai/v1', headers: {} } },
  tavily: { ...providerPresets.tavily!, connection: { transport: 'stdio', command: 'npx', args: ['-y', 'tavily-mcp@0.2.22'], env: {} } },
  firecrawl: { ...providerPresets.firecrawl!, connection: { transport: 'http', url: 'https://mcp.firecrawl.dev/v2/mcp', headers: {} },
    read: { name: 'firecrawl_scrape', arguments: { url: '$url', formats: ['markdown'], onlyMainContent: true, objective: 'Read the supplied public webpage as Markdown.' } } },
};
export const defaultProviders = Object.fromEntries(Object.entries(providerPresets).map(([id, provider]) => [id, { ...provider, enabled: !['tavily', 'firecrawl'].includes(id) }]));
export const defaultRoutes = { defaultIntent: 'general' as const, search: 'brave', read: 'jina',
  intents: { semantic: 'exa', research: 'tavily' }, searchFallback: ['brave', 'exa'], readFallback: [] };
