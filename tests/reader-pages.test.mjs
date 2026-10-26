import test from 'node:test';
import assert from 'node:assert/strict';
import { readerPages, checkPage, htmlNoise } from './support/reader-pages.mjs';

test('Reader comparison has eight public pages, five categories and exactly two focused cases', () => {
  assert.equal(readerPages.length, 8); assert.equal(new Set(readerPages.map(page => page.url)).size, 8);
  assert.equal(readerPages.filter(page => page.focus).length, 2);
  assert.deepEqual(new Set(readerPages.map(page => page.category)), new Set(['technical', 'long-spec', 'commands', 'table', 'dynamic']));
  for (const page of readerPages) { assert.equal(new URL(page.url).protocol, 'https:'); assert.equal(page.checks.length, 3); }
});
test('Reader checks normalize markup and distinguish missing facts from HTML overhead', () => {
  const sqlite = readerPages[0];
  const partial = 'must be <b>enabled separately</b> for each database connection';
  assert.deepEqual(checkPage(partial, sqlite), { 'per-connection': true, transaction: false, 'no-error-no-effect': false });
  assert.deepEqual(checkPage('must be enabled separately for each [database connection](https://example.com/)', sqlite),
    { 'per-connection': true, transaction: false, 'no-error-no-effect': false });
  assert.deepEqual(htmlNoise('plain text'), { tagChars: 0, tagFraction: 0 });
  assert.equal(htmlNoise('<b>x</b>').tagChars, 7);
});
