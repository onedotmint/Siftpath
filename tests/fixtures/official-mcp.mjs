import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { appendFile } from 'node:fs/promises';

export function mockServer() {
  const server = new Server({ name: 'mock-official-mcp', version: '1' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async request => {
    if (process.env.MOCK_DISCOVERY_FAIL) throw new Error('PRIVATE_DISCOVERY_ERROR');
    if (process.env.MOCK_OUTPUT_SCHEMA || process.env.MOCK_TASK_REQUIRED) {
      if (request.params?.cursor) return { tools: [{ name: 'read', inputSchema: { type: 'object' } }] };
      return { tools: [{ name: 'search', inputSchema: { type: 'object' }, ...(process.env.MOCK_OUTPUT_SCHEMA ? { outputSchema: { type: 'object', properties: { verifiedField: { type: 'string' } }, required: ['verifiedField'] } } : { execution: { taskSupport: 'required' } }) }], nextCursor: 'second-page' };
    }
    if (process.env.MOCK_PAGINATED_TOOLS && !request.params?.cursor) return { tools: [], nextCursor: 'second-page' };
    return { tools: ['search', 'read', 'fail', 'slow', 'empty', 'malformed', 'secret', 'large'].map(name => ({
      name, inputSchema: { type: 'object', properties: {}, additionalProperties: true },
    })) };
  });
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args = {} } = request.params;
    if (process.env.MOCK_LOG) await appendFile(process.env.MOCK_LOG, JSON.stringify({ name, args }) + '\n');
    if (name === 'slow') {
      await new Promise(resolve => {
        const timer = setTimeout(resolve, 5000);
        extra.signal.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
      });
    }
    if (name === 'fail') return { isError: true, content: [{ type: 'text', text: 'PRIVATE_KEY_ERROR_BODY' }] };
    if (name === 'secret') throw new Error('PRIVATE_KEY_ERROR_BODY');
    if (name === 'empty') return { content: [] };
    if (name === 'malformed') return { content: [{ type: 'text', text: 'No traceable results' }] };
    if (name === 'read') return { content: [{ type: 'text', text: `URL Source: ${args.url}\nTitle: Example\nMarkdown Content:\nNative reader text; focus=${args.question ?? 'none'}` }] };
    const results = [{ title: 'Example', url: 'https://example.com/a?utm_source=original', description: 'Official result text', publishedDate: '2026-01-01' },
      { title: 'Second', url: 'https://example.org/b', description: 'Second result' }].slice(0, Number(args.count ?? 2));
    if (process.env.MOCK_LONG_SOURCES) for (const [index, row] of results.entries()) { row.url = 'https://source' + index + '.example/' + 'x'.repeat(800); row.description = 'Readable content '.repeat(1000); }
    if (name === 'large') results[0].description = '中"\n😀'.repeat(10000);
    return { content: [{ type: 'text', text: JSON.stringify({ results, received: args }) }], structuredContent: { results } };
  });
  return server;
}
if (process.argv.includes('--stdio')) {
  const server = mockServer();
  server.onclose = () => process.exit(0);
  process.stdin.once('end', () => { void server.close(); });
  await server.connect(new StdioServerTransport());
}
