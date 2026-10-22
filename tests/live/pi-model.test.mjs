import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const enabled = process.env.SIFTPATH_PI_LIVE === '1';
// A real model run, not an MCP SDK client: opt-in because both model and providers may charge quota.
test('LIVE Pi model calls Siftpath search/read and answers from the returned sources', {
  skip: !enabled && 'Set SIFTPATH_PI_LIVE=1 and SIFTPATH_PI_MODEL=provider/model (Pi >=1.4 required).',
  timeout: 240000,
}, async t => {
  const model = process.env.SIFTPATH_PI_MODEL;
  assert.ok(model, 'SIFTPATH_PI_MODEL must explicitly select the paid/free model to use.');
  const pkg = resolve(process.env.SIFTPATH_PI_PACKAGE_DIR ?? fileURLToPath(new URL('../..', import.meta.url)));
  const dir = await mkdtemp(join(tmpdir(), 'siftpath-pi-model-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const agentDir = join(dir, 'agent');
  await mkdir(agentDir, { mode: 0o700 });
  // Reuse existing Pi authentication without copying its values or loading personal MCP/settings/extensions.
  const source = resolve(process.env.PI_CODING_AGENT_DIR ?? join(homedir(), '.pi', 'agent'));
  for (const name of ['auth.json', 'models.json']) {
    try { await stat(join(source, name)); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    try { await symlink(join(source, name), join(agentDir, name)); }
    catch (error) { throw new Error('Cannot link Pi model configuration into the isolated directory: ' + error.code); }
  }
  const config = JSON.parse(await readFile(join(pkg, 'examples/anonymous.json'), 'utf8'));
  config.providers = { exa: config.providers.exa, jina: config.providers.jina };
  config.routes = { search: 'exa', read: 'jina', intents: {}, searchFallback: [], readFallback: [] };
  const path = join(dir, 'config.json');
  await writeFile(path, JSON.stringify(config), { mode: 0o600 });
  const args = ['--mode', 'json', '--no-session', '--no-extensions', '-e', 'builtin:mcp',
    '-e', join(pkg, 'extensions/siftpath.mjs'), '--no-skills', '--no-prompt-templates', '--no-themes',
    '--no-context-files', '--no-approve', '--offline', '--model', model, '--thinking', 'off',
    '--tools', 'mcp__siftpath__web_search,mcp__siftpath__web_read',
    'Use web_search exactly once to find the official Node.js documentation (query: Node.js official documentation, maxResults: 1). '
    + 'Use web_read exactly once on https://example.com (no focus). Do not use any other tools or retry. '
    + 'After BOTH results, briefly state what Example Domain is for and cite its URL plus a nodejs.org documentation URL returned by search. '
    + 'If a tool fails, report failure honestly; do not invent its content.'];
  let stdout;
  try {
    const pending = promisify(execFile)(process.env.SIFTPATH_PI_BIN ?? 'pi', args, {
      cwd: dir, env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, SIFTPATH_CONFIG: path, PI_SKIP_VERSION_CHECK: '1' },
      timeout: 210000, maxBuffer: 16 * 1024 * 1024,
    });
    pending.child.stdin.end(); // Pi consumes redirected stdin before starting the prompt.
    ({ stdout } = await pending);
  } catch (error) {
    // Do not dump provider stderr, model configuration or a credential-bearing child-process error.
    throw new Error('Pi did not finish successfully (code=' + error.code + '). Check Pi authentication/network separately.');
  }
  const events = stdout.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
  const messages = events.filter(event => event.type === 'message_end' && event.message.role === 'assistant').map(event => event.message);
  const final = messages.at(-1);
  if (final?.stopReason === 'error') t.diagnostic(JSON.stringify({
    stopReason: final.stopReason, httpStatus: final.errorMessage?.match(/\b[45]\d\d\b/)?.[0],
    category: final.errorMessage?.match(/not supported|no available provider|unauthorized|forbidden|connection|fetch failed|API key/i)?.[0] ?? 'model request failed',
  }));
  assert.equal(final?.stopReason, 'stop', 'Model must finish normally, not just return process exit code 0.');
  assert.ok(events.some(event => event.type === 'agent_settled' && event.aborted === false));
  const calls = messages.flatMap(message => message.content.filter(block => block.type === 'toolCall'));
  assert.deepEqual(calls.map(call => call.name).sort(), ['mcp__siftpath__web_read', 'mcp__siftpath__web_search']);
  const evidence = [];
  for (const [tool, provider] of [['web_search', 'exa'], ['web_read', 'jina']]) {
    const call = calls.find(call => call.name === 'mcp__siftpath__' + tool);
    const end = events.find(event => event.type === 'tool_execution_end' && event.toolCallId === call.id);
    assert.equal(end?.isError, false, tool + ' must actually succeed.');
    const result = JSON.parse(end.result.content.find(block => block.type === 'text').text);
    assert.equal(result.provider, provider);
    assert.ok(result.content.length > 20 && result.sources.length > 0);
    evidence.push({ tool, provider, sources: result.sources.map(source => source.url), outputChars: result.content.length });
  }
  const answer = final.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
  assert.match(answer, /example\.com/i);
  assert.match(answer, /nodejs\.org/i);
  assert.match(answer, /example|documentation|示例|文档/i);
  t.diagnostic(JSON.stringify({ model: final.provider + '/' + final.model, tools: evidence, answer }));
});
