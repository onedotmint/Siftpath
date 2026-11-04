import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { defaultSettings } from '../lib/config.js';

// Browser platform boundary double; runtime.test exercises the real Cordis/services.
class FormModel {
  constructor(scope, specs, secrets) { this.scope = scope; this.specs = specs; this.secrets = secrets; this.drafts = new Map(); this.listeners = new Set(); this.failed = false; this.saving = false; this.unsubscribe = scope.subscribe(() => this.publish()); }
  field(field) { const value = this.drafts.has(field) ? this.drafts.get(field) : this.specs.some(s => s.field === field) ? this.scope.getSnapshot().value?.[field] : ''; return { text: value === undefined ? '' : String(value), overridden: this.drafts.has(field), invalid: false }; }
  shell() { return { available: true, writable: true, dirty: this.drafts.size > 0, invalid: false, saving: this.saving, failed: this.failed }; }
  bind(project) { let value = project(); const listeners = new Set(); const store = { getSnapshot: () => value, set: next => { value = next; for (const l of listeners) l(); }, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); } }; this.listeners.add(() => store.set(project())); return store; }
  publish() { for (const fn of this.listeners) fn(); }
  actions() { return { edit: (field, text) => { this.baseline ??= this.scope.getSnapshot(); this.drafts.set(field, text); this.publish(); }, discard: () => { this.drafts.clear(); this.baseline = undefined; this.failed = false; this.publish(); } }; }
  async save() {
    this.saving = true; this.failed = false;
    try {
      const entries = [...this.drafts];
      const ops = entries.flatMap(([field, text]) => { const spec = this.specs.find(s => s.field === field); if (!spec) return []; const parsed = spec.parse(text); if (!parsed) throw new Error('invalid'); return [{ op: 'set', path: [field], value: parsed.value }]; });
      if (ops.length && !await this.scope.mutate(ops, this.baseline?.revision)) throw new Error('refused');
      for (const [field, text] of entries) { const secret = this.secrets.find(s => s.field === field); if (secret && text.trim() && !await secret.write(text.trim())) throw new Error('secret refused'); }
      this.actions().discard();
    } catch { this.failed = true; }
    finally { this.saving = false; this.publish(); }
  }
  dispose() { this.unsubscribe(); this.listeners.clear(); }
}
const primitives = { SettingsFormModel: FormModel, settingsTextField: field => ({ field }), settingsNumberField: field => ({ field }) };
async function client() {
  let registration;
  vm.runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), { window: { __ModuleLoader__: { load: value => { registration = value; } } } });
  assert.equal(registration.id, '@onedotmint/dsh-siftpath');
  const requests = [];
  const exports = registration.factory(id => {
    requests.push(id);
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return primitives;
    if (id === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null };
    throw new Error(`Unexpected browser import ${id}`);
  });
  assert.ok(!requests.some(id => id.includes('node:') || id === '@onedotmint/siftpath'));
  return exports;
}
function scope() {
  let snapshot = { status: 'ready', value: { settings: structuredClone(defaultSettings) }, base: { settings: structuredClone(defaultSettings) }, user: {}, revision: 7, writable: true };
  const listeners = new Set(), writes = [];
  return {
    writes,
    getSnapshot: () => snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    change(patch) { snapshot = { ...snapshot, revision: snapshot.revision + 1, value: { settings: { ...snapshot.value.settings, ...patch } } }; for (const fn of listeners) fn(); },
    async mutate(ops, revision) { writes.push({ ops, revision }); if (revision !== snapshot.revision) return false; for (const op of ops) snapshot.value.settings[op.path[1]] = op.value; snapshot = { ...snapshot, revision: snapshot.revision + 1 }; for (const fn of listeners) fn(); return true; },
  };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('packaged lazy client registers the exact native row page and cleans up subscriptions', async () => {
  const c = await client();
  const form = scope(), effects = [], registrations = [];
  let disposed = 0;
  const ctx = {
    locale: { register: () => () => { disposed++; } },
    configForms: { get: id => { assert.ok(['siftpath', 'web'].includes(id)); return form; }, whileServed: (ids, fn) => { assert.deepEqual(Array.from(ids), ['siftpath']); return fn(); } },
    remote: { credentials: { describe: async () => ({ ok: true, value: {} }) }, $on: () => () => { disposed++; } },
    effect: fn => { const clean = fn(); effects.push(clean); return clean; },
    slots: { inject: (name, fn) => { assert.equal(name, 'plugins.row.config'); return fn(); }, register: (spec, page) => { registrations.push(spec); assert.equal(page, c.SiftpathConfigPage); return () => { disposed++; }; } },
  };
  c.apply(ctx);
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].key, '@onedotmint/dsh-siftpath#siftpath');
  assert.equal(registrations[0].id, undefined);
  assert.ok(registrations[0].inject().hooks.siftpathConfig);
  for (const dispose of effects.reverse()) dispose();
  assert.equal(disposed, 3);
});

