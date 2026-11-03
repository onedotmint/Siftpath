import { build } from 'esbuild';
import { mkdir, copyFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
// Source builds use the already-built sibling core; installed runtime imports remain package-only.
const { providerCatalog, parseConfiguration } = await import(process.env.SIFTPATH_CORE_ENTRY ?? '../../dist/index.js');

const root = new URL('./', import.meta.url);
await mkdir(new URL('lib/', root), { recursive: true });
for (const file of ['index.js', 'config.js', 'runtime.js', 'fields.js']) await copyFile(new URL(`src/${file}`, root), new URL(`lib/${file}`, root));
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const defaults = parseConfiguration({});
// Only safe setup facts are embedded; browser code cannot import the Node core.
await build({
  absWorkingDir: fileURLToPath(root), entryPoints: ['src/client.jsx'], outfile: 'lib/client.js', bundle: true,
  platform: 'browser', format: 'cjs', target: 'es2022', jsx: 'automatic', legalComments: 'inline',
  external: ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'],
  define: {
    __SIFTPATH_CATALOG__: JSON.stringify(providerCatalog.map(({ id, label, key, search, read, anonymous }) => ({ id, label, key, search, read, anonymous }))),
    __SIFTPATH_DEFAULTS__: JSON.stringify({ providers: Object.fromEntries(Object.entries(defaults.providers).map(([id, p]) => [id, { enabled: p.enabled }])), routes: defaults.routes, timeoutMs: defaults.timeoutMs, providerTimeoutMs: defaults.providerTimeoutMs, maxOutputChars: defaults.maxOutputChars }),
  },
  banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;` },
  footer: { js: 'return module.exports; } });' },
});
