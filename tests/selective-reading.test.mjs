import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { markdownHeadings, headingNavigation, sectionFromSameText } from './support/selective-reading.mjs';
import { mapArguments } from '../dist/router.js';
import { publicUrl } from '../dist/inputs.js';
import { readerPages, checkPage } from './support/reader-pages.mjs';

const schemaSnapshot = JSON.parse(await readFile(new URL('../docs/selective-reading-schemas.json', import.meta.url), 'utf8'));

test('research ATX scanner excludes fenced code, indented code and non-ATX syntax', () => {
  const body = '# Real\n````js\n# Not a heading\n```\n## Still code\n````\n~~~\n# Also code\n~~~\n    # Indented\n#NoSpace\nSetext\n======\n> # Quoted\n## End ##\n';
  assert.deepEqual(markdownHeadings(body).map(row => row.title), ['Real', 'End']);
});
test('same-text section slicing includes children, excludes next sibling and disambiguates duplicate titles', () => {
  const body = '# Parent\nintro\n## Same\none\n### Child\ninside\n## Same\ntwo\n# Next\nother';
  const headings = markdownHeadings(body);
  assert.equal(sectionFromSameText(body, headings, 1), '## Same\none\n### Child\ninside\n');
  assert.equal(sectionFromSameText(body, headings, 3), '## Same\ntwo\n');
  assert.equal(sectionFromSameText(body, headings, 99), null);
});
test('missing ATX headings or a missing chapter yields no fabricated navigation or evidence', () => {
  for (const body of ['plain text', '<html><h2>Real HTML heading</h2></html>', 'Setext title\n---']) {
    const headings = markdownHeadings(body);
    assert.deepEqual(headings, []);
    assert.equal(headingNavigation(headings), '');
    assert.equal(sectionFromSameText(body, headings, 0), null);
  }
  const partial = '# 4. Cache operation\n...\n# 6. Other caches\n...';
  assert.equal(markdownHeadings(partial).findIndex(row => /5\.2/.test(row.title)), -1);
});
test('research section slice preserves code indentation, blank lines, table text, Unicode and CRLF exactly', () => {
  const section = '## API\r\n```python\r\ndef f():\r\n    return "中😀"\r\n\r\n```\r\n| A | B |\r\n|---|---|\r\n| 0 | off |\r\n';
  const body = '# Doc\r\nintro\r\n' + section + '## Next\r\nend';
  assert.equal(sectionFromSameText(body, markdownHeadings(body), 1), section);
});
test('short navigation is not evidence: it can locate a late heading while containing none of its facts', () => {
  const body = '# Intro\n' + 'intro '.repeat(300) + '\n## Limits\nActual limit is 37.\n';
  const headings = markdownHeadings(body), nav = headingNavigation(headings);
  assert.match(nav, /Limits/);
  assert.ok(!body.slice(0, nav.length).includes('Limits'));
  assert.ok(!nav.includes('37'));
  assert.ok(!nav.includes('http'), 'Do not invent anchor URLs or CSS selectors.');
});
test('captured hosted MCP schemas distinguish native capability from REST-only and unrelated pagination', () => {
  assert.equal(schemaSnapshot.businessCalls, 0);
  const jina = schemaSnapshot.results.find(row => row.provider === 'jina').tool.inputSchema.properties;
  for (const key of ['url', 'question', 'topk', 'chunk_size', 'ocr', 'page']) assert.ok(jina[key]);
  for (const key of ['targetSelector', 'selector', 'start_index', 'max_length', 'outline']) assert.equal(jina[key], undefined);
  const firecrawl = schemaSnapshot.results.find(row => row.provider === 'firecrawl').tool;
  const fields = firecrawl.inputSchema.properties;
  assert.ok(firecrawl.inputSchema.required.includes('objective'));
  assert.deepEqual(fields.queryOptions.properties.mode.enum, ['directQuote', 'freeform']);
  assert.ok(fields.formats.items.enum.includes('query'));
  for (const key of ['includeTags', 'excludeTags', 'onlyMainContent', 'maxAge', 'storeInCache']) assert.ok(fields[key]);
  for (const key of ['section', 'offset', 'maxCharacters', 'outline', 'changeTrackingOptions']) assert.equal(fields[key], undefined);
  assert.ok(!fields.formats.items.enum.includes('highlights'), 'Output fields are not input capabilities.');
});
test('existing nested mappings express native focus/CSS constants but cannot conditionally switch formats', () => {
  const binding = { url: '$url', formats: ['query'], queryOptions: { prompt: '$focus', mode: 'directQuote' }, objective: 'Read the requested public page.' };
  assert.deepEqual(mapArguments(binding, { url: 'https://example.com', focus: 'no-store response conditions' }), {
    url: 'https://example.com', formats: ['query'], queryOptions: { prompt: 'no-store response conditions', mode: 'directQuote' }, objective: 'Read the requested public page.',
  });
  const unfocused = mapArguments(binding, { url: 'https://example.com' });
  assert.equal(unfocused.queryOptions.prompt, undefined);
  assert.deepEqual(unfocused.formats, ['query'], 'Static mapping is not a safe automatic focus/full binding switch.');
  const css = { url: '$url', formats: ['markdown'], includeTags: ['#known-section-container'], onlyMainContent: false };
  assert.deepEqual(mapArguments(css, { url: 'https://example.com' }).includeTags, ['#known-section-container']);
  const nativeHeadings = { ...css, includeTags: ['h1, h2, h3, h4, h5, h6'] };
  assert.deepEqual(mapArguments(nativeHeadings, { url: 'https://example.com' }).includeTags, ['h1, h2, h3, h4, h5, h6']);
  // One combined selector avoids grouping results by separately supplied tag names
  // in the documented Cheerio fallback; hosted execution is not tested here.
  const url = 'https://example.com/docs#heading';
  assert.equal(publicUrl(url), url, 'Preserving a fragment does not implement chapter selection.');
});

