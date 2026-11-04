import { McpClients } from './client.js';
import { deepseekSearch } from './deepseek.js';
import { parseConfiguration, providerStatus, type Binding, type Configuration } from './config.js';
import { SiftpathError, type Diagnostic } from './errors.js';
import { parseInput, publicUrl, readSchema, searchSchema, type ReadInput, type SearchInput } from './inputs.js';
import { normalize, type WebResult } from './output.js';

/** $field references tool input; missing optional fields are omitted, not sent as null. */
export function mapArguments(template: Binding['arguments'], input: Record<string, unknown>): Record<string, unknown> {
  const map = (value: unknown): unknown => {
    if (typeof value === 'string' && /^\$(query|intent|maxResults|url|focus)$/.test(value)) return input[value.slice(1)];
    if (Array.isArray(value)) return value.map(map).filter(item => item !== undefined);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, map(child)]).filter(([, child]) => child !== undefined));
    return value;
  };
  return map(template) as Record<string, unknown>;
}
function mapsFocus(value: unknown): boolean {
  return value === '$focus' || !!value && typeof value === 'object' && Object.values(value).some(mapsFocus);
}
const SINGLE_CAUSE: Record<string, string> = {
  NOT_CONFIGURED: 'no such configured provider. Check the ID (siftpath status lists them).',
  DISABLED: 'this provider is disabled. Enable it with /siftpath or `siftpath setup`.',
  MISSING_CREDENTIALS: 'the configured Key is missing. Add it with /siftpath or export the environment variable.',
  UNSUPPORTED_OPERATION: 'this provider has no binding for this operation.',
  FOCUS_UNSUPPORTED: 'this Reader has no native focus binding. Omit focus, or choose a focus-capable Reader.',
  AUTH_FAILED: 'the provider rejected the credential. Replace the Key.',
  BALANCE_EXHAUSTED: 'the provider needs this account topped up before it will run the request. Add credit or use another Reader.',
  RATE_LIMITED: 'the provider rate or quota limit was reached. Wait, or use another Reader.',
  UPSTREAM_FORBIDDEN: 'the provider refused this request for this account; the exact reason is upstream.',
  UPSTREAM_ERROR: 'the provider tool failed upstream. Run `siftpath test <provider>` for the failing stage.',
  PROVIDER_TIMEOUT: 'the provider did not answer within its timeout.',
};
export class Siftpath {
  readonly configuration: Configuration;
  private clients: McpClients;
  private shutdown = new AbortController();
  private active = 0;
  private retiring = false;
  constructor(config: unknown = {}, private env: NodeJS.ProcessEnv = process.env) {
    this.configuration = parseConfiguration(config);
    this.clients = new McpClients(this.configuration, env);
  }
  search(input: SearchInput, options: { signal?: AbortSignal } = {}): Promise<WebResult> {
    const args = parseInput(searchSchema, input);
    const intent = args.intent ?? this.configuration.routes.defaultIntent;
    return this.route('search', { ...args, intent, maxResults: args.maxResults ?? 5 }, options.signal);
  }
  read(input: ReadInput, options: { signal?: AbortSignal } = {}): Promise<WebResult> {
    const args = parseInput(readSchema, input); publicUrl(args.url);
    return this.route('read', args, options.signal);
  }
  async close(): Promise<void> { this.shutdown.abort(); await this.clients.close(); }
  /** Close only after in-flight calls finish, so a configuration reload never interrupts unrelated work. */
  retire(): void { this.retiring = true; if (!this.active) void this.close(); }
  private async route(kind: 'search' | 'read', input: Record<string, unknown>, caller?: AbortSignal): Promise<WebResult> {
    this.active++;
    try { return await this.attempt(kind, input, caller); }
    finally { this.active--; if (this.retiring && !this.active) void this.close(); }
  }
  private async attempt(kind: 'search' | 'read', input: Record<string, unknown>, caller?: AbortSignal): Promise<WebResult> {
    const c = this.configuration, routes = c.routes, deadline = AbortSignal.timeout(c.timeoutMs);
    const signal = AbortSignal.any([deadline, this.shutdown.signal, ...(caller ? [caller] : [])]);
    const explicit = kind === 'read' && typeof input.reader === 'string';
    const primary = explicit ? input.reader as string
      : kind === 'search' ? routes.intents[input.intent as keyof typeof routes.intents] ?? routes.search : routes.read;
    const order = explicit ? [primary] : [...new Set([primary, ...routes[kind === 'search' ? 'searchFallback' : 'readFallback']])];
    const diagnostics: Diagnostic[] = [];
    const cancelled = () => {
      if (this.shutdown.signal.aborted) throw new SiftpathError('CLOSED', 'Siftpath has been closed.');
      if (caller?.aborted) throw new SiftpathError('ABORTED', 'Operation cancelled.');
      if (deadline.aborted) throw new SiftpathError('TIMEOUT', 'Operation deadline exceeded.', diagnostics);
    };
    for (const id of order) {
      cancelled();
      const status = providerStatus(id, c, this.env), provider = c.providers[id], binding = provider?.[kind];
      if (status.code !== 'READY') { diagnostics.push(status); continue; }
      if (!binding) { diagnostics.push({ provider: id, code: 'UNSUPPORTED_OPERATION' }); continue; }
      if (kind === 'read' && input.focus && !mapsFocus(binding.arguments)) {
        diagnostics.push({ provider: id, code: 'FOCUS_UNSUPPORTED' }); continue;
      }
      const attempt = AbortSignal.timeout(provider!.timeoutMs ?? c.providerTimeoutMs);
      try {
        const effective = { ...input };
        const raised = kind === 'search' && !!binding.minResults && Number(effective.maxResults) < binding.minResults;
        if (raised) effective.maxResults = binding.minResults;
        const args = mapArguments(binding.arguments, effective), operationSignal = AbortSignal.any([signal, attempt]);
        const direct = provider!.connection.transport === 'deepseek';
        const raw = direct ? await deepseekSearch(id, binding.name, args, c, this.env, operationSignal)
          : await this.clients.call(id, binding.name, args, operationSignal);
        cancelled();
        const warnings: WebResult['warnings'] = [];
        if (raised) warnings.push({ provider: id, code: 'MAX_RESULTS_RAISED' });
        if (kind === 'read' && input.focus) warnings.push({ provider: id, code: 'FOCUS_MAY_OMIT_CONTENT' });
        warnings.push(...diagnostics.map(({ provider, code }) => ({ provider, code })));
        return normalize(raw, id, binding.name, c.maxOutputChars, kind === 'read' ? String(input.url) : undefined, warnings, direct ? 'deepseek' : undefined);
      } catch (error) {
        cancelled();
        const code = attempt.aborted ? 'PROVIDER_TIMEOUT' : error instanceof SiftpathError ? error.code : 'UPSTREAM_ERROR';
        diagnostics.push({ provider: id, code });
        // Provider input limits must not silently send a different provider the query instead.
        if (provider!.connection.transport === 'deepseek' && code === 'INVALID_UPSTREAM_ARGUMENTS')
          throw new SiftpathError(code, 'DeepSeek requires a query of 1–128 Unicode characters and a count of 1–50; the query was not rewritten or sent to a fallback.', diagnostics);
      }
    }
    cancelled();
    // One provider, one cause: repeating the generic message made users re-check everything
    // when the answer was already known (wrong reader ID, unsupported capability).
    if (diagnostics.length === 1 && (explicit || diagnostics[0]!.code === 'FOCUS_UNSUPPORTED')) {
      const { provider, code } = diagnostics[0]!;
      throw new SiftpathError(code, `${provider}: ${SINGLE_CAUSE[code] ?? 'the requested operation could not run.'}`, diagnostics);
    }
    const code = 'NO_PROVIDER_SUCCEEDED';
    // Every provider already reported a code; naming them is the whole difference between
    // "something failed" and "your account is out of credit and the other one is refused".
    const detail = diagnostics.map(({ provider, code }) => `${provider}(${code})`).join(', ');
    throw new SiftpathError(code, `No configured provider could serve this request. Each attempt failed: ${detail}.`, diagnostics);
  }
}
