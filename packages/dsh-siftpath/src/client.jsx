import { SettingsForm, SettingsValueField, SettingsSecretField, Switch, Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { ConfigController } from './controller.js';
import { fieldDefinitions } from './fields.js';

// Replaced at build time with safe catalog facts, never Node code or credentials.
const catalog = __SIFTPATH_CATALOG__;
const defaults = __SIFTPATH_DEFAULTS__;
export const fields = fieldDefinitions(catalog, defaults);
export { ConfigController };
export const name = 'siftpath-config';
export const inject = ['slots', 'locale', 'configForms', 'remote', 'remote.credentials'];
const NS = 'onedotmint.siftpath';

export function SiftpathConfigPage(props) {
  const state = props.useSiftpathConfig(snapshot => snapshot);
  if (props.view === 'summary') return 'Siftpath search routes and focused page reading. Host provider selection is unchanged.';
  const disabled = !state.writable || state.saving;
  // rc5 SettingsForm owns an unmount effect that calls onDiscard (including secret drafts).
  return <SettingsForm labels={{ unavailable: 'Siftpath configuration is unavailable.', readOnly: 'This configuration is read-only.', saveFailed: 'Save was not fully accepted. Review changes; configuration and credentials are separate stores.', save: 'Save', saving: 'Saving…' }} state={state} onSave={props.save} onDiscard={props.discard}>
    <p>Configure Siftpath here, then use the explicit search selection below. Existing standalone Siftpath configuration is not read or migrated. No automatic fallback is enabled.</p>
    <Button type="button" disabled={state.saving || state.dirty || state.invalid || state.failed || !state.selectionWritable || state.selected} onClick={props.useSearch}>{state.selected ? 'Siftpath search selected' : 'Use Siftpath search'}</Button>
    <p>Save or discard pending settings and keys before selecting Siftpath search. This action changes only DSH’s searchProvider, not fetchProvider. Installation never changes either.</p>
    <p>Keys are write-only DSH credentials. Blank means keep. Changing a reference after entering a key requires re-entering that key.</p>
    {state.notice && <p role="status">{state.notice}</p>}
    {catalog.map(provider => <fieldset key={provider.id} disabled={disabled}>
      <legend>{provider.label}</legend>
      {fields.filter(f => f.field.startsWith(provider.id)).map(def => {
        const field = state.fields[def.field];
        if (def.type === 'boolean') return <label key={def.field} style={{ display: 'flex', gap: '1rem', marginBlock: '.75rem' }}><span>{def.label}</span><Switch label={def.label} checked={field.text === 'true'} disabled={disabled} onChange={value => props.edit(def.field, String(value))} /></label>;
        const badge = state.badges[field.text.trim()];
        return <div key={def.field}>
          <SettingsValueField id={`siftpath-${def.field}`} label={def.label} hint="A DSH credential-reference name, never an API key." text={field.text} overridden={field.overridden} invalid={field.invalid} overriddenLabel="Override" resetLabel="Reset" invalidLabel="Use a valid credential-reference name." disabled={disabled} onEdit={text => props.edit(def.field, text)} onReset={() => props.edit(def.field, def.default)} />
          <SettingsSecretField id={`siftpath-${provider.id}-secret`} label={`${provider.label} API key`} hint="Blank keeps the current key. Saved only to DSH’s credential store, not this configuration." text={state.secrets[provider.id].text} configured={badge?.configured ?? false} stateLabel={badge ? badge.configured ? `Configured (${badge.source ?? 'DSH'})` : 'Not configured' : 'Status unavailable'} disabled={disabled || !badge?.writable} onEdit={text => props.edit(`${provider.id}Secret`, text)} />
          <Button type="button" disabled={disabled || !badge?.writable} onClick={() => props.remove(provider.id)}>Remove stored {provider.label} key</Button>
        </div>;
      })}
    </fieldset>)}
    <fieldset disabled={disabled}><legend>Routes and budgets</legend>
      {fields.filter(f => !f.provider && !catalog.some(p => f.field.startsWith(p.id))).map(def => {
        const field = state.fields[def.field];
        const options = def.type === 'intent' ? ['general', 'semantic', 'research'] : def.type.startsWith('search') ? catalog.filter(p => p.search).map(p => p.id) : def.type === 'read' ? catalog.filter(p => p.read).map(p => p.id) : [];
        return <SettingsValueField key={def.field} id={`siftpath-${def.field}`} label={def.label} hint={def.type === 'number' ? `${def.min}–${def.max}, whole numbers.` : def.type === 'intent' ? 'Choose general, semantic or research.' : options.length ? `Choose an enabled provider: ${options.join(', ')}.${def.type === 'searchIntent' ? ' Blank inherits the default.' : ' Use unconfigured to disable this route.'}` : ''} numeric={def.type === 'number'} {...field} overriddenLabel="Override" resetLabel="Default" invalidLabel="Invalid value; check the allowed values and range." disabled={disabled} onEdit={text => props.edit(def.field, text)} onReset={() => props.edit(def.field, String(def.default))} />;
      })}
    </fieldset>
  </SettingsForm>;
}

export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { en: { title: 'Siftpath' } }));
  const controller = new ConfigController(ctx.configForms.get('siftpath'), ctx.remote, fields, catalog, ctx.configForms.get('web'));
  ctx.effect(() => () => controller.dispose());
  ctx.effect(() => ctx.remote.$on('credentials/reference-updated', () => { void controller.refresh(); }));
  ctx.effect(() => ctx.configForms.whileServed(['siftpath'], () => ctx.slots.inject('plugins.row.config', () => ctx.slots.register({ name: 'plugins.row.config', key: '@onedotmint/dsh-siftpath#siftpath', locale: NS, inject: () => controller.inject() }, SiftpathConfigPage))));
}
