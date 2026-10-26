import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfiguration, providerStatus } from '../dist/config.js';
import { providerPresets, anonymousPresets } from '../dist/defaults.js';
import { runSetupWizard, runQuickSetup, chooseSetupMode } from '../dist/setup-ui.js';
import { applyRecommendedRoutes, providerCatalog } from '../dist/setup-plan.js';
import { isCancel, CANCEL_SYMBOL } from '@clack/prompts';

function prompts({ providers, action = 'keep', key = '', route, test = false, cancelAt } = {}) {
  const calls = [], notices = [];
  const wrap = (name, handler) => async options => { calls.push({ name, ...options }); return options.message === cancelAt ? CANCEL_SYMBOL : handler(options); };
  return { calls, notices, isCancel,
    intro: () => {}, outro: () => {}, cancel: text => notices.push(text),
    log: Object.fromEntries(['info', 'warn', 'error'].map(name => [name, text => notices.push(text)])),
    multiselect: wrap('multiselect', options => /^(Providers|What should)/.test(options.message) ? providers ?? [...options.initialValues] : [...options.initialValues]),
    select: wrap('select', options => options.message.endsWith('credentials') ? action === 'keep' && !options.options.some(o => o.value === 'keep') ? options.initialValue : action : route?.(options) ?? options.initialValue),
    password: wrap('password', options => { assert.equal(options.validate?.(key), undefined); return key; }),
    confirm: wrap('confirm', () => test),
  };
}
test('wizard keeps existing credentials, enabled providers, custom MCP and supported route choices without re-entry', async () => {
  const saved = parseConfiguration({ credentials: { BRAVE_API_KEY: 'saved-secret' }, providers: {
    brave: providerPresets.brave, jina: anonymousPresets.jina, custom: { enabled: true, connection: { transport: 'http', url: 'https://custom.example/mcp' }, search: { name: 'search', arguments: { q: '$query' } } },
  }, routes: { search: 'custom', read: 'jina', intents: {}, searchFallback: ['brave'] } });
  const p = prompts(), result = await runSetupWizard(saved, {}, p);
  assert.equal(result.configuration.credentials.BRAVE_API_KEY, 'saved-secret');
  assert.deepEqual(p.calls[0].initialValues, ['brave', 'jina', 'custom']);
  assert.equal(result.configuration.routes.search, 'custom'); assert.equal(result.configuration.routes.read, 'jina');
  assert.deepEqual(result.configuration.providers.custom, saved.providers.custom);
  assert.ok(!p.calls.some(call => call.name === 'password')); assert.equal(result.test, false);
  assert.ok(!JSON.stringify(p.notices).includes('saved-secret'));
  assert.equal(saved.routes.intents.semantic, undefined);
});
test('wizard adds/replaces a private Key with hidden input and all routes reference ready selections', async () => {
  const p = prompts({ providers: ['tavily', 'jina'], action: 'key', key: 'new-test-secret' });
  const result = await runSetupWizard(parseConfiguration({ credentials: { TAVILY_API_KEY: 'old-test-secret', UNRELATED_KEY: 'keep-test' } }), {}, p);
  assert.equal(result.configuration.credentials.TAVILY_API_KEY, 'new-test-secret');
  assert.equal(result.configuration.credentials.UNRELATED_KEY, 'keep-test');
  assert.equal(result.configuration.routes.search, 'tavily'); assert.equal(result.configuration.routes.read, 'jina');
  assert.equal(result.configuration.providers.brave.enabled, false);
  assert.equal(result.configuration.providers.firecrawl.enabled, false);
  assert.ok(!JSON.stringify(p.notices).includes('new-test-secret'));
  assert.equal(p.calls.filter(c => c.name === 'password').length, 2);
  assert.equal(result.configuration.providers.tavily.search.name, 'tavily_search');
  assert.equal(result.configuration.providers.tavily.search.arguments.search_depth, 'basic');
});
test('anonymous selections do not request passwords or destroy old saved credentials', async () => {
  const p = prompts({ providers: ['exa', 'jina'], action: 'anonymous', test: false });
  const result = await runSetupWizard(parseConfiguration({ credentials: { EXA_API_KEY: 'keep-secret' } }), {}, p);
  assert.ok(!p.calls.some(c => c.name === 'password')); assert.equal(result.test, false);
  assert.equal(result.configuration.credentials.EXA_API_KEY, 'keep-secret');
  assert.equal(result.configuration.providers.exa.connection.transport, 'http');
  assert.equal(result.configuration.providers.jina.connection.headers.Authorization, undefined);
  assert.equal(result.configuration.routes.intents.semantic, 'exa');
});
test('environment credentials take precedence and replacing a saved Key warns without exposing it', async () => {
  const p = prompts({ providers: ['brave'], action: 'key', key: 'replacement-test' });
  const result = await runSetupWizard(parseConfiguration({}), { BRAVE_API_KEY: 'environment-test' }, p);
  assert.match(p.notices.join('\n'), /environment.*precedence/);
  assert.ok(!p.notices.join().includes('environment-test'));
  assert.equal(result.configuration.credentials.BRAVE_API_KEY, 'replacement-test');
  assert.equal(providerStatus('brave', result.configuration, { BRAVE_API_KEY: 'environment-test' }).code, 'READY');
  assert.equal(result.configuration.routes.read, 'unconfigured');
});
test('cancel at any stage returns no config and never mutates saved settings', async () => {
  const { CANCEL_SYMBOL } = await import('@clack/prompts');
  for (const step of ['Providers (Space: toggle, Enter: continue)', 'Brave credentials', 'BRAVE_API_KEY (required)', 'After saving, run real provider tests? (may use API quota)']) {
    const saved = parseConfiguration({}), original = structuredClone(saved), p = prompts({ providers: ['brave'], action: 'key', key: 'fixture-secret' });
    for (const name of ['select', 'multiselect', 'password', 'confirm']) { const fn = p[name]; p[name] = options => options.message === step ? Promise.resolve(CANCEL_SYMBOL) : fn(options); }
    assert.equal(await runSetupWizard(saved, {}, p), null); assert.deepEqual(saved, original);
    assert.match(p.notices.at(-1), /no changes saved/);
  }
});
test('advanced routes retain explicit choices and allow ordered fallback selection', async () => {
  const saved = parseConfiguration({ credentials: { BRAVE_API_KEY: 'fixture-b', TAVILY_API_KEY: 'fixture-t' }, providers: {
    brave: providerPresets.brave, tavily: providerPresets.tavily, exa: anonymousPresets.exa, jina: anonymousPresets.jina,
  }, routes: { search: 'brave', read: 'jina', intents: {}, searchFallback: ['tavily', 'exa'] } });
  const p = prompts({ route: options => options.message === 'Default search provider' ? 'tavily' : options.initialValue });
  p.multiselect = async options => options.message.startsWith('Providers') ? ['brave', 'tavily', 'exa', 'jina'] : ['exa', 'brave'];
  const result = await runSetupWizard(saved, {}, p);
  assert.equal(result.configuration.routes.search, 'tavily'); assert.equal(result.configuration.routes.intents.semantic, 'exa');
  assert.equal(result.configuration.routes.intents.research, 'tavily');
  assert.deepEqual(result.configuration.routes.searchFallback, ['exa', 'brave']);
  assert.equal(result.configuration.routes.read, 'jina');
});
test('password validation rejects empty required keys, controls and oversized values; Enter keeps existing', async () => {
  const p = prompts({ providers: ['brave'], action: 'key' });
  let validate;
  p.password = async options => { validate = options.validate; return 'test-only'; };
  await runSetupWizard(parseConfiguration({}), {}, p);
  assert.match(validate(''), /Enter an API Key/); assert.equal(validate('valid'), undefined);
  assert.match(validate('x\ny'), /Invalid/); assert.match(validate('x'.repeat(4097)), /Invalid/);
  const existing = prompts({ providers: ['brave'], action: 'key', key: '' });
  const result = await runSetupWizard(parseConfiguration({ credentials: { BRAVE_API_KEY: 'keep-test' } }), {}, existing);
  assert.equal(result.configuration.credentials.BRAVE_API_KEY, 'keep-test');
});

