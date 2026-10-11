/** CI-only external MCP client smoke. Neither SDK nor its dependencies ship with Siftpath. */
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { serveHttp } from '../dist/mcp/http.js';
import { EvidenceEngine } from '../dist/core/engine.js';
import { candidate } from './helpers.mjs';

const engine = new EvidenceEngine({ providers: {
  search: [{ id:'mock', capabilities:{search:true}, async search() {
    return { items:[candidate('https://example.test/a','mock','alpha verification evidence')] };
  } }],
  fetch: [],
} });
const token = 'siftpath-ci-authentication-test-token-1234';
const handle = await serveHttp({createEngine:()=>engine,token,port:0});
const URL_TEXT = `http://127.0.0.1:${handle.port}/mcp`;
const tasks = [];
try {
  for (const [label,protocol,era] of [
    ['HTTP modern',{versionNegotiation:{mode:{pin:'2026-07-28'}}},'modern'],
  ]) {
    const client = new Client({name:'siftpath-official-ci',version:'1'},protocol);
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(URL_TEXT),{
        requestInit:{headers:{authorization:`Bearer ${token}`}},
      }));
      assert.equal(client.getProtocolEra(),era,`${label}: wrong protocol era`);
      const tools=await client.listTools();
      assert.deepEqual(tools.tools.map(item=>item.name),['web_search','web_fetch','web_gather']);
      const result=await client.callTool({name:'web_search',arguments:{query:'alpha'}});
      assert.equal(result.isError,false);
      assert.ok(JSON.parse(result.content[0].text).results.length);
      tasks.push(label);
    } finally {await client.close();}
  }
  // HTTP deliberately refuses the old initialize handshake; stdio retains it.
  const oldClient=new Client({name:'siftpath-legacy-probe',version:'1'});
  try {
    await assert.rejects(oldClient.connect(new StreamableHTTPClientTransport(new URL(URL_TEXT),{
      requestInit:{headers:{authorization:`Bearer ${token}`}},
    })));
    tasks.push('HTTP legacy rejected');
  } finally { await oldClient.close(); }
  for(const [label,protocol,era] of [
    ['stdio legacy',{},'legacy'],
    ['stdio modern',{versionNegotiation:{mode:{pin:'2026-07-28'}}},'modern'],
  ]){
    const client = new Client({name:'siftpath-official-ci',version:'1'},protocol);
    try {
      await client.connect(new StdioClientTransport({
        command:process.execPath, args:[resolve('dist/cli.js'),'mcp'],
        env:{SIFTPATH_CONFIG:resolve('tests/nonexistent-ci-siftpath-config.json')},
        stderr:'pipe',
      }));
      assert.equal(client.getProtocolEra(),era,`${label}: wrong protocol era`);
      const result=await client.listTools();
      assert.equal(result.tools.length,3);
      tasks.push(label);
    } finally {await client.close();}
  }
  console.log(JSON.stringify({ok:true,client:'official MCP TypeScript SDK v2.3.1',cases:tasks}));
} finally {await handle.close();}
