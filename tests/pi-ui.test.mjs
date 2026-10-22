import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CancellableLoader, visibleWidth } from '@earendil-works/pi-tui';
import extension, { validateSecret } from '../extensions/siftpath.mjs';
import { parseConfiguration } from '../dist/config.js';
import { anonymousPresets } from '../dist/defaults.js';

const theme = { fg: (_color, text) => `\x1b[36m${text}\x1b[0m` };
const ready = () => parseConfiguration({ providers: { exa: anonymousPresets.exa, tavily: anonymousPresets.tavily, jina: anonymousPresets.jina },
  routes: { search: 'exa', read: 'jina', intents: { general: 'exa' } } });
const status = () => ({ version: '2.0.0', ok: true, configPath: '/tmp/中文配置.json', nextStep: '测试连接',
  routes: ready().routes, providers: ['exa', 'tavily', 'jina'].map(provider => ({ provider, code: 'READY', operations: ['search'], lastTest: null })) });

async function isolated(t, initial = ready()) {
  const dir = await mkdtemp(join(tmpdir(), 'siftpath-pi-ui-')), path = join(dir, 'config.json');
  const keys = ['SIFTPATH_CONFIG', 'EXA_API_KEY', 'TAVILY_API_KEY', 'BRAVE_API_KEY', 'JINA_API_KEY', 'FIRECRAWL_API_KEY'];
  const previous = keys.map(key => process.env[key]);
  for (const key of keys) delete process.env[key];
  process.env.SIFTPATH_CONFIG = path;
  if (initial) await writeFile(path, JSON.stringify(initial));
  t.after(async () => {
    keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; });
    await rm(dir, { recursive: true, force: true });
  });
  return path;
}

function harness({ answers = [], drivers = [], mode = 'tui', confirm = true, exec } = {}) {
  let command;
  const events = new Map(), notices = [], calls = [], prompts = [], confirmations = [], screens = [];
  extension({ registerCommand: (_name, value) => { command = value; }, registerMcpServer() {}, on: (name, handler) => events.set(name, handler),
    exec: async (_command, args, options) => {
      calls.push({ args: args.slice(1), signal: options.signal });
      return exec ? exec(args.slice(1), options.signal) : { stdout: JSON.stringify(status()) };
    } });
  const ui = {
    notify: (text, kind) => notices.push({ text, kind }),
    select: async (title, options) => {
      prompts.push({ title, options });
      if (!answers.length) return options[0];
      const [expected, answer] = answers.shift();
      assert.ok(title.includes(expected), `Unexpected prompt: ${title}`);
      assert.ok(answer === undefined || options.includes(answer), 'Scripted answer must be offered');
      return answer;
    },
    confirm: async (title, message) => { confirmations.push({ title, message }); return confirm; },
    custom: factory => {
      assert.equal(mode, 'tui', 'RPC must not invoke a terminal component');
      return new Promise((resolve, reject) => {
        const component = factory({ requestRender() {} }, theme, {}, value => queueMicrotask(() => resolve(value)));
        screens.push(component);
        try {
          const driver = drivers.shift();
          if (driver) driver(component);
          else if (!(component instanceof CancellableLoader)) component.handleInput('\r');
        } catch (error) { component.dispose?.(); reject(error); }
      });
    },
  };
  return { run: args => command.handler(args, { cwd: '/tmp', hasUI: true, mode, ui }), events, notices, calls, prompts, confirmations, screens };
}
const quickAnswers = () => [['Siftpath', '快速配置'], ['用哪个服务搜索', 'Exa (exa)'], ['用哪个服务阅读', '保持现有阅读'], ['Exa 凭据', '输入新的 API Key（替换现有）']];
const advancedAnswers = action => [['Siftpath', '高级配置'], ['Siftpath 高级配置', action]];

