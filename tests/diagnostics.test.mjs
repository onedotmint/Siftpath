import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { parseConfiguration } from '../dist/config.js';
import { Siftpath } from '../dist/index.js';
import { statusReport, testReport, testHistoryPath, formatStatus, formatTests } from '../dist/diagnostics.js';
const fixture = resolve('tests/fixtures/official-mcp.mjs');
function provider(name = 'search', env = {}) {
  return { connection: { transport: 'stdio', command: process.execPath, args: [fixture, '--stdio'], env },
    search: { name, arguments: { q: '$query', count: '$maxResults' } } };
}
async function setup(t, providers) {
  const dir = await mkdtemp(join(tmpdir(), 'siftpath-diagnostics-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'config.json'), config = parseConfiguration({ providers });
  await writeFile(path, JSON.stringify(config)); return { dir, path, config };
}
function cli(path, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['dist/cli.js', ...args], { env: { ...process.env, SIFTPATH_CONFIG: path }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = ''; child.stdout.on('data', d => stdout += d); child.stderr.on('data', d => stderr += d);
    child.once('error', reject); child.once('exit', code => resolve({ code, stdout, stderr }));
  });
}

test('status is offline, shows configured/credentials/routes/version and never implies untested availability', async t => {
  const s = await setup(t, { brave: provider('search', { KEY: '${ABSENT_KEY}' }), exa: provider(), jina: { ...provider(), enabled: false } });
  const result = await cli(s.path, ['status', '--json']); assert.equal(result.code, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.networkChecked, false); assert.ok(report.version); assert.equal(report.routes.read, 'jina');
  assert.equal(report.providers.find(p => p.provider === 'brave').code, 'MISSING_CREDENTIALS');
  assert.equal(report.providers.find(p => p.provider === 'jina').code, 'DISABLED');
  assert.ok(report.providers.every(p => p.lastTest === null)); assert.match(report.summary, /NOT_TESTED/);
  await assert.rejects(stat(testHistoryPath(s.path)), { code: 'ENOENT' });
});
test('single provider probe reports all stages and never invokes configured fallback', async t => {
  const s = await setup(t, { brave: provider('fail'), exa: provider() });
  const report = await testReport(s.config, 'brave', s.path, {});
  assert.equal(report.ok, false); assert.equal(report.results.length, 1); assert.equal(report.results[0].configuration, 'READY');
  assert.deepEqual(report.results[0].stages, { connection: 'passed', discovery: 'passed', request: 'failed' });
  assert.equal(report.results[0].code, 'UPSTREAM_ERROR'); assert.ok(!JSON.stringify(report).includes('PRIVATE_KEY'));
  const state = await statusReport(s.config, s.path, {});
  assert.equal(state.providers.find(p => p.provider === 'exa').lastTest, null);
  assert.equal(state.providers.find(p => p.provider === 'brave').lastTest.outcome, 'failed');
});
test('all runs sequentially with one minimal request per search/read binding and private bounded history', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'siftpath-probe-log-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const log = join(dir, 'calls.jsonl'), both = provider('search', { MOCK_LOG: log });
  both.read = { name: 'read', arguments: { url: '$url', question: '$focus' } };
  const s = await setup(t, { first: both, second: provider('search', { MOCK_LOG: log }) });
  const report = await testReport(s.config, 'all', s.path, {});
  assert.equal(report.ok, true); assert.equal(report.results.length, 2);
  assert.ok(report.results.every(r => r.outcome === 'passed' && r.durationMs > 0));
  const calls = (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(calls.map(call => call.name), ['search', 'read', 'search']);
  assert.equal(calls[0].args.count, 5); assert.deepEqual(calls[1].args, { url: 'https://example.com' });
  const history = await readFile(testHistoryPath(s.path), 'utf8');
  assert.ok(!history.includes('Official result text') && !history.includes('example.com'));
  if (process.platform !== 'win32') assert.equal((await stat(testHistoryPath(s.path))).mode & 0o777, 0o600);
  const status = await statusReport(s.config, s.path, {});
  assert.equal(status.providers.find(p => p.provider === 'first').lastTestStale, false);
});
test('missing credentials, disabled, absent providers and unsupported capabilities stay not_tested', async t => {
  const s = await setup(t, { brave: provider('search', { KEY: '${ABSENT_KEY}' }), exa: { ...provider(), enabled: false }, empty: { connection: provider().connection } });
  const report = await testReport(s.config, 'all', s.path, {});
  assert.equal(report.networkChecked, false);
  assert.deepEqual(report.results.map(r => r.code), ['MISSING_CREDENTIALS', 'DISABLED', 'UNSUPPORTED_OPERATION']);
  assert.ok(report.results.every(r => r.stages.connection === 'not_tested' && r.outcome === 'skipped'));
  for (const id of ['jina', 'constructor']) {
    const absent = await testReport(s.config, id, s.path, {}); assert.equal(absent.results[0].code, 'NOT_CONFIGURED');
  }
});
test('discovery and connection failures cannot mark actual request as passed', async t => {
  const s = await setup(t, { missing: provider('missing_tool'), invalid: { ...provider(), connection: { transport: 'stdio', command: '/not/a/real/executable', args: [] } } });
  const report = await testReport(s.config, 'all', s.path, {});
  assert.deepEqual(report.results[0].stages, { connection: 'passed', discovery: 'failed', request: 'not_tested' });
  assert.equal(report.results[0].code, 'TOOL_NOT_FOUND');
  assert.deepEqual(report.results[1].stages, { connection: 'failed', discovery: 'not_tested', request: 'not_tested' });
});
test('timeouts bound the whole probe and history marks changed credentials/config as stale', async t => {
  const s = await setup(t, { slow: { ...provider('slow'), timeoutMs: 1000 }, exa: provider('search', { KEY: '${TEST_KEY}' }) });
  const report = await testReport(s.config, 'slow', s.path, {});
  assert.equal(report.results[0].code, 'PROVIDER_TIMEOUT'); assert.equal(report.results[0].stages.request, 'failed');
  await testReport(s.config, 'exa', s.path, { TEST_KEY: 'first-secret-value' });
  assert.equal((await statusReport(s.config, s.path, { TEST_KEY: 'first-secret-value' })).providers.find(p => p.provider === 'exa').lastTestStale, false);
  const changed = await statusReport(s.config, s.path, { TEST_KEY: 'second-secret-value' });
  assert.equal(changed.providers.find(p => p.provider === 'exa').lastTestStale, true);
  assert.ok(!JSON.stringify(changed).includes('secret-value'));
});
test('unreadable history does not falsify status or overwrite an unsafe file', async t => {
  const s = await setup(t, { exa: provider() }); await writeFile(testHistoryPath(s.path), 'not JSON');
  const status = await statusReport(s.config, s.path, {});
  assert.deepEqual(status.warnings, ['TEST_HISTORY_UNREADABLE']); assert.ok(status.providers.every(p => p.lastTest === null));
  const tested = await testReport(s.config, 'exa', s.path, {});
  assert.equal(tested.ok, true); assert.deepEqual(tested.warnings, ['TEST_HISTORY_UNREADABLE']);
  assert.equal(await readFile(testHistoryPath(s.path), 'utf8'), 'not JSON');
});
test('CLI JSON exit codes, summaries, failure messages and latest-test persistence are consistent', async t => {
  const s = await setup(t, { brave: provider('fail'), exa: provider() });
  const bad = await cli(s.path, ['test', 'brave', '--json']); assert.equal(bad.code, 1); assert.equal(bad.stderr, '');
  assert.match(JSON.parse(bad.stdout).summary, /UPSTREAM_ERROR/);
  const good = await cli(s.path, ['test', 'exa', '--json']); assert.equal(good.code, 0); assert.equal(JSON.parse(good.stdout).results[0].outcome, 'passed');
  assert.match((await cli(s.path, ['status'])).stdout, /last test passed/);
  assert.equal((await cli(s.path, ['test'])).code, 1);
  assert.equal((await cli(s.path, ['test', 'brave', 'exa'])).code, 1);
});

test('paginated tool discovery works and discovery errors cannot pass the request stage', async t => {
  const s = await setup(t, { pages: provider('search', { MOCK_PAGINATED_TOOLS: '1' }), broken: provider('search', { MOCK_DISCOVERY_FAIL: '1' }) });
  const report = await testReport(s.config, 'all', s.path, {});
  assert.equal(report.results[0].outcome, 'passed');
  assert.deepEqual(report.results[1].stages, { connection: 'passed', discovery: 'failed', request: 'not_tested' });
  assert.equal(report.results[1].code, 'DISCOVERY_FAILED');
  assert.ok(!JSON.stringify(report).includes('PRIVATE_DISCOVERY_ERROR'));
});
test('connection authentication failures are distinct from an untested/missing key', async t => {
  const server = createServer((_req, res) => res.writeHead(401).end('PRIVATE_AUTH_DETAILS'));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const s = await setup(t, { denied: { ...provider(), connection: { transport: 'http', url: 'http://127.0.0.1:' + server.address().port + '/mcp', headers: { Authorization: 'Bearer test-only-secret' } } } });
  const report = await testReport(s.config, 'denied', s.path, {});
  assert.equal(report.results[0].code, 'AUTH_FAILED');
  assert.deepEqual(report.results[0].stages, { connection: 'failed', discovery: 'not_tested', request: 'not_tested' });
  assert.ok(!JSON.stringify(report).includes('PRIVATE_AUTH_DETAILS')); assert.ok(!JSON.stringify(report).includes('test-only-secret'));
});

test('first-page output schema and task-required metadata cannot be lost by later pages', async t => {
  const s = await setup(t, { schema: provider('search', { MOCK_OUTPUT_SCHEMA: '1' }), tasks: provider('search', { MOCK_TASK_REQUIRED: '1' }) });
  const report = await testReport(s.config, 'all', s.path, {});
  assert.deepEqual(report.results.map(result => result.outcome), ['failed', 'failed']);
  assert.deepEqual(report.results.map(result => result.code), ['INVALID_UPSTREAM_RESPONSE', 'TASK_REQUIRED']);
  assert.ok(report.results.every(result => result.stages.discovery === 'passed' && result.stages.request === 'failed'));
});
test('effective timeout and output-limit changes invalidate historical results', async t => {
  const s = await setup(t, { exa: provider() }); await testReport(s.config, 'exa', s.path, {});
  const latest = config => statusReport(config, s.path, {}).then(report => report.providers.find(p => p.provider === 'exa'));
  assert.equal((await latest(s.config)).lastTestStale, false);
  assert.equal((await latest({ ...s.config, providerTimeoutMs: 100 })).lastTestStale, true);
  assert.equal((await latest({ ...s.config, timeoutMs: 100 })).lastTestStale, true);
  assert.equal((await latest({ ...s.config, maxOutputChars: 2000 })).lastTestStale, true);
});
test('history eviction preserves the newest result and never writes a file it refuses to read', async t => {
  const s = await setup(t, { missing: provider('search', { KEY: '${ABSENT_KEY}' }) });
  const row = { fingerprint: 'a'.repeat(64), result: { provider: 'old', testedAt: '2000-01-01T00:00:00.000Z', durationMs: 1,
    outcome: 'skipped', code: 'NOT_CONFIGURED', stages: { connection: 'not_tested', discovery: 'not_tested', request: 'not_tested' }, operations: [] } };
  const data = { version: 1, tests: {} };
  for (let i = 0; ; i++) {
    data.tests['old' + i] = row;
    if (Buffer.byteLength(JSON.stringify(data, null, 2) + '\n') > 1048576 - 500) { delete data.tests['old' + i]; break; }
  }
  await writeFile(testHistoryPath(s.path), JSON.stringify(data, null, 2) + '\n');
  await testReport(s.config, 'missing', s.path, {});
  assert.ok((await stat(testHistoryPath(s.path))).size <= 1048576);
  const state = await statusReport(s.config, s.path, {});
  assert.deepEqual(state.warnings, []); assert.equal(state.providers.find(p => p.provider === 'missing').lastTest.code, 'MISSING_CREDENTIALS');
});

test('two config files in the same directory retain independent latest-test records', async t => {
  const s = await setup(t, { exa: provider() }), otherPath = join(s.dir, 'work.json');
  const other = parseConfiguration({ providers: { exa: provider('fail') } });
  await testReport(s.config, 'exa', s.path, {});
  await testReport(other, 'exa', otherPath, {});
  assert.notEqual(testHistoryPath(s.path), testHistoryPath(otherPath));
  const personal = (await statusReport(s.config, s.path, {})).providers.find(p => p.provider === 'exa');
  const work = (await statusReport(other, otherPath, {})).providers.find(p => p.provider === 'exa');
  assert.equal(personal.lastTest.outcome, 'passed'); assert.equal(personal.lastTestStale, false);
  assert.equal(work.lastTest.outcome, 'failed'); assert.equal(work.lastTestStale, false);
});
test('diagnostic contract validation is intentionally stricter than business-call success', async t => {
  const s = await setup(t, { exa: provider('search', { MOCK_OUTPUT_SCHEMA: '1' }) });
  const r = new Siftpath({ ...s.config, routes: { ...s.config.routes, search: 'exa', intents: {}, searchFallback: [] } }, {}); t.after(() => r.close());
  const result = await r.search({ query: 'native text still usable' });
  assert.ok(result.content.length); assert.ok(result.sources.length);
  const diagnostic = await testReport(s.config, 'exa', s.path, {});
  assert.equal(diagnostic.results[0].code, 'INVALID_UPSTREAM_RESPONSE');
  assert.equal(diagnostic.results[0].stages.request, 'failed');
});

test('ambiguous legacy directory history is not imported or overwritten for a selected config', async t => {
  const s = await setup(t, { exa: provider() }), legacyPath = join(s.dir, '.siftpath-tests.json');
  const legacy = JSON.stringify({ version: 1, tests: {} }); await writeFile(legacyPath, legacy);
  const before = await statusReport(s.config, s.path, {});
  assert.equal(before.providers.find(p => p.provider === 'exa').lastTest, null);
  await testReport(s.config, 'exa', s.path, {});
  assert.equal(await readFile(legacyPath, 'utf8'), legacy);
  assert.equal((await statusReport(s.config, s.path, {})).providers.find(p => p.provider === 'exa').lastTest.outcome, 'passed');
});

test('disabled providers are skipped without failing the run, and nothing testable is never a success', async t => {
  const mixed = await setup(t, { exa: provider(), jina: { ...provider(), enabled: false } });
  const partial = await testReport(mixed.config, 'all', mixed.path, {});
  assert.equal(partial.ok, true); assert.deepEqual(partial.counts, { passed: 1, failed: 0, skipped: 1 });
  assert.match(formatTests(partial), /1 passed, 0 failed, 1 skipped/);
  assert.match(formatTests(partial), /Overall: OK/);
  const none = await setup(t, { exa: { ...provider(), enabled: false }, jina: { ...provider(), enabled: false } });
  const empty = await testReport(none.config, 'all', none.path, {});
  assert.equal(empty.ok, false); assert.deepEqual(empty.counts, { passed: 0, failed: 0, skipped: 2 });
  assert.equal(empty.networkChecked, false);
  assert.match(formatTests(empty), /Overall: nothing testable/);
  assert.match((await cli(none.path, ['test', 'all'])).stdout, /nothing testable/);
});

test('enabled but unconfigured providers are reported as pending setup, not as healthy', async t => {
  const s = await setup(t, { brave: provider('search', { KEY: '${ABSENT_KEY}' }), exa: provider() });
  const report = await testReport(s.config, 'all', s.path, {});
  assert.equal(report.results[0].configuration, 'MISSING_CREDENTIALS');
  assert.equal(report.results[0].outcome, 'skipped');
  assert.equal(report.ok, true);
  const status = await statusReport(s.config, s.path, {});
  assert.equal(status.providers.find(row => row.provider === 'brave').code, 'MISSING_CREDENTIALS');
  assert.match(status.nextStep, /待配置: brave/);
});

test('status names the effective config file and separates READY from actually tested providers', async t => {
  const s = await setup(t, { exa: provider() });
  const untested = await statusReport(s.config, s.path, {});
  assert.equal(untested.configPath, s.path);
  assert.match(untested.nextStep, /Test the configured services/);
  assert.ok(formatStatus(untested).includes('Config: ' + s.path));
  assert.match(formatStatus(untested), /NOT_TESTED/);
  await testReport(s.config, 'exa', s.path, {});
  const tested = await statusReport(s.config, s.path, {});
  assert.equal(tested.providers.find(row => row.provider === 'exa').lastTest.outcome, 'passed');
  assert.match(formatStatus(tested), /exa: READY · search · last test passed/);
  assert.match(formatStatus(tested), /Ready: ask the model/);
  assert.ok(!JSON.stringify(tested).includes('PRIVATE_KEY'));
});
