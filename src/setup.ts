import { readFile } from 'node:fs/promises';
import { configPath, diagnostics, parseConfiguration, readConfiguration, writePrivateJson, type Configuration } from './config.js';
import { EngineError } from './core/errors.js';
export { setupProviders } from './setup-options.js';

/** TUI loads only on an interactive terminal, never during normal search or MCP calls. */
export async function setup(nonInteractive = false): Promise<void> {
  const path = configPath();
  let saved: Configuration = { version: 1 };
  try { saved = parseConfiguration(JSON.parse(await readFile(path, 'utf8')) as unknown); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw new EngineError('CONFIG_READ_FAILED', 'Fix the existing configuration before setup; it will not be overwritten.');
  }
  if (!nonInteractive && process.stdin.isTTY && process.stdout.isTTY) {
    const effective = await readConfiguration();
    const configuredNames = Object.entries(effective.credentials ?? {})
      .filter(([, value]) => Boolean(value?.trim())).map(([name]) => name);
    const { runSetupWizard } = await import('./setup-ui.js');
    const result = await runSetupWizard(diagnostics(effective).readyForSearch, configuredNames);
    if (!result) return; // Esc/Ctrl+C: no partial file writes or secrets in output.
    if (result.providers.length || Object.keys(result.credentials).length) {
      saved.credentials = { ...saved.credentials, ...result.credentials };
      await writePrivateJson(path, parseConfiguration(saved));
      process.stdout.write('Saved private configuration at ' + path + '\n');
    } else process.stdout.write('Configuration unchanged.\n');
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
  } else process.stdout.write('No search key. Run siftpath setup in a terminal or set EXA_API_KEY / TAVILY_API_KEY.\n');
}
