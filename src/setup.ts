import { createInterface } from 'node:readline/promises';
import { emitKeypressEvents } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { configPath, credentialNames, diagnostics, parseConfiguration, readConfiguration, writePrivateJson, type Configuration } from './config.js';
import { EngineError } from './core/errors.js';

/** Keys are read in raw mode, never echoed or passed through command-line arguments. */
function secret(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new EngineError('TTY_REQUIRED', 'Interactive key entry requires a terminal. Use environment variables in automation.');
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
      if (text && !key.ctrl && !/[\x00-\x1f\x7f]/.test(text) && value.length + text.length <= 4096) value += text;
    };
    process.stdin.on('keypress', keypress);
  });
}
export async function setup(nonInteractive = false): Promise<void> {
  const path = configPath();
  let saved: Configuration = { version: 1 };
  try { saved = parseConfiguration(JSON.parse(await readFile(path, 'utf8')) as unknown); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new EngineError('CONFIG_READ_FAILED', 'Fix the existing configuration before setup; it will not be overwritten.'); }
  if (!nonInteractive && process.stdin.isTTY && process.stdout.isTTY) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout });
    const selection = await prompt.question('Configure exa, parallel, tavily, brave, firecrawl, jina, or cloudflare (comma-separated; Enter keeps environment keys): ');
    prompt.close();
    const names: Record<string, string[]> = { exa: ['EXA_API_KEY'], parallel: ['PARALLEL_API_KEY'], tavily: ['TAVILY_API_KEY'],
      brave: ['BRAVE_API_KEY'], firecrawl: ['FIRECRAWL_API_KEY'], jina: ['JINA_API_KEY'], cloudflare: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'] };
    for (const provider of selection.split(',').map(s => s.trim()).filter(Boolean)) {
      if (!Object.hasOwn(names, provider)) throw new EngineError('INVALID_INPUT', 'Unknown provider selection.');
      for (const name of names[provider]!) {
        const value = await secret(`${name} (hidden; Enter keeps current): `);
        if (value) {
          const key = credentialNames.find(key => key === name)!;
          saved.credentials = { ...saved.credentials, [key]: value };
        }
      }
    }
    process.stdin.pause();
    await writePrivateJson(path, parseConfiguration(saved));
    process.stdout.write(`Saved ${path} (private file; do not commit it).\n`);
  } else {
    process.stdout.write('Non-interactive setup: existing environment credentials are used; no secrets written.\n');
    try { await readFile(path); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') await writePrivateJson(path, { version: 1 }); else throw error;
    }
  }
  const report = diagnostics(await readConfiguration());
  for (const provider of report.providers) process.stdout.write(`${provider.state.padEnd(8)} ${provider.id.padEnd(11)} ${provider.roles.join('/')}\n`);
  process.stdout.write(report.readyForSearch ? 'Ready. Run siftpath search "your question".\n' : 'Add one search key to get started. Missing optional keys are skipped.\n');
}
