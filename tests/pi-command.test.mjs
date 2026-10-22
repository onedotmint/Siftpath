import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import extension from '../extensions/siftpath.mjs';

const theme = { fg: (_color, text) => text, dim: text => text, accent: text => text };
const missing = provider => ({ provider, code: 'MISSING_CREDENTIALS', needs: [provider.toUpperCase() + '_API_KEY'], operations: [provider === 'jina' ? 'read' : 'search'], lastTest: null, lastTestStale: false, configured: true });
function report(overrides = {}) {
  return { version: '2.0.0', ok: true, networkChecked: false, configPath: '/tmp/config.json', warnings: [], nextStep: 'Test the configured services.',
    routes: { search: 'exa', read: 'jina', defaultIntent: 'general', intents: { general: 'exa' }, searchFallback: [], readFallback: [] },
    providers: [{ provider: 'exa', code: 'READY', operations: ['search'], lastTest: { outcome: 'passed' }, lastTestStale: false, configured: true },
      { provider: 'jina', code: 'READY', operations: ['read'], lastTest: { outcome: 'passed' }, lastTestStale: false, configured: true }], ...overrides };
}
function harness({ exec, select, confirm = true, drivers = [], tools = [] } = {}) {
  const commands = new Map(), events = new Map(), servers = [], notices = [], calls = [];
  extension({
    registerCommand: (name, command) => commands.set(name, command),
    on: (name, handler) => events.set(name, handler),
    registerMcpServer: (name, config) => servers.push({ name, config }),
    unregisterMcpServer: () => {},
    getAllTools: () => tools,
    exec: async (command, args, options) => { calls.push(args); return (exec ?? (async () => ({ code: 0, stdout: JSON.stringify(report()) })))(command, args, options); },
  });
  const queue = [...drivers];
  const ui = {
    notify: (text, kind) => notices.push({ text, kind }),
    select: async (title, options) => (select ? select(title, options) : options[0]),
    confirm: async () => confirm,
    custom: factory => new Promise(resolve => {
      const component = factory({ requestRender() {} }, theme, {}, resolve);
      (queue.shift() ?? ((_component, done) => done(undefined)))(component, resolve);
    }),
  };
  return { commands, events, servers, notices, calls, ui, ctx: { cwd: '/tmp', hasUI: true, mode: 'tui', ui } };
}
async function isolatedConfig(t) {
  const dir = await mkdtemp(join(tmpdir(), 'siftpath-pi-'));
  const path = join(dir, 'config.json'), previous = process.env.SIFTPATH_CONFIG;
  process.env.SIFTPATH_CONFIG = path;
  t.after(async () => {
    if (previous === undefined) delete process.env.SIFTPATH_CONFIG; else process.env.SIFTPATH_CONFIG = previous;
    await rm(dir, { recursive: true, force: true });
  });
  return { dir, path };
}
const command = app => app.commands.get('siftpath');

test('Pi registers one command and one MCP server pointing at the packaged runtime, with no startup work', () => {
  const app = harness();
  assert.deepEqual([...app.commands.keys()], ['siftpath']);
  assert.equal(app.servers.length, 1);
  const { name, config } = app.servers[0];
  assert.equal(name, 'siftpath'); assert.equal(config.exposure, 'direct');
  assert.equal(config.command, process.execPath);
  assert.deepEqual(config.args.slice(1), ['mcp']);
  // Windows reports backslashes; the runtime path is correct on both platforms.
  assert.match(config.args[0], /dist[\\/]cli\.js$/);
  assert.equal(app.calls.length, 0);
});

test('first-time /siftpath leads with quick setup; a configured install leads with status', async t => {
  await isolatedConfig(t);
  let menu;
  const first = harness({ exec: async () => ({ code: 0, stdout: JSON.stringify(report({ providers: [missing('exa'), missing('jina')],
    routes: { search: 'unconfigured', read: 'unconfigured', defaultIntent: 'general', intents: {}, searchFallback: [], readFallback: [] } })) }),
  select: (title, options) => { if (title === 'Siftpath') { menu = options; return undefined; } } });
  await command(first).handler('', first.ctx);
  assert.equal(menu[0], '快速配置（推荐）');
  const configured = harness({ select: (title, options) => { if (title === 'Siftpath') { menu = options; return undefined; } } });
  await command(configured).handler('', configured.ctx);
  assert.equal(menu[0], '查看服务状态');
});

