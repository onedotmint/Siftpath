import { anonymousPresets, providerPresets } from './defaults.js';
import { providerStatus, type Configuration } from './config.js';

/** Shared by the Clack wizard, the Pi command and the CLI: one catalog, one route recommendation. */
export interface ProviderInfo {
  id: string; label: string; hint: string; key: string; search: boolean; read: boolean; anonymous: boolean;
}
export type CredentialMode = 'keep' | 'existing' | 'key' | 'anonymous';

/** Quick recommendation order: Tavily/Exa search, Jina/Firecrawl read; Brave stays advanced-only. */
export const providerCatalog: ProviderInfo[] = [
  { id: 'tavily', label: 'Tavily', hint: 'Default general/research search; API Key recommended', key: 'TAVILY_API_KEY', search: true, read: false, anonymous: true },
  { id: 'exa', label: 'Exa', hint: 'Semantic search; API Key recommended', key: 'EXA_API_KEY', search: true, read: false, anonymous: true },
  { id: 'jina', label: 'Jina', hint: 'Default webpage reader with native focus; API Key recommended', key: 'JINA_API_KEY', search: false, read: true, anonymous: true },
  { id: 'firecrawl', label: 'Firecrawl', hint: 'Explicit reader: web_read({ url, reader: "firecrawl" }); API Key recommended', key: 'FIRECRAWL_API_KEY', search: false, read: true, anonymous: true },
  { id: 'brave', label: 'Brave', hint: 'Advanced optional general search; API Key required', key: 'BRAVE_API_KEY', search: true, read: false, anonymous: false },
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
/** Fill only unusable routes; explicit ready routes and fallback order belong to the user. */
export function applyRecommendedRoutes(config: Configuration, env: NodeJS.ProcessEnv): Configuration {
  const next = structuredClone(config), searched = readyFor(next, env, 'search'), read = readyFor(next, env, 'read'), routes = next.routes;
  if (!searched.includes(routes.search)) routes.search = searched[0] ?? 'unconfigured';
  if (searched.length) {
    for (const intent of ['general', 'research', 'semantic'] as const) {
      if (searched.includes(routes.intents[intent] ?? '')) continue;
      const preferred = intent === 'general' ? routes.search : intent === 'semantic' ? 'exa' : 'tavily';
      routes.intents[intent] = searched.includes(preferred) ? preferred : routes.search;
    }
  } else routes.intents = {};
  if (!read.includes(routes.read)) routes.read = read[0] ?? 'unconfigured';
  routes.searchFallback = routes.searchFallback.filter(id => searched.includes(id));
  routes.readFallback = routes.readFallback.filter(id => read.includes(id));
  return next;
}
