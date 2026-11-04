import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { z } from 'zod';
import { McpError, type Tool } from '@modelcontextprotocol/sdk/types.js';
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv';
import { StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { McpClients } from './client.js';
import { deepseekSearch } from './deepseek.js';
import { configPath, diagnostics, providerStatus, resolveSecret, writePrivateJson, type Configuration } from './config.js';
import { SiftpathError } from './errors.js';
import { normalize } from './output.js';
import { mapArguments } from './router.js';
import { packageVersion } from './version.js';

const reasons = {
  NOT_CONFIGURED: 'Provider is not configured.', DISABLED: 'Provider is disabled.', MISSING_CREDENTIALS: 'Required credential references are missing.',
  CONNECTION_FAILED: 'Cannot connect. Check the MCP command/URL, credentials and connectivity.',
  AUTH_FAILED: 'Authentication rejected. Check credentials and account access.', RATE_LIMITED: 'Rate or quota limit reached.',
  BALANCE_EXHAUSTED: 'The provider requires payment or top-up before this account can run the request.',
  DISCOVERY_FAILED: 'Cannot list official MCP tools.', TOOL_NOT_FOUND: 'A configured tool was not found in tools/list.',
  INVALID_UPSTREAM_ARGUMENTS: 'Provider rejected mapped arguments or native input limits; check the binding and provider limits.',
  UPSTREAM_ERROR: 'Official MCP tool failed. Check account permissions/quota and tool configuration.',
  UPSTREAM_FORBIDDEN: 'The provider refused this request for this account. The exact reason is upstream (permission, plan, entitlement or suspended access); this is not a Siftpath configuration error.',
  INVALID_UPSTREAM_RESPONSE: 'Provider returned malformed output or violated its declared output schema.', TASK_REQUIRED: 'Configured tool requires task execution, not a synchronous search/read call.',
  OUTPUT_LIMIT: 'Source metadata exceeded maxOutputChars.', EMPTY_RESPONSE: 'Official MCP returned no readable text.', NO_SOURCES: 'Official MCP returned no traceable public source.',
  RESPONSE_TOO_LARGE: 'Provider response exceeded 4 MiB.',
  UNSUPPORTED_OPERATION: 'No search or read binding is configured.', PROVIDER_TIMEOUT: 'Provider test deadline exceeded.', ABORTED: 'Test cancelled.',
} as const;
const codeSchema = z.enum(Object.keys(reasons) as [keyof typeof reasons, ...(keyof typeof reasons)[]]);
const stage = z.enum(['not_tested', 'passed', 'failed']);
const testSchema = z.strictObject({
  provider: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/), testedAt: z.iso.datetime(), durationMs: z.number().nonnegative(),
  outcome: z.enum(['passed', 'failed', 'skipped']), code: codeSchema.optional(),
  stages: z.strictObject({ connection: stage, discovery: stage, request: stage }),
  operations: z.array(z.strictObject({ operation: z.enum(['search', 'read']), state: stage, durationMs: z.number().nonnegative(), code: codeSchema.optional() })).max(2),
});
export type ProviderTest = z.infer<typeof testSchema>;
/** A tool-level refusal carries the provider's own error envelope; keep its status, never the message. */
export function upstreamStatus(raw: unknown): number | undefined {
  const error = (raw as { structuredContent?: { error?: { status?: unknown } } })?.structuredContent?.error;
  const status = error?.status;
  if (typeof status === 'number' && Number.isInteger(status) && status >= 400 && status < 600) return status;
  // Some tools report no status field and only spell the code out in their text; read the code, never the words.
  const parts = (raw as { content?: { type?: string; text?: unknown }[] })?.content;
  if (!Array.isArray(parts)) return;
  for (const block of parts) {
    const match = block?.type === 'text' && typeof block.text === 'string' && /^\s*HTTP (\d{3})\b/.exec(block.text);
    if (match) {
      const text = Number(match[1]);
      if (text >= 400 && text < 600) return text;
    }
  }
  return;
}
const historySchema = z.strictObject({ version: z.literal(1), tests: z.record(z.string(), z.strictObject({
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/), configHash: z.string().regex(/^[a-f0-9]{64}$/).optional(), result: testSchema })) });
type History = z.infer<typeof historySchema>;
const maxHistoryBytes = 1048576;
export function testHistoryPath(path = configPath()): string { return join(dirname(path), '.' + basename(path) + '.siftpath-tests.json'); }
function fingerprint(id: string, config: Configuration, env: NodeJS.ProcessEnv): { hash: string; configHash: string } {
  const provider = Object.hasOwn(config.providers, id) ? config.providers[id] : undefined;
  const limits = { timeoutMs: Math.min(config.timeoutMs, provider?.timeoutMs ?? config.providerTimeoutMs), maxOutputChars: config.maxOutputChars };
  const configHash = createHash('sha256').update(JSON.stringify(provider ?? null)).update(JSON.stringify(limits))
    .update(provider ? resolveSecret(JSON.stringify(provider.connection), config, env) : '').digest('hex');
  return { hash: createHash('sha256').update(packageVersion).update(configHash).digest('hex'), configHash };
}
async function readHistory(path: string): Promise<{ data: History; warning?: string }> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxHistoryBytes) throw new Error();
    return { data: historySchema.parse(JSON.parse(await readFile(path, 'utf8'))) };
  } catch (error) {
    return { data: { version: 1, tests: {} }, ...((error as NodeJS.ErrnoException).code === 'ENOENT' ? {} : { warning: 'TEST_HISTORY_UNREADABLE' }) };
  }
}
function errorCode(error: unknown): keyof typeof reasons {
  if (error instanceof StreamableHTTPError && [401, 403].includes(error.code ?? 0)) return 'AUTH_FAILED';
  if (error instanceof StreamableHTTPError && error.code === 429) return 'RATE_LIMITED';
  if (error instanceof McpError && error.code === -32602) return 'INVALID_UPSTREAM_ARGUMENTS';
  if (error instanceof SiftpathError && Object.hasOwn(reasons, error.code)) return error.code as keyof typeof reasons;
  return 'UPSTREAM_ERROR';
}
/** A strict provider contract probe, not an equivalent execution of Router selection, fallback or focus. */
export async function providerTest(id: string, config: Configuration, env: NodeJS.ProcessEnv = process.env, caller?: AbortSignal): Promise<ProviderTest> {
  const start = performance.now(), status = providerStatus(id, config, env), provider = config.providers[id];
  const result: ProviderTest = { provider: id, testedAt: new Date().toISOString(), durationMs: 0, outcome: 'skipped',
    stages: { connection: 'not_tested', discovery: 'not_tested', request: 'not_tested' }, operations: [] };
  if (status.code !== 'READY') { result.code = status.code as keyof typeof reasons; return result; }
  const operations = (['search', 'read'] as const).filter(kind => !!provider?.[kind]);
  if (!operations.length) { result.code = 'UNSUPPORTED_OPERATION'; return result; }
  result.operations = operations.map(operation => ({ operation, state: 'not_tested', durationMs: 0 }));
  const clients = new McpClients(config, env), timeout = AbortSignal.timeout(Math.min(config.timeoutMs, provider!.timeoutMs ?? config.providerTimeoutMs));
  const signal = AbortSignal.any([timeout, ...(caller ? [caller] : [])]);
  let current: keyof ProviderTest['stages'] = 'connection';
  try {
    if (provider!.connection.transport === 'deepseek') {
      // A direct API has no independent MCP connection/discovery stage; make exactly one search.
      current = 'request';
      const operation = result.operations[0]!, at = performance.now();
      try {
        const binding = provider!.search!;
        const raw = await deepseekSearch(id, binding.name, mapArguments(binding.arguments, { query: 'example.com', maxResults: 5 }), config, env, signal);
        normalize(raw, id, binding.name, config.maxOutputChars, undefined, [], 'deepseek');
        operation.state = 'passed'; result.stages.request = 'passed'; result.outcome = 'passed';
      } catch (error) { operation.state = 'failed'; operation.code = errorCode(error); throw error; }
      finally { operation.durationMs = Math.round(performance.now() - at); }
      return result;
    }
    await clients.connect(id, signal); result.stages.connection = 'passed';
    current = 'discovery';
    const tools = new Map<string, Tool>(), validator = new AjvJsonSchemaValidator(), cursors = new Set<string>(); let cursor: string | undefined;
    do {
      const page = await clients.listTools(id, signal, cursor);
      for (const tool of page.tools) tools.set(tool.name, tool);
      cursor = page.nextCursor;
      if (cursor && cursors.has(cursor)) throw new SiftpathError('DISCOVERY_FAILED', reasons.DISCOVERY_FAILED);
      if (cursor) cursors.add(cursor);
    } while (cursor);
    if (operations.some(kind => !tools.has(provider![kind]!.name))) throw new SiftpathError('TOOL_NOT_FOUND', reasons.TOOL_NOT_FOUND);
    result.stages.discovery = 'passed'; current = 'request';
    for (const operation of result.operations) {
      const at = performance.now();
      try {
        const binding = provider![operation.operation]!;
        // At most one small request per configured capability; no focus/rerank/agent calls or fallback.
        const input = operation.operation === 'search' ? { query: 'example.com', intent: 'general', maxResults: 5 } : { url: 'https://example.com' };
        const tool = tools.get(binding.name)!;
        if (tool.execution?.taskSupport === 'required') throw new SiftpathError('TASK_REQUIRED', reasons.TASK_REQUIRED);
        const raw = await clients.call(id, binding.name, mapArguments(binding.arguments, input), signal);
        if (!raw.isError && tool.outputSchema && (!raw.structuredContent || !validator.getValidator(tool.outputSchema)(raw.structuredContent).valid))
          throw new SiftpathError('INVALID_UPSTREAM_RESPONSE', reasons.INVALID_UPSTREAM_RESPONSE);
        normalize(raw, id, binding.name, config.maxOutputChars, operation.operation === 'read' ? 'https://example.com' : undefined);
        operation.state = 'passed';
      } catch (error) { operation.state = 'failed'; operation.code = errorCode(error); throw error; }
      finally { operation.durationMs = Math.round(performance.now() - at); }
    }
    result.stages.request = 'passed'; result.outcome = 'passed';
  } catch (error) {
    result.outcome = 'failed'; result.stages[current] = 'failed';
    result.code = caller?.aborted ? 'ABORTED' : timeout.aborted ? 'PROVIDER_TIMEOUT' : current === 'discovery' && errorCode(error) === 'UPSTREAM_ERROR' ? 'DISCOVERY_FAILED' : errorCode(error);
    const failed = result.operations.find(operation => operation.state === 'failed'); if (failed) failed.code = result.code;
  } finally { await clients.close(); result.durationMs = Math.round(performance.now() - start); }
  return result;
}
export async function statusReport(config: Configuration, path = configPath(), env: NodeJS.ProcessEnv = process.env) {
  const history = await readHistory(testHistoryPath(path));
  const local = diagnostics(config, env);
  const providers = local.providers.map(provider => {
    const saved = Object.hasOwn(history.data.tests, provider.provider) ? history.data.tests[provider.provider] : undefined;
    const current = fingerprint(provider.provider, config, env);
    // Name the cause instead of a blanket CONFIG_CHANGED: a package upgrade is not a
    // credential or route edit, and older history files have no configHash to compare.
    const staleReason = !saved || saved.fingerprint === current.hash ? undefined
      : saved.configHash === undefined ? 'unknown' : saved.configHash === current.configHash ? 'version' : 'configuration';
    return { ...provider, configured: Object.hasOwn(config.providers, provider.provider), lastTest: saved?.result ?? null,
      lastTestStale: saved ? saved.fingerprint !== current.hash : false,
      ...(staleReason ? { lastTestStaleReason: staleReason as 'version' | 'configuration' | 'unknown' } : {}) };
  });
  // READY is configuration only; the next step follows from what is configured and what was actually tested.
  const ready = providers.filter(provider => provider.code === 'READY');
  const verified = ready.filter(provider => provider.lastTest?.outcome === 'passed' && !provider.lastTestStale);
  // A failed test is the strongest signal available offline. A stale one no longer proves the
  // current setup fails, so it is reported with the reason instead of being dropped or upgraded.
  const failing = ready.filter(provider => provider.lastTest?.outcome === 'failed');
  const failingLabel = (provider: (typeof failing)[number]) =>
    `${provider.provider}(${provider.lastTest!.code ?? 'FAILED'})${provider.lastTestStale ? ` as tested before ${provider.lastTestStaleReason === 'version' ? 'a package upgrade' : provider.lastTestStaleReason === 'configuration' ? 'a configuration change' : 'an unknown change'}` : ''}`;
  const currentFailing = failing.filter(provider => !provider.lastTestStale);
  const pending = providers.filter(provider => provider.configured && ['MISSING_CREDENTIALS', 'AUTH_FAILED', 'NOT_CONFIGURED'].includes(provider.code));
  const pendingText = pending.length ? `待配置: ${pending.map(provider => `${provider.provider}(${provider.needs?.join(', ') ?? provider.code})`).join(', ')}. ` : '';
  const failingText = failing.length ? `Last test failed: ${failing.map(failingLabel).join(', ')}. ` : '';
  const nextStep = pendingText + failingText + (pending.length && !ready.length ? 'Run /siftpath (Pi) or `siftpath setup` to finish the Keys above.'
    : !ready.length ? 'Run /siftpath (Pi) or `siftpath setup` and add one search or one read service.'
    : currentFailing.length ? 'Fix the failures above, then test again: /siftpath → test, or `siftpath test all`.'
    : verified.length < ready.length ? 'Test the configured services: /siftpath → test, or `siftpath test all` (may use API quota).'
    : 'Ready: ask the model to search, or run `siftpath search "..."` for an end-to-end check.');
  return { version: packageVersion, ok: true, ...local, configPath: path, providers, nextStep, warnings: history.warning ? [history.warning] : [] };
}
export async function testReport(config: Configuration, target: string, path = configPath(), env: NodeJS.ProcessEnv = process.env, signal?: AbortSignal) {
  if (target !== 'all' && !/^[a-z][a-z0-9_-]{0,63}$/.test(target)) throw new SiftpathError('INVALID_INPUT', 'Use siftpath test <provider|all>.');
  const results: ProviderTest[] = [], warnings = new Set<string>();
  for (const id of target === 'all' ? Object.keys(config.providers) : [target]) {
    if (signal?.aborted) break;
    const result = await providerTest(id, config, env, signal); results.push(result);
    const history = await readHistory(testHistoryPath(path));
    if (history.warning) { warnings.add(history.warning); continue; }
    // shortcut: concurrent CLI writers are last-writer-wins; add locking only if concurrent diagnostics become a real workflow.
    history.data.tests[id] = { fingerprint: fingerprint(id, config, env).hash, configHash: fingerprint(id, config, env).configHash, result };
    const oldest = Object.keys(history.data.tests).filter(key => key !== id).sort((a, b) => history.data.tests[a]!.result.testedAt.localeCompare(history.data.tests[b]!.result.testedAt));
    for (const key of oldest) {
      if (Buffer.byteLength(JSON.stringify(history.data, null, 2) + '\n') <= maxHistoryBytes) break;
      delete history.data.tests[key];
    }
    try { await writePrivateJson(testHistoryPath(path), history.data); } catch { warnings.add('TEST_HISTORY_WRITE_FAILED'); }
  }
  const counts = tally(results);
  return { version: packageVersion, ok: counts.passed > 0 && counts.failed === 0 && !signal?.aborted, counts,
    networkChecked: results.some(result => result.stages.connection !== 'not_tested' || result.stages.request !== 'not_tested'),
    results: results.map(result => ({ ...result, configuration: providerStatus(result.provider, config, env).code })), warnings: [...warnings] };
}
/** Why a past test no longer describes the current setup, in the words a user can act on. */
function staleLabel(reason: 'version' | 'configuration' | 'unknown' | undefined): string {
  if (reason === 'version') return 'PACKAGE_UPGRADED; ';
  if (reason === 'configuration') return 'CONFIG_CHANGED; ';
  if (reason === 'unknown') return 'STALE; ';
  return '';
}
/** Disabled providers are skipped, not failures; nothing testable is never a success. */
function tally(results: ProviderTest[]) {
  return { passed: results.filter(result => result.outcome === 'passed').length,
    failed: results.filter(result => result.outcome === 'failed').length,
    skipped: results.filter(result => result.outcome === 'skipped').length };
}
export function formatStatus(report: Awaited<ReturnType<typeof statusReport>>): string {
  const route = report.routes, describe = (id: string) => {
    const found = report.providers.find(row => row.provider === id);
    return found ? `${id} (${found.code}${found.lastTest?.outcome === 'passed' && !found.lastTestStale ? ', tested' : ''})` : `${id} (NOT_CONFIGURED)`;
  };
  const chain = (primary: string, fallback: string[]) => primary === 'unconfigured' ? 'not configured' : [describe(primary), ...fallback.map(describe)].join(' → ');
  return [`Siftpath ${report.version} — status (offline, configuration only)`, `Config: ${report.configPath}`,
    `Search: ${chain(route.search, route.searchFallback)}`, `Read: ${chain(route.read, route.readFallback)}`,
    `Intent: default=${route.defaultIntent}${Object.entries(route.intents).map(([intent, id]) => `, ${intent}=${id}`).join('')}`,
    'Providers:', ...report.providers.map(provider => {
      const recent = provider.lastTest;
      return `  ${provider.provider}: ${provider.code}${provider.needs?.length ? ' (' + provider.needs.join(', ') + ')' : ''} · ${provider.operations.join('/') || 'no tools'}${provider.focus ? ', focus' : ''} · ` +
        (recent ? `${staleLabel(provider.lastTestStaleReason)}last test ${recent.outcome} ${recent.testedAt}${recent.code ? ' — ' + recent.code : ''}` : 'NOT_TESTED');
    }), ...(report.warnings.length ? ['Warnings: ' + report.warnings.join(', ')] : []), `Next: ${report.nextStep}`,
    'READY means configuration/credentials only, not verified availability. Test explicitly: /siftpath test <provider|all> (may use API quota).'].join('\n');
}
export function formatTests(report: Awaited<ReturnType<typeof testReport>>): string {
  return [`Siftpath ${report.version} — provider tests (no fallback)`, ...report.results.flatMap(result => [
    `${result.provider}: ${result.outcome.toUpperCase()} ${result.durationMs}ms — config=${result.configuration}, connect=${result.stages.connection}, tools=${result.stages.discovery}, request=${result.stages.request}`,
    ...result.operations.map(operation => `  ${operation.operation}: ${operation.state} ${operation.durationMs}ms`),
    ...(result.code ? [`  ${result.code}: ${reasons[result.code]}`] : []),
  ]), `${report.counts.passed} passed, ${report.counts.failed} failed, ${report.counts.skipped} skipped (disabled or unconfigured providers are skipped, not failures)`,
  report.ok ? 'Overall: OK' : report.counts.failed ? 'Overall: FAILED — see the codes above.' : 'Overall: nothing testable — configure at least one provider, then test again.',
  ...report.warnings, ...(report.results.length ? [] : ['No providers tested.']), 'Results record this test only; no fallback or retries.'].join('\n');
}