for (const [name, input, expected] of [
  ['CSI-u text, release, backspace and Enter', ['fixture-secret-', '\x1b[97u', '\x1b[98;1:3u', '\x1b[99u', '\x1b[127u', '\x1b[100u', '\x1b[13u'], 'fixture-secret-ad'],
  ['kitty Shift text and forward delete', ['fixture-secret-', '\x1b[97:65;2u', 'x', '\x1b[3;1~', '\x1b[57414u'], 'fixture-secret-A'],
  ['bracketed paste split across chunks and a Unicode deletion', ['\x1b[200~', 'fixture-中文😀', '\x1b[20', '1~', '\x1b[127u', '\r'], 'fixture-中文'],
  ['complete bracketed paste with trailing submit', ['\x1b[200~fixture-paste\x1b[201~\x1b[13u'], 'fixture-paste'],
]) {
  test(`masked input handles ${name} without displaying the value`, async t => {
    const initial = ready(); initial.credentials.EXA_API_KEY = 'fixture-old';
    const path = await isolated(t, initial);
    const app = harness({ answers: quickAnswers(), drivers: [component => {
      for (const data of input) component.handleInput(data);
      for (const width of [1, 2, 3, 8, 20, 80]) {
        const lines = component.render(width);
        assert.ok(lines.every(line => visibleWidth(line) <= width));
        assert.ok(!lines[1].includes(expected));
      }
    }] });
    await app.run('');
    assert.equal(JSON.parse(await readFile(path, 'utf8')).credentials.EXA_API_KEY, expected);
    assert.ok(!JSON.stringify(app.notices).includes(expected));
  });
}

for (const cancel of ['\x1b[27u', '\x1b[99;5u']) {
  test('kitty Escape/Ctrl+C cancels masked input without saving', async t => {
    const initial = ready(); initial.credentials.EXA_API_KEY = 'fixture-old';
    const path = await isolated(t, initial), before = await readFile(path, 'utf8');
    const app = harness({ answers: quickAnswers(), drivers: [component => { component.handleInput('fixture-discard'); component.handleInput(cancel); }] });
    await app.run('');
    assert.equal(await readFile(path, 'utf8'), before);
    assert.equal(app.confirmations.length, 0);
  });
}

test('pasted control sequences and newlines are rejected rather than executed or silently stripped', async t => {
  const initial = ready(); initial.credentials.EXA_API_KEY = 'fixture-old';
  const path = await isolated(t, initial), before = await readFile(path, 'utf8');
  const app = harness({ answers: quickAnswers(), drivers: [component => {
    component.handleInput('\x1b[200~fixture\n\x1b[13u\x1b[201~');
    component.handleInput('\x1b[13u');
    assert.match(component.render(100).join('\n'), /Key 格式无效/);
    component.handleInput('\x1b[27u');
  }] });
  await app.run('');
  assert.equal(await readFile(path, 'utf8'), before);
  for (const value of ['bad\tkey', 'bad\x1bkey', 'bad\x85key']) assert.ok(validateSecret(value));
});

test('ANSI Chinese status fits narrow columns and uses protocol-aware scroll/close keys', async () => {
  const report = status(); report.providers = Array.from({ length: 30 }, (_, i) => ({ provider: `服务${i}`, code: 'READY', operations: [] }));
  const app = harness({ exec: async () => ({ stdout: JSON.stringify(report) }), drivers: [component => {
    for (const width of [1, 2, 3, 5, 12, 80]) assert.ok(component.render(width).every(line => visibleWidth(line) <= width));
    const before = component.render(100).join('\n');
    component.handleInput('\x1b[1;1:3B');
    assert.equal(component.render(100).join('\n'), before);
    component.handleInput('\x1b[1;1B');
    assert.notEqual(component.render(100).join('\n'), before);
    component.handleInput('\x1b[1;1A');
    assert.equal(component.render(100).join('\n'), before);
    component.handleInput('\x1b[13u');
  }] });
  await app.run('status');
});

test('RPC status/test deliver notifications without custom UI', async () => {
  const app = harness({ mode: 'rpc', answers: [['真实请求', '确认测试']], exec: async args => ({ stdout: JSON.stringify(args[0] === 'status' ? status() : { ok: false, summary: 'exa: FAILED — safe diagnostic' }) }) });
  await app.run('status'); await app.run('test exa');
  assert.equal(app.screens.length, 0);
  assert.ok(app.notices.some(({ text }) => text.includes('配置来源: /tmp/中文配置.json')));
  assert.ok(app.notices.some(({ text, kind }) => text.includes('exa: FAILED — safe diagnostic') && kind === 'warning'));
});

