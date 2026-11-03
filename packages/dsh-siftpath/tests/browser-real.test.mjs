import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { build } from 'esbuild';
import { defaultSettings } from '../lib/config.js';

const require = createRequire(import.meta.url);

test('real rc5 SettingsFormModel and house controls materialize and render the packaged native page', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'siftpath-ui-smoke-'));
  try {
    // rc5 publishes this shared UI library as ESM+CSS, while the browser supplies
    // it as a shared module. Bundle only the controls we actually use for Node's
    // render smoke; unused UI dependencies are excluded, CSS has no SSR behavior.
    const primitivesFile = join(temporary, 'primitives.cjs');
    const uiSource = await readFile(require.resolve('@deepseek-ai/dsh-client-ui-primitives'), 'utf8');
    await build({
      stdin: { contents: 'export { SettingsFormModel, settingsNumberField, settingsTextField, SettingsForm, SettingsValueField, SettingsSecretField, Switch, Button } from "@deepseek-ai/dsh-client-ui-primitives";', resolveDir: new URL('../', import.meta.url).pathname },
      outfile: primitivesFile, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent',
      plugins: [{ name: 'shared-ui-ssr', setup(b) {
        b.onResolve({ filter: /\.css$/ }, args => ({ path: args.path, namespace: 'empty-css' }));
        b.onLoad({ filter: /.*/, namespace: 'empty-css' }, () => ({ contents: 'export default {}', loader: 'js' }));
        b.onResolve({ filter: /^[^./]/ }, args => {
          if (args.path === '@deepseek-ai/dsh-client-ui-primitives' || args.path === '@deepseek-ai/dsh-client-store' || args.path === 'clsx' || args.path.startsWith('zustand') || args.path === 'immer') return;
          if (args.path === 'react' || args.path.startsWith('react/') || args.path === 'react-dom') return { path: require.resolve(args.path), external: true, sideEffects: false };
          return { path: args.path, namespace: 'unused-ui-boundary', sideEffects: false };
        });
        b.onLoad({ filter: /.*/, namespace: 'unused-ui-boundary' }, args => {
          const names = [...uiSource.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)].filter(m => m[2] === args.path).flatMap(m => m[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0]));
          return { contents: `const stub = new Proxy(function(){ return stub }, { get: (_, key) => key === Symbol.toPrimitive ? () => '' : stub }); export default stub; ${[...new Set(names)].map(n => `export const ${n} = stub;`).join('\n')}`, loader: 'js' };
        });
      } }],
    });
    const primitives = require(primitivesFile);
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const TestRenderer = require('react-test-renderer');
    let registration;
    vm.runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), { window: { __ModuleLoader__: { load: value => { registration = value; } } } });
    const c = registration.factory(id => id === '@deepseek-ai/dsh-client-ui-primitives' ? primitives : require(id));
    let snapshot = { status: 'ready', value: { settings: structuredClone(defaultSettings) }, base: { settings: structuredClone(defaultSettings) }, user: {}, revision: 5, writable: true };
    const listeners = new Set(), writes = [], secrets = [];
    const form = {
      getSnapshot: () => snapshot,
      subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); },
      mutate: async (ops, revision) => { writes.push({ ops, revision }); if (revision !== snapshot.revision) return false; return true; },
    };
    const remote = { credentials: {
      describe: async refs => ({ ok: true, value: Object.fromEntries(refs.map(ref => [ref, { configured: true, writable: true, source: 'managed' }])) }),
      set: async (ref, text) => { secrets.push([ref, text]); return { ok: true }; },
    } };
    const web = { getSnapshot: () => ({ status: 'ready', writable: true, revision: 3, value: { searchProvider: 'existing', fetchProvider: 'http' } }), subscribe: () => () => {}, mutate: async () => true };
    const catalog = [{ id: 'tavily', search: true }, { id: 'exa', search: true }, { id: 'jina', read: true }, { id: 'firecrawl', read: true }, { id: 'deepseek', search: true }, { id: 'brave', search: true }];
    const controller = new c.ConfigController(form, remote, c.fields, catalog, web);
    await new Promise(resolve => setImmediate(resolve));
    const inject = controller.inject();
    const render = () => renderToStaticMarkup(React.createElement(c.SiftpathConfigPage, { ...inject, view: 'page', useSiftpathConfig: selector => selector(controller.store.getSnapshot()) }));
    const html = render();
    assert.match(html, /Use Siftpath search/);
    assert.match(html, /Default search provider/);
    assert.match(html, /Maximum output characters/);
    assert.match(html, /role="switch"/);
    assert.match(html, /type="password"/);
    assert.ok(!html.includes('first-key'));
    controller.edit('maxOutputChars', '12000');
    snapshot = { ...snapshot, revision: 6 };
    for (const fn of listeners) fn();
    await controller.save();
    assert.equal(writes[0].revision, 5);
    assert.equal(controller.store.getSnapshot().failed, true);
    assert.match(render(), /Save was not fully accepted/);
    controller.discard();
    controller.edit('jinaSecret', 'test-private-key');
    await controller.save();
    assert.deepEqual(secrets, [['JINA_API_KEY', 'test-private-key']]);
    assert.equal(controller.store.getSnapshot().secrets.jina.text, '');
    assert.ok(!render().includes('test-private-key'));
    controller.edit('jinaSecret', 'discard-on-page-leave');
    let mounted;
    TestRenderer.act(() => { mounted = TestRenderer.create(React.createElement(c.SiftpathConfigPage, { ...inject, view: 'page', useSiftpathConfig: selector => selector(controller.store.getSnapshot()) })); });
    TestRenderer.act(() => { mounted.unmount(); });
    assert.equal(controller.store.getSnapshot().secrets.jina.text, '');
    assert.equal(controller.secretRefs.size, 0);
    controller.dispose();
    assert.equal(listeners.size, 0);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
