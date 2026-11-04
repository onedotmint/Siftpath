import Schema from '@deepseek-ai/schemastery';
import { providerCatalog, parseConfiguration, applySelection } from '@onedotmint/siftpath';
import { fieldDefinitions, validField } from './fields.js';

export const fields = fieldDefinitions(providerCatalog, parseConfiguration({}));
export const defaultSettings = Object.fromEntries(fields.map(f => [f.field, f.default]));
const invalid = () => { throw new Error('Invalid Siftpath settings: use known enabled providers, supported routes, credential-reference names and bounded budgets.'); };
export function validateSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.some(f => f.field === key))) invalid();
  const settings = { ...defaultSettings, ...value };
  for (const f of fields) if (!validField(f, settings[f.field], providerCatalog)) invalid();
  for (const f of fields.filter(f => ['search', 'read', 'searchIntent'].includes(f.type))) {
    const id = settings[f.field];
    if (id && id !== 'unconfigured' && !settings[`${id}Enabled`]) invalid();
  }
  return settings;
}
const properties = Object.fromEntries(fields.map(f => {
  let schema = f.type === 'boolean' ? Schema.boolean() : f.type === 'number' ? Schema.number().min(f.min).max(f.max).step(1)
    : f.type === 'reference' ? Schema.string().pattern(/^[A-Za-z_][A-Za-z0-9_]{0,127}$/)
    : f.type === 'intent' ? Schema.union(['general', 'semantic', 'research'])
    : Schema.union(['unconfigured', ...(f.type === 'searchIntent' ? [''] : []), ...providerCatalog.filter(p => p[f.type === 'read' ? 'read' : 'search']).map(p => p.id)]);
  if (f.type === 'reference') schema = schema.role('credential-ref');
  return [f.field, schema.description(f.label).default(f.default)];
}));
// Only this references-only allowlist crosses the native configuration transport.
const settingsSchema = Schema.object(properties).default(defaultSettings).volatile();
export const Config = Schema.object({ settings: settingsSchema });
// rc5 has no strict-object/check API; validate unknown keys and route relationships
// at the public Standard Schema boundary, without serializing closures to the browser.
const standard = Config['~standard'];
Object.defineProperty(Config, '~standard', { value: { ...standard, validate(value) {
  if (value && typeof value === 'object' && Object.keys(value).some(key => key !== 'settings'))
    return { issues: [{ message: 'Only references-only Siftpath settings are accepted.' }] };
  try { validateSettings(value?.settings ?? defaultSettings); }
  catch { return { issues: [{ message: 'Invalid references-only Siftpath settings.' }] }; }
  return standard.validate(value);
} } });

export function coreConfiguration(settings) {
  const s = validateSettings(settings);
  let config = parseConfiguration({ providers: {}, credentials: {}, routes: { searchFallback: [], readFallback: [] } });
  for (const p of providerCatalog) {
    if (s[`${p.id}Enabled`]) config = applySelection(config, { id: p.id, mode: s[`${p.id}Anonymous`] ? 'anonymous' : 'existing' });
  }
  config.routes = {
    search: s.searchProvider, read: s.readProvider, defaultIntent: s.defaultIntent,
    intents: Object.fromEntries(['general', 'semantic', 'research'].filter(i => s[`${i}Provider`]).map(i => [i, s[`${i}Provider`]])),
    searchFallback: [], readFallback: [],
  };
  for (const key of ['timeoutMs', 'providerTimeoutMs', 'maxOutputChars']) config[key] = s[key];
  return parseConfiguration(config);
}