test('all built-in providers have ready authenticated presets and anonymous modes only where native support exists', () => {
  for (const id of ['brave', 'exa', 'tavily', 'jina', 'firecrawl']) {
    const key = id.toUpperCase() + '_API_KEY';
    const config = parseConfiguration({ providers: { [id]: providerPresets[id] } });
    assert.equal(providerStatus(id, config, {}).code, 'MISSING_CREDENTIALS');
    assert.equal(providerStatus(id, config, { [key]: 'fixture-only' }).code, 'READY');
    assert.ok(config.providers[id].search || config.providers[id].read);
  }
  for (const id of ['exa', 'tavily', 'jina', 'firecrawl']) assert.equal(providerStatus(id, parseConfiguration({ providers: { [id]: anonymousPresets[id] } }), {}).code, 'READY');
  assert.equal(anonymousPresets.brave, undefined);
  for (const id of ['tavily', 'exa', 'jina', 'firecrawl']) assert.equal(parseConfiguration({}).providers[id].enabled, true);
  assert.equal(parseConfiguration({}).providers.brave.enabled, false);
  assert.deepEqual(providerCatalog.map(entry => entry.id), ['tavily', 'exa', 'jina', 'firecrawl', 'brave']);
});
test('read-only configuration does not invent a usable search route and asks before testing', async () => {
  const p = prompts({ providers: ['firecrawl'], action: 'anonymous', test: true });
  const result = await runSetupWizard(parseConfiguration({}), {}, p);
  assert.equal(result.configuration.routes.read, 'firecrawl'); assert.equal(result.configuration.routes.search, 'unconfigured');
  assert.deepEqual(result.configuration.routes.searchFallback, []); assert.deepEqual(result.configuration.routes.intents, {});
  assert.equal(result.test, true); assert.ok(!p.calls.some(c => c.name === 'password'));
  assert.equal(p.calls.at(-1).initialValue, false);
});