test('OFFLINE saved Reader bodies: navigation vs prefix and exact same-body section slices', {
  skip: !process.env.SIFTPATH_SELECTIVE_ARTIFACTS && 'Set SIFTPATH_SELECTIVE_ARTIFACTS to the prior local Reader body directory; no network.',
}, async t => {
  const root = process.env.SIFTPATH_SELECTIVE_ARTIFACTS;
  const cases = [
    { id: 'rfc9111', target: /\[5\.2\.2\.5\.\]/, required: [/MUST NOT store/, /both private and shared caches/, /non-volatile storage/, /best-effort/, /not a reliable or sufficient mechanism/], forbidden: /##### \[5\.2\.2\.6\./ },
    { id: 'sqlite', target: /Enabling Foreign Key Support/, required: [/PRAGMA foreign_keys = ON;/, /must be enabled separately/, /simply has no effect/], forbidden: /# 3\\\./ },
    { id: 'python-venv', target: /How venvs work/, required: [/bin\/activate/, /Scripts\\activate.bat/, /Scripts\\Activate.ps1/], forbidden: /^## API/m },
  ];
  const report = { source: 'Prior saved provider body artifacts, not fresh reads or complete-page guarantees',
    businessCalls: 0, modelCalls: 0, characterUnit: 'JavaScript UTF-16 code units, not measured tokens', cases: [] };
  for (const item of cases) {
    const file = 'firecrawl-' + item.id + '-full-raw.txt';
    const body = await readFile(join(root, file), 'utf8');
    const headings = markdownHeadings(body), nav = headingNavigation(headings);
    const index = headings.findIndex(row => item.target.test(row.title));
    assert.ok(index >= 0, item.id + ': known heading must actually be present.');
    const section = sectionFromSameText(body, headings, index);
    for (const pattern of item.required) assert.match(section, pattern);
    assert.doesNotMatch(section, item.forbidden);
    assert.ok(body.includes(section));
    const row = { page: item.id, artifact: file, sha256: createHash('sha256').update(body).digest('hex'),
      bodyChars: body.length, headingCount: headings.length, navigationChars: nav.length,
      targetHeading: headings[index].title, targetOffset: headings[index].offset,
      equalBudgetPrefixHasTargetHeading: body.slice(0, nav.length).includes(headings[index].title),
      navigationContainsEvidence: item.required.map(pattern => pattern.test(nav)),
      sectionChars: section.length, sectionPreservedExactly: body.slice(headings[index].offset, headings[index].offset + section.length) === section,
      // A client without a retained full body must call a provider again. This is
      // a scenario count, not an execution trace or evidence that the second call works.
      statelessOutlineThenReadMinimumCalls: 2,
    };
    if (item.id === 'python-venv') {
      const codeIndex = headings.findIndex(heading => /An example of extending/.test(heading.title));
      const code = sectionFromSameText(body, headings, codeIndex);
      assert.ok(code.includes('\n    def '));
      row.codeSectionChars = code.length;
      row.codeIndentationRetained = body.includes(code);
    }
    if (item.id === 'sqlite') {
      const focused = await readFile(join(root, 'jina-sqlite-focus-raw.txt'), 'utf8');
      row.priorFocusedEvidenceChecks = checkPage(focused, readerPages.find(page => page.id === 'sqlite'));
      assert.ok(Object.values(row.priorFocusedEvidenceChecks).every(Boolean));
    }
    report.cases.push(row); t.diagnostic(JSON.stringify(row));
  }
  const partial = await readFile(join(root, 'jina-rfc9111-full-raw.txt'), 'utf8');
  report.upstreamMissingChapter = { page: 'rfc9111', targetFoundInATX: markdownHeadings(partial).some(row => /5\.2\.2\.5/.test(row.title)),
    note: 'An outline cannot restore a chapter absent from the supplied body; lack of a heading is not proof the live page lacks that chapter.' };
  assert.equal(report.upstreamMissingChapter.targetFoundInATX, false);
  t.diagnostic(JSON.stringify(report.upstreamMissingChapter));
});
