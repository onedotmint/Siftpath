import * as clack from '@clack/prompts';
import { providerStatus, type Configuration } from './config.js';
import { providerPresets, anonymousPresets } from './defaults.js';

// Adapted from 9d4b9ca/b5939d1: Clack owns selection, password masking and terminal cancellation.
const catalog = [
  { id: 'brave', label: 'Brave', hint: 'General web search', key: 'BRAVE_API_KEY' },
  { id: 'exa', label: 'Exa', hint: 'Semantic search', key: 'EXA_API_KEY' },
  { id: 'tavily', label: 'Tavily', hint: 'General web search', key: 'TAVILY_API_KEY' },
  { id: 'jina', label: 'Jina', hint: 'Web reading (native focus with Key)', key: 'JINA_API_KEY' },
  { id: 'firecrawl', label: 'Firecrawl', hint: 'Optional complex page reading', key: 'FIRECRAWL_API_KEY' },
] as const;
type Prompts = Pick<typeof clack, 'intro' | 'outro' | 'cancel' | 'log' | 'select' | 'multiselect' | 'password' | 'confirm' | 'isCancel'>;
export async function runSetupWizard(saved: Configuration, env: NodeJS.ProcessEnv = process.env, prompts: Prompts = clack): Promise<{ configuration: Configuration; test: boolean } | null> {
  const canceled = Symbol('setup-cancelled');
  const answer = async <T>(pending: Promise<T>): Promise<Exclude<T, symbol>> => {
    const value = await pending; if (prompts.isCancel(value)) throw canceled; return value as Exclude<T, symbol>;
  };
  const config = structuredClone(saved);
  try {
    prompts.intro('Siftpath setup');
    prompts.log.info('Arrow keys: move; Space: toggle; Enter: confirm; Esc/Ctrl+C: cancel. Keys are never displayed.');
    const options = [...catalog.map(p => ({ value: p.id as string, label: p.label, hint: p.hint })),
      ...Object.keys(config.providers).filter(id => !catalog.some(p => p.id === id)).map(id => ({ value: id, label: id, hint: 'Existing custom MCP (kept as configured)' }))];
    const chosen = await answer(prompts.multiselect({ message: 'Providers (Space: toggle, Enter: continue)', options,
      initialValues: Object.keys(config.providers).filter(id => config.providers[id]!.enabled), required: true }));
    const selected = options.map(option => option.value).filter(id => chosen.includes(id));
    for (const [id, provider] of Object.entries(config.providers)) provider.enabled = selected.includes(id);
    for (const id of selected) {
      const entry = catalog.find(p => p.id === id);
      if (!entry) continue;
      config.providers[id] ??= structuredClone(providerPresets[id]!);
      config.providers[id]!.enabled = true;
      const existing = env[entry.key]?.trim() || config.credentials[entry.key];
      const anonymous = anonymousPresets[id as keyof typeof anonymousPresets];
      const current = providerStatus(id, config, env);
      prompts.log.info(entry.label + ': ' + (existing ? entry.key + ' configured' : 'No saved/environment Key') + '; connection=' + current.code);
      const action = await answer(prompts.select({ message: entry.label + ' credentials',
        options: [
          ...(current.code === 'READY' ? [{ value: 'keep', label: 'Keep current connection', hint: existing ? 'Key configured; no re-entry needed' : 'No missing credential references' }] : []),
          ...(existing ? [{ value: 'existing', label: 'Use existing API Key', hint: 'Official authenticated preset' }] : []),
          { value: 'key', label: existing ? 'Replace API Key' : 'Add API Key', hint: env[entry.key]?.trim() ? 'Environment overrides saved Key until unset' : 'Hidden input; private local storage' },
          ...(anonymous ? [{ value: 'anonymous', label: 'Use official anonymous access', hint: 'Limited quota; availability may change' }] : []),
        ], initialValue: current.code === 'READY' ? 'keep' : existing ? 'existing' : anonymous ? 'anonymous' : 'key' }));
      if (action === 'keep') continue;
      if (action === 'anonymous' && id === 'tavily') prompts.log.warn('The official Tavily stdio server may load a local .env. Use a clean working directory for strictly anonymous access.');
      if (action === 'key') {
        if (env[entry.key]?.trim()) prompts.log.warn(entry.key + ' is set in the environment and still takes precedence over a saved replacement.');
        const key = await answer(prompts.password({ message: entry.key + (existing ? ' (Enter keeps existing Key)' : ' (required)'),
          validate: value => {
            if (!(value ?? '').trim() && !existing) return 'Enter an API Key or press Esc to cancel.';
            if ((value?.length ?? 0) > 4096 || /[\r\n\0]/.test(value ?? '')) return 'Invalid Key format.';
          } }));
        if (key.trim()) config.credentials[entry.key] = key.trim();
      }
      // Explicit mode changes install the checked official preset; Keep never rewrites a custom connection.
      config.providers[id] = structuredClone(action === 'anonymous' ? anonymous! : providerPresets[id]!);
    }
    const ready = (kind: 'search' | 'read') => Object.keys(config.providers).filter(id => config.providers[id]![kind] && providerStatus(id, config, env).code === 'READY');
    const search = ready('search'), read = ready('read');
    if (!search.length && !read.length) { prompts.log.error('No ready Search or Read connection. Nothing saved.'); return null; }
    const choose = (message: string, ids: string[], preferred?: string) => answer(prompts.select({ message,
      options: ids.map(value => ({ value, label: value })), initialValue: ids.includes(preferred ?? '') ? preferred : ids[0] }));
    const routes = config.routes;
    if (search.length) {
      const ordered = [...new Set(['tavily', 'brave', 'exa', ...search])].filter(id => search.includes(id));
      routes.search = await choose('Default search provider', ordered, routes.search);
      routes.intents = {
        general: routes.search,
        semantic: await choose('Semantic search provider', ordered, search.includes(routes.intents.semantic ?? '') ? routes.intents.semantic : search.includes('exa') ? 'exa' : routes.search),
        research: await choose('Research search provider', ordered, search.includes(routes.intents.research ?? '') ? routes.intents.research : search.includes('tavily') ? 'tavily' : routes.search),
      };
    } else { routes.search = 'unconfigured'; routes.intents = {}; routes.searchFallback = []; }
    if (read.length) routes.read = await choose('Default webpage reader', read, read.includes(routes.read) ? routes.read : read.includes('jina') ? 'jina' : read[0]);
    else { routes.read = 'unconfigured'; routes.readFallback = []; }
    for (const [kind, ids] of [['search', search], ['read', read]] as const) {
      const primary = routes[kind], field = kind === 'search' ? 'searchFallback' : 'readFallback';
      // One search fallback chain serves all intents; retain the general primary as a possible semantic fallback.
      const available = kind === 'search' && ids.length > 1 ? [...ids] : ids.filter(id => id !== primary), initial = [...new Set([...routes[field], ...available])].filter(id => available.includes(id));
      if (!available.length) { routes[field] = []; continue; }
      if (kind === 'search') prompts.log.info('Search fallbacks apply to all intents; the active primary is automatically deduplicated.');
      const fallback = await answer(prompts.multiselect({ message: kind + ' fallback providers (shown order)',
        options: initial.map(value => ({ value, label: value })), initialValues: routes[field].filter(id => available.includes(id)), required: false }));
      routes[field] = [];
      while (fallback.length) {
        const next = fallback.length === 1 ? fallback[0]! : await choose(kind + ' fallback: choose next in order', fallback, initial.find(id => fallback.includes(id)));
        routes[field].push(next); fallback.splice(fallback.indexOf(next), 1);
      }
    }
    prompts.log.info('Selected: ' + selected.join(', ') + '\nSearch: ' + (search.length ? routes.search : 'not configured') + '; default intent=' + routes.defaultIntent + '; semantic: ' + (routes.intents.semantic ?? 'none') +
      '\nRead: ' + (read.length ? routes.read : 'not configured') + '\nFallbacks: search=' + (routes.searchFallback.join(' -> ') || 'none') + '; read=' + (routes.readFallback.join(' -> ') || 'none'));
    const test = await answer(prompts.confirm({ message: 'After saving, run real provider tests? (may use API quota)', initialValue: false }));
    prompts.outro('Ready to save private configuration.');
    return { configuration: config, test };
  } catch (error) {
    if (error !== canceled) throw error;
    prompts.cancel('Cancelled; no changes saved.'); return null;
  }
}
