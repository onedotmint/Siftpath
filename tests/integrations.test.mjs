import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, stat, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { EvidenceEngine, configureProviders } from '../dist/index.js';
import { checkConnection, parseConfiguration, readConfiguration, writePrivateJson } from '../dist/config.js';
import { setupProviders } from '../dist/setup.js';
import { toolDefinitions, invokeTool } from '../dist/tools.js';
import { McpSession } from '../dist/mcp/session.js';
import { serveHttp } from '../dist/mcp/http.js';
import { registerPi } from '../dist/integrations/pi.js';
import { fixtureProvider, providers, mockTransport } from './helpers.mjs';

const init={jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'test',version:'1'}}};
function engine(){const p=fixtureProvider();return new EvidenceEngine({providers:providers([p],[p])});}

test('agent schema exposes exactly three tools without vendor-specific parameters',async()=>{
 assert.deepEqual(toolDefinitions.map(t=>t.name),['web_search','web_fetch','web_gather']);
 for(const tool of toolDefinitions){assert.equal(tool.inputSchema.additionalProperties,false);assert.ok(!JSON.stringify(tool.inputSchema).match(/apiKey|provider|baseUrl|search_depth/));}
 await assert.rejects(invokeTool(engine(),'web_search',{query:'alpha',provider:'exa'}),{code:'INVALID_INPUT'});
 await assert.rejects(invokeTool(engine(),'web_fetch',{}),{code:'INVALID_INPUT'});
 await assert.rejects(invokeTool(engine(),'web_gather',{query:'alpha',maxTokens:20001}),{code:'INVALID_INPUT'});
});
test('MCP initialize, list, call, malformed input, and unknown tool use one dispatcher',async()=>{
 const session=new McpSession(engine());
 assert.equal((await session.dispatch({jsonrpc:'2.0',id:0,method:'tools/list'})).error.code,-32002);
 assert.equal((await session.dispatch(init)).result.protocolVersion,'2025-11-25');
 assert.equal((await session.dispatch({jsonrpc:'2.0',method:'notifications/initialized'})),undefined);
 const list=await session.dispatch({jsonrpc:'2.0',id:2,method:'tools/list'});assert.equal(list.result.tools.length,3);
 const call=await session.dispatch({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'web_gather',arguments:{query:'alpha beta'}}});
 assert.equal(call.result.isError,false);assert.ok(JSON.parse(call.result.content[0].text).evidence.length);assert.equal(call.result.structuredContent,undefined);
 assert.equal((await session.dispatch({jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'unknown'}})).error.code,-32602);
 assert.equal((await session.dispatch([])).error.code,-32600);session.close();
});
test('MCP cancellation aborts provider work and duplicate IDs are rejected',async()=>{
 let signal;const p=fixtureProvider();p.search=async(_r,c)=>{signal=c.signal;return new Promise(()=>{})};
 const session=new McpSession(new EvidenceEngine({providers:providers([p])}));await session.dispatch(init);
 const work=session.dispatch({jsonrpc:'2.0',id:'call',method:'tools/call',params:{name:'web_search',arguments:{query:'alpha'}}});
 await new Promise(r=>setTimeout(r,3));
 assert.equal((await session.dispatch({jsonrpc:'2.0',id:'call',method:'ping'})).error.code,-32600);
 await session.dispatch({jsonrpc:'2.0',method:'notifications/cancelled',params:{requestId:'call'}});
 const result=await work;assert.equal(JSON.parse(result.result.content[0].text).code,'ABORTED');assert.equal(signal.aborted,true);session.close();
});
test('MCP progress only emits when explicitly requested',async()=>{
 const session=new McpSession(engine());await session.dispatch(init);const messages=[];
 await session.dispatch({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'web_search',arguments:{query:'alpha'}}},m=>messages.push(m));assert.equal(messages.length,0);
 await session.dispatch({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'web_search',arguments:{query:'alpha'},_meta:{progressToken:'p'}}},m=>messages.push(m));
 assert.ok(messages.length);assert.ok(messages.every(m=>m.method==='notifications/progress'&&m.params.progressToken==='p'));session.close();
});
test('modern-only HTTP rejects legacy sessions and preserves security guards',async t=>{
  const token='unit-test-only-not-a-real-secret-12345';
  const server=await serveHttp({createEngine:engine,token,port:0});t.after(()=>server.close());
  const url=`http://127.0.0.1:${server.port}/mcp`,headers={
    authorization:`Bearer ${token}`,'content-type':'application/json',
    accept:'application/json, text/event-stream','mcp-protocol-version':'2026-07-28'
  };
  const discover={jsonrpc:'2.0',id:1,method:'server/discover',params:{_meta:{
    'io.modelcontextprotocol/protocolVersion':'2026-07-28',
    'io.modelcontextprotocol/clientCapabilities':{}
  }}};
  const post=(message,overrides={})=>fetch(url,{method:'POST',
    headers:{...headers,'mcp-method':message.method,...overrides},body:JSON.stringify(message)});
  assert.equal((await fetch(url,{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify(init)})).status,401);
  assert.equal((await post(discover,{origin:'https://evil.test'})).status,403);
  assert.equal((await fetch(url,{method:'POST',headers:{...headers,'mcp-protocol-version':'2025-11-25'},
    body:JSON.stringify(init)})).status,400);
  assert.equal((await fetch(url,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
    body:JSON.stringify(init)})).status,400);
  assert.equal((await fetch(url,{method:'POST',headers:{...headers,'mcp-session-id':'old-session','mcp-method':'server/discover'},
    body:JSON.stringify(discover)})).status,400);
  assert.equal((await fetch(url,{method:'DELETE',headers})).status,405);
  assert.equal((await fetch(url,{headers})).status,405);
  assert.equal((await fetch(url,{method:'POST',headers:{...headers,'mcp-method':'server/discover'},
    body:'not-json'})).status,400);
  const supported=await post(discover);assert.equal(supported.status,200);
  assert.equal(supported.headers.get('mcp-session-id'),null);
  assert.deepEqual((await supported.json()).result.supportedVersions,['2026-07-28']);
});
test('HTTP credentials are mandatory and not echoed',async()=>{
 await assert.rejects(serveHttp({createEngine:engine,token:'short',port:0}),{code:'INVALID_CONFIG'});
});
test('stdio works as a real child process, not just a protocol mock',async t=>{
 const child=spawn(process.execPath,['tests/fixtures/mcp-server.mjs'],{stdio:['pipe','pipe','pipe']});t.after(()=>child.kill());
 let buffer='',stderr='';const waiting=new Map();child.stderr.on('data',d=>stderr+=d);
 child.stdout.on('data',d=>{buffer+=d;let nl;while((nl=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,nl);buffer=buffer.slice(nl+1);const message=JSON.parse(line);const waiter=waiting.get(message.id);if(waiter){clearTimeout(waiter.timer);waiting.delete(message.id);waiter.resolve(message);}}});
 const call=message=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('stdio response deadline')),2000);waiting.set(message.id,{resolve,timer});child.stdin.write(JSON.stringify(message)+'\n');});
 assert.equal((await call(init)).result.serverInfo.name,'siftpath');
 assert.equal((await call({jsonrpc:'2.0',id:2,method:'tools/list'})).result.tools.length,3);
 const result=await call({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'web_fetch',arguments:{urls:['https://alpha.test/a','https://beta.test/b'],query:'alpha'}}});
 assert.equal(result.result.isError,false);assert.equal(JSON.parse(result.result.content[0].text).sources.length,2);assert.equal(stderr,'');
 child.stdin.end();await new Promise(resolve=>child.once('exit',resolve));
});
test('Pi native tools execute shared core, report progress, and clear UI state',async()=>{
 const tools=[],commands=[],updates=[],statuses=[];
 const Type={String:o=>({type:'string',...o}),Integer:o=>({type:'integer',...o}),Array:(items,o)=>({type:'array',items,...o}),Literal:value=>({const:value}),
  Union:(anyOf,o)=>({anyOf,...o}),Optional:item=>({...item,optional:true}),Object:(properties,o)=>({type:'object',properties,...o})};
 registerPi({registerTool:t=>tools.push(t),registerCommand:(name,c)=>commands.push({name,...c})},Type,engine());
 assert.equal(tools.length,3);assert.deepEqual(commands.map(c=>c.name),['siftpath']);
 const result=await tools.find(t=>t.name==='web_gather').execute('call',{query:'alpha beta'},undefined,r=>updates.push(r),{ui:{setStatus:(...args)=>statuses.push(args),notify(){}}});
 assert.ok(JSON.parse(result.content[0].text).evidence.length);assert.ok(updates.length);assert.equal(statuses.at(-1)[1],undefined);
 await assert.rejects(tools[0].execute('bad',{query:''},undefined,undefined,{ui:{setStatus:(...args)=>statuses.push(args),notify(){}}}),{code:'INVALID_INPUT'});assert.equal(statuses.at(-1)[1],undefined);
});
test('private configuration respects environment precedence and rejects unsafe/unknown fields',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'siftpath-config-'));t.after(()=>rm(dir,{recursive:true,force:true}));const path=join(dir,'config.json');
 await writePrivateJson(path,{version:1,credentials:{EXA_API_KEY:'saved-placeholder'}});
 if(process.platform!=='win32')assert.equal((await stat(path)).mode&0o777,0o600);
 const config=await readConfiguration(path,{EXA_API_KEY:'environment-placeholder'});assert.equal(config.credentials.EXA_API_KEY,'environment-placeholder');
 assert.equal(configureProviders(config).statuses[0].state,'ready');assert.throws(()=>parseConfiguration({credentials:{TYPO_API_KEY:'x'}}),{code:'INVALID_CONFIG'});
 assert.equal(parseConfiguration({evidenceRanking:'bm25'}).evidenceRanking,'bm25');
 assert.throws(()=>parseConfiguration({evidenceRanking:'neural'}),{code:'INVALID_CONFIG'});
 assert.equal((await readConfiguration(path,{SIFTPATH_EVIDENCE_RANKING:'bm25'})).evidenceRanking,'bm25');
 assert.throws(()=>parseConfiguration({timeoutMs:-1}),{code:'INVALID_CONFIG'});assert.throws(()=>parseConfiguration({clefModel:'planner'}),{code:'INVALID_CONFIG'});
 const link=join(dir,'link.json');await symlink(path,link);await assert.rejects(writePrivateJson(link,{}),{code:'UNSAFE_CONFIG_PATH'});
});
test('CLI help, error codes, noninteractive setup and symlink executable work',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'siftpath-cli-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const env={...process.env,SIFTPATH_CONFIG:join(dir,'config.json')};for(const k of Object.keys(env))if(/^(EXA|PARALLEL|TAVILY|BRAVE|FIRECRAWL|JINA|CLOUDFLARE)_/.test(k))delete env[k];
 const cli=resolve('dist/cli.js');const run=args=>spawnSync(process.execPath,[cli,...args],{env,encoding:'utf8'});
 assert.equal(run(['--help']).status,0);assert.match(run(['--help']).stdout,/siftpath gather/);
 assert.equal(run(['doctor','--json']).status,2);
  const missingLive=run(['doctor','--live','--json']);assert.equal(missingLive.status,2);
  assert.equal(JSON.parse(missingLive.stdout).live.code,'NO_SEARCH_PROVIDER');
  assert.equal(run(['search','alpha']).status,1);
 assert.equal(JSON.parse(run(['search','alpha']).stderr).code,'NO_EVIDENCE');
 assert.equal(run(['setup','--non-interactive']).status,0);assert.deepEqual(JSON.parse(await readFile(env.SIFTPATH_CONFIG,'utf8')),{version:1});
 const link=join(dir,'siftpath.js');await symlink(cli,link);const linked=spawnSync(process.execPath,[link,'--version'],{env,encoding:'utf8'});
 assert.equal(linked.status,0);assert.equal(linked.stdout.trim(),JSON.parse(await readFile('package.json','utf8')).version);
});

