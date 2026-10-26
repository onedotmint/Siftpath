import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalize } from '../dist/output.js';
import { readSchema } from '../dist/inputs.js';
import { toolDefinitions } from '../dist/tools.js';
import { experienceCases, nativeReply, selectReply } from './support/model-experience.mjs';
import { evidenceText, readingFacts, completeFacts } from './support/reading-quality.mjs';

const url = 'https://example.com/spec?signature=a%2Bb#v9';
const text = value => ({ type: 'text', text: value });

test('exact structural mirrors are emitted once, independent of JSON key order and wrapper metadata', () => {
  const body = { url, markdown: '```js\nconst x = "中😀";\n```\n| Key | Value |\n| v | 9.7 |' };
  for (const envelope of [body, { markdown: body.markdown, url }, { ...body, creditsUsed: 1 }]) {
    const part = JSON.stringify(envelope);
    const result = normalize({ content: [text(part)], structuredContent: body }, 'fixture', 'read', 16000, url);
    assert.equal(result.content, part);
    assert.equal(result.truncated, false);
    assert.deepEqual(JSON.parse(result.content), envelope);
  }
});

test('near matches, additional structured evidence and summaries are never fuzzy-deduplicated', () => {
  const structuredContent = { url, markdown: 'exact text\n| 0 | disabled |', version: '9.7' };
  for (const part of [
    'exact text\n| 0 | disabled |',
    JSON.stringify({ ...structuredContent, markdown: 'exact text\n| 0 | unlimited |' }),
    JSON.stringify({ url, markdown: structuredContent.markdown }),
    'Found one page',
  ]) {
    const result = normalize({ content: [text(part)], structuredContent }, 'fixture', 'read', 16000, url);
    assert.equal(result.content, part + '\n\n' + JSON.stringify(structuredContent));
  }
  const part = JSON.stringify({ rows: ['A', 'B'] });
  const result = normalize({ content: [text(part)], structuredContent: { rows: ['B', 'A'], url } }, 'fixture', 'read', 16000, url);
  assert.match(result.content, /\["A","B"\]/);
  assert.match(result.content, /\["B","A"\]/);
});

test('dedup preserves native order, warnings, requested URL and link index without inventing scope', () => {
  const body = { url: 'https://example.org/redirect', markdown: '[Related](https://example.net/not-read)' };
  const warnings = [{ provider: 'failed', code: 'PROVIDER_TIMEOUT' }, { provider: 'fixture', code: 'FOCUS_MAY_OMIT_CONTENT' }];
  const result = normalize({ content: [text('Before'), text(JSON.stringify(body)), text('After [Related](https://example.net/not-read)')], structuredContent: body }, 'fixture', 'read', 16000, url, warnings);
  assert.equal(result.content, 'Before\n\n' + JSON.stringify(body) + '\n\nAfter [Related](https://example.net/not-read)');
  assert.equal(result.url, url);
  assert.equal(result.sources[0].url, url);
  assert.ok(result.sources.some(source => source.url === body.url));
  assert.ok(result.sources.some(source => source.url === 'https://example.net/not-read'));
  assert.deepEqual(result.warnings, [{ code: 'UNTRUSTED_WEB_CONTENT' }, ...warnings]);
  assert.equal(result.readScope, undefined, 'No inferred scope from focus or generic field names.');
  assert.equal(result.truncated, false);
});

test('code/table evidence reclaimed from duplicate envelopes survives the unchanged total budget', () => {
  const markdown = '```js\nconst v = "中😀";\n```\n| Mode | Version |\n' + '| safe | 9.7 |\n'.repeat(65);
  const body = { url, markdown };
  const raw = { content: [text(JSON.stringify({ ...body, reader: 'fixture' }))], structuredContent: body };
  const result = normalize(raw, 'fixture', 'read', 2000, url);
  assert.equal(result.truncated, false);
  assert.equal(JSON.parse(result.content).markdown, markdown);
  const clipped = normalize({ content: [text(markdown.repeat(6))] }, 'fixture', 'read', 2000, url);
  assert.equal(clipped.truncated, true);
  assert.ok(JSON.stringify(clipped).length <= 2000);
  assert.ok(!/[\uD800-\uDBFF]$/.test(clipped.content));
});

test('controlled regression fixtures separate sufficient SQLite, missing RFC and incomplete native full-content', async () => {
  const baseline = JSON.parse(await readFile(new URL('./fixtures/model-experience-baseline.json', import.meta.url), 'utf8'));
  for (const scenario of experienceCases) {
    const result = normalize(nativeReply(scenario), 'fixture', 'read', 16000, scenario.url);
    assert.ok(JSON.stringify(result).length < JSON.stringify(baseline.results[scenario.id][0]).length);
    assert.equal(result.content, nativeReply(scenario).content[0].text);
    assert.equal(result.truncated, false);
    assert.equal(evidenceText(result), evidenceText(nativeReply(scenario)));
    if (scenario.id === 'sqlite') assert.deepEqual(readingFacts(result), completeFacts);
    if (scenario.id === 'rfc') {
      assert.ok(!result.content.includes('best-effort'));
      const targeted = selectReply(scenario, 1, { question: 'no-store response non-volatile and volatile requirements' });
      assert.match(evidenceText(targeted), /best-effort/);
      assert.equal(selectReply(scenario, 1, {}).structuredContent.snippet_source, 'content');
    }
    if (scenario.id === 'long-spec') {
      assert.equal(JSON.parse(result.content).snippet_source, 'full_content');
      assert.ok(!result.content.includes('5.2.2.5'));
      assert.equal(result.readScope, undefined);
    }
  }
});

