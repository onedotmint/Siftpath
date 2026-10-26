import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { parseConfiguration } from '../../dist/index.js';

for (const id of ['brave', 'exa', 'tavily', 'jina', 'firecrawl']) test(`CONTRACT published official ${id}: initialize + tools/list (no search/read)`,
  { skip: process.env.SIFTPATH_CONTRACT !== '1' ? 'Set SIFTPATH_CONTRACT=1 to download official packages/connect to official MCP.' : false, timeout: 120000 }, async t => {
    const c = parseConfiguration({}), provider = c.providers[id], connection = provider.connection;
    const client = new Client({ name: 'siftpath-contract-check', version: '1' });
    t.after(() => client.close());
    const transport = connection.transport === 'http' ? new StreamableHTTPClientTransport(new URL(connection.url))
      : new StdioClientTransport({ command: connection.command, args: connection.args,
        env: Object.fromEntries(Object.entries(connection.env).map(([key, value]) => [key, value.startsWith('${') ? 'non-secret-contract-placeholder' : value])), stderr: 'ignore' });
    await client.connect(transport, { timeout: 90000 });
    const tools = (await client.listTools()).tools, binding = provider.search ?? provider.read;
    const tool = tools.find(tool => tool.name === binding.name);
    assert.ok(tool, `${binding.name} missing from published official MCP`);
    for (const key of Object.keys(binding.arguments)) assert.ok(Object.hasOwn(tool.inputSchema.properties ?? {}, key), `${key} missing from published schema`);
    if (id === 'jina') for (const [key, maximum] of [['topk', 50], ['chunk_size', 4096]]) {
      const field = tool.inputSchema.properties[key];
      assert.equal(field.type, 'integer'); assert.equal(field.minimum, 1); assert.equal(field.maximum, maximum);
    }
    t.diagnostic(JSON.stringify({ provider: id, tool: tool.name, required: tool.inputSchema.required, parameters: Object.keys(tool.inputSchema.properties ?? {}), toolCalls: 0 }));
  });
