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
export type SiftpathPanelAction = 'status' | 'usage' | 'reload' | 'close';
export interface SiftpathPanelSnapshot {
  version: string;
  selected: 'status' | 'usage';
  rows: { label: string; value: string }[];
  note: string;
}
export type SiftpathPanelPresenter = (context: PiContext, snapshot: SiftpathPanelSnapshot) => Promise<SiftpathPanelAction>;

export function registerPi(pi: PiApi, Type: TypeFactory, supplied?: EvidenceEngine, present?: SiftpathPanelPresenter): void {
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

  async function snapshot(selected: 'status' | 'usage'): Promise<SiftpathPanelSnapshot> {
    const counts = engine?.usage();
    if (selected === 'usage') return {
      version: packageVersion, selected,
      rows: [
        { label: 'Operations', value: String(counts?.operations ?? 0) },
        { label: 'Provider calls', value: String(counts?.providerCalls ?? 0) },
        { label: 'HTTP requests', value: String(counts?.httpRequests ?? 0) },
        { label: 'Cache hits', value: String(counts?.cacheHits ?? 0) },
        { label: 'Reported cost', value: counts?.reportedCostUSD ? '$' + counts.reportedCostUSD.toFixed(4) : 'Not reported' },
      ],
      note: 'Session totals only. Not a bill. Reload resets these values.',
    };
    const current = await readConfiguration();
    const report = diagnostics(activeConfiguration ?? current);
    const changed = activeConfiguration !== undefined &&
      JSON.stringify(current) !== JSON.stringify(activeConfiguration);
    const note = !report.readyForSearch
      ? 'No search key. In your terminal run: node "' +
        fileURLToPath(new URL('../cli.js', import.meta.url)) + '" setup. Never paste API keys into chat.'
      : changed
        ? 'Configuration changed on disk; select Reload to apply.'
        : 'Keys are configured, not network-verified. CLI: siftpath doctor --live (may incur charges).';
    return {
      version: packageVersion, selected,
      rows: [
        { label: 'Search', value: report.routes.fast.join(', ') || 'Not configured' },
        { label: 'Fetch', value: report.routes.fetch.join(', ') || 'Not configured' },
        { label: 'Network', value: 'Not checked' },
        { label: 'Tools', value: 'Search / Fetch / Gather' },
        { label: 'Operations', value: String(counts?.operations ?? 0) },
        { label: 'HTTP requests', value: String(counts?.httpRequests ?? 0) },
      ],
      note,
    };
  }

  async function reload(context: PiContext): Promise<void> {
    try {
      const configuration = await readConfiguration();
      const replacement = createEngine(configuration);
      engine = replacement;
      activeConfiguration = configuration;
      context.ui.notify('Siftpath reloaded. Cache and session usage reset.', 'info');
    } catch (error) {
      context.ui.notify('Reload failed (' + errorCode(error) +
        '). Previous engine and session usage were kept.', 'error');
    }
  }

  pi.registerCommand('siftpath', {
    description: 'Open Siftpath TUI dashboard (status, usage, reload).',
    async handler(args, context) {
      const action = args.trim().toLowerCase() || 'status';
      if (!['status', 'usage', 'reload'].includes(action)) {
        context.ui.notify('Usage: /siftpath [status | usage | reload]', 'warning');
        return;
      }
      if (action === 'reload') await reload(context);
      let selected: 'status' | 'usage' = action === 'usage' ? 'usage' : 'status';
      for (;;) {
        let view: SiftpathPanelSnapshot;
        try { view = await snapshot(selected); }
        catch (error) {
          context.ui.notify('Siftpath status unavailable (' + errorCode(error) +
            '). Check your local configuration; keys were not displayed.', 'error');
          return;
        }
        if (!present) {
          context.ui.notify('Siftpath v' + view.version + '\n' +
            view.rows.map(row => row.label + ': ' + row.value).join('\n') + '\n' + view.note,
            view.rows.some(row => row.label === 'Search' && row.value === 'Not configured') ? 'warning' : 'info');
          return;
        }
        const next = await present(context, view);
        if (next === 'close') return;
        if (next === 'reload') { await reload(context); selected = 'status'; }
        else selected = next;
      }
    },
  });
}
