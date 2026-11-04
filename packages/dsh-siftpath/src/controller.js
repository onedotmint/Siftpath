import { SettingsFormModel, settingsNumberField, settingsTextField } from '@deepseek-ai/dsh-client-ui-primitives';
import { validField } from './fields.js';

export class ConfigController {
  constructor(form, remote, fields, catalog, webForm) {
    this.remote = remote;
    this.fields = fields;
    this.catalog = catalog;
    this.badges = {};
    this.secretRefs = new Map();
    this.generation = 0;
    this.disposed = false;
    this.notice = '';
    this.busy = false;
    this.webForm = webForm;
    // Flat native fields live inside the host's single volatile allowlist.
    const unwrap = snapshot => ({ ...snapshot, value: snapshot.value?.settings, base: snapshot.base?.settings, user: snapshot.user?.settings });
    const scope = {
      getSnapshot: () => unwrap(form.getSnapshot()),
      subscribe: listener => form.subscribe(listener),
      mutate: (ops, revision) => form.mutate(ops.map(op => ({ ...op, path: ['settings', ...op.path] })), revision),
    };
    const specs = fields.map(def => ({
      ...(def.type === 'number' ? settingsNumberField(def.field) : settingsTextField(def.field)),
      format: value => value === undefined ? '' : String(value),
      parse: text => {
        const value = def.type === 'boolean' ? text === 'true' ? true : text === 'false' ? false : undefined : def.type === 'number' ? Number(text) : text.trim();
        return validField(def, value, catalog) ? { kind: 'set', value } : undefined;
      },
    }));
    this.model = new SettingsFormModel(scope, specs, fields.filter(f => f.type === 'reference').map(f => ({ field: `${f.provider}Secret`, write: text => this.writeSecret(f, text) })));
    this.actions = this.model.actions();
    this.store = this.model.bind(() => this.projection());
    this.unsubscribe = form.subscribe(() => { void this.refresh(); });
    this.unsubscribeWeb = webForm?.subscribe(() => this.publish());
    void this.refresh();
  }
  projection() {
    const shell = this.model.shell(), web = this.webForm?.getSnapshot();
    return { ...shell, saving: shell.saving || this.busy, selected: web?.value?.searchProvider === 'siftpath', selectionWritable: web?.status === 'ready' && web.writable && web.revision !== undefined, fields: Object.fromEntries(this.fields.map(f => [f.field, this.model.field(f.field)])), secrets: Object.fromEntries(this.fields.filter(f => f.type === 'reference').map(f => [f.provider, this.model.field(`${f.provider}Secret`)])), badges: this.badges, notice: this.notice };
  }
  publish() { if (!this.disposed) this.store.set(this.projection()); }
  ref(def) { return this.model.field(def.field).text.trim(); }
  edit(field, text) {
    if (this.busy || this.model.shell().saving || this.disposed) return;
    this.notice = '';
    const def = this.fields.find(f => `${f.provider}Secret` === field);
    if (def) {
      if (text.trim()) this.secretRefs.set(field, this.ref(def));
      else this.secretRefs.delete(field);
    }
    this.actions.edit(field, text);
    void this.refresh();
  }
  async refresh() {
    const generation = ++this.generation;
    const refs = [...new Set(this.fields.filter(f => f.type === 'reference').map(f => this.ref(f)).filter(ref => /^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(ref)))];
    this.badges = {};
    this.publish();
    try {
      const result = await this.remote.credentials.describe(refs);
      if (this.disposed || generation !== this.generation) return;
      if (result.ok) this.badges = result.value;
      else this.notice = 'Credential status is unavailable. No key values are read by this page.';
    } catch { if (!this.disposed && generation === this.generation) this.notice = 'Credential status is unavailable.'; }
    if (generation === this.generation) this.publish();
  }
  async writeSecret(def, text) {
    const field = `${def.provider}Secret`, ref = this.secretRefs.get(field);
    if (this.disposed || !ref || ref !== this.ref(def)) {
      this.notice = 'Configuration may have saved, but the credential reference changed. Re-enter the key for the intended reference; no key was redirected.';
      return false;
    }
    try {
      const result = await this.remote.credentials.set(ref, text);
      if (!result.ok) throw new Error('refused');
      // Each successful credential write clears its draft even if another store fails.
      this.actions.edit(field, '');
      this.secretRefs.delete(field);
      return true;
    } catch {
      this.notice = 'Configuration may have saved, but a credential write failed. The stores are separate; review the reference and retry or discard.';
      return false;
    }
  }
  async save() {
    if (this.busy || this.model.shell().saving || this.disposed) return;
    this.busy = true;
    this.publish();
    try {
      await this.model.save();
      if (!this.model.shell().failed) this.secretRefs.clear();
      await this.refresh();
    } finally { this.busy = false; this.publish(); }
  }
  discard() {
    this.secretRefs.clear();
    this.notice = '';
    this.actions.discard();
    if (!this.disposed) void this.refresh();
  }
  async remove(provider) {
    if (this.busy || this.model.shell().saving || this.disposed) return;
    const def = this.fields.find(f => f.provider === provider);
    if (!def) return;
    const ref = this.ref(def);
    this.busy = true;
    this.publish();
    try {
      const result = await this.remote.credentials.unset(ref);
      if (!result.ok) throw new Error('refused');
      this.actions.edit(`${provider}Secret`, '');
      this.secretRefs.delete(`${provider}Secret`);
      this.notice = 'Stored credential removed. A DSH ambient credential may become effective again.';
    } catch { this.notice = 'Credential removal failed; the stored key may still be present.'; }
    finally { this.busy = false; }
    await this.refresh();
  }
  async useSearch() {
    const shell = this.model.shell();
    if (this.busy || shell.saving || shell.dirty || shell.invalid || shell.failed || this.disposed) return;
    const snapshot = this.webForm?.getSnapshot();
    if (snapshot?.status !== 'ready' || !snapshot.writable || snapshot.revision === undefined) return;
    this.busy = true;
    this.publish();
    try {
      const accepted = await this.webForm.mutate([{ op: 'set', path: ['searchProvider'], value: 'siftpath' }], snapshot.revision);
      this.notice = accepted ? 'DSH now uses Siftpath for search. Fetch settings were not changed.' : 'Search selection was not accepted; it may have changed elsewhere. Review the current selection and retry.';
    } catch { this.notice = 'Search selection failed. Existing DSH search and fetch settings were not overwritten.'; }
    finally { this.busy = false; this.publish(); }
  }
  inject() {
    return { hooks: { siftpathConfig: this.store }, edit: (field, text) => this.edit(field, text), save: () => { void this.save(); }, discard: () => this.discard(), remove: provider => { void this.remove(provider); }, useSearch: () => { void this.useSearch(); } };
  }
  dispose() {
    this.disposed = true;
    this.generation++;
    this.discard();
    this.unsubscribe();
    this.unsubscribeWeb?.();
    this.model.dispose();
  }
}