const modernMeta = {
  'io.modelcontextprotocol/protocolVersion':'2026-07-28',
  'io.modelcontextprotocol/clientCapabilities':{},
  'io.modelcontextprotocol/clientInfo':{name:'siftpath-test',version:'1'}
};
function modern(id,method,fields={}) {
  return {jsonrpc:'2.0',id,method,params:{...fields,_meta:modernMeta}};
}
test('modern stdio dispatcher supports discover, calls and rejects era mixing',async()=>{
  const session=new McpSession(engine());
  const discover=await session.dispatch(modern(1,'server/discover'));
  assert.deepEqual(discover.result.supportedVersions,['2026-07-28']);
  assert.equal(discover.result._meta['io.modelcontextprotocol/serverInfo'].name,'siftpath');
  const list=await session.dispatch(modern(2,'tools/list'));
  assert.deepEqual(list.result.tools.map(t=>t.name),['web_search','web_fetch','web_gather']);
  const call=await session.dispatch(modern(3,'tools/call',{name:'web_search',arguments:{query:'alpha'}}));
  assert.ok(JSON.parse(call.result.content[0].text).results.length);
  assert.equal((await session.dispatch(init)).error.code,-32022);
  session.close();
});
test('modern stateless HTTP MCP authenticates each request without session ID',async t=>{
  const token='modern-siftpath-http-test-only-123456';
  const handle=await serveHttp({createEngine:engine,token,port:0});t.after(()=>handle.close());
  const url=`http://127.0.0.1:${handle.port}/mcp`;
  const headers={authorization:`Bearer ${token}`,'content-type':'application/json',
    accept:'application/json, text/event-stream','mcp-protocol-version':'2026-07-28'};
  const request=(message,extra={})=>fetch(url,{method:'POST',headers:{...headers,
    'mcp-method':message.method,...(message.params?.name?{'mcp-name':message.params.name}:{}),...extra},
    body:JSON.stringify(message)});
  const unauth=await fetch(url,{method:'POST',headers:{...headers,authorization:'bad','mcp-method':'tools/list'},body:JSON.stringify(modern(1,'tools/list'))});
  assert.equal(unauth.status,401);
  const discover=await request(modern(2,'server/discover'));assert.equal(discover.status,200);
  assert.equal(discover.headers.get('mcp-session-id'),null);
  assert.deepEqual((await discover.json()).result.supportedVersions,['2026-07-28']);
  const list=await request(modern(3,'tools/list'));
  assert.equal(list.status,200);assert.equal((await list.json()).result.tools.length,3);
  const called=await request(modern(4,'tools/call',{name:'web_fetch',arguments:{urls:['https://alpha.test/a'],query:'alpha'}}));
  assert.equal(called.status,200);assert.equal(JSON.parse((await called.json()).result.content[0].text).sources.length,1);
  const badHeader=await request(modern(5,'tools/list'),{'mcp-method':'tools/call'});
  assert.equal(badHeader.status,400);
  const missingEnvelope=await request({jsonrpc:'2.0',id:6,method:'tools/list',params:{}});
  assert.equal(missingEnvelope.status,400);
});

