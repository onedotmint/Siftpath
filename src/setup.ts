import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { configPath, diagnostics, parseConfiguration, readConfiguration, writePrivateJson, type Configuration } from './config.js';
import { EngineError } from './core/errors.js';

const keys = {
  exa: ['EXA_API_KEY'],
  tavily: ['TAVILY_API_KEY'],
  parallel: ['PARALLEL_API_KEY'],
  brave: ['BRAVE_API_KEY'],
  firecrawl: ['FIRECRAWL_API_KEY'],
  jina: ['JINA_API_KEY'],
  cloudflare: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'],
} as const;
type ProviderName = keyof typeof keys;
const keyPages: Partial<Record<ProviderName, string>> = {
  exa: 'https://dashboard.exa.ai/api-keys',
  tavily: 'https://app.tavily.com/',
  parallel: 'https://platform.parallel.ai/',
  brave: 'https://api-dashboard.search.brave.com/',
};

/** Pure selection logic: an already-configured user defaults to no changes. */
export function setupProviders(answer: string, alreadyReady: boolean): ProviderName[] {
  const requested = answer.trim().toLowerCase() || (alreadyReady ? '' : 'exa');
  if (!requested) return [];
  const providers = requested.split(',').map(item => item.trim()).filter(Boolean);
  if (providers.some(id => !Object.hasOwn(keys, id)))
    throw new EngineError('INVALID_INPUT', 'Choose exa, tavily, parallel, brave, or an advanced provider listed in the prompt.');
  return [...new Set(providers)] as ProviderName[];
}

/** Masked TTY input: provider credentials never appear in arguments or agent chat. */
function secret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new EngineError('TTY_REQUIRED', 'Open an interactive terminal, or supply provider keys through environment variables.');
  process.stdout.write(prompt); emitKeypressEvents(process.stdin);
  const wasRaw = process.stdin.isRaw; process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (cancel = false) => {
      process.stdin.off('keypress', keypress); process.stdin.setRawMode(wasRaw); process.stdout.write('\n');
      if (cancel) reject(new EngineError('ABORTED', 'Setup cancelled.')); else resolve(value.trim());
    };
    const keypress = (text: string | undefined, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === 'c' || key.name === 'escape') { finish(true); return; }
      if (key.name === 'return' || key.name === 'enter') { finish(); return; }
      if (key.name === 'backspace') { value = [...value].slice(0, -1).join(''); return; }
      if (text && !key.ctrl && !/[\x00-\x1f\x7f]/.test(text) && value.length + text.length <= 4096)
        value += text;
    };
    process.stdin.on('keypress', keypress);
  });
}
export async function setup(nonInteractive = false): Promise<void> {
  const path = configPath();
  let saved: Configuration = { version: 1 };
  try { saved = parseConfiguration(JSON.parse(await readFile(path, 'utf8')) as unknown); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw new EngineError('CONFIG_READ_FAILED', 'Fix the existing configuration before setup; it will not be overwritten.');
  }
  if (!nonInteractive && process.stdin.isTTY && process.stdout.isTTY) {
    const ready = diagnostics(await readConfiguration()).readyForSearch;
    process.stdout.write('Siftpath setup: one search API key is enough.\n');
    process.stdout.write('Recommended: Exa (search + page extraction). Get a key: https://dashboard.exa.ai/api-keys\n');
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    const selected = await prompt.question(ready
      ? 'Add or update a provider? [keep] (exa/tavily/parallel/brave/advanced): '
      : 'Search provider [exa] (tavily/parallel/brave/advanced): ');
    let answer = selected;
    if (selected.trim().toLowerCase() === 'advanced')
      answer = await prompt.question('Provider names (comma-separated: exa,tavily,parallel,brave,firecrawl,jina,cloudflare): ');
    prompt.close();
    for (const provider of setupProviders(answer, ready)) {
      if (provider === 'brave') process.stdout.write('Note: Brave only searches; full-page extraction needs another provider.\n');
      if (keyPages[provider]) process.stdout.write('Provider key page: ' + keyPages[provider] + '\n');
      for (const name of keys[provider]) {
        const value = await secret(name + ' (hidden; Enter keeps existing key): ');
        if (value) saved.credentials = { ...saved.credentials, [name]: value };
      }
    }
    process.stdin.pause();
    await writePrivateJson(path, parseConfiguration(saved));
    process.stdout.write('Saved private configuration at ' + path + '\n');
  } else {
    process.stdout.write('Non-interactive setup: existing environment credentials are used; no secrets written.\n');
    try { await readFile(path); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') await writePrivateJson(path, { version: 1 });
      else throw error;
    }
  }
  const report = diagnostics(await readConfiguration());
  if (report.readyForSearch) {
    process.stdout.write('Search provider configured (key not yet verified).\n');
    process.stdout.write('Optional live check (may incur charges): siftpath doctor --live\n');
    process.stdout.write('Then run: siftpath search "HTTP ETag", or ask your AI assistant to search.\n');
  } else {
    process.stdout.write('No search key. Run siftpath setup in a terminal or set EXA_API_KEY / TAVILY_API_KEY.\n');
  }
}
