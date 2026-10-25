import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { normalize } from '../dist/output.js';
import { readingFacts, completeFacts } from './support/reading-quality.mjs';

const facts = [
  'Foreign key constraints must be enabled separately for each database connection.',
  'It is not possible to enable or disable foreign key constraints in the middle of a multi-statement transaction.',
  'Attempting to do so does not return an error; it simply has no effect.',
].join(' ');
const textResult = text => ({ content: [{ type: 'text', text }] });

test('reading quality ignores questions, metadata and sources instead of counting echoed facts', () => {
  const missing = { perConnection: false, transaction: false, noEffect: false };
  assert.deepEqual(readingFacts(textResult(`url: https://sqlite.org/foreignkeys.html\nquestion: ${facts}\nsnippets:\n  - unrelated text\nsnippet_source: content\n`)), missing);
  assert.deepEqual(readingFacts({ question: facts, sources: [{ title: facts }], content: 'unrelated' }), missing);
  assert.deepEqual(readingFacts(textResult(JSON.stringify({ question: facts, snippets: ['unrelated'] }))), missing);
  assert.deepEqual(readingFacts(textResult(`question: ${facts}\nsnippet_source: full_content\ncontent: >-\n  unrelated\n`)), missing);
});
test('reading quality handles native snippet, full-content and structured results', () => {
  for (const result of [
    textResult(`url: https://sqlite.org/foreignkeys.html\nquestion: example\nsnippets:\n  - '${facts}'\nsnippet_source: content\n`),
    textResult(`url: https://sqlite.org/foreignkeys.html\ncontent: >-\n  ${facts}\n`),
    { content: [], structuredContent: { snippets: [facts] } },
    { structuredData: { content: facts } },
    textResult(JSON.stringify({ snippets: [facts] })),
    textResult(JSON.stringify({ data: { markdown: facts }, metadata: { question: 'ignored' } })),
  ]) assert.deepEqual(readingFacts(result), completeFacts);
});
test('raw missing evidence and local output clipping are separate quality failures', () => {
  const url = 'https://sqlite.org/foreignkeys.html';
  const rawMissing = textResult('Foreign keys must be enabled separately for each database connection.');
  const missing = { perConnection: true, transaction: false, noEffect: false };
  assert.deepEqual(readingFacts(rawMissing), missing);
  const short = normalize(rawMissing, 'jina', 'read_url', 2000, url);
  assert.deepEqual(readingFacts(short), missing); assert.equal(short.truncated, false);

  const rawComplete = textResult('Introduction '.repeat(2000) + facts);
  assert.deepEqual(readingFacts(rawComplete), completeFacts);
  const clipped = normalize(rawComplete, 'jina', 'read_url', 2000, url);
  assert.equal(clipped.truncated, true); assert.ok(JSON.stringify(clipped).length <= 2000);
  assert.notDeepEqual(readingFacts(clipped), completeFacts);
  const roomy = normalize(rawComplete, 'jina', 'read_url', 50000, url);
  assert.equal(roomy.truncated, false); assert.deepEqual(readingFacts(roomy), completeFacts);
});


test('quality opt-in rejects custom endpoints before reading without logging private URL paths', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'siftpath-quality-private-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'config.json'), secret = 'private-path-sentinel-never-log';
  await writeFile(path, JSON.stringify({ providers: { jina: {
    connection: { transport: 'http', url: 'https://example.invalid/' + secret },
    read: { name: 'read_url', arguments: { url: '$url', question: '$focus' } },
  } } }));
  const env = { ...process.env, SIFTPATH_CONFIG: path, SIFTPATH_READ_QUALITY: '1' };
  delete env.NODE_TEST_CONTEXT; // Run a separate test process, not an inherited Node test worker.
  await assert.rejects(promisify(execFile)(process.execPath, ['--test', 'tests/live/reading-quality.test.mjs'], {
    env, timeout: 5000,
  }), error => {
    const log = error.stdout + error.stderr;
    assert.match(log, /This acceptance targets the official Jina reader/);
    assert.ok(!log.includes(secret)); return true;
  });
});


test('quality extraction reads present escaped Markdown in clipped JSON without inventing missing evidence', () => {
  const clipped = JSON.stringify({ markdown: facts }).slice(0, -2);
  assert.deepEqual(readingFacts(textResult(clipped)), completeFacts);
  const partial = JSON.stringify({ markdown: facts.split(' It is not possible')[0] }).slice(0, -2);
  assert.deepEqual(readingFacts(textResult(partial)), { perConnection: true, transaction: false, noEffect: false });
});
