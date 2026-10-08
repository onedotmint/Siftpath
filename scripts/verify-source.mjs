#!/usr/bin/env node
/** Filesystem-independent source delivery checks; no dependencies or API keys. */
import { readFile, readdir, lstat } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
const required = ['README.md','LICENSE','THIRD_PARTY_NOTICES.md','package.json','package-lock.json','tsconfig.json','src/index.ts','src/core/engine.ts','src/cli.ts','src/version.ts','src/mcp/session.ts','integrations/pi/index.ts','skills/web-research/SKILL.md','docs/ARCHITECTURE.md','docs/PROVIDERS.md','docs/CONFIGURATION.md','docs/DEVELOPMENT.md','docs/TESTING.md','docs/MIGRATION.md','docs/history/DELIVERY.md','docs/history/PREFLIGHT.md','docs/history/MIGRATION.md','docs/REFERENCES.md','.agents/plugins/marketplace.json'];
for (const path of required) if (!(await lstat(join(root, path))).isFile()) throw new Error(`Missing source file: ${path}`);
const pkg = JSON.parse(await readFile(join(root,'package.json'),'utf8'));
if (Object.keys(pkg.dependencies ?? {}).length) throw new Error('Unexpected runtime dependencies; audit distribution.');
const lock = JSON.parse(await readFile(join(root,'package-lock.json'),'utf8'));
if (lock.version !== pkg.version || lock.name !== pkg.name || lock.packages[''].name !== pkg.name || lock.packages[''].version !== pkg.version) throw new Error('Package/lock identity mismatch.');
for (const [key, value] of Object.entries(lock.packages)) if (key && (value.link || !value.resolved?.startsWith('https://registry.npmjs.org/') || !value.integrity)) throw new Error('Nonportable lockfile.');
let count = 0;
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory,entry.name), name = relative(root,path);
    if (['.git','node_modules','dist'].includes(entry.name)) continue; // local development directories are not delivery inputs
    if (entry.isSymbolicLink()) throw new Error(`Unpackaged symlink: ${name}`);
    if (entry.isDirectory()) { if (['target','coverage','.tmp'].includes(entry.name)) throw new Error(`Unexpected cache: ${name}`); await walk(path); continue; }
    if ((entry.name === '.env' || entry.name.startsWith('.env.')) && entry.name !== '.env.example') throw new Error(`Secret configuration: ${name}`);
    if (/\.(?:pem|key|p12|pfx)$/.test(entry.name)) throw new Error(`Private key candidate: ${name}`);
    const text = await readFile(path,'utf8');
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text) || /(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}/.test(text)) throw new Error(`Credential pattern in ${name}`);
    count++;
  }
}
await walk(root);
console.log(JSON.stringify({ ok: true, filesInspected: count, package: pkg.name, version: pkg.version, note: 'Static checks are not a comprehensive secret-scanner guarantee.' }));
