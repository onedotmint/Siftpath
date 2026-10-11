import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root=resolve('.');
const tmp=await mkdtemp(join(tmpdir(),'siftpath-packed-'));
const npm=process.platform==='win32'?'npm.cmd':'npm';
const run=(cmd,args,opts={})=>{
  const result=spawnSync(cmd,args,{encoding:'utf8',cwd:root,timeout:120000,...opts});
  assert.equal(result.status,0,cmd+' '+args.join(' ')+' failed: '+String(result.stderr).slice(-3000));
  return result.stdout;
};
try {
  const pack=JSON.parse(run(npm,['pack','--json','--ignore-scripts','--pack-destination',tmp]));
  assert.equal(pack.length,1);
  const file=join(tmp,pack[0].filename);
  await stat(file);
  const prefix=join(tmp,'consumer');
  run(npm,['install','--prefix',prefix,'--ignore-scripts','--no-audit','--no-fund',file]);
  const pkg=join(prefix,'node_modules','@onedotmint','siftpath');
  const json=JSON.parse(await readFile(join(pkg,'package.json'),'utf8'));
  assert.ok(json.pi?.extensions?.length);
  for(const path of [json.bin.siftpath,json.exports['.'].import,json.pi.extensions[0],json.pi.skills[0],'integrations/pi/index.ts','docs/INTEGRATIONS.md'])
    await stat(join(pkg,path.replace(/^\.\//,'')));
  assert.equal(run(process.execPath,[join(pkg,'dist','cli.js'),'--version']).trim(),json.version);
  const env={...process.env,SIFTPATH_CONFIG:join(tmp,'config.json')};
  for(const key of Object.keys(env))if(/^(EXA|TAVILY|PARALLEL|BRAVE|FIRECRAWL|JINA|CLOUDFLARE)_/.test(key))delete env[key];
  run(process.execPath,[join(pkg,'dist','cli.js'),'setup','--non-interactive'],{env});
  const doctor=spawnSync(process.execPath,[join(pkg,'dist','cli.js'),'doctor','--json'],{encoding:'utf8',env});
  assert.equal(doctor.status,2);
  assert.equal(JSON.parse(doctor.stdout).readyForSearch,false);
  console.log(JSON.stringify({ok:true,version:json.version,packageBytes:pack[0].size,installedEntrypoints:true}));
} finally {await rm(tmp,{recursive:true,force:true});}
