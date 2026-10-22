import test from 'node:test';
import assert from 'node:assert/strict';
import extension from '../extensions/siftpath.mjs';

function load(exec) {
  const commands = new Map(), events = new Map(), notices = [];
  extension({ registerCommand: (name, command) => commands.set(name, command), on: (name, handler) => events.set(name, handler), exec });
  return { commands, events, notices, ctx: { cwd: '/tmp', hasUI: true, ui: { notify: (text, kind) => notices.push({ text, kind }) } } };
}
test('Pi registers only one slash command, calls packaged CLI JSON and displays its summary', async () => {
  const calls = [], app = load(async (...args) => { calls.push(args); return { code: 0, stdout: JSON.stringify({ ok: true, summary: 'offline CLI status' }) }; });
  assert.deepEqual([...app.commands.keys()], ['siftpath']);
  await app.commands.get('siftpath').handler('', app.ctx);
  assert.equal(calls[0][0], process.execPath); assert.match(calls[0][1][0], /dist\/cli.js$/);
  assert.deepEqual(calls[0][1].slice(1), ['status', '--json']);
  assert.equal(app.notices[0].text, 'offline CLI status');
});
test('Pi reports nonzero provider test results from stdout, not raw stderr', async () => {
  const calls = [], app = load(async (...args) => { calls.push(args); return { code: 1, stdout: JSON.stringify({ ok: false, summary: 'brave MISSING_CREDENTIALS' }), stderr: 'PRIVATE_SECRET' }; });
  await app.commands.get('siftpath').handler('test brave', app.ctx);
  assert.deepEqual(calls[0][1].slice(1), ['test', 'brave', '--json']);
  assert.equal(app.notices.at(-1).kind, 'warning'); assert.match(app.notices.at(-1).text, /MISSING_CREDENTIALS/);
  assert.ok(!JSON.stringify(app.notices).includes('PRIVATE_SECRET'));
  await app.commands.get('siftpath').handler('test all', app.ctx);
  assert.deepEqual(calls[1][1].slice(1), ['test', 'all', '--json']);
});
test('Pi rejects arbitrary arguments and hides malformed/raw process errors', async () => {
  let calls = 0; const app = load(async () => { calls++; throw new Error('PRIVATE_SECRET'); });
  await app.commands.get('siftpath').handler('test brave; echo secret', app.ctx); assert.equal(calls, 0);
  await app.commands.get('siftpath').handler('', app.ctx); assert.equal(calls, 1);
  assert.equal(app.notices.at(-1).kind, 'error'); assert.ok(!JSON.stringify(app.notices).includes('PRIVATE_SECRET'));
});
test('Pi session shutdown aborts its CLI child and no work starts at extension load', async () => {
  let signal; const app = load(async (_command, _args, options) => {
    signal = options.signal; return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  });
  assert.equal(signal, undefined);
  const work = app.commands.get('siftpath').handler('test all', app.ctx);
  app.events.get('session_shutdown')(); await work; assert.equal(signal.aborted, true);
});

test('Pi displays structured CLI configuration failures but never plain raw stderr', async () => {
  const app = load(async () => ({ code: 1, stdout: '', stderr: JSON.stringify({ code: 'INVALID_CONFIG', message: 'Invalid configuration; values are never echoed.' }) }));
  await app.commands.get('siftpath').handler('', app.ctx);
  assert.match(app.notices.at(-1).text, /INVALID_CONFIG/); assert.equal(app.notices.at(-1).kind, 'error');
  const raw = load(async () => ({ code: 1, stdout: '', stderr: 'PRIVATE_SECRET' }));
  await raw.commands.get('siftpath').handler('', raw.ctx); assert.ok(!JSON.stringify(raw.notices).includes('PRIVATE_SECRET'));
});
