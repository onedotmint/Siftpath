#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { configPath, createEngine, diagnostics, readConfiguration, saveUsage, usagePath, siftpathEnv } from './config.js';
import { EngineError } from './core/errors.js';
import { serveHttp } from './mcp/http.js';
import { serveStdio } from './mcp/stdio.js';
import { setup } from './setup.js';
import { packageVersion } from './version.js';
import { invokeTool, safeError, summary } from './tools.js';
import type { TraceEvent } from './core/types.js';

const help = `Siftpath - web evidence retrieval for AI agents

  siftpath search "question" [--mode fast|quality] [--recency 7d] [--domains example.com]
  siftpath fetch URL [URL ...] [--query "objective"] [--max-tokens 3000]
  siftpath gather "comparison" [--mode quality] [--max-tokens 6000]
  siftpath html --url https://example.com/article [--query "objective"] [--readability] < page.html
  siftpath setup [--non-interactive]
  siftpath doctor [--json]
  siftpath providers
  siftpath usage
  siftpath integration pi|codex|cursor|claude-code|deepseek-harness
  siftpath mcp [--http --host 127.0.0.1 --port 7337]

Retrieval output is compact JSON on stdout; --trace writes diagnostics to stderr.
Keys: EXA_API_KEY / PARALLEL_API_KEY / TAVILY_API_KEY / BRAVE_API_KEY (one is enough).
Optional: FIRECRAWL_API_KEY, JINA_API_KEY, CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN.
HTTP requires SIFTPATH_SERVER_TOKEN (24+ random characters); TLS is external.
`;
export async function main(argv = process.argv.slice(2)): Promise<void> {
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true, strict: true, options: {
      help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' },
      mode: { type: 'string' }, 'max-results': { type: 'string' }, 'max-tokens': { type: 'string' },
      recency: { type: 'string' }, domains: { type: 'string' }, query: { type: 'string' },
      url: { type: 'string' }, readability: { type: 'boolean' },
      trace: { type: 'boolean' }, json: { type: 'boolean' },
      'non-interactive': { type: 'boolean' }, http: { type: 'boolean' }, host: { type: 'string' }, port: { type: 'string' },
    } });
  } catch { throw new EngineError('INVALID_INPUT', 'Invalid command-line arguments. Run siftpath --help.'); }
  const values = parsed.values;
  const [command, ...args] = parsed.positionals;
  if (values.version) { process.stdout.write(`${packageVersion}\n`); return; }
  if (values.help || !command) { process.stdout.write(help); return; }
  if (command === 'setup') { await setup(Boolean(values['non-interactive'])); return; }
  if (command === 'usage') {
    try { process.stdout.write(await readFile(usagePath(), 'utf8')); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      process.stdout.write(JSON.stringify({ scope: 'last CLI operation', available: false, note: 'SDK and Pi retain session totals; CLI records its latest operation without queries or URLs.' }) + '\n');
    }
    return;
  }
  if (command === 'integration') {
    const client = args[0];
    if (!client || !['pi', 'codex', 'cursor', 'claude-code', 'deepseek-harness'].includes(client))
      throw new EngineError('INVALID_INPUT', 'Choose pi, codex, cursor, claude-code, or deepseek-harness.');
    const root = fileURLToPath(new URL('..', import.meta.url));
    const report = { client, packageRoot: root, skill: resolve(root, 'skills/web-research'),
      entry: client === 'pi' ? resolve(root, 'integrations/pi/index.ts') : resolve(root, `integrations/${client}`),
      mcp: { command: process.execPath, args: [fileURLToPath(import.meta.url), 'mcp'] },
      guide: resolve(root, 'docs/INTEGRATIONS.md'),
    };
    process.stdout.write(JSON.stringify(report, null, 2) + '\n'); return;
  }
  const configuration = await readConfiguration();
  if (command === 'doctor' || command === 'providers') {
    const report = diagnostics(configuration);
    if (values.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    else {
      process.stdout.write(`Node ${report.runtime} | configuration ${configPath()}\n`);
      for (const provider of report.providers) process.stdout.write(`${provider.state.padEnd(8)} ${provider.id.padEnd(11)} ${provider.roles.join('/')}\n`);
      process.stdout.write(`Routes: fast=${report.routes.fast.join(',') || 'none'} quality=${report.routes.quality.join(',') || 'none'}\n`);
      process.stdout.write('No network calls made. Run npm run test:live from source for explicit, potentially billable provider checks.\n');
    }
    // A missing optional provider is not an error; doctor signals unusable retrieval configuration.
    if (command === 'doctor' && (!report.supportedRuntime || !report.readyForSearch && !report.readyForFetch)) process.exitCode = 2;
    return;
  }
  const trace = values.trace ? (event: TraceEvent) => process.stderr.write(JSON.stringify(event) + '\n') : undefined;
  if (command === 'mcp') {
    if (values.http) {
      const port = values.port === undefined ? 7337 : Number(values.port);
      if (!Number.isInteger(port) || port < 0 || port > 65535) throw new EngineError('INVALID_INPUT', 'port must be 0-65535.');
      const server = await serveHttp({ createEngine: () => createEngine(configuration), token: siftpathEnv('SERVER_TOKEN') ?? '',
        host: typeof values.host === 'string' ? values.host : undefined, port, onTrace: trace,
        allowedHosts: siftpathEnv('ALLOWED_HOSTS')?.split(',').map(s => s.trim()).filter(Boolean),
        allowedOrigins: siftpathEnv('ALLOWED_ORIGINS')?.split(',').map(s => s.trim()).filter(Boolean),
      });
      process.stderr.write(`Siftpath MCP listening on ${server.host}:${server.port}/mcp; use HTTPS at the reverse proxy.\n`);
      const stop = () => { void server.close(); };
      process.once('SIGINT', stop); process.once('SIGTERM', stop);
      server.server.once('close', () => { process.off('SIGINT', stop); process.off('SIGTERM', stop); });
    } else await serveStdio(createEngine(configuration), process.stdin, process.stdout, trace);
    return;
  }
  if (command === 'html') {
    if (args.length || typeof values.url !== 'string' || process.stdin.isTTY)
      throw new EngineError('INVALID_INPUT', 'Pipe HTML into stdin and supply --url as source metadata.');
    const chunks: Buffer[] = []; let total = 0;
    for await (const chunk of process.stdin) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
      total += bytes.length;
      if (total > 1_048_576) throw new EngineError('INVALID_INPUT', 'HTML exceeds 1 MiB.');
      chunks.push(bytes);
    }
    const result = await createEngine(configuration).fromHtml({
      url: values.url, html: Buffer.concat(chunks).toString('utf8'),
      ...(typeof values.query === 'string' ? { query: values.query } : {}),
      ...(values['max-tokens'] !== undefined ? { maxTokens: Number(values['max-tokens']) } : {}),
      ...(values.readability ? { extractor: 'readability' as const } : {}),
    });
    process.stdout.write(JSON.stringify(result) + '\n');
    try { await saveUsage(result.usage); } catch { process.stderr.write('USAGE_WRITE_FAILED: local extraction succeeded but usage could not be saved.\n'); }
    return;
  }
  if (!['search', 'fetch', 'gather'].includes(command)) throw new EngineError('INVALID_INPUT', 'Unknown command. Run siftpath --help.');
  const input: Record<string, unknown> = {};
  if (command === 'fetch') {
    if (args.length) input.urls = args;
    if (values.query !== undefined) input.query = values.query;
  } else input.query = args.join(' ');
  if (values.mode !== undefined) input.mode = values.mode;
  if (values['max-tokens'] !== undefined) input.maxTokens = Number(values['max-tokens']);
  if (values['max-results'] !== undefined) input.maxResults = Number(values['max-results']);
  if (values.recency !== undefined) input.recency = values.recency;
  if (values.domains !== undefined) input.domains = String(values.domains).split(',').map(s => s.trim());
  const controller = new AbortController(); const stop = () => controller.abort();
  process.once('SIGINT', stop); process.once('SIGTERM', stop);
  try {
    const result = await invokeTool(createEngine(configuration), `web_${command}`, input, { signal: controller.signal, onTrace: trace });
    process.stdout.write(JSON.stringify(result) + '\n');
    if (!values.json && process.stderr.isTTY) process.stderr.write(summary(result) + '\n');
    try { await saveUsage(result.usage); } catch { process.stderr.write('USAGE_WRITE_FAILED: retrieval succeeded, but local usage could not be saved.\n'); }
  } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { const safe = safeError(error); process.stderr.write(JSON.stringify(safe) + '\n'); process.exitCode = safe.code === 'ABORTED' ? 130 : 1; });
}
