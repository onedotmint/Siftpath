import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createJiti } from 'jiti';
import { visibleWidth } from '@earendil-works/pi-tui';

/**
 * Host-compatibility smoke: load the ACTUAL shipped TS extension using
 * the same module loader family as Pi, against Pi's published components.
 * No model, API key, network query or terminal interaction is required.
 */
test('Pi extension loads from package and retains full setup command at narrow widths', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'siftpath-pi-host-'));
  const priorConfig = process.env.SIFTPATH_CONFIG;
  process.env.SIFTPATH_CONFIG = join(dir, 'not-configured.json');
  t.after(async () => {
    if (priorConfig === undefined) delete process.env.SIFTPATH_CONFIG;
    else process.env.SIFTPATH_CONFIG = priorConfig;
    await rm(dir, { recursive: true, force: true });
  });

  const jiti = createJiti(import.meta.url);
  const loaded = await jiti.import('../integrations/pi/index.ts', { default: true });
  const register = typeof loaded === 'function' ? loaded : loaded.default;
  assert.equal(typeof register, 'function');
  const commands = [], tools = [];
  register({
    registerTool(tool) { tools.push(tool); },
    registerCommand(name, command) { commands.push({ name, ...command }); },
  });
  assert.deepEqual(commands.map(command => command.name), ['siftpath']);
  assert.deepEqual(tools.map(tool => tool.name), ['web_search', 'web_fetch', 'web_gather']);

  const theme = {
    fg(_color, value) { return value; },
    bold(value) { return value; },
  };
  let opened = 0;
  const ui = {
    setStatus() {},
    notify(message, level) { assert.fail('Unexpected notification: ' + message + ' (' + level + ')'); },
    custom(create) {
      opened++;
      return new Promise((resolvePromise, reject) => {
        try {
          const uiHost = { requestRender() {} };
          const component = create(uiHost, theme, {}, resolvePromise);
          const widths = [16, 20, 28, 44, 72, 100];
          const expected = ('node "' + resolve('dist/cli.js') + '" setup').replace(/\s/g, '');
          for (const width of widths) {
            const lines = component.render(width);
            assert.ok(lines.length > 8, 'panel should render meaningful content at width ' + width);
            for (const line of lines) {
              assert.ok(visibleWidth(line) <= width,
                'overwide line at width ' + width + ': ' + JSON.stringify(line));
            }
            const compact = lines.join('').replace(/\s/g, '');
            assert.ok(compact.includes(expected),
              'setup command truncated at width ' + width);
          }
          // Route a real Escape key through the actual Pi SelectList.
          component.handleInput('\x1b');
        } catch (error) { reject(error); }
      });
    },
  };
  await commands[0].handler('', { mode: 'tui', ui });
  assert.equal(opened, 1);
});