test('status screen names config source, Pi tools, READY vs tested, routes and next step without secrets', async t => {
  await isolatedConfig(t);
  const screens = [];
  const app = harness({ tools: [{ name: 'mcp__siftpath__web_search' }, { name: 'mcp__siftpath__web_read' }, { name: 'bash' }],
    select: (title, options) => title === 'Siftpath' ? '查看服务状态' : options[0],
    drivers: [(component, done) => { screens.push(component.render(200).join('\n')); done(undefined); }] });
  await command(app).handler('', app.ctx);
  const text = screens.join('\n');
  assert.match(text, /配置来源: \/tmp\/config\.json/);
  assert.match(text, /mcp__siftpath__web_search/); assert.match(text, /mcp__siftpath__web_read/);
  assert.ok(!text.includes('bash'));
  assert.match(text, /最近测试 passed/); assert.match(text, /READY 只表示配置可用/);
  assert.match(text, /下一步: Test the configured services/);
  assert.ok(!JSON.stringify(app.notices).includes('sk-'));
});

test('quick setup masks the Key, saves private config with recommended routes, and never exposes the Key', async t => {
  const { path } = await isolatedConfig(t);
  const rendered = [];
  const app = harness({
    exec: async () => ({ code: 0, stdout: JSON.stringify(report({ providers: [missing('exa'), missing('jina')],
      routes: { search: 'unconfigured', read: 'unconfigured', defaultIntent: 'general', intents: {}, searchFallback: [], readFallback: [] } })) }),
    select: title => title === 'Siftpath' ? '快速配置（推荐）'
      : title.startsWith('用哪个服务搜索') ? 'Exa (exa)'
      : title.startsWith('用哪个服务阅读') ? 'Jina (jina)'
      : title === 'Exa 凭据' ? '输入 API Key'
      : title === 'Jina 凭据' ? '使用官方匿名访问' : undefined,
    drivers: [(component, done) => {
      for (const char of 'sk-live-test-key') component.handleInput(char);
      rendered.push(component.render(120).join('\n'));
      component.handleInput('\r');
    }],
  });
  await command(app).handler('', app.ctx);
  const saved = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(saved.credentials.EXA_API_KEY, 'sk-live-test-key');
  assert.equal(saved.providers.exa.search.name, 'web_search_exa');
  assert.equal(saved.providers.exa.enabled, true);
  assert.equal(saved.providers.jina.connection.headers.Authorization, undefined);
  assert.equal(saved.routes.search, 'exa'); assert.equal(saved.routes.read, 'jina');
  assert.ok(rendered[0].includes('•')); assert.ok(!rendered[0].includes('sk-live-test-key'));
  assert.ok(!JSON.stringify(app.notices).includes('sk-live-test-key'));
  assert.match(app.notices.map(notice => notice.text).join('\n'), /已保存/);
  if (process.platform !== 'win32') assert.equal((await stat(path)).mode & 0o777, 0o600);
});

test('cancelling the masked Key prompt saves no partial configuration', async t => {
  const { path } = await isolatedConfig(t);
  const app = harness({
    exec: async () => ({ code: 0, stdout: JSON.stringify(report({ providers: [missing('exa'), missing('jina')] })) }),
    select: title => title === 'Siftpath' ? '快速配置（推荐）'
      : title.startsWith('用哪个服务搜索') ? 'Exa (exa)'
      : title.startsWith('用哪个服务阅读') ? 'Jina (jina)'
      : title === 'Exa 凭据' ? '输入 API Key' : undefined,
    drivers: [(component, done) => component.handleInput('\x1b')],
  });
  await command(app).handler('', app.ctx);
  await assert.rejects(readFile(path), { code: 'ENOENT' });
});

