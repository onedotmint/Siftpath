import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapArguments } from '../../dist/router.js';
import { McpClients } from '../../dist/client.js';
import { readConfiguration } from '../../dist/config.js';
import { scenarios, attribute, layers, requireMissing } from '../support/experience-scenarios.mjs';

// Opt-in only: a real model run plus whatever provider calls the model chooses.
// The point is to judge Siftpath's real use, not to score a model.
const enabled = process.env.SIFTPATH_PI_LIVE === '1';

function piArgs(pkg, model, prompt, tools) {
  return ['--mode', 'json', '--no-session', '--no-extensions', '-e', 'builtin:mcp',
    '-e', join(pkg, 'extensions/siftpath.mjs'), '--no-skills', '--no-prompt-templates', '--no-themes',
    '--no-context-files', '--no-approve', '--offline', '--model', model, '--thinking', 'off',
    '--tools', tools.map(tool => 'mcp__siftpath__' + tool).join(','), prompt];
}

/** Run one scenario through a real Pi session; return the tool evidence and the answer. */
async function runScenario(pkg, model, dir, index, scenario) {
  const agentDir = join(dir, 'agent-' + index);
  await mkdir(agentDir, { mode: 0o700 });
  const source = resolve(process.env.PI_CODING_AGENT_DIR ?? join(homedir(), '.pi', 'agent'));
  for (const name of ['auth.json', 'models.json']) {
    try { await stat(join(source, name)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    try { await symlink(join(source, name), join(agentDir, name)); }
    catch (error) { throw new Error('Cannot link Pi model configuration: ' + error.code); }
  }
  const pending = promisify(execFile)(process.env.SIFTPATH_PI_BIN ?? 'pi', piArgs(pkg, model, scenario.prompt, scenario.tools), {
    cwd: dir, env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, PI_SKIP_VERSION_CHECK: '1' },
    timeout: 240000, maxBuffer: 32 * 1024 * 1024,
  });
  pending.child.stdin.end();
  const events = (await pending).stdout.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
  const messages = events.filter(event => event.type === 'message_end' && event.message.role === 'assistant').map(event => event.message);
  const answer = (messages.at(-1)?.content ?? []).filter(block => block.type === 'text').map(block => block.text).join('\n');
  const calls = messages.flatMap(message => message.content.filter(block => block.type === 'toolCall'));
  const results = calls.map(call => {
    const end = events.find(event => event.type === 'tool_execution_end' && event.toolCallId === call.id);
    let parsed;
    try { parsed = JSON.parse(end?.result?.content?.find(block => block.type === 'text')?.text ?? ''); }
    catch { /* A failed or non-JSON result is recorded as absent evidence. */ }
    return { tool: call.name, isError: end?.isError ?? true, parsed };
  });
  return { answer, stopReason: messages.at(-1)?.stopReason, results };
}

test('experience scenarios: discovery, known API document, long-spec exceptions', {
  skip: !enabled && 'Set SIFTPATH_PI_LIVE=1 and SIFTPATH_PI_MODEL=provider/model to judge real use.',
  timeout: 900000,
}, async t => {
  const model = process.env.SIFTPATH_PI_MODEL;
  assert.ok(model, 'SIFTPATH_PI_MODEL must explicitly select the model to use.');
  const pkg = resolve(process.env.SIFTPATH_PI_PACKAGE_DIR ?? fileURLToPath(new URL('../..', import.meta.url)));
  const dir = await mkdtemp(join(tmpdir(), 'siftpath-experience-'));
  t.after(() => rm(dir, { recursive: true, force: true }));

  // Raw upstream capture: the Reader's own text before Siftpath normalizes or clips it,
  // so a missing passage is attributed to the vendor instead of guessed at. Only this
  // capture raises the budget; the model's own tool results use the real configured limit.
  const config = await readConfiguration();
  const reader = config.routes.read;
  const raw = {};
  const clients = new McpClients({ ...config, maxOutputChars: 50000 }, process.env);
  try {
    for (const scenario of scenarios.filter(row => row.url)) {
      const binding = config.providers[reader]?.read;
      if (!binding) { raw[scenario.id] = { error: 'NO_READ_BINDING' }; continue; }
      const entry = { url: scenario.url, focus: scenario.focus ?? null, reader };
      const modes = scenario.focus ? [['focused', scenario.focus], ['plain', null]] : [['plain', null]];
      for (const [mode, focus] of modes) {
        try {
          const result = await clients.call(reader, binding.name,
            mapArguments(binding.arguments, { url: scenario.url, ...(focus ? { focus } : {}) }),
            AbortSignal.timeout(60000));
          const text = result.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n');
          entry[mode] = { text, chars: text.length };
        } catch (error) { entry[mode] = { error: error.code ?? 'UNKNOWN' }; }
      }
      raw[scenario.id] = entry;
    }
  } finally { await clients.close(); }

  const report = { ranAt: new Date().toISOString(), model, maxOutputChars: config.maxOutputChars,
    note: 'Attribution is per anchor by regular expression over the recorded evidence; it is not a semantic judge. '
      + 'vendor_missing = the Reader never returned the passage, siftpath_clipped = the passage existed upstream but not in the tool result the model saw, '
      + 'model_misread = the passage reached the model but the answer contradicts it. The raw capture raises maxOutputChars to 50000; '
      + 'the model\'s own tool calls used the real configured limit.', results: [] };

  for (const [index, scenario] of scenarios.entries()) {
    const run = await runScenario(pkg, model, dir, index, scenario);
    const captured = raw[scenario.id] ?? null;
    // What the model actually saw: its own tool results, not the out-of-band capture.
    const seen = run.results.flatMap(call => typeof call.parsed?.content === 'string' ? [call.parsed.content] : []).join('\n');
    const row = {
      id: scenario.id, title: scenario.title, stopReason: run.stopReason,
      toolCalls: run.results.map(call => ({ tool: call.tool, isError: call.isError,
        provider: call.parsed?.provider ?? null,
        outputChars: call.parsed ? JSON.stringify(call.parsed).length : null,
        truncated: call.parsed?.truncated ?? null })),
      toolSucceeded: run.results.length > 0 && run.results.every(call => !call.isError),
      toolWorked: run.results.some(call => !call.isError),
      raw: captured, answer: run.answer,
      attribution: attribute(scenario, { raw: captured, output: seen, answer: run.answer }),
      taskRequirement: requireMissing(scenario, { output: seen, answer: run.answer }),
    };
    report.results.push(row);
    t.diagnostic(JSON.stringify({ id: row.id, layers: layers([row]), toolCalls: row.toolCalls, taskRequirement: row.taskRequirement }));
  }

  await writeFile(new URL('../fixtures/experience-scenarios.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');

  // Honest gate: the harness must run, and at least one tool call per scenario must work.
  // A model probing a capability that is not there and getting a clean failure is the
  // extension behaving correctly, so per-call failures are recorded, not gated. Evidence
  // that did reach the model may not be reported as lost by Siftpath either.
  for (const row of report.results) {
    assert.ok(row.toolCalls.length > 0, row.id + ' must actually call a tool.');
    assert.equal(row.toolWorked, true, row.id + ': no tool call succeeded. ' + JSON.stringify(row.toolCalls));
    assert.ok(!row.attribution.some(entry => entry.layer === 'siftpath_clipped'),
      row.id + ': evidence the Reader returned must survive Siftpath. ' + JSON.stringify(row.attribution));
  }
  const lost = report.results.flatMap(row => row.attribution.filter(entry => entry.layer !== 'ok')
    .map(entry => row.id + '/' + entry.id + '=' + entry.layer));
  if (lost.length) t.diagnostic('Recorded, not fixed: ' + lost.join(', '));
});
