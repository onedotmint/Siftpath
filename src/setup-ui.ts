import { intro, log, select, multiselect, password, isCancel, cancel, outro } from '@clack/prompts';
import { setupOptions, type SetupProviderName } from './setup-options.js';
import type { CredentialName } from './config.js';

/** Entire module is bundled at build time; none of these packages is needed at runtime. */
export interface SetupWizardResult {
  providers: SetupProviderName[];
  credentials: Partial<Record<CredentialName, string>>;
}
interface WizardPrompts {
  select: typeof select;
  multiselect: typeof multiselect;
  password: typeof password;
  intro: typeof intro;
  outro: typeof outro;
  cancel: typeof cancel;
  log: typeof log;
}
const defaultPrompts: WizardPrompts = { select, multiselect, password, intro, outro, cancel, log };
const mainOptions = setupOptions.filter(p => ['exa', 'tavily', 'parallel', 'brave'].includes(p.id));
const advancedOption = { value: 'advanced', label: 'Advanced: select multiple providers',
  hint: 'Includes optional fetch/rerank/decision providers' };

export async function runSetupWizard(ready: boolean, existingNames: readonly string[],
  prompts: WizardPrompts = defaultPrompts): Promise<SetupWizardResult | null> {
  prompts.intro('Siftpath setup');
  prompts.log.info('One provider is enough. Credentials stay in your private local configuration.');
  const options = [
    ...(ready ? [{ value: 'keep', label: 'Keep existing configuration', hint: 'No changes' }] : []),
    ...mainOptions.map(provider => ({ value: provider.id, label: provider.label, hint: provider.hint })),
    advancedOption,
  ];
  const choice = await prompts.select({ message: 'Choose search provider', options,
    initialValue: ready ? 'keep' : 'exa' });
  if (isCancel(choice)) { prompts.cancel('Cancelled; no changes saved.'); return null; }
  let providers: SetupProviderName[];
  if (choice === 'keep') providers = [];
  else if (choice === 'advanced') {
    const chosen = await prompts.multiselect({
      message: 'Providers (Space: toggle, Enter: continue)',
      options: setupOptions.map(provider => ({
        value: provider.id, label: provider.label, hint: provider.hint,
      })),
      initialValues: ready ? [] : ['exa'],
      required: !ready,
    });
    if (isCancel(chosen)) { prompts.cancel('Cancelled; no changes saved.'); return null; }
    providers = chosen as SetupProviderName[];
  } else providers = [choice as SetupProviderName];

  const credentials: Partial<Record<CredentialName, string>> = {};
  for (const id of providers) {
    const provider = setupOptions.find(item => item.id === id);
    if (!provider) continue;
    prompts.log.info(provider.label + ': get API credentials at ' + provider.url);
    if (id === 'brave') prompts.log.warn('Brave supports search only; select a fetch provider for full pages.');
    for (const name of provider.keys) {
      const alreadySet = existingNames.includes(name);
      const value = await prompts.password({
        message: name + (alreadySet ? ' (Enter to keep existing key)' : ' (required)'),
        validate: text => {
          if (!text.trim() && !alreadySet) return 'Enter an API key, or press Esc to cancel.';
          if (text.length > 4096 || /[\r\n\0]/.test(text)) return 'Invalid key format.';
        },
      });
      if (isCancel(value)) { prompts.cancel('Cancelled; no changes saved.'); return null; }
      if (value.trim()) credentials[name] = value.trim();
    }
  }
  prompts.outro(providers.length ? 'Ready to save configuration locally.' : 'Keeping existing configuration.');
  return { providers, credentials };
}