test('guided setup selects one default provider and preserves an existing search key',()=>{
  assert.deepEqual(setupProviders('',false),['exa']);
  assert.deepEqual(setupProviders('',true),[]);
  assert.deepEqual(setupProviders('Tavily',false),['tavily']);
  assert.deepEqual(setupProviders('exa,tavily,exa',false),['exa','tavily']);
  assert.throws(()=>setupProviders('unavailable',false),{code:'INVALID_INPUT'});
});
test('live doctor uses only one real provider adapter without leaking credentials',async()=>{
  const configuration={credentials:{EXA_API_KEY:'sensitive-private-key',TAVILY_API_KEY:'secondary-private-key'}};
  const transport=mockTransport(request=>{
    assert.equal(request.url,'https://api.exa.ai/search');
    assert.equal(request.headers['x-api-key'],'sensitive-private-key');
    assert.equal(request.body.numResults,1);
    return {results:[{id:'item',url:'https://example.com/etag',title:'ETag',highlights:['HTTP ETag validation']}]};
  });
  const success=await checkConnection(configuration,transport.transport);
  assert.equal(success.ok,true);assert.equal(success.provider,'exa');assert.equal(success.results,1);
  assert.equal(success.requests,1);assert.equal(transport.calls.length,1);
  assert.doesNotMatch(JSON.stringify(success),/private-key/);
  const missing=await checkConnection({});
  assert.equal(missing.code,'NO_SEARCH_PROVIDER');assert.equal(missing.requests,undefined);
  const denied=await checkConnection(configuration,async()=>new Response('{}',{status:401}));
  assert.equal(denied.ok,false);assert.equal(denied.code,'AUTH_FAILED');assert.equal(denied.requests,1);
  assert.doesNotMatch(JSON.stringify(denied),/private-key/);
});