test('shared search fallbacks can retain the general primary when semantic search chooses Exa', async () => {
  const saved = parseConfiguration({ providers: { brave: providerPresets.brave, exa: anonymousPresets.exa }, credentials: { BRAVE_API_KEY: 'fixture-b' },
    routes: { search: 'brave', searchFallback: ['brave', 'exa'] } });
  const p = prompts();
  const result = await runSetupWizard(saved, {}, p);
  assert.equal(result.configuration.routes.search, 'brave'); assert.equal(result.configuration.routes.intents.semantic, 'exa');
  assert.deepEqual(result.configuration.routes.searchFallback, ['brave', 'exa']);
  assert.deepEqual(p.calls.find(call => call.message === 'search fallback providers (shown order)').options.map(o => o.value), ['brave', 'exa']);
});

test('credential-only edits preserve defaultIntent and existing supported intent routes', async () => {
  const saved = parseConfiguration({ providers: { brave: providerPresets.brave, exa: anonymousPresets.exa }, credentials: { BRAVE_API_KEY: 'old-key' },
    routes: { search: 'brave', read: 'unconfigured', defaultIntent: 'semantic', intents: { semantic: 'brave', research: 'exa' }, searchFallback: [] } });
  const p = prompts({ action: 'key', key: 'replacement' });
  const result = await runSetupWizard(saved, {}, p);
  assert.equal(result.configuration.routes.defaultIntent, 'semantic');
  assert.equal(result.configuration.routes.intents.semantic, 'brave');
  assert.equal(result.configuration.routes.intents.research, 'exa');
  assert.match(p.notices.join('\n'), /default intent=semantic/);
});

test('setup mode chooser defaults to quick for a first-time install and advanced when already configured', async () => {
  assert.equal(await chooseSetupMode(true, prompts()), 'quick');
  assert.equal(await chooseSetupMode(false, prompts()), 'advanced');
});

