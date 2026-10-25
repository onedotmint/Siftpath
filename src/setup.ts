import { readFile } from 'node:fs/promises';
import { configPath, configurationMaxBytes, parseConfiguration, readConfiguration, writePrivateJson } from './config.js';
import { statusReport, testReport, formatStatus, formatTests } from './diagnostics.js';
import { needsSetup } from './setup-plan.js';

export interface SetupOptions { mode?: 'ask' | 'quick' | 'advanced'; nonInteractive?: boolean }
/** Clack is bundled separately and loaded only for an interactive setup, never on the tool path. */
export async function setup({ mode = 'ask', nonInteractive = false }: SetupOptions = {}): Promise<void> {
  const path = configPath();
  const saved = await readConfiguration(path, {});
  if (!nonInteractive && process.stdin.isTTY && process.stdout.isTTY) {
    const ui = await import('./setup-ui.js');
    const chosen = mode === 'ask' ? await ui.chooseSetupMode(needsSetup(saved, process.env)) : mode;
    if (!chosen) return;
    const result = chosen === 'quick' ? await ui.runQuickSetup(saved) : await ui.runSetupWizard(saved);
    if (!result) return;
    await writePrivateJson(path, parseConfiguration(result.configuration), configurationMaxBytes);
    process.stdout.write('Saved private configuration: ' + path + '\n');
    process.stdout.write(formatStatus(await statusReport(await readConfiguration(path), path)) + '\n');
    if (result.test) {
      const controller = new AbortController(), stop = () => controller.abort();
      process.once('SIGINT', stop); process.once('SIGTERM', stop);
      try {
        // Test only the enabled selection; use the same CLI diagnostic implementation, without Router fallback.
        for (const [id, provider] of Object.entries(result.configuration.providers)) if (provider.enabled && !controller.signal.aborted) {
          const report = await testReport(await readConfiguration(path), id, path, process.env, controller.signal);
          process.stdout.write(formatTests(report) + '\n');
          if (!report.ok) process.exitCode = 1;
        }
      } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
    }
  } else {
    process.stdout.write('Non-interactive setup: environment credentials are used; no secrets written.\n');
    try { await readFile(path); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') await writePrivateJson(path, saved, configurationMaxBytes); else throw error;
    }
    process.stdout.write(formatStatus(await statusReport(await readConfiguration(path), path)) + '\n');
  }
}
