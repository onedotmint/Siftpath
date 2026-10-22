#!/usr/bin/env node
/** Portable source/package invariants; this is not a comprehensive secret scanner. */
import { readFile, readdir, lstat } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
const required = ['README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'package.json', 'package-lock.json', 'tsconfig.json',
  'extensions/siftpath.mjs', 'src/diagnostics.ts', 'src/index.ts', 'src/router.ts', 'src/client.ts', 'src/config.ts', 'src/defaults.ts', 'src/cli.ts', 'src/mcp/stdio.ts',
  'docs/ARCHITECTURE.md', 'docs/PROVIDERS.md', 'docs/CONFIGURATION.md', 'docs/TESTING.md', 'docs/MIGRATION.md'];
for (const path of required) if (!(await lstat(join(root, path))).isFile()) throw new Error(`Missing source file: ${path}`);
for (const path of ['src/core/engine.ts', 'src/providers', 'src/mcp/http.ts', 'src/integrations', 'integrations/pi']) {
  const present = await lstat(join(root, path)).then(() => true, error => { if (error.code !== 'ENOENT') throw error; return false; });
  if (present) throw new Error(`Obsolete runtime still present: ${path}`);
}
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (Object.keys(pkg.dependencies ?? {}).sort().join(',') !== '@modelcontextprotocol/sdk,zod') throw new Error('Unexpected runtime dependency.');
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
if (lock.version !== pkg.version || lock.name !== pkg.name || lock.packages[''].name !== pkg.name || lock.packages[''].version !== pkg.version) throw new Error('Package/lock identity mismatch.');
if (JSON.stringify(lock.packages[''].bin) !== JSON.stringify(pkg.bin)) throw new Error('Package/lock executable mismatch.');
for (const [key, value] of Object.entries(lock.packages)) if (key && (value.link || !value.resolved?.startsWith('https://registry.npmjs.org/') || !value.integrity)) throw new Error('Nonportable lockfile.');
let count = 0;
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name), name = relative(root, path);
    if (['.git', 'node_modules', 'dist'].includes(entry.name)) continue;
    if (entry.isSymbolicLink()) throw new Error(`Unpackaged symlink: ${name}`);
    if (entry.isDirectory()) { if (['target', 'coverage', '.tmp'].includes(entry.name)) throw new Error(`Unexpected cache: ${name}`); await walk(path); continue; }
    if (entry.name.endsWith('.tgz')) continue; // npm pack artifacts are ignored local outputs.
    if ((entry.name === '.env' || entry.name.startsWith('.env.')) && entry.name !== '.env.example') throw new Error(`Secret configuration: ${name}`);
    if (/\.(?:pem|key|p12|pfx)$/.test(entry.name)) throw new Error(`Private key candidate: ${name}`);
    const content = await readFile(path, 'utf8');
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content) || /(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}/.test(content)) throw new Error(`Credential pattern in ${name}`);
    count++;
  }
}
await walk(root);
console.log(JSON.stringify({ ok: true, filesInspected: count, package: pkg.name, version: pkg.version }));
