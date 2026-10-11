import { fromJsonSchema, McpServer } from '@modelcontextprotocol/server';
import type { EvidenceEngine } from '../core/engine.js';
import type { TraceEvent } from '../core/types.js';
import { invokeTool, safeError, toolDefinitions } from '../tools.js';
import { packageVersion } from '../version.js';

/** A thin, lazy-loaded protocol adapter. SDK/CLI/Pi all use the same engine. */
export function createMcpServer(engine: EvidenceEngine, trace?: (event: TraceEvent) => void): McpServer {
  const server = new McpServer({ name: 'siftpath', version: packageVersion }, { maxToolInputElements: 256 });
  for (const tool of toolDefinitions) {
    server.registerTool(tool.name, {
      description: tool.description,
      inputSchema: fromJsonSchema<Record<string, unknown>>(tool.inputSchema as Parameters<typeof fromJsonSchema>[0]),
      annotations: tool.annotations,
    }, async (args, ctx) => {
      const progressToken = ctx.mcpReq._meta?.progressToken;
      let progress = 0;
      try {
        const pack = await invokeTool(engine, tool.name, args, {
          signal: ctx.mcpReq.signal,
          onTrace: trace,
          ...(progressToken === undefined ? {} : { onProgress: (event: TraceEvent) => {
            if (event.stage === 'http' || event.stage === 'retry') return;
            void ctx.mcpReq.notify({
              method: 'notifications/progress',
              params: { progressToken, progress: ++progress, message: event.stage },
            }).catch(() => {});
          } }),
        });
        return { content: [{ type: 'text' as const, text: JSON.stringify(pack) }] };
      } catch (error) {
        return { content: [{ type: 'text' as const, text: JSON.stringify(safeError(error)) }], isError: true };
      }
    });
  }
  return server;
}