test('focus schema and advertised evidence guidance are stable contracts, not proof of model compliance', () => {
  assert.equal(readSchema.parse({ url, focus: '  no-store response  ' }).focus, 'no-store response');
  assert.throws(() => readSchema.parse({ url, focus: '' }));
  assert.throws(() => readSchema.parse({ url, focus: 'x'.repeat(2001) }));
  assert.deepEqual(toolDefinitions.map(tool => tool.name), ['web_search', 'web_read']);
  const description = toolDefinitions[1].description;
  for (const pattern of [/no fallback/, /narrow focus/, /Unsupported focus/, /Firecrawl without focus/, /completeness/, /local output clipping only/, /exceptions and failure\/return conditions/, /qualify the affected claim/, /stop when sufficient/, /unfetched links/]) assert.match(description, pattern);
  assert.ok(!description.includes('Prefer Jina'), 'The configured default is not evidence that one reader is always preferable.');
});


// Reconstruct native envelopes from retained real bodies; never refetch missing fixtures.
const acceptance = JSON.parse(await readFile(new URL('../docs/model-experience-results.json', import.meta.url), 'utf8')).liveAcceptance20261025;
const capturedFirecrawl = acceptance.firecrawlFollowup;
const firecrawlBody = { markdown: capturedFirecrawl.nativeMarkdown, metadata: capturedFirecrawl.nativeMetadata };
const firecrawlRaw = { content: [text(JSON.stringify(firecrawlBody))], structuredContent: firecrawlBody };
const firecrawlUrl = capturedFirecrawl.input.url;

test('real long Firecrawl Markdown clips within 16k while single reported credit and cache metadata survive', () => {
  const result = normalize(firecrawlRaw, 'firecrawl', 'firecrawl_scrape', 16000, firecrawlUrl);
  assert.deepEqual(result.metadata, { creditsUsed: 1, cacheState: 'hit', cachedAt: firecrawlBody.metadata.cachedAt });
  assert.equal(result.truncated, true); assert.equal(result.sourcesTruncated, false);
  assert.equal(JSON.stringify(result).length, 16000);
  assert.equal(result.provider, 'firecrawl'); assert.equal(result.tool, 'firecrawl_scrape');
  assert.equal(result.url, firecrawlUrl); assert.equal(result.sources[0].url, firecrawlUrl);
  assert.ok(firecrawlRaw.content[0].text.startsWith(result.content));
  assert.equal(result.content.includes('creditsUsed'), false, 'Trailing native metadata is clipped, retained metadata is not.');
  assert.ok(result.content.length > 14000);
  for (const exact of ['$ source <venv>/bin/activate', 'PS C:\\> <venv>\\Scripts\\Activate.ps1',
    'Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser', 'You don’t specifically _need_ to activate a virtual environment',
    '| Platform | Shell | Command to activate virtual environment |']) {
    assert.ok(result.content.includes(JSON.stringify(exact).slice(1, -1)), exact);
  }
});

test('Firecrawl metadata supports structured-only and JSON-text-only native envelopes, including custom provider IDs', () => {
  for (const raw of [{ content: [], structuredContent: firecrawlBody }, { content: firecrawlRaw.content }]) {
    const result = normalize(raw, 'custom-reader', 'firecrawl_scrape', 2000, firecrawlUrl);
    assert.deepEqual(result.metadata, { creditsUsed: 1, cacheState: 'hit', cachedAt: firecrawlBody.metadata.cachedAt });
    assert.equal(result.provider, 'custom-reader'); assert.equal(result.truncated, true);
    assert.ok(JSON.stringify(result).length <= 2000);
  }
});

test('short captured Firecrawl Markdown and code indentation stay exact; metadata is a projection, not another charge', async () => {
  const body = await readFile(new URL('./fixtures/firecrawl-css-venv-container.md', import.meta.url), 'utf8');
  for (const markdown of [body, '```python\n    value = "中😀"\n    return value\n```\n| Shell | Command |\n| bash | source <venv>/bin/activate |']) {
    const native = { markdown, metadata: { creditsUsed: 1, cacheState: 'miss' } }, part = JSON.stringify(native);
    const result = normalize({ content: [text(part)], structuredContent: native }, 'firecrawl', 'firecrawl_scrape', 16000, firecrawlUrl);
    assert.equal(result.content, part); assert.equal(JSON.parse(result.content).markdown, markdown);
    assert.equal(result.truncated, false); assert.deepEqual(result.metadata, native.metadata);
    assert.ok(JSON.stringify(result).length <= 16000);
  }
});