test('environment credentials warn about precedence and still allow a saved replacement', async t => {
  const { path } = await isolatedConfig(t);
  process.env.EXA_API_KEY = 'env-only-test-value';
  t.after(() => { delete process.env.EXA_API_KEY; });
  const app = harness({
    exec: async () => ({ code: 0, stdout: JSON.stringify(report({ providers: [missing('exa'), missing('jina')] })) }),
    select: title => title === 'Siftpath' ? '快速配置（推荐）'
      : title.startsWith('用哪个服务搜索') ? 'Exa (exa)'
      : title.startsWith('用哪个服务阅读') ? 'Jina (jina)'
      : title === 'Exa 凭据' ? '输入 API Key（替换现有）'
      : title === 'Jina 凭据' ? '使用官方匿名访问' : undefined,
    drivers: [(component, done) => { for (const char of 'replacement-key') component.handleInput(char); component.handleInput('\r'); }],
  });
  await command(app).handler('', app.ctx);
  assert.equal(JSON.parse(await readFile(path, 'utf8')).credentials.EXA_API_KEY, 'replacement-key');
  assert.match(app.notices.map(notice => notice.text).join('\n'), /环境变量优先/);
  assert.ok(!JSON.stringify(app.notices).includes('env-only-test-value'));
});

test('/siftpath test passes a safe provider id, shows the CLI summary and hides raw stderr', async t => {
  await isolatedConfig(t);
  const app = harness({ exec: async () => ({ code: 1, stdout: JSON.stringify({ ok: false, counts: { passed: 0, failed: 1, skipped: 0 }, summary: 'brave: FAILED — UPSTREAM_ERROR: ...' }), stderr: 'PRIVATE_SECRET' }),
    drivers: [(component, done) => { assert.match(component.render(200).join('\n'), /UPSTREAM_ERROR/); done(undefined); }] });
  await command(app).handler('test brave', app.ctx);
  assert.deepEqual(app.calls[0].slice(1), ['test', 'brave', '--json']);
  assert.ok(!JSON.stringify(app.notices).includes('PRIVATE_SECRET'));
  const failing = harness({ exec: async () => ({ code: 1, stdout: '', stderr: JSON.stringify({ code: 'AUTH_FAILED', message: 'Authentication rejected.', hint: 'Replace the Key.' }) }) });
  await command(failing).handler('test exa', failing.ctx);
  assert.equal(failing.notices.at(-1).kind, 'warning');
  assert.match(failing.notices.at(-1).text, /AUTH_FAILED/); assert.match(failing.notices.at(-1).text, /Replace the Key/);
});

test('arbitrary arguments are rejected, closed sessions abort their CLI child, and config errors stay structured', async t => {
  await isolatedConfig(t);
  const rejected = harness({ exec: async () => { throw new Error('must not run'); } });
  await command(rejected).handler('test brave; echo secret', rejected.ctx);
  await command(rejected).handler('rm -rf /', rejected.ctx);
  assert.equal(rejected.calls.length, 0);
  let signal;
  const aborted = harness({ exec: async (_command, _args, options) => {
    signal = options.signal; return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  } });
  const work = command(aborted).handler('test all', aborted.ctx);
  aborted.events.get('session_shutdown')(); await work;
  assert.equal(signal.aborted, true);
  const broken = harness({ exec: async () => ({ code: 1, stdout: '', stderr: JSON.stringify({ code: 'INVALID_CONFIG', message: 'Invalid configuration; values are never echoed.' }) }) });
  await command(broken).handler('', broken.ctx);
  assert.equal(broken.notices.at(-1).kind, 'error');
  assert.match(broken.notices.at(-1).text, /状态读取失败/);
  const raw = harness({ exec: async () => ({ code: 1, stdout: '', stderr: 'PRIVATE_SECRET' }) });
  await command(raw).handler('test all', raw.ctx);
  assert.ok(!JSON.stringify(raw.notices).includes('PRIVATE_SECRET'));
});

test('non-interactive modes refuse configuration instead of starting a second terminal UI', async t => {
  await isolatedConfig(t);
  const app = harness({ exec: async () => ({ code: 0, stdout: JSON.stringify(report({ summary: 'Siftpath 2.0.0 — status (offline)' })) }) });
  const quiet = { ...app.ctx, mode: 'json' };
  await command(app).handler('', quiet);
  assert.match(app.notices.at(-1).text, /status \(offline\)/);
  assert.ok(!app.notices.some(notice => /快速配置/.test(notice.text)));
});