test('browser keeps blank secrets, fences original revision, never redirects keys, and reports partial saves', async () => {
  const { ConfigController, fields } = await client();
  const catalog = [{ id: 'tavily', search: true }, { id: 'exa', search: true }, { id: 'jina', read: true }, { id: 'firecrawl', read: true }, { id: 'deepseek', search: true }, { id: 'brave', search: true }];
  const form = scope(), writes = [];
  let refuse = false;
  const remote = { credentials: {
    describe: async refs => ({ ok: true, value: Object.fromEntries(refs.map(ref => [ref, { configured: true, writable: true }])) }),
    set: async (ref, value) => { writes.push([ref, value]); return { ok: !refuse }; },
    unset: async ref => { writes.push([ref, 'unset']); return { ok: !refuse }; },
  } };
  const controller = new ConfigController(form, remote, fields, catalog); await tick();
  assert.equal(controller.store.getSnapshot().secrets.jina.text, '');
  controller.edit('jinaSecret', ''); await controller.save(); assert.deepEqual(writes, []);
  controller.edit('maxOutputChars', '12000'); form.change({ timeoutMs: 30000 }); await controller.save();
  assert.equal(form.writes[0].revision, 7); assert.equal(controller.store.getSnapshot().failed, true);
  controller.discard();
  controller.edit('jinaSecret', 'private-key'); controller.edit('jinaCredentialRef', 'OTHER_KEY'); await controller.save();
  assert.deepEqual(writes, []); assert.match(controller.store.getSnapshot().notice, /reference changed/);
  controller.discard();
  controller.edit('jinaSecret', 'new-private-key'); await controller.save();
  assert.deepEqual(writes[0], ['OTHER_KEY', 'new-private-key']); assert.equal(controller.store.getSnapshot().secrets.jina.text, '');
  refuse = true; controller.edit('jinaSecret', 'never-log-this'); await controller.save();
  assert.equal(controller.store.getSnapshot().failed, true); assert.match(controller.store.getSnapshot().notice, /credential write failed/);
  assert.ok(!controller.store.getSnapshot().notice.includes('never-log-this'));
  controller.discard(); assert.equal(controller.store.getSnapshot().secrets.jina.text, '');
  await controller.remove('jina'); assert.match(controller.store.getSnapshot().notice, /removal failed/);
  controller.dispose(); assert.equal(controller.secretRefs.size, 0);
});

test('late credential badges cannot overwrite a changed reference or publish after disposal', async () => {
  const { ConfigController, fields } = await client();
  const form = scope(), pending = [];
  const remote = { credentials: { describe: refs => new Promise(resolve => pending.push({ refs, resolve })) } };
  const controller = new ConfigController(form, remote, fields, []);
  controller.edit('jinaCredentialRef', 'NEW_KEY');
  const first = pending[0], last = pending.at(-1);
  last.resolve({ ok: true, value: { NEW_KEY: { configured: false, writable: true } } }); await tick();
  first.resolve({ ok: true, value: { JINA_API_KEY: { configured: true, writable: true } } }); await tick();
  assert.equal(controller.store.getSnapshot().badges.JINA_API_KEY, undefined);
  assert.equal(controller.store.getSnapshot().badges.NEW_KEY.configured, false);
  controller.dispose();
});

test('explicit native search selection is revision-fenced and removal locks edits/save', async () => {
  const { ConfigController, fields } = await client();
  const form = scope(), mutations = [], removed = [], saved = [];
  let release;
  const snapshot = { status: 'ready', writable: true, revision: 12, value: { searchProvider: 'existing', fetchProvider: 'keep-fetch' } };
  const web = { getSnapshot: () => snapshot, subscribe: () => () => {}, async mutate(ops, revision) { mutations.push({ ops, revision }); return true; } };
  const remote = { credentials: { describe: async () => ({ ok: true, value: {} }), unset: ref => { removed.push(ref); return new Promise(resolve => { release = () => resolve({ ok: true }); }); }, set: async (...args) => { saved.push(args); return { ok: true }; } } };
  const controller = new ConfigController(form, remote, fields, [], web);
  assert.deepEqual(mutations, []);
  await controller.useSearch();
  assert.equal(mutations.length, 1); assert.equal(mutations[0].revision, 12);
  assert.deepEqual(JSON.parse(JSON.stringify(mutations[0].ops)), [{ op: 'set', path: ['searchProvider'], value: 'siftpath' }]);
  assert.equal(snapshot.value.fetchProvider, 'keep-fetch');
  controller.edit('maxOutputChars', '12000'); await controller.useSearch();
  assert.equal(mutations.length, 1); controller.discard();
  const pending = controller.remove('jina');
  assert.equal(controller.store.getSnapshot().saving, true);
  controller.edit('jinaCredentialRef', 'DO_NOT_REDIRECT');
  controller.edit('jinaSecret', 'do-not-save');
  await controller.save(); await controller.useSearch();
  assert.equal(controller.ref(fields.find(f => f.provider === 'jina')), 'JINA_API_KEY');
  assert.deepEqual(removed, ['JINA_API_KEY']); assert.deepEqual(saved, []); assert.equal(mutations.length, 1);
  release(); await pending; assert.equal(controller.store.getSnapshot().saving, false);
  controller.dispose();
});
