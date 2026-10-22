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
export class Siftpath {
  readonly configuration: Configuration;
  private clients: McpClients;
  private shutdown = new AbortController();
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
  private async route(kind: 'search' | 'read', input: Record<string, unknown>, caller?: AbortSignal): Promise<WebResult> {
    const c = this.configuration, routes = c.routes, deadline = AbortSignal.timeout(c.timeoutMs);
    const signal = AbortSignal.any([deadline, this.shutdown.signal, ...(caller ? [caller] : [])]);
    const primary = kind === 'search' ? routes.intents[input.intent as keyof typeof routes.intents] ?? routes.search : routes.read;
    const order = [...new Set([primary, ...routes[kind === 'search' ? 'searchFallback' : 'readFallback']])];
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
      const attempt = AbortSignal.timeout(provider!.timeoutMs ?? c.providerTimeoutMs);
      try {
        const raw = await this.clients.call(id, binding.name, mapArguments(binding.arguments, input), AbortSignal.any([signal, attempt]));
        cancelled();
        const warnings: WebResult['warnings'] = [];
        if (kind === 'read' && input.focus && !JSON.stringify(binding.arguments).includes('"$focus"')) warnings.push({ provider: id, code: 'FOCUS_UNSUPPORTED' });
        warnings.push(...diagnostics.map(({ provider, code }) => ({ provider, code })));
        return normalize(raw, id, binding.name, c.maxOutputChars, kind === 'read' ? String(input.url) : undefined, warnings);
      } catch (error) {
        cancelled();
        const code = attempt.aborted ? 'PROVIDER_TIMEOUT' : error instanceof SiftpathError ? error.code : 'UPSTREAM_ERROR';
        diagnostics.push({ provider: id, code });
      }
    }
    cancelled();
    throw new SiftpathError('NO_PROVIDER_SUCCEEDED', 'No official MCP succeeded. Run siftpath doctor and check credentials, tool names and connectivity.', diagnostics);
  }
}
