import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfiguration, providerStatus } from '../dist/config.js';
import { providerPresets, anonymousPresets } from '../dist/defaults.js';
import { runSetupWizard, runQuickSetup, chooseSetupMode } from '../dist/setup-ui.js';
import { isCancel } from '@clack/prompts';

function prompts({ providers, action = 'keep', key = '', route, test = false, cancelAt } = {}) {
  const calls = [], notices = [];
  const wrap = (name, handler) => async options => { calls.push({ name, ...options }); return options.message === cancelAt ? Symbol.for('clack:cancel') : handler(options); };
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
test('routes prioritize Exa/Jina, retain explicit primary and allow ordered fallback selection', async () => {
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
  assert.equal(parseConfiguration({}).providers.tavily.enabled, false);
  assert.equal(parseConfiguration({}).providers.firecrawl.enabled, false);
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
  const saved = parseConfiguration({ providers: { brave: providerPresets.brave, exa: anonymousPresets.exa }, credentials: { BRAVE_API_KEY: 'fixture-b' } });
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

test('quick setup keeps a saved Key, supports anonymous access and disables unselected services', async () => {
  const saved = parseConfiguration({ credentials: { EXA_API_KEY: 'saved-quick-key' }, providers: { exa: providerPresets.exa, jina: anonymousPresets.jina, brave: providerPresets.brave } });
  const p = prompts({ providers: ['exa', 'jina'], action: 'anonymous' });
  p.select = async options => options.message.endsWith('credentials') ? 'anonymous' : options.initialValue;
  const result = await runQuickSetup(saved, {}, p);
  assert.equal(result.configuration.credentials.EXA_API_KEY, 'saved-quick-key');
  assert.equal(result.configuration.providers.exa.connection.transport, 'http');
  assert.equal(result.configuration.providers.brave.enabled, false);
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

test('quick setup preselects only services that can work, never a Key-required provider on a fresh install', async () => {
  const fresh = prompts();
  await runQuickSetup(parseConfiguration({}), {}, fresh);
  assert.deepEqual(fresh.calls.find(call => call.name === 'multiselect').initialValues, ['exa', 'jina']);
  const configured = prompts();
  await runQuickSetup(parseConfiguration({ credentials: { BRAVE_API_KEY: 'saved-brave' } }), {}, configured);
  assert.deepEqual(configured.calls.find(call => call.name === 'multiselect').initialValues, ['brave']);
});