test('Pi /siftpath status, usage and reload are offline, safe and single-command',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'siftpath-pi-status-'));
  const previous=process.env.SIFTPATH_CONFIG;
  process.env.SIFTPATH_CONFIG=join(dir,'config.json');
  t.after(async()=>{
    if(previous===undefined) delete process.env.SIFTPATH_CONFIG;
    else process.env.SIFTPATH_CONFIG=previous;
    await rm(dir,{recursive:true,force:true});
  });
  await writePrivateJson(process.env.SIFTPATH_CONFIG,{version:1,credentials:{EXA_API_KEY:'very-private-exa-key'}});
  const commands=[],notifications=[],tools=[];
  const ui={setStatus(){},notify:(message,level)=>notifications.push({message,level})};
  const Type={String:o=>({type:'string',...o}),Integer:o=>({type:'integer',...o}),Array:(items,o)=>({type:'array',items,...o}),
    Literal:value=>({const:value}),Union:(anyOf,o)=>({anyOf,...o}),Optional:item=>({...item,optional:true}),
    Object:(properties,o)=>({type:'object',properties,...o})};
  const original=engine();
  await original.search({query:'alpha'});
  registerPi({registerTool:tool=>tools.push(tool),registerCommand:(name,c)=>commands.push({name,...c})},Type,original);
  assert.deepEqual(commands.map(c=>c.name),['siftpath']);
  assert.equal(tools.length,3);
  const command=commands[0];
  await command.handler('',{ui});
  assert.match(notifications.at(-1).message,/Siftpath v2\.0\.0-next\.1 \| loaded/);
  assert.match(notifications.at(-1).message,/Search: exa/);
  assert.match(notifications.at(-1).message,/Network: Not checked/);
  assert.match(notifications.at(-1).message,/Operations: 1/);
  await command.handler('usage',{ui});
  assert.match(notifications.at(-1).message,/Operations: 1/);
  assert.match(notifications.at(-1).message,/HTTP requests: 0/);
  assert.doesNotMatch(notifications.map(x=>x.message).join('\n'),/very-private-exa-key/);
  await writePrivateJson(process.env.SIFTPATH_CONFIG,{version:1,credentials:{TAVILY_API_KEY:'another-private-key'}});
  await command.handler('reload',{ui});
  assert.match(notifications.at(-1).message,/Cache and session usage reset/);
  await command.handler('status',{ui});
  assert.match(notifications.at(-1).message,/Search: tavily/);
  assert.match(notifications.at(-1).message,/Operations: 0/);
  await command.handler('usage',{ui});
  assert.match(notifications.at(-1).message,/Operations: 0/);
  await command.handler('help',{ui});
  assert.match(notifications.at(-1).message,/Usage: \/siftpath/);
  assert.doesNotMatch(notifications.map(x=>x.message).join('\n'),/another-private-key/);
});
test('Pi /siftpath reload preserves working engine when new configuration is invalid',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'siftpath-pi-reload-'));
  const previous=process.env.SIFTPATH_CONFIG;
  process.env.SIFTPATH_CONFIG=join(dir,'config.json');
  t.after(async()=>{
    if(previous===undefined) delete process.env.SIFTPATH_CONFIG;
    else process.env.SIFTPATH_CONFIG=previous;
    await rm(dir,{recursive:true,force:true});
  });
  await writePrivateJson(process.env.SIFTPATH_CONFIG,{version:1,credentials:{EXA_API_KEY:'placeholder-private'}});
  const commands=[],notifications=[];
  const Type={String:o=>({type:'string',...o}),Integer:o=>({type:'integer',...o}),Array:(items,o)=>({type:'array',items,...o}),
    Literal:value=>({const:value}),Union:(anyOf,o)=>({anyOf,...o}),Optional:item=>({...item,optional:true}),
    Object:(properties,o)=>({type:'object',properties,...o})};
  const original=engine();
  await original.search({query:'alpha'});
  registerPi({registerTool(){},registerCommand:(name,c)=>commands.push({name,...c})},Type,original);
  const ui={setStatus(){},notify:(message,level)=>notifications.push({message,level})};
  await writePrivateJson(process.env.SIFTPATH_CONFIG,{version:1,credentials:{INVALID_API_KEY:'do-not-echo'}});
  await commands[0].handler('reload',{ui});
  assert.equal(notifications.at(-2).level,'error');
  assert.match(notifications.at(-2).message,/Previous engine and session usage were kept/);
  await commands[0].handler('usage',{ui});
  assert.match(notifications.at(-1).message,/Operations: 1/);
  assert.doesNotMatch(notifications.map(x=>x.message).join('\n'),/do-not-echo/);
});

