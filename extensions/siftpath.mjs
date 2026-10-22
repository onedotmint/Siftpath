import { fileURLToPath } from 'node:url';

/** Thin Pi command: all configuration, network tests and formatting belong to the CLI. */
export default function (pi) {
  const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
  const running = new Set();
  pi.on('session_shutdown', () => { for (const controller of running) controller.abort(); });
  pi.registerCommand('siftpath', {
    description: 'Offline Siftpath status; test <provider|all> makes real requests (may use API quota)',
    handler: async (args, ctx) => {
      const words = args.trim().split(/\s+/).filter(Boolean);
      if (words.length && (words.length !== 2 || words[0] !== 'test' || !/^(all|[a-z][a-z0-9_-]{0,63})$/.test(words[1]))) {
        ctx.ui.notify('Usage: /siftpath | /siftpath test <provider|all> (may use API quota)', 'warning'); return;
      }
      if (!ctx.hasUI) return;
      const controller = new AbortController(); running.add(controller);
      try {
        if (words.length) ctx.ui.notify('Siftpath: testing providers sequentially; no fallback. This may use API quota.', 'info');
        const result = await pi.exec(process.execPath, [cli, ...(words.length ? words : ['status']), '--json'], { cwd: ctx.cwd, signal: controller.signal });
        // Nonzero exit is expected for failed/skipped tests; their safe report is still on stdout.
        const report = JSON.parse(result.stdout || result.stderr);
        if (typeof report.code === 'string' && typeof report.message === 'string') {
          ctx.ui.notify(`${report.code}: ${report.message}`, 'error'); return;
        }
        if (typeof report.summary !== 'string' || typeof report.ok !== 'boolean') throw new Error();
        ctx.ui.notify(report.summary, report.ok ? 'info' : 'warning');
      } catch {
        ctx.ui.notify('Siftpath CLI did not return a diagnostic report. Run node dist/cli.js status --json; check the build and configuration. Raw process output is hidden.', 'error');
      } finally { running.delete(controller); }
    },
  });
}
