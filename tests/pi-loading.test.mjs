import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const exec = promisify(execFile);
const root = resolve(process.env.SIFTPATH_PI_PACKAGE_DIR ?? fileURLToPath(new URL('..', import.meta.url)));
const probe = fileURLToPath(new URL('./fixtures/pi-loading-extension.mjs', import.meta.url));
const names = ['mcp__siftpath__web_read', 'mcp__siftpath__web_search'];

test('local Pi loads builtin:mcp + Siftpath: two tools, reader/focus schema and /siftpath (no inference)', {
  timeout: 60000,
}, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'siftpath-pi-loading-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const agentDir = join(dir, 'agent'), reportPath = join(dir, 'report.json');
  await mkdir(agentDir, { mode: 0o700 });
  // Allowlist, not process.env spread: no private keys, proxy settings, NODE_OPTIONS or Pi config.
  const env = Object.fromEntries(['PATH', 'SystemRoot', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT', 'WINDIR']
    .filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  Object.assign(env, {
    HOME: dir, USERPROFILE: dir, APPDATA: dir, LOCALAPPDATA: dir,
    XDG_CONFIG_HOME: dir, XDG_CACHE_HOME: dir, XDG_DATA_HOME: dir,
    TMPDIR: dir, TMP: dir, TEMP: dir,
    PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: '1', PI_SKIP_VERSION_CHECK: '1', PI_TELEMETRY: '0',
    SIFTPATH_CONFIG: join(dir, 'config.json'), SIFTPATH_PI_LOADING_REPORT: reportPath,
    NODE_OPTIONS: '--import=' + JSON.stringify(pathToFileURL(probe).href),
  });
  await writeFile(join(agentDir, 'auth.json'), '{}', { mode: 0o600 });
  await writeFile(join(agentDir, 'settings.json'), JSON.stringify({
    packages: [], compaction: { enabled: false }, retry: { enabled: false },
  }), { mode: 0o600 });
  const provider = {
    connection: { transport: 'stdio', command: process.execPath,
      args: [fileURLToPath(new URL('./fixtures/official-mcp.mjs', import.meta.url)), '--stdio'],
      env: { NODE_OPTIONS: env.NODE_OPTIONS, SIFTPATH_PI_LOADING_REPORT: reportPath } },
    search: { name: 'search', arguments: { q: '$query', count: '$maxResults' } },
    read: { name: 'read', arguments: { url: '$url', question: '$focus' } },
  };
  await writeFile(env.SIFTPATH_CONFIG, JSON.stringify({
    version: 2, credentials: {}, providers: { 'local-reader_42': provider },
    routes: { search: 'local-reader_42', read: 'local-reader_42', intents: {}, searchFallback: [], readFallback: [] },
  }), { mode: 0o600 });

  const bin = process.env.SIFTPATH_PI_BIN ?? 'pi';
  const isScript = /\.[cm]?js$/i.test(bin), command = isScript ? process.execPath : bin, prefix = isScript ? [bin] : [];
  let version;
  try {
    ({ stdout: version } = await exec(command, [...prefix, '--version'], { cwd: dir, env, timeout: 10000, maxBuffer: 65536 }));
  } catch (error) {
    if (error.code === 'ENOENT') { t.skip('Local Pi CLI not found; install Pi >=1.4 or set SIFTPATH_PI_BIN. No simulated loading.'); return; }
    throw new Error('Local Pi version check failed (code=' + error.code + '); output withheld.');
  }
  assert.match(version.trim(), /^1\.(?:[4-9]|[1-9]\d+)\.\d+(?:[-+].*)?$/, 'Requires local Pi 1.4+ (1.x).');
  const args = ['--mode', 'rpc', '--no-session', '--offline', '--no-approve',
    '--no-extensions', '-e', 'builtin:mcp', '-e', join(root, 'extensions/siftpath.mjs'), '-e', probe,
    '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files', '--no-builtin-tools'];
  let stdout;
  try {
    const pending = exec(command, [...prefix, ...args], { cwd: dir, env, timeout: 35000, maxBuffer: 1024 * 1024 });
    let buffer = '', observed = false;
    const answered = new Set();
    pending.child.stdout.setEncoding('utf8');
    pending.child.stdout.on('data', chunk => {
      buffer += chunk;
      let end;
      // RPC framing is LF only, not readline's additional Unicode line separators.
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        let record;
        try { record = JSON.parse(line); }
        catch { pending.child.stdin.end(); continue; } // The final parse below reports invalid JSON.
        if (record.type === 'extension_ui_request' && record.message === 'pi-loading:observed') observed = true;
        if (record.type === 'response') answered.add(record.id);
      }
      if (observed && answered.has('commands') && answered.has('messages')) pending.child.stdin.end();
    });
    pending.child.stdin.on('error', () => {}); // execFile reports premature process termination safely below.
    // No prompt, compact, model lookup, shell command, or paid tool execution is ever sent.
    pending.child.stdin.write('{"id":"commands","type":"get_commands"}\n{"id":"messages","type":"get_messages"}\n');
    ({ stdout } = await pending);
  } catch (error) {
    throw new Error('Isolated Pi loading failed (code=' + error.code + ', signal=' + error.signal + '); output withheld.');
  }
  const records = stdout.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
  assert.ok(!records.some(record => ['extension_error', 'agent_start', 'turn_start', 'message_start', 'tool_execution_start'].includes(record.type)),
    'Extensions must load without errors or any agent/model/tool run.');
  const commands = records.find(record => record.type === 'response' && record.id === 'commands');
  assert.equal(commands?.success, true, 'Pi must answer get_commands.');
  const registered = commands.data.commands.filter(command => command.name === 'siftpath');
  assert.equal(registered.length, 1, 'The production /siftpath command must be registered exactly once.');
  assert.equal(registered[0].source, 'extension');
  assert.equal(registered[0].sourceInfo.path, join(root, 'extensions/siftpath.mjs'));
  const messages = records.find(record => record.type === 'response' && record.id === 'messages');
  assert.equal(messages?.success, true, 'Pi must answer get_messages.');
  assert.deepEqual(messages.data.messages, [], 'Loading must not create a model conversation.');

  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  assert.equal(report.mode, 'rpc');
  assert.deepEqual(report.tools.map(tool => tool.name).sort(), names, 'Inspect all discovered Siftpath tools, without filtering extras away.');
  assert.deepEqual(report.activeTools.filter(name => name.startsWith('mcp__siftpath__')).sort(), names);
  assert.ok(report.tools.every(tool => tool.exposure === 'direct'));
  const schema = report.tools.find(tool => tool.name === 'mcp__siftpath__web_read').parameters;
  assert.equal(schema.type, 'object');
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties).sort(), ['focus', 'reader', 'url']);
  assert.deepEqual(schema.required, ['url']);
  const { reader, focus } = schema.properties;
  assert.equal(reader.type, 'string');
  assert.equal(reader.enum, undefined, 'Reader must not be restricted to hard-coded provider IDs.');
  assert.equal(reader.const, undefined);
  assert.equal(reader.anyOf, undefined);
  assert.equal(reader.oneOf, undefined);
  assert.ok(new RegExp(reader.pattern).test('local-reader_42'), 'A configured custom Reader ID must fit the real Pi schema.');
  assert.equal(focus.type, 'string');
  assert.ok(!Object.hasOwn(schema.properties, 'mode'));
  t.diagnostic('Pi ' + version.trim() + ': actual RPC/MCP loading passed; 2 Siftpath tools, reader/focus, /siftpath; 0 prompts, 0 inference, 0 external business calls.');
});
