import { McpClients } from './client.js';
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
        const raw = await this.clients.call(id, binding.name, mapArguments(binding.arguments, effective), AbortSignal.any([signal, attempt]));
        cancelled();
        const warnings: WebResult['warnings'] = [];
        if (raised) warnings.push({ provider: id, code: 'MAX_RESULTS_RAISED' });
        if (kind === 'read' && input.focus) warnings.push({ provider: id, code: 'FOCUS_MAY_OMIT_CONTENT' });
        warnings.push(...diagnostics.map(({ provider, code }) => ({ provider, code })));
        return normalize(raw, id, binding.name, c.maxOutputChars, kind === 'read' ? String(input.url) : undefined, warnings);
      } catch (error) {
        cancelled();
        const code = attempt.aborted ? 'PROVIDER_TIMEOUT' : error instanceof SiftpathError ? error.code : 'UPSTREAM_ERROR';
        diagnostics.push({ provider: id, code });
      }
    }
    cancelled();
    const code = diagnostics.length === 1 && (explicit || diagnostics[0]!.code === 'FOCUS_UNSUPPORTED') ? diagnostics[0]!.code : 'NO_PROVIDER_SUCCEEDED';
    throw new SiftpathError(code, 'No configured provider could serve this request. Check status, credentials and the requested capability.', diagnostics);
  }
}
