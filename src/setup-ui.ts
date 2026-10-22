import * as clack from '@clack/prompts';
import { providerStatus, type Configuration } from './config.js';
import { anonymousPresets } from './defaults.js';
import { applyRecommendedRoutes, applySelection, providerCatalog, type CredentialMode } from './setup-plan.js';

// Adapted from 9d4b9ca/b5939d1: Clack owns selection, password masking and terminal cancellation.
const catalog = providerCatalog;
type Prompts = Pick<typeof clack, 'intro' | 'outro' | 'cancel' | 'log' | 'select' | 'multiselect' | 'password' | 'confirm' | 'isCancel'>;
type Answers = ReturnType<typeof answers>;
function answers(prompts: Prompts) {
  const canceled = Symbol('setup-cancelled');
  const ask = async <T>(pending: Promise<T>): Promise<Exclude<T, symbol>> => {
    const value = await pending; if (prompts.isCancel(value)) throw canceled; return value as Exclude<T, symbol>;
  };
  return { canceled, ask };
}
/** Hidden Key entry shared by both paths; Enter keeps a saved Key, Esc cancels the whole run. */
async function askCredential(id: string, config: Configuration, env: NodeJS.ProcessEnv, prompts: Prompts, ask: Answers['ask']) {
  const entry = catalog.find(p => p.id === id)!, existing = env[entry.key]?.trim() || config.credentials[entry.key], anonymous = anonymousPresets[id];
  const current = providerStatus(id, config, env);
  prompts.log.info(entry.label + ': ' + (existing ? entry.key + ' configured' : 'No saved/environment Key') + '; connection=' + current.code);
  const action = await ask(prompts.select({ message: entry.label + ' credentials',
    options: [
      ...(current.code === 'READY' ? [{ value: 'keep', label: 'Keep current connection', hint: existing ? 'Key configured; no re-entry needed' : 'No missing credential references' }] : []),
      ...(existing ? [{ value: 'existing', label: 'Use existing API Key', hint: 'Official authenticated preset' }] : []),
      { value: 'key', label: existing ? 'Replace API Key' : 'Add API Key', hint: env[entry.key]?.trim() ? 'Environment overrides saved Key until unset' : 'Hidden input; private local storage' },
      ...(anonymous ? [{ value: 'anonymous', label: 'Use official anonymous access', hint: 'Limited quota; availability may change' }] : []),
    ], initialValue: current.code === 'READY' ? 'keep' : existing ? 'existing' : anonymous ? 'anonymous' : 'key' })) as CredentialMode;
  if (action === 'anonymous' && id === 'tavily') prompts.log.warn('The official Tavily stdio server may load a local .env. Use a clean working directory for strictly anonymous access.');
  let key = '';
  if (action === 'key') {
    if (env[entry.key]?.trim()) prompts.log.warn(entry.key + ' is set in the environment and still takes precedence over a saved replacement.');
    key = await ask(prompts.password({ message: entry.key + (existing ? ' (Enter keeps existing Key)' : ' (required)'),
      validate: value => {
        if (!(value ?? '').trim() && !existing) return 'Enter an API Key or press Esc to cancel.';
        if ((value?.length ?? 0) > 4096 || /[\r\n\0]/.test(value ?? '')) return 'Invalid Key format.';
      } }));
  }
  return applySelection(config, { id, mode: action, key }).configuration;
}
/** Advanced path: every provider, every route and ordered fallback stay selectable. */
export async function runSetupWizard(saved: Configuration, env: NodeJS.ProcessEnv = process.env, prompts: Prompts = clack): Promise<{ configuration: Configuration; test: boolean } | null> {
  const { canceled, ask } = answers(prompts);
  let config = structuredClone(saved);
  try {
    prompts.intro('Siftpath setup (advanced)');
    prompts.log.info('Arrow keys: move; Space: toggle; Enter: confirm; Esc/Ctrl+C: cancel. Keys are never displayed.');
    const options = [...catalog.map(p => ({ value: p.id as string, label: p.label, hint: p.hint })),
      ...Object.keys(config.providers).filter(id => !catalog.some(p => p.id === id)).map(id => ({ value: id, label: id, hint: 'Existing custom MCP (kept as configured)' }))];
    const chosen = await ask(prompts.multiselect({ message: 'Providers (Space: toggle, Enter: continue)', options,
      initialValues: Object.keys(config.providers).filter(id => config.providers[id]!.enabled), required: true }));
    const selected = options.map(option => option.value).filter(id => chosen.includes(id));
    for (const [id, provider] of Object.entries(config.providers)) provider.enabled = selected.includes(id);
    for (const id of selected) {
      if (!catalog.some(p => p.id === id)) continue;
      config = await askCredential(id, config, env, prompts, ask);
    }
    const ready = (kind: 'search' | 'read') => Object.keys(config.providers).filter(id => config.providers[id]![kind] && providerStatus(id, config, env).code === 'READY');
    const search = ready('search'), read = ready('read');
    if (!search.length && !read.length) { prompts.log.error('No ready Search or Read connection. Nothing saved.'); return null; }
    const choose = (message: string, ids: string[], preferred?: string) => ask(prompts.select({ message,
      options: ids.map(value => ({ value, label: value })), initialValue: ids.includes(preferred ?? '') ? preferred : ids[0] })) as Promise<string>;
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
      const fallback = await ask(prompts.multiselect({ message: kind + ' fallback providers (shown order)',
        options: initial.map(value => ({ value, label: value })), initialValues: routes[field].filter(id => available.includes(id)), required: false }));
      routes[field] = [];
      while (fallback.length) {
        const next = fallback.length === 1 ? fallback[0]! : await choose(kind + ' fallback: choose next in order', fallback, initial.find(id => fallback.includes(id)));
        routes[field].push(next); fallback.splice(fallback.indexOf(next), 1);
      }
    }
    prompts.log.info('Selected: ' + selected.join(', ') + '\nSearch: ' + (search.length ? routes.search : 'not configured') + '; default intent=' + routes.defaultIntent + '; semantic: ' + (routes.intents.semantic ?? 'none') +
      '\nRead: ' + (read.length ? routes.read : 'not configured') + '\nFallbacks: search=' + (routes.searchFallback.join(' -> ') || 'none') + '; read=' + (routes.readFallback.join(' -> ') || 'none'));
    const test = await ask(prompts.confirm({ message: 'After saving, run real provider tests? (may use API quota)', initialValue: false }));
    prompts.outro('Ready to save private configuration.');
    return { configuration: config, test };
  } catch (error) {
    if (error !== canceled) throw error;
    prompts.cancel('Cancelled; no changes saved.'); return null;
  }
}
/** Shared entry point so the CLI and Pi offer the same two paths. */
export async function chooseSetupMode(firstTime: boolean, prompts: Prompts = clack): Promise<'quick' | 'advanced' | null> {
  const { canceled, ask } = answers(prompts);
  try {
    const mode = await ask(prompts.select({ message: 'Setup mode', initialValue: firstTime ? 'quick' : 'advanced',
      options: [
        { value: 'quick', label: 'Quick setup (recommended)', hint: 'Pick search and read services, enter Keys, recommended routes' },
        { value: 'advanced', label: 'Advanced setup', hint: 'Providers, default/semantic/research search, reader, ordered fallback' },
      ] }));
    return mode as 'quick' | 'advanced';
  } catch (error) {
    if (error !== canceled) throw error;
    prompts.cancel('Cancelled; no changes saved.'); return null;
  }
}
/** Quick path: pick what to search/read with, enter Keys, recommended routes, done. */
export async function runQuickSetup(saved: Configuration, env: NodeJS.ProcessEnv = process.env, prompts: Prompts = clack): Promise<{ configuration: Configuration; test: boolean } | null> {
  const { canceled, ask } = answers(prompts);
  let config = structuredClone(saved);
  try {
    prompts.intro('Siftpath setup (quick)');
    prompts.log.info('Space: toggle, Enter: confirm, Esc: cancel. Keys are never displayed; recommended routes are chosen for you.');
    // Preselect what is actually usable: the configured services, or the keyless recommended pair on a fresh install.
    const usable = catalog.filter(entry => config.providers[entry.id]?.enabled && providerStatus(entry.id, config, env).code === 'READY').map(entry => entry.id);
    const initialValues = usable.length ? usable : ['exa', 'jina'].filter(id => config.providers[id]);
    const chosen = await ask(prompts.multiselect({ message: 'What should Siftpath search and read with?', required: true,
      options: catalog.map(p => ({ value: p.id as string, label: p.label, hint: p.hint })), initialValues }));
    for (const id of chosen) config = await askCredential(id, config, env, prompts, ask);
    for (const entry of catalog) if (!chosen.includes(entry.id) && config.providers[entry.id]) config.providers[entry.id]!.enabled = false;
    config = applyRecommendedRoutes(config, env);
    const routes = config.routes;
    if (routes.search === 'unconfigured' && routes.read === 'unconfigured') { prompts.log.error('No ready Search or Read connection. Nothing saved.'); return null; }
    prompts.log.info('Search: ' + (routes.search === 'unconfigured' ? 'not configured' : routes.search + ' (fallback: ' + (routes.searchFallback.join(' -> ') || 'none') + ')') +
      '\nRead: ' + (routes.read === 'unconfigured' ? 'not configured' : routes.read + ' (fallback: ' + (routes.readFallback.join(' -> ') || 'none') + ')'));
    const test = await ask(prompts.confirm({ message: 'After saving, run real provider tests? (may use API quota)', initialValue: false }));
    prompts.outro('Ready to save private configuration. Run "siftpath setup" again for advanced routing.');
    return { configuration: config, test };
  } catch (error) {
    if (error !== canceled) throw error;
    prompts.cancel('Cancelled; no changes saved.'); return null;
  }
}