test('quick setup asks only for services and Keys, then chooses recommended routes', async () => {
  const p = prompts({ providers: ['exa', 'jina'], action: 'key', key: 'quick-test-key' });
  const result = await runQuickSetup(parseConfiguration({}), {}, p);
  assert.equal(result.configuration.credentials.EXA_API_KEY, 'quick-test-key');
  assert.equal(result.configuration.credentials.JINA_API_KEY, 'quick-test-key');
  assert.equal(result.configuration.routes.search, 'exa');
  assert.equal(result.configuration.routes.intents.semantic, 'exa');
  assert.equal(result.configuration.routes.read, 'jina');
  assert.deepEqual(result.configuration.routes.searchFallback, []);
  assert.ok(!p.calls.some(call => /Default search provider|Semantic search provider|Research search provider|fallback/.test(call.message)));
  assert.equal(result.test, false);
  assert.ok(!JSON.stringify(p.notices).includes('quick-test-key'));
});

test('quick setup keeps a saved Key, supports anonymous access and preserves unselected services', async () => {
  const saved = parseConfiguration({ credentials: { EXA_API_KEY: 'saved-quick-key' }, providers: { exa: providerPresets.exa, jina: anonymousPresets.jina, brave: providerPresets.brave } });
  const p = prompts({ providers: ['exa', 'jina'], action: 'anonymous' });
  p.select = async options => options.message.endsWith('credentials') ? 'anonymous' : options.initialValue;
  const result = await runQuickSetup(saved, {}, p);
  assert.equal(result.configuration.credentials.EXA_API_KEY, 'saved-quick-key');
  assert.equal(result.configuration.providers.exa.connection.transport, 'http');
  assert.deepEqual(result.configuration.providers.brave, saved.providers.brave);
  assert.ok(!p.calls.some(call => call.name === 'password'));
});

test('quick setup reports nothing usable and never saves a partial configuration', async () => {
  const p = prompts({ providers: ['firecrawl'], action: 'key', key: '' });
  p.select = async options => options.message.endsWith('credentials') ? 'key' : options.initialValue;
  p.password = async () => '';
  const result = await runQuickSetup(parseConfiguration({}), {}, p);
  assert.equal(result, null);
  assert.match(p.notices.join('\n'), /No ready Search or Read connection/);
});

test('quick setup preselects ready recommended services or Tavily/Jina, never Brave or anonymous credentials', async () => {
  const fresh = prompts({ key: 'fixture-quick-key' });
  await runQuickSetup(parseConfiguration({}), {}, fresh);
  const picker = fresh.calls.find(call => call.name === 'multiselect');
  assert.deepEqual(picker.initialValues, ['tavily', 'jina']);
  assert.deepEqual(picker.options.map(option => option.value), ['tavily', 'exa', 'jina', 'firecrawl']);
  assert.ok(fresh.calls.filter(call => call.message?.endsWith('credentials')).every(call => call.initialValue === 'key'));
  const configured = prompts();
  await runQuickSetup(parseConfiguration({ providers: { brave: providerPresets.brave, exa: providerPresets.exa, jina: providerPresets.jina },
    credentials: { BRAVE_API_KEY: 'fixture-brave', EXA_API_KEY: 'fixture-exa', JINA_API_KEY: 'fixture-jina' } }), {}, configured);
  assert.deepEqual(configured.calls.find(call => call.name === 'multiselect').initialValues, ['exa', 'jina']);
  const legacy = prompts({ providers: ['jina'], key: 'fixture-jina' });
  const result = await runQuickSetup(parseConfiguration({ providers: { brave: providerPresets.brave },
    credentials: { BRAVE_API_KEY: 'fixture-brave' }, routes: { search: 'brave', intents: { general: 'brave' }, searchFallback: [] } }), {}, legacy);
  assert.deepEqual(legacy.calls.find(call => call.name === 'multiselect').initialValues, ['tavily', 'jina']);
  assert.equal(result.configuration.routes.search, 'brave');
});


