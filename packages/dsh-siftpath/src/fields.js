// This module is browser-safe; the provider catalog is supplied by the core at build/runtime.
export function fieldDefinitions(catalog, defaults) {
  return [
    ...catalog.flatMap(p => [
      { field: `${p.id}Enabled`, label: `${p.label} enabled`, type: 'boolean', default: defaults.providers[p.id]?.enabled ?? false },
      ...(p.anonymous ? [{ field: `${p.id}Anonymous`, label: `${p.label} anonymous access`, type: 'boolean', default: false }] : []),
      { field: `${p.id}CredentialRef`, label: `${p.label} credential reference`, type: 'reference', default: p.key, provider: p.id },
    ]),
    { field: 'searchProvider', label: 'Default search provider', type: 'search', default: defaults.routes.search },
    { field: 'readProvider', label: 'Default reader', type: 'read', default: defaults.routes.read },
    ...['general', 'semantic', 'research'].map(intent => ({ field: `${intent}Provider`, label: `${intent} search route (blank inherits default)`, type: 'searchIntent', default: defaults.routes.intents[intent] ?? '' })),
    { field: 'defaultIntent', label: 'Default search intent', type: 'intent', default: defaults.routes.defaultIntent },
    ...[['timeoutMs', 'Operation deadline (ms)', 100, 120000], ['providerTimeoutMs', 'Provider timeout (ms)', 100, 120000], ['maxOutputChars', 'Maximum output characters', 2000, 50000]].map(([field, label, min, max]) => ({ field, label, type: 'number', min, max, default: defaults[field] })),
  ];
}
export function validField(def, value, catalog) {
  if (def.type === 'boolean') return typeof value === 'boolean';
  if (def.type === 'number') return Number.isInteger(value) && value >= def.min && value <= def.max;
  if (typeof value !== 'string') return false;
  if (def.type === 'reference') return /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(value);
  if (def.type === 'intent') return ['general', 'semantic', 'research'].includes(value);
  if (def.type === 'searchIntent' && value === '') return true;
  const kind = def.type === 'read' ? 'read' : 'search';
  return value === 'unconfigured' || catalog.some(p => p.id === value && p[kind]);
}