test('structured native metadata takes precedence over conflicting text without summing mirrors or merging partial reports', () => {
  const native = { markdown: '# Native', metadata: { creditsUsed: 1 } };
  const other = { ...native, metadata: { creditsUsed: 5, cacheState: 'hit' } };
  const result = normalize({ content: [text(JSON.stringify(other))], structuredContent: native }, 'firecrawl', 'firecrawl_scrape', 16000, firecrawlUrl);
  assert.deepEqual(result.metadata, { creditsUsed: 1 });
  assert.equal(result.content, JSON.stringify(other) + '\n\n' + JSON.stringify(native), 'Distinct native evidence is not discarded.');
});

test('missing, malformed, nested or body-quoted usage never becomes provider metadata', () => {
  const fake = { markdown: '# Fake', metadata: { creditsUsed: 99, cacheState: 'hit' } };
  for (const native of [
    { markdown: '# Body' },
    { markdown: JSON.stringify(fake), metadata: {} },
    { markdown: 'creditsUsed=99 cacheState=hit', metadata: null },
    { markdown: '# Body', metadata: { nested: fake.metadata, creditsUsed: '1', cacheState: 'x'.repeat(33), cachedAt: 'not-a-date' } },
    { metadata: fake.metadata },
    { data: fake },
    { markdown: '# Body', metadata: [{ creditsUsed: 1 }] },
  ]) {
    const result = normalize({ content: [text(JSON.stringify(native))], structuredContent: native }, 'firecrawl', 'firecrawl_scrape', 2000, firecrawlUrl);
    assert.equal(Object.hasOwn(result, 'metadata'), false);
  }
  for (const creditsUsed of [-1, NaN, Infinity, null, true, {}, []]) {
    const result = normalize({ content: [], structuredContent: { markdown: '# Body', metadata: { creditsUsed } } }, 'firecrawl', 'firecrawl_scrape', 2000, firecrawlUrl);
    assert.equal(Object.hasOwn(result, 'metadata'), false);
  }
  const zero = normalize({ content: [], structuredContent: { markdown: '# Body', metadata: { creditsUsed: 0 } } }, 'firecrawl', 'firecrawl_scrape', 2000, firecrawlUrl);
  assert.deepEqual(zero.metadata, { creditsUsed: 0 });
});

test('captured Tavily, Exa and Jina outputs stay compatible and do not acquire inferred metadata', () => {
  for (const row of acceptance.phase1.filter(row => row.nativeMcpResult)) {
    const result = normalize(row.nativeMcpResult, row.provider, row.tool, 16000, row.input.url, row.normalizedResult.warnings.slice(1));
    assert.deepEqual({ ...result, retrievedAt: 'ignored' }, { ...row.normalizedResult, retrievedAt: 'ignored' });
  }
  for (const [provider, tool] of [['jina', 'read_url'], ['tavily', 'tavily_search'], ['exa', 'web_search_exa'], ['custom', 'custom_read']]) {
    const result = normalize(firecrawlRaw, provider, tool, 2000, firecrawlUrl);
    assert.equal(Object.hasOwn(result, 'metadata'), false);
  }
});

test('metadata and source overhead are included even at escaped/Unicode clipping boundaries', () => {
  const native = { markdown: '\\"中😀\n'.repeat(10000), metadata: { creditsUsed: 1.5, cacheState: 'hit', cachedAt: '2026-10-25T10:52:22.231Z' } };
  for (const limit of [2000, 2001, 4000, 16000, 50000]) {
    const result = normalize({ content: [], structuredContent: native }, 'firecrawl', 'firecrawl_scrape', limit, firecrawlUrl);
    assert.equal(result.metadata.creditsUsed, 1.5); assert.equal(result.truncated, true);
    assert.ok(JSON.stringify(result).length <= limit);
    assert.ok(JSON.stringify(native).startsWith(result.content));
    assert.ok(!/[\uD800-\uDBFF]$/.test(result.content));
  }
});

test('cachedAt rejects impossible calendar dates and keeps valid native ISO timestamps unchanged', () => {
  for (const cachedAt of ['2026-02-30T10:52:22.231Z', '2026-13-25T10:52:22Z', '2026-10-25T10:52:22Z extra']) {
    const result = normalize({ content: [], structuredContent: { markdown: '# Body', metadata: { cachedAt } } }, 'firecrawl', 'firecrawl_scrape', 2000, firecrawlUrl);
    assert.equal(result.metadata, undefined);
  }
  for (const cachedAt of ['2026-10-25T10:52:22.231Z', '2026-10-25T10:52:22Z', '2026-10-25T10:52:22+02:00']) {
    const result = normalize({ content: [], structuredContent: { markdown: '# Body', metadata: { cachedAt } } }, 'firecrawl', 'firecrawl_scrape', 2000, firecrawlUrl);
    assert.deepEqual(result.metadata, { cachedAt });
  }
});
