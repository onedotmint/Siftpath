import { createEngine, diagnostics, readConfiguration } from '../config.js';
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
export function registerPi(pi: PiApi, Type: TypeFactory, supplied?: EvidenceEngine): void {
  let engine = supplied;
  const getEngine = async () => engine ??= createEngine(await readConfiguration());
  for (const tool of toolDefinitions) pi.registerTool({
    name: tool.name, label: tool.name.replace('web_', 'Web '), description: tool.description,
    parameters: hostSchema(tool.inputSchema, Type),
    async execute(id, args, signal, update, context) {
      const key = `siftpath:${id}`;
      try {
        const result = await invokeTool(await getEngine(), tool.name, args, { signal, onProgress: event => {
          if (event.stage === 'http' || event.stage === 'retry') return;
          const status = `${event.stage}${event.status ? `: ${event.status}` : ''}`;
          context.ui.setStatus(key, status);
          update?.({ content: [{ type: 'text', text: status }], details: { progress: true } });
        } });
        return { content: [{ type: 'text', text: JSON.stringify(result) }], details: { summary: summary(result), usage: result.usage } };
      } finally { context.ui.setStatus(key, undefined); }
    },
  });
  for (const name of ['siftpath-doctor', 'smartsearch-doctor']) pi.registerCommand(name, { description: 'Check Siftpath configuration without sending queries.',
    async handler(_args, context) { const report = diagnostics(await readConfiguration());
      context.ui.notify(report.providers.map(p => `${p.id}: ${p.state}`).join(' | '), report.readyForSearch ? 'info' : 'warning'); } });
  for (const name of ['siftpath-usage', 'smartsearch-usage']) pi.registerCommand(name, { description: 'Show retrieval usage in this Pi session.',
    async handler(_args, context) { context.ui.notify(JSON.stringify((await getEngine()).usage()), 'info'); } });
}