test('explicit Jina presets use the expanded window while keep preserves custom arguments', async () => {
  const { applySelection } = await import('../dist/setup-plan.js');
  const saved = parseConfiguration({ providers: { jina: { ...anonymousPresets.jina,
    read: { name: 'read_url', arguments: { url: '$url', question: '$focus', topk: 4, chunk_size: 160 } } } } });
  assert.deepEqual(applySelection(saved, { id: 'jina', mode: 'keep' }).providers.jina.read, saved.providers.jina.read);
  for (const mode of ['anonymous', 'existing', 'key']) {
    const next = applySelection(saved, { id: 'jina', mode, key: 'test-only' });
    assert.deepEqual(next.providers.jina.read.arguments, { url: '$url', question: '$focus', topk: 3, chunk_size: 250 });
  }
  assert.equal(saved.providers.jina.read.arguments.topk, 4);
});

for (const ids of [['tavily'], ['exa'], ['tavily', 'exa'], ['firecrawl'], ['tavily', 'exa', 'jina', 'firecrawl']]) {
  test(`quick setup supports only configuring ${ids.join('/')} without inventing fallbacks`, async () => {
    const saved = parseConfiguration({}), before = structuredClone(saved);
    const p = prompts({ providers: ids, action: 'key', key: 'fixture-partial-key' });
    const { configuration: next } = await runQuickSetup(saved, {}, p);
    const search = ids.includes('tavily') ? 'tavily' : ids.includes('exa') ? 'exa' : 'unconfigured';
    assert.equal(next.routes.search, search);
    assert.deepEqual(next.routes.intents, search === 'unconfigured' ? {} : {
      general: search, research: search, semantic: ids.includes('exa') ? 'exa' : search,
    });
    assert.equal(next.routes.read, ids.includes('jina') ? 'jina' : ids.includes('firecrawl') ? 'firecrawl' : 'unconfigured');
    assert.deepEqual(next.routes.searchFallback, []);
    assert.deepEqual(next.routes.readFallback, []);
    for (const id of ids) assert.equal(providerStatus(id, next, {}).code, 'READY');
    assert.deepEqual(saved, before);
  });
}

test('quick setup preserves usable custom/Brave routes, all intents, defaultIntent and explicit fallback order', async () => {
  const saved = parseConfiguration({ credentials: { BRAVE_API_KEY: 'fixture-brave' }, providers: {
    ...Object.fromEntries(providerCatalog.map(({ id }) => [id, providerPresets[id]])),
    custom: { enabled: true, connection: { transport: 'http', url: 'https://custom.example/mcp' },
      search: { name: 'search', arguments: { q: '$query' } }, read: { name: 'read', arguments: { url: '$url' } } },
    exa: anonymousPresets.exa, jina: anonymousPresets.jina, firecrawl: anonymousPresets.firecrawl,
  }, routes: { defaultIntent: 'semantic', search: 'custom', read: 'firecrawl',
    intents: { general: 'brave', research: 'exa', semantic: 'custom' },
    searchFallback: ['exa', 'brave', 'custom'], readFallback: ['jina', 'custom'] } });
  const p = prompts({ providers: ['tavily'], action: 'key', key: 'fixture-tavily' });
  const result = await runQuickSetup(saved, {}, p);
  assert.deepEqual(result.configuration.routes, saved.routes);
  assert.deepEqual(result.configuration.providers.custom, saved.providers.custom);
  const empty = structuredClone(saved); empty.routes.searchFallback = []; empty.routes.readFallback = [];
  assert.deepEqual(applyRecommendedRoutes(empty, {}).routes.searchFallback, []);
  assert.deepEqual(applyRecommendedRoutes(empty, {}).routes.readFallback, []);
});

test('recommendations repair unavailable primaries/intents and prune only unusable explicit fallbacks', () => {
  const saved = parseConfiguration({ providers: { tavily: anonymousPresets.tavily, exa: anonymousPresets.exa,
    jina: anonymousPresets.jina, firecrawl: { ...anonymousPresets.firecrawl, enabled: false } },
    routes: { defaultIntent: 'research', search: 'missing', read: 'firecrawl',
      intents: { general: 'missing', research: 'exa', semantic: 'missing' },
      searchFallback: ['missing', 'exa', 'tavily'], readFallback: ['firecrawl', 'jina'] } });
  const routes = applyRecommendedRoutes(saved, {}).routes;
  assert.equal(routes.defaultIntent, 'research');
  assert.equal(routes.search, 'tavily'); assert.equal(routes.read, 'jina');
  assert.deepEqual(routes.intents, { general: 'tavily', research: 'exa', semantic: 'exa' });
  assert.deepEqual(routes.searchFallback, ['exa', 'tavily']);
  assert.deepEqual(routes.readFallback, ['jina']);
  assert.equal(saved.routes.search, 'missing');
});

