import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { normalize } from '../dist/output.js';

const captured = JSON.parse(await readFile(new URL('./fixtures/wal-agent-evidence.json', import.meta.url), 'utf8'));
const body = name => captured.reads.find(row => row.input.url.endsWith(name)).modelVisibleResult.content;

test('real WAL native MCP text reaches the recorded Agent tool result unchanged within 16k', () => {
  for (const row of captured.reads) {
    const native = row.nativeMcpResult.content[0].text;
    assert.equal(row.nativeMcpResult.content.length, 1);
    assert.equal(createHash('sha256').update(native).digest('hex'), row.nativeTextSha256);
    assert.equal(native, row.modelVisibleResult.content);
    const output = normalize(row.nativeMcpResult, 'jina', 'read_url', 16000, row.input.url,
      [{ provider: 'jina', code: 'FOCUS_MAY_OMIT_CONTENT' }]);
    assert.deepEqual({ ...output, retrievedAt: 'ignored' }, { ...row.modelVisibleResult, retrievedAt: 'ignored' });
    assert.equal(output.content, native);
    assert.equal(output.truncated, false);
    assert.equal(output.sourcesTruncated, false);
    assert.deepEqual(output.sources, [{ url: row.input.url }]);
    assert.ok(JSON.stringify(output).length <= 16000);
  }
});


test('native partial sentences and script noise are upstream, not local clipping or a promise of completeness', () => {
  const hook = body('wal_hook.html');
  assert.ok(hook.includes('function toggle_div'));
  assert.ok(hook.includes('antiRobotDefense();'));
  assert.ok(hook.endsWith('To re-enable the default behavi\nsnippet_source: content\n'));
  for (const row of captured.reads) {
    assert.equal(row.modelVisibleResult.truncated, false);
    assert.ok(row.modelVisibleResult.warnings.some(w => w.code === 'FOCUS_MAY_OMIT_CONTENT'));
    assert.ok(row.modelVisibleResult.warnings.some(w => w.code === 'UNTRUSTED_WEB_CONTENT'));
  }
  assert.equal(captured.provenance.searchCalls, 0, 'Reads and cited URLs are not evidence of a search.');
});

test('smaller output budgets still flag local clipping and never manufacture missing exceptions', () => {
  const row = captured.reads.find(row => row.input.url.endsWith('walformat.html'));
  const output = normalize(row.nativeMcpResult, 'jina', 'read_url', 2000, row.input.url,
    [{ provider: 'jina', code: 'FOCUS_MAY_OMIT_CONTENT' }]);
  assert.equal(output.truncated, true);
  assert.ok(row.nativeMcpResult.content[0].text.startsWith(output.content));
  assert.ok(JSON.stringify(output).length <= 2000);
  assert.equal(output.sources[0].url, row.input.url);
  assert.ok(!output.content.includes('nBackfill is changed to zero'));
  assert.equal(output.readScope, undefined);
});

const followup = JSON.parse(await readFile(new URL('./fixtures/evidence-quality-followup.json', import.meta.url), 'utf8'));

test('real short advisory preserves maintenance-branch exceptions without local clipping', () => {
  const row = followup.discoveryRead;
  const result = normalize(row.nativeMcpResult, 'jina', 'read_url', 16000, row.input.url);
  assert.deepEqual({ ...result, retrievedAt: 'ignored' }, { ...row.modelVisibleResult, retrievedAt: 'ignored' });
  assert.equal(result.truncated, false);
  assert.equal(result.content, row.nativeMcpResult.content[0].text);
  for (const version of ['8.20.2', '8.16.2', '8.14.3']) {
    assert.ok(result.content.includes(`curl >= ${version}`));
  }
});
