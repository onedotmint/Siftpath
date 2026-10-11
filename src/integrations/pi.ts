import { createEngine, diagnostics, readConfiguration, type Configuration } from '../config.js';
import { packageVersion } from '../version.js';
import { errorCode } from '../core/errors.js';
import { fileURLToPath } from 'node:url';
import { invokeTool, summary, toolDefinitions, type JsonSchema } from '../tools.js';
import type { EvidenceEngine } from '../core/engine.js';

type SchemaObject = Record<string, unknown>;
/** The entry point passes the host's TypeBox instance, avoiding a second TypeBox dependency. */
export interface TypeFactory {
  Object(properties: Record<string, SchemaObject>, options?: SchemaObject): SchemaObject;
  String(options?: SchemaObject): SchemaObject; Integer(options?: SchemaObject): SchemaObject;
  Array(items: SchemaObject, options?: SchemaObject): SchemaObject;
  Union(items: SchemaObject[], options?: SchemaObject): SchemaObject;
  Literal(value: unknown): SchemaObject; Optional(item: SchemaObject): SchemaObject;
}
interface ToolResult { content: { type: 'text'; text: string }[]; details: unknown }
interface PiContext { ui: { setStatus(key: string, value: string | undefined): void; notify(message: string, level?: 'info' | 'warning' | 'error'): void } }
export interface PiApi {
  registerTool(tool: { name: string; label: string; description: string; parameters: SchemaObject;
    execute(id: string, args: unknown, signal: AbortSignal | undefined, update: ((result: ToolResult) => void) | undefined, context: PiContext): Promise<ToolResult> }): void;
  registerCommand(name: string, command: { description: string; handler(args: string, context: PiContext): Promise<void> }): void;
}
export function hostSchema(schema: JsonSchema, Type: TypeFactory): SchemaObject {
  const options = { ...schema } as SchemaObject;
  delete options.properties; delete options.required; delete options.items; delete options.anyOf; delete options.enum; delete options.type;
  if (schema.enum) return Type.Union(schema.enum.map(value => Type.Literal(value)), options);
  if (schema.type === 'string') return Type.String(options);
  if (schema.type === 'integer') return Type.Integer(options);
  if (schema.type === 'array') return Type.Array(hostSchema(schema.items!, Type), options);
  const properties = Object.fromEntries(Object.entries(schema.properties ?? {}).map(([name, item]) => {
    const type = hostSchema(item, Type); return [name, schema.required?.includes(name) ? type : Type.Optional(type)];
  }));
  // The shared invocation validator enforces the fetch anyOf, even if host schema libraries differ.
  return Type.Object(properties, options);
}
/** A single on-demand Pi command: status (default), usage, reload. */
export function registerPi(pi: PiApi, Type: TypeFactory, supplied?: EvidenceEngine): void {
  let engine = supplied;
  let activeConfiguration: Configuration | undefined;
  const getEngine = async (): Promise<EvidenceEngine> => {
    if (!engine) {
      const configuration = await readConfiguration();
      engine = createEngine(configuration);
      activeConfiguration = configuration;
    }
    return engine;
  };
  for (const tool of toolDefinitions) pi.registerTool({
    name: tool.name, label: tool.name.replace('web_', 'Web '), description: tool.description,
    parameters: hostSchema(tool.inputSchema, Type),
    async execute(id, args, signal, update, context) {
      const key = 'siftpath:' + id;
      try {
        const result = await invokeTool(await getEngine(), tool.name, args, { signal, onProgress: event => {
          if (event.stage === 'http' || event.stage === 'retry') return;
          const status = event.stage + (event.status ? ': ' + event.status : '');
          context.ui.setStatus(key, status);
          update?.({ content: [{ type: 'text', text: status }], details: { progress: true } });
        } });
        return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { summary: summary(result), usage: result.usage } };
      } finally { context.ui.setStatus(key, undefined); }
    },
  });

  pi.registerCommand('siftpath', {
    description: 'Siftpath status (default); usage; reload configuration.',
    async handler(args, context) {
      const action = args.trim().toLowerCase() || 'status';
      if (action === 'usage') {
        // Reading usage must not initialize the engine, contact providers or reset the cache.
        const usage = engine?.usage();
        context.ui.notify('Siftpath session usage\nOperations: ' + (usage?.operations ?? 0) +
          ' | provider calls: ' + (usage?.providerCalls ?? 0) +
          ' | HTTP requests: ' + (usage?.httpRequests ?? 0) +
          ' | cache hits: ' + (usage?.cacheHits ?? 0) +
          '\nSession totals only; reload resets them. Not a billing statement.', 'info');
        return;
      }
      if (action === 'reload') {
        try {
          // Validate and construct the replacement before discarding the working engine.
          const configuration = await readConfiguration();
          const replacement = createEngine(configuration);
          engine = replacement;
          activeConfiguration = configuration;
          const report = diagnostics(configuration);
          context.ui.notify('Siftpath configuration reloaded (offline). Cache and session usage reset.\n' +
            (report.readyForSearch
              ? 'Search: ' + report.routes.fast.join(', ') + ' (configured, not network-verified).'
              : 'No search key; run siftpath setup in your system terminal.'),
            report.readyForSearch ? 'info' : 'warning');
        } catch (error) {
          context.ui.notify('Siftpath reload failed (' + errorCode(error) +
            '). Previous engine and session usage were kept. Fix the configuration and retry.', 'error');
        }
        return;
      }
      if (action !== 'status') {
        context.ui.notify('Usage: /siftpath [status | usage | reload]', 'warning');
        return;
      }
      try {
        const current = await readConfiguration();
        const changed = activeConfiguration !== undefined &&
          JSON.stringify(current) !== JSON.stringify(activeConfiguration);
        const report = diagnostics(activeConfiguration ?? current);
        const usage = engine?.usage();
        const lines = [
          'Siftpath v' + packageVersion + ' | loaded',
          'Search: ' + (report.routes.fast.join(', ') || 'not configured') +
            ' | Fetch: ' + (report.routes.fetch.join(', ') || 'not configured'),
          'Network: not checked | Tools: web_search, web_fetch, web_gather',
          'Pi session: ' + (usage?.operations ?? 0) + ' operations, ' + (usage?.httpRequests ?? 0) + ' HTTP requests',
        ];
        if (changed) lines.push('Configuration changed since engine load; run /siftpath reload to apply.');
        if (!report.readyForSearch) {
          const cli = fileURLToPath(new URL('../cli.js', import.meta.url));
          lines.push('No search key. In your system terminal run: node "' + cli + '" setup. Never paste keys into chat.');
        } else lines.push('Check connectivity only when needed: siftpath doctor --live (may incur charges).');
        lines.push('/siftpath usage | /siftpath reload');
        context.ui.notify(lines.join('\n'), report.readyForSearch ? 'info' : 'warning');
      } catch (error) {
        context.ui.notify('Siftpath status unavailable (' + errorCode(error) +
          '). Fix your local configuration; keys were not displayed.', 'error');
      }
    },
  });
}