test('Pi TUI presenter supports navigating status, usage and reload without a network call',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'siftpath-pi-tui-'));
  const previous=process.env.SIFTPATH_CONFIG;
  process.env.SIFTPATH_CONFIG=join(dir,'config.json');
  t.after(async()=>{
    if(previous===undefined) delete process.env.SIFTPATH_CONFIG;
    else process.env.SIFTPATH_CONFIG=previous;
    await rm(dir,{recursive:true,force:true});
  });
  await writePrivateJson(process.env.SIFTPATH_CONFIG,{version:1,credentials:{EXA_API_KEY:'never-print-this-key'}});
  const cmds=[],panels=[],notices=[],actions=['usage','reload','close'];
  const supplied=engine();
  await supplied.search({query:'alpha'});
  const Type={String:o=>({type:'string',...o}),Integer:o=>({type:'integer',...o}),
    Array:(items,o)=>({type:'array',items,...o}),Literal:value=>({const:value}),
    Union:(anyOf,o)=>({anyOf,...o}),Optional:item=>({...item,optional:true}),
    Object:(properties,o)=>({type:'object',properties,...o})};
  registerPi({registerTool(){},registerCommand:(name,c)=>cmds.push({name,...c})},Type,supplied,
    async (_context,view)=>{panels.push(view);return actions.shift();});
  await cmds[0].handler('',{ui:{setStatus(){},notify:(message,level)=>notices.push({message,level})}});
  assert.deepEqual(panels.map(p=>p.selected),['status','usage','status']);
  assert.equal(panels[0].rows.find(r=>r.label==='Operations').value,'1');
  assert.equal(panels[1].rows.find(r=>r.label==='Operations').value,'1');
  assert.equal(panels[2].rows.find(r=>r.label==='Operations').value,'0');
  assert.ok(notices.some(n=>/Cache and session usage reset/.test(n.message)));
  assert.doesNotMatch(JSON.stringify(panels)+JSON.stringify(notices),/never-print-this-key/);
});