for (const [name, credentials, action, key] of [
  ['adds', {}, 'key', 'fixture-firecrawl-new'],
  ['replaces', { FIRECRAWL_API_KEY: 'fixture-firecrawl-old' }, 'key', 'fixture-firecrawl-replacement'],
  ['keeps on Enter', { FIRECRAWL_API_KEY: 'fixture-firecrawl-old' }, 'key', ''],
  ['reuses', { FIRECRAWL_API_KEY: 'fixture-firecrawl-old' }, 'existing', ''],
]) {
  test(`quick setup ${name} Firecrawl Key using the official authenticated HTTP preset`, async () => {
    const p = prompts({ providers: ['firecrawl'], action, key });
    const { configuration: next } = await runQuickSetup(parseConfiguration({ credentials }), {}, p);
    assert.equal(next.credentials.FIRECRAWL_API_KEY, key || credentials.FIRECRAWL_API_KEY);
    assert.deepEqual(next.providers.firecrawl.connection, { transport: 'http', url: 'https://mcp.firecrawl.dev/v2/mcp',
      headers: { Authorization: 'Bearer ${FIRECRAWL_API_KEY}' } });
    assert.ok(next.providers.firecrawl.read.arguments.objective);
    for (const secret of [key, credentials.FIRECRAWL_API_KEY].filter(Boolean)) assert.ok(!JSON.stringify(p.notices).includes(secret));
  });
}

test('quick setup keeps custom Firecrawl connections and never copies environment Keys into credentials', async () => {
  const saved = parseConfiguration({ providers: { firecrawl: { ...anonymousPresets.firecrawl,
    connection: { transport: 'http', url: 'https://custom.example/mcp', headers: {} } } } });
  const p = prompts({ providers: ['firecrawl'] });
  const kept = await runQuickSetup(saved, {}, p);
  assert.deepEqual(kept.configuration.providers.firecrawl, saved.providers.firecrawl);
  const env = { FIRECRAWL_API_KEY: 'fixture-env-firecrawl' }, existing = prompts({ providers: ['firecrawl'], action: 'existing' });
  const result = await runQuickSetup(parseConfiguration({}), env, existing);
  assert.deepEqual(result.configuration.credentials, {});
  assert.equal(providerStatus('firecrawl', result.configuration, env).code, 'READY');
  assert.ok(!JSON.stringify(existing.notices).includes(env.FIRECRAWL_API_KEY));
});

test('quick cancellation after an earlier Key edit discards the whole draft', async () => {
  const saved = parseConfiguration({}), before = structuredClone(saved);
  const p = prompts({ providers: ['tavily', 'firecrawl'], action: 'key', key: 'fixture-cancelled' });
  const select = p.select;
  p.select = options => options.message === 'Firecrawl credentials' ? Promise.resolve(CANCEL_SYMBOL) : select(options);
  assert.equal(await runQuickSetup(saved, {}, p), null);
  assert.deepEqual(saved, before);
});

test('adding Tavily does not redirect an existing Brave primary through a new general intent', async () => {
  const saved = parseConfiguration({ providers: { brave: providerPresets.brave }, credentials: { BRAVE_API_KEY: 'fixture-brave' },
    routes: { search: 'brave', intents: {}, searchFallback: [] } });
  const { configuration: next } = await runQuickSetup(saved, {}, prompts({ providers: ['tavily'], action: 'key', key: 'fixture-tavily' }));
  assert.equal(next.routes.search, 'brave');
  assert.deepEqual(next.routes.intents, { general: 'brave', research: 'tavily', semantic: 'brave' });
  assert.deepEqual(next.routes.searchFallback, []);
});
