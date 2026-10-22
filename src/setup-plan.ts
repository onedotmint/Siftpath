import { anonymousPresets, providerPresets } from './defaults.js';
import { providerStatus, type Configuration } from './config.js';

/** Shared by the Clack wizard, the Pi command and the CLI: one catalog, one route recommendation. */
export interface ProviderInfo {
  id: string; label: string; hint: string; key: string; search: boolean; read: boolean; anonymous: boolean;
}
export type CredentialMode = 'keep' | 'existing' | 'key' | 'anonymous';

/** Order is the recommendation order for the quick path: Tavily/Exa first, Jina for reading. */
export const providerCatalog: ProviderInfo[] = [
  { id: 'tavily', label: 'Tavily', hint: 'Web search; API Key or official keyless mode', key: 'TAVILY_API_KEY', search: true, read: false, anonymous: true },
  { id: 'exa', label: 'Exa', hint: 'Semantic web search; official anonymous access supported', key: 'EXA_API_KEY', search: true, read: false, anonymous: true },
  { id: 'brave', label: 'Brave', hint: 'General web search; API Key required', key: 'BRAVE_API_KEY', search: true, read: false, anonymous: false },
  { id: 'jina', label: 'Jina', hint: 'Web reading with native focus; API Key or official anonymous access', key: 'JINA_API_KEY', search: false, read: true, anonymous: true },
  { id: 'firecrawl', label: 'Firecrawl', hint: 'Optional complex page reading; API Key or official anonymous access', key: 'FIRECRAWL_API_KEY', search: false, read: true, anonymous: true },
];
const preferred = { search: ['tavily', 'exa', 'brave'], read: ['jina', 'firecrawl'] } as const;
export function providerInfo(id: string): ProviderInfo | undefined { return providerCatalog.find(entry => entry.id === id); }
/** Provide-ready providers for one role, best-known first; used for routes and for the quick path. */
export function readyFor(config: Configuration, env: NodeJS.ProcessEnv, kind: 'search' | 'read'): string[] {
  const ids = Object.keys(config.providers).filter(id => config.providers[id]![kind] && providerStatus(id, config, env).code === 'READY');
  const order: readonly string[] = preferred[kind];
  return [...order.filter(id => ids.includes(id)), ...ids.filter(id => !order.includes(id))];
}
/** True when no route can actually run yet: a first-time user should see the quick path first. */
export function needsSetup(config: Configuration, env: NodeJS.ProcessEnv): boolean {
  return !readyFor(config, env, 'search').length && !readyFor(config, env, 'read').length;
}
export interface ProviderSelection { id: string; mode: CredentialMode; key?: string }
/** Apply one provider decision. `keep` never rewrites a custom connection; explicit modes install the official preset. */
export function applySelection(config: Configuration, selection: ProviderSelection): Configuration {
  const { id, mode, key } = selection, info = providerInfo(id);
  const next = structuredClone(config);
  if (mode === 'keep') { if (next.providers[id]) next.providers[id]!.enabled = true; return next; }
  const preset = mode === 'anonymous' ? anonymousPresets[id] : providerPresets[id];
  if (!preset) throw new Error(`Provider ${id} has no official preset.`);
  next.providers[id] = structuredClone({ ...preset, enabled: true });
  if (mode === 'key' && key?.trim()) next.credentials[info!.key] = key.trim();
  return next;
}
/** Disable a provider without deleting its credentials or custom connection. */
export function disableProvider(config: Configuration, id: string): Configuration {
  const next = structuredClone(config);
  if (next.providers[id]) next.providers[id]!.enabled = false;
  return next;
}
/** Recommended routes for the quick path: no fallback questions, remaining ready providers stay as ordered fallbacks. */
export function applyRecommendedRoutes(config: Configuration, env: NodeJS.ProcessEnv): Configuration {
  const next = structuredClone(config), searched = readyFor(next, env, 'search'), read = readyFor(next, env, 'read'), routes = next.routes;
  if (searched.length) {
    routes.search = searched[0]!;
    routes.defaultIntent = 'general';
    routes.intents = { general: routes.search,
      ...(searched.includes('exa') ? { semantic: 'exa' } : {}), ...(searched.includes('tavily') ? { research: 'tavily' } : {}) };
    routes.searchFallback = searched.slice(1);
  } else { routes.search = 'unconfigured'; routes.intents = {}; routes.searchFallback = []; }
  if (read.length) { routes.read = read[0]!; routes.readFallback = read.slice(1); }
  else { routes.read = 'unconfigured'; routes.readFallback = []; }
  return next;
}
