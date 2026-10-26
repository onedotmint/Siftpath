import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { cssCases, cssArguments, markdownRepresentations, headingChecks, venvChecks } from './support/firecrawl-css.mjs';
import { normalize } from '../dist/output.js';

const dom = JSON.parse(await readFile(new URL('./fixtures/firecrawl-css-dom.json', import.meta.url), 'utf8'));
const table = dom.venv.tableRows.map(row => '| ' + row.join(' | ') + ' |').join('\n');

test('CSS experiments predeclare two public pages, Markdown-only native selection and real container', () => {
  assert.equal(cssCases.length, 2); assert.equal(new Set(cssCases.map(item => item.url)).size, 2);
  assert.equal(dom.venv.elementCount, 1);
  assert.equal(dom.venv.preCount, 0, 'Do not claim an indentation check on a section without fenced code.');
  for (const item of cssCases) {
    const args = cssArguments(item);
    assert.deepEqual(args.formats, ['markdown']);
    assert.deepEqual(args.includeTags, [item.selector]);
    assert.equal(args.onlyMainContent, false); assert.ok(args.objective.length <= 1000);
    assert.equal(args.queryOptions, undefined); assert.equal(args.headers, undefined);
  }
  assert.equal(cssCases[1].selector, dom.venv.selector);
});
test('CSS body extraction uses known native fields, not echoed objectives or vendor summaries', () => {
  assert.deepEqual(markdownRepresentations({ content: [{ type: 'text', text: 'Success; ' + table }], structuredContent: { objective: table } }), []);
  const body = '# Actual body\n';
  const raw = { content: [{ type: 'text', text: JSON.stringify({ markdown: body, metadata: { creditsUsed: 1 } }) }], structuredContent: { markdown: body } };
  assert.deepEqual(markdownRepresentations(raw).map(row => row.text), [body, body]);
  const output = normalize(raw, 'firecrawl', 'firecrawl_scrape', 16000, cssCases[0].url);
  assert.equal(markdownRepresentations({ content: [{ type: 'text', text: output.content }] })[0].text, body);
  assert.equal(output.truncated, false);
});
test('RFC checks separately detect missing headings, reordering, hierarchy errors and duplicate headings', () => {
  const body = dom.rfc.headings.map(row => '#'.repeat(row.level) + ' ' + row.text).join('\n');
  const checks = headingChecks(body, dom.rfc.headings);
  assert.equal(checks.actualCount, 76); assert.deepEqual(checks.missing, []);
  assert.equal(checks.orderPreserved, true); assert.equal(checks.levelsPreserved, true);
  assert.equal(checks.requestDirectives, true); assert.equal(checks.responseDirectives, true);
  assert.equal(checks.responseNoStore, true); assert.equal(checks.noBodyEvidence, true);
  const reversed = headingChecks(body.split('\n').reverse().join('\n'), dom.rfc.headings);
  assert.equal(reversed.orderPreserved, false);
  assert.equal(headingChecks(body.replace('##### 5.2.2.5. no-store', '## 5.2.2.5. no-store'), dom.rfc.headings).levelsPreserved, false);
  assert.equal(headingChecks(body + '\n# HTTP Caching', dom.rfc.headings).duplicateCount, 1);
  assert.equal(headingChecks(body.split('\n').slice(0, 10).join('\n'), dom.rfc.headings).responseDirectives, false);
});
test('Python checks require table shell/command associations and conditions, not merely heading or keywords', () => {
  const body = '## How venvs work\n' + table + '\n' + dom.venv.plainText;
  const checks = venvChecks(body, dom.venv.tableRows);
  for (const key of ['tableHeader', 'completeOrderedCommands', 'eachCommandExactlyOnce', 'prefixCheck', 'activationOptional', 'fullInterpreterPath', 'environmentVariableNotProof', 'nonPortable', 'recreateIfMoved', 'outsideSectionAbsent']) assert.equal(checks[key], true, key);
  assert.equal(checks.fencedCodeIndentation, null);
  const incomplete = venvChecks('## How venvs work\n| POSIX | bash/zsh | activate |', dom.venv.tableRows);
  assert.equal(incomplete.completeOrderedCommands, false); assert.equal(incomplete.activationOptional, false);
  assert.equal(venvChecks(body + '\n## API\n', dom.venv.tableRows).outsideSectionAbsent, false);
  assert.equal(venvChecks(body + '\n' + table, dom.venv.tableRows).eachCommandExactlyOnce, false);
});

test('captured official CSS bodies retain all RFC headings/anchors and Python table/conditions offline', async () => {
  const { createHash } = await import('node:crypto');
  const report = JSON.parse(await readFile(new URL('../docs/firecrawl-css-results.json', import.meta.url), 'utf8'));
  assert.equal(report.businessRequests.length, 2); assert.equal(report.blockedRequests, 0);
  assert.equal(report.reportedCreditsUsedTotal, 2); assert.equal(report.modelCalls, 0);
  assert.equal(report.measuredToolOutputTokens, null);
  for (const row of report.results) {
    const body = await readFile(new URL('../' + row.retainedBodyFixture, import.meta.url), 'utf8');
    assert.equal(createHash('sha256').update(body).digest('hex'), row.bodySha256);
    assert.equal(row.success, true); assert.equal(row.businessRequests, 1);
    assert.equal(row.bodyPreservedExactly, true); assert.equal(row.truncated, false);
    if (row.case === 'rfc-headings') {
      const checks = headingChecks(body, dom.rfc.headings);
      assert.deepEqual(checks.missing, []); assert.deepEqual(checks.unexpected, []);
      assert.equal(checks.actualCount, 76); assert.equal(checks.duplicateCount, 0);
      for (const key of ['orderPreserved', 'levelsPreserved', 'headingOnlyBody', 'requestDirectives', 'responseDirectives', 'responseNoStore']) assert.equal(checks[key], true, key);
      const ids = new Set([...dom.rfc.headings.map(h => h.id), ...dom.rfc.sectionIds]);
      const links = [...body.matchAll(/\]\((https:\/\/www\.rfc-editor\.org\/rfc\/rfc9111\.html[^)\s]*)\)/g)];
      assert.equal(links.length, 141);
      for (const match of links) assert.ok(ids.has(new URL(match[1].replaceAll('\\#', '#')).hash.slice(1)));
    } else {
      const checks = venvChecks(body, dom.venv.tableRows);
      for (const key of ['tableHeader', 'completeOrderedCommands', 'eachCommandExactlyOnce', 'prefixCheck', 'activationOptional', 'fullInterpreterPath', 'environmentVariableNotProof', 'nonPortable', 'recreateIfMoved', 'outsideSectionAbsent']) assert.equal(checks[key], true, key);
      assert.equal(row.historicalSection.equalsIgnoringBoundaryWhitespace, true);
      assert.equal(checks.fencedCodeIndentation, null);
    }
  }
});
