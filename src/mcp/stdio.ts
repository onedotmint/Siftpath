import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { safeError } from '../errors.js';
import type { Siftpath } from '../router.js';
import { invokeTool, toolDefinitions } from '../tools.js';
import { packageVersion } from '../version.js';
export async function serveStdio(router: Siftpath): Promise<void> {
  const server = new Server({ name: 'siftpath', version: packageVersion }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefinitions }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    try {
      const result = await invokeTool(router, request.params.name, request.params.arguments, { signal: extra.signal });
      return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: false };
    } catch (error) { return { content: [{ type: 'text', text: JSON.stringify(safeError(error)) }], isError: true }; }
  });
  await new Promise<void>((resolve, reject) => {
    let closing = false;
    const stop = () => {
      if (closing) return; closing = true;
      process.off('SIGINT', stop); process.off('SIGTERM', stop);
      process.stdin.off('end', stop); process.stdout.off('error', stop);
      void Promise.allSettled([router.close(), server.close()]).then(() => resolve());
    };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    process.stdin.once('end', stop); process.stdout.once('error', stop);
    server.onclose = stop;
    server.onerror = () => {}; // SDK transport errors are not safe to print verbatim.
    server.connect(new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: 1024 * 1024 })).catch(() => {
      stop(); reject(new Error('Cannot start MCP stdio transport.'));
    });
  });
}
