import { lstat } from 'node:fs/promises';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { configPath, readConfiguration } from '../config.js';
import { safeError } from '../errors.js';
import { Siftpath } from '../router.js';
import { invokeTool, toolDefinitions } from '../tools.js';
import { packageVersion } from '../version.js';
export interface RouterProvider { get(): Promise<Siftpath>; close(): Promise<void> }
/**
 * Configuration is read on first use and rebuilt when the file changes on disk, so a saved Key or
 * route applies to the next call without restarting the client. The replaced router retires only
 * after its in-flight calls finish.
 */
export function fileRouter(path = configPath(), env: NodeJS.ProcessEnv = process.env): RouterProvider {
  let current: Siftpath | undefined, stamp: string | undefined, pending: Promise<Siftpath> | undefined;
  const revision = async () => {
    try { const stats = await lstat(path); return stats.isFile() ? `${stats.mtimeMs}:${stats.size}` : 'invalid'; }
    catch { return 'absent'; }
  };
  const load = async (): Promise<Siftpath> => {
    const next = await revision();
    if (current && stamp === next) return current;
    const router = new Siftpath(await readConfiguration(path, env), env);
    const previous = current; current = router; stamp = next;
    if (previous) previous.retire();
    return router;
  };
  return {
    get() { return pending ??= load().finally(() => { pending = undefined; }); },
    async close() { const router = current; current = undefined; if (router) await router.close(); },
  };
}
export async function serveStdio(routers: RouterProvider): Promise<void> {
  const server = new Server({ name: 'siftpath', version: packageVersion }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefinitions }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    try {
      const router = await routers.get();
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
      void Promise.allSettled([routers.close(), server.close()]).then(() => resolve());
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
