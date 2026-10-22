#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { configPath, readConfiguration, diagnostics } from './config.js';
import { statusReport, testReport, formatStatus, formatTests } from './diagnostics.js';
import { SiftpathError, safeError } from './errors.js';
import { Siftpath } from './router.js';
import { serveStdio } from './mcp/stdio.js';
import { setup } from './setup.js';
import { packageVersion } from './version.js';
import { invokeTool } from './tools.js';
const help = `Siftpath — lightweight official MCP router (Node.js 22+)
  siftpath mcp
  siftpath search "question" [--intent general|semantic|research] [--max-results 5]
  siftpath read URL [--focus "question about the page"]
  siftpath status [--json]               # offline configuration and last tests
  siftpath test <provider|all> [--json]   # real requests, no fallback; may use API quota
  siftpath doctor
  siftpath setup [--non-interactive]     # Clack provider/Key/routes wizard; tests are opt-in
  siftpath --version
Configuration: SIFTPATH_CONFIG or ~/.config/siftpath/config.json (JSON).
Keys: BRAVE_API_KEY, EXA_API_KEY, JINA_API_KEY; optional TAVILY_API_KEY, FIRECRAWL_API_KEY.
Only the selected provider is called; failures try configured fallbacks sequentially.
`;
export async function main(argv = process.argv.slice(2)): Promise<void> {
  let parsed;
  try { parsed = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
    help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' }, intent: { type: 'string' },
    json: { type: 'boolean' }, 'max-results': { type: 'string' }, focus: { type: 'string' }, 'non-interactive': { type: 'boolean' },
  } }); } catch { throw new SiftpathError('INVALID_INPUT', 'Invalid command-line arguments. Run siftpath --help.'); }
  const { values, positionals: [command, ...args] } = parsed;
  if (command === 'search' && values.focus !== undefined || command === 'read' && (values.intent !== undefined || values['max-results'] !== undefined))
    throw new SiftpathError('INVALID_INPUT', 'Options do not match the selected command. Run siftpath --help.');
  if (values.help || !command && !values.version) { process.stdout.write(help); return; }
  if (values.version) { process.stdout.write(packageVersion + '\n'); return; }
  if (command === 'setup') { await setup(Boolean(values['non-interactive'])); return; }
  if (!['mcp', 'search', 'read', 'doctor', 'status', 'test'].includes(command!)) throw new SiftpathError('INVALID_INPUT', 'Unknown command. Run siftpath --help.');
  const config = await readConfiguration();
  if (command === 'doctor') { process.stdout.write(JSON.stringify(diagnostics(config), null, 2) + '\n'); return; }
  if (command === 'status') {
    if (args.length) throw new SiftpathError('INVALID_INPUT', 'status takes no positional arguments.');
    const report = await statusReport(config);
    process.stdout.write((values.json ? JSON.stringify({ ...report, summary: formatStatus(report) }) : formatStatus(report)) + '\n'); return;
  }
  if (command === 'test') {
    if (args.length !== 1) throw new SiftpathError('INVALID_INPUT', 'Use siftpath test <provider|all> [--json].');
    const controller = new AbortController(), stop = () => controller.abort();
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    try {
      const report = await testReport(config, args[0]!, configPath(), process.env, controller.signal);
      process.stdout.write((values.json ? JSON.stringify({ ...report, summary: formatTests(report) }) : formatTests(report)) + '\n');
      if (!report.ok) process.exitCode = controller.signal.aborted ? 130 : 1;
    } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
    return;
  }
  const router = new Siftpath(config);
  if (command === 'mcp') { try { await serveStdio(router); } finally { await router.close(); } return; }
  const controller = new AbortController(), stop = () => controller.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    if (command === 'read' && args.length !== 1) throw new SiftpathError('INVALID_INPUT', 'read requires exactly one URL.');
    const input = command === 'search'
      ? { query: args.join(' '), ...(values.intent !== undefined ? { intent: values.intent } : {}),
          ...(values['max-results'] !== undefined ? { maxResults: Number(values['max-results']) } : {}) }
      : { url: args[0], ...(values.focus !== undefined ? { focus: values.focus } : {}) };
    const result = await invokeTool(router, `web_${command}`, input, { signal: controller.signal });
    process.stdout.write(JSON.stringify(result) + '\n');
  } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); await router.close(); }
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { const safe = safeError(error); process.stderr.write(JSON.stringify(safe) + '\n'); process.exitCode = safe.code === 'ABORTED' ? 130 : 1; });
}