test('search fallback offers the general primary for other intents and preserves selected order', async t => {
  const path = await isolated(t);
  const app = harness({ answers: [...advancedAnswers('设置搜索意图'), ['general 搜索', 'Exa (exa)'], ['semantic 搜索', 'Tavily (tavily)'], ['research 搜索', 'Tavily (tavily)'],
    ['搜索后备顺序', 'Exa (exa)'], ['搜索后备顺序', 'Tavily (tavily)'], ['Siftpath 高级配置', '保存并退出']] });
  await app.run('');
  const saved = JSON.parse(await readFile(path, 'utf8'));
  assert.deepEqual(saved.routes.searchFallback, ['exa', 'tavily']);
  assert.equal(saved.routes.intents.semantic, 'tavily');
});

for (const [action, submenu, preceding = []] of [
  ['配置或更换某个服务的凭据', '选择服务'],
  ['配置或更换某个服务的凭据', 'Exa 凭据', [['选择服务', 'Exa (exa)']]],
  ['停用某个服务', '停用哪个服务？'],
  ['设置搜索意图', 'general 搜索'],
  ['设置搜索意图', 'semantic 搜索', [['general 搜索', 'Exa (exa)']]],
  ['设置搜索意图', 'research 搜索', [['general 搜索', 'Exa (exa)'], ['semantic 搜索', 'Exa (exa)']]],
  ['设置搜索意图', '搜索后备顺序', [['general 搜索', 'Exa (exa)'], ['semantic 搜索', 'Exa (exa)'], ['research 搜索', 'Exa (exa)']]],
  ['设置阅读服务与后备顺序', '默认阅读服务'],
  ['设置阅读服务与后备顺序', '阅读后备顺序', [['默认阅读服务', 'Jina (jina)']]],
]) {
  test(`advanced cancellation at ${submenu} discards earlier draft changes`, async t => {
    const initial = ready(); initial.providers.firecrawl = anonymousPresets.firecrawl;
    const path = await isolated(t, initial), before = await readFile(path, 'utf8');
    const app = harness({ answers: [...advancedAnswers('停用某个服务'), ['停用哪个服务？', 'Tavily (tavily)'], ['Siftpath 高级配置', action], ...preceding, [submenu, undefined]] });
    await app.run('');
    assert.equal(await readFile(path, 'utf8'), before);
    assert.equal(app.confirmations.length, 0);
  });
}

for (const mode of ['快速配置', '高级配置']) {
  test(`${mode} discloses plaintext storage, path and platform boundaries before saving`, async t => {
    const path = await isolated(t), before = await readFile(path, 'utf8');
    const answers = mode === '高级配置' ? advancedAnswers('保存并退出') : [['Siftpath', mode], ['用哪个服务搜索', 'Exa (exa)'], ['用哪个服务阅读', '保持现有阅读'], ['Exa 凭据', '保留当前连接']];
    const app = harness({ answers, confirm: false });
    await app.run('');
    assert.equal(await readFile(path, 'utf8'), before);
    assert.equal(app.confirmations.length, 1);
    const { message } = app.confirmations[0];
    assert.ok(message.includes(path));
    for (const wording of ['明文私有 JSON', '未加密', 'POSIX 0600', 'Windows 不保证 POSIX 权限', '用户 ACL', '环境 Key 不复制']) assert.ok(message.includes(wording));
  });
}

for (const args of ['test all', 'test exa']) {
  test(`${args} defaults to cancelling paid requests`, async () => {
    const app = harness(); await app.run(args);
    assert.deepEqual(app.prompts[0].options, ['取消', '确认测试']);
    assert.equal(app.calls.length, 0);
  });
}

test('running tests use official cancellation and abort the original CLI signal', async () => {
  let signal;
  const app = harness({ answers: [['真实请求', '确认测试']], exec: async (_args, supplied) => {
    signal = supplied;
    return new Promise(resolve => supplied.addEventListener('abort', () => resolve({ stdout: '' }), { once: true }));
  }, drivers: [loader => { assert.ok(loader instanceof CancellableLoader); loader.handleInput('\x1b[27u'); }] });
  await app.run('test all');
  assert.equal(signal.aborted, true);
  assert.equal(app.screens[0].intervalId, null);
  assert.match(app.notices.at(-1).text, /测试已取消/);
});

test('successful test closes and disposes its loader before presenting results', async () => {
  const app = harness({ answers: [['真实请求', '确认测试']], exec: async () => ({ stdout: JSON.stringify({ ok: true, summary: 'exa: PASSED' }) }) });
  await app.run('test exa');
  assert.equal(app.screens.length, 2);
  assert.equal(app.screens[0].intervalId, null);
  assert.match(app.screens[1].render(80).join('\n'), /exa: PASSED/);
});
