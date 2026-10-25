import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { Siftpath } from '../../dist/router.js';
import { anonymousPresets } from '../../dist/defaults.js';
import { safeError } from '../../dist/errors.js';
import { cssCases, cssArguments, markdownRepresentations, headingChecks, venvChecks } from '../support/firecrawl-css.mjs';

// Explicit opt-in: <=2 official MCP tools/call, each fixed URL at most once.
// Independent anonymous config, no env credentials, REST, search, fallback or model.
test('LIVE anonymous Firecrawl CSS: RFC headings and known Python section', {
  skip: process.env.SIFTPATH_FIRECRAWL_CSS !== '1', timeout: 150000,
}, async t => {
  const dom = JSON.parse(await readFile(new URL('../fixtures/firecrawl-css-dom.json', import.meta.url), 'utf8'));
  const artifacts = await mkdtemp(join(tmpdir(), 'siftpath-firecrawl-css-'));
  const report = { capturedAt: new Date().toISOString(), access: 'official-anonymous',
    endpoint: 'https://mcp.firecrawl.dev/v2/mcp', maxOutputChars: 16000, modelCalls: 0,
    measuredToolOutputTokens: null, artifactDirectory: artifacts,
    domCapturedAt: dom.capturedAt, domSha256: { rfc: dom.rfc.sha256, venv: dom.venv.sha256 },
    note: 'One sample per page; CSS acceptance, evidence preservation, shorter output and model quality are separate. Provider-internal fetches/retries/billing are not counted by the client.',
    businessRequests: [], blockedRequests: 0, results: [] };
  const reportPath = new URL('../../docs/firecrawl-css-results.json', import.meta.url);
  const fetch = globalThis.fetch;
  const seen = new Set();
  // Enforce the authorization at the outgoing HTTP boundary, not only the Router.
  globalThis.fetch = async (input, init) => {
    const endpoint = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    assert.equal(endpoint.href.split('?')[0], report.endpoint, 'Only the anonymous official MCP endpoint is allowed.');
    assert.ok(!new Headers(init?.headers).has('Authorization'), 'Do not send paid credentials.');
    let rpc;
    if (typeof init?.body === 'string') { try { rpc = JSON.parse(init.body); } catch { /* Non-JSON is not an MCP business call. */ } }
    assert.ok(!Array.isArray(rpc), 'Do not send a batch of business calls.');
    if (rpc?.method === 'tools/call') {
      const url = rpc.params?.arguments?.url;
      if (seen.has(url) || report.businessRequests.length >= 2) {
        report.blockedRequests++; throw new Error('CSS business call budget exhausted; no retry.');
      }
      assert.equal(rpc.params.name, 'firecrawl_scrape');
      assert.ok(cssCases.some(item => item.url === url));
      seen.add(url); report.businessRequests.push({ name: rpc.params.name, arguments: rpc.params.arguments });
    }
    return fetch(input, init);
  };
  try {
    for (const item of cssCases) {
      const args = cssArguments(item);
      const router = new Siftpath({ providers: { firecrawl: { ...anonymousPresets.firecrawl, timeoutMs: 60000,
        read: { name: 'firecrawl_scrape', arguments: { ...args, url: '$url' } },
      } }, routes: { read: 'firecrawl', search: 'firecrawl', intents: {}, readFallback: [], searchFallback: [] } }, {});
      let raw, output;
      const row = { case: item.id, url: item.url, selector: item.selector, arguments: args };
      const before = report.businessRequests.length;
      const call = router.clients.call.bind(router.clients);
      router.clients.call = async (...params) => { raw = await call(...params); return raw; };
      try {
        const page = await router.clients.listTools('firecrawl', AbortSignal.timeout(25000));
        const tool = page.tools.find(tool => tool.name === 'firecrawl_scrape');
        await writeFile(join(artifacts, item.id + '-schema.json'), JSON.stringify(tool, null, 2), { mode: 0o600 });
        assert.ok(tool, 'The official read tool must actually be available.');
        for (const key of Object.keys(args)) assert.ok(tool.inputSchema.properties?.[key], 'Unsupported native parameter: ' + key);
        for (const key of tool.inputSchema.required ?? []) assert.ok(Object.hasOwn(args, key), 'Missing required native parameter: ' + key);
        assert.ok(tool.inputSchema.properties.formats.items.enum.includes('markdown'));
        row.schemaAcceptedShape = true;
        const start = performance.now();
        try { output = await router.read({ url: item.url }); }
        finally { row.elapsedMs = Math.round(performance.now() - start); }
        row.success = true;
      } catch (error) {
        const safe = safeError(error);
        row.success = false; row.error = safe.code; row.diagnostics = safe.diagnostics;
      } finally {
        await router.close();
        row.businessRequests = report.businessRequests.length - before;
        if (raw) {
          await writeFile(join(artifacts, item.id + '-raw.json'), JSON.stringify(raw, null, 2), { mode: 0o600 });
          row.rawChars = JSON.stringify(raw).length;
          row.rawIsError = raw.isError ?? false;
          const representations = markdownRepresentations(raw);
          row.bodyPaths = representations.map(body => body.path);
          row.rawRepresentationsAgree = representations.length > 0 && new Set(representations.map(body => body.text)).size === 1;
          const body = representations[0]?.text;
          if (body !== undefined) {
            await writeFile(join(artifacts, item.id + '-raw-body.md'), body, { mode: 0o600 });
            row.rawBodyChars = body.length;
            row.rawChecks = item.id === 'rfc-headings' ? headingChecks(body, dom.rfc.headings) : venvChecks(body, dom.venv.tableRows);
          }
          // Report numeric usage under its native name; estimatedTokens is not a measurement.
          row.providerNumericUsage = {}; row.providerWarnings = [];
          const visit = (value, path = '', depth = 0) => {
            if (!value || typeof value !== 'object' || depth > 10) return;
            for (const [key, child] of Object.entries(value)) {
              const next = path ? path + '.' + key : key;
              if (typeof child === 'number' && /credit|token|cost|usage/i.test(next)) row.providerNumericUsage[next] = child;
              if (/warning/i.test(key)) row.providerWarnings.push({ path: next, value: child });
              if (key === 'text' && typeof child === 'string') { try { visit(JSON.parse(child), next, depth + 1); } catch { /* Body text is not metadata. */ } }
              else if (!['markdown', 'html', 'rawHtml'].includes(key)) visit(child, next, depth + 1);
            }
          };
          visit(raw);
        }
        if (output) {
          await writeFile(join(artifacts, item.id + '-output.json'), JSON.stringify(output, null, 2), { mode: 0o600 });
          row.outputChars = JSON.stringify(output).length; row.truncated = output.truncated;
          row.sourcesTruncated = output.sourcesTruncated; row.sources = output.sources; row.warnings = output.warnings;
          const finalBodies = markdownRepresentations({ content: [{ type: 'text', text: output.content }] });
          const body = finalBodies[0]?.text;
          row.outputBodyChars = body?.length ?? null;
          row.bodyPreservedExactly = body !== undefined && body === markdownRepresentations(raw)[0]?.text;
          row.outputChecks = body === undefined ? null : item.id === 'rfc-headings' ? headingChecks(body, dom.rfc.headings) : venvChecks(body, dom.venv.tableRows);
        }
        report.results.push(row);
        await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
        t.diagnostic(JSON.stringify(row));
      }
    }
  } finally { globalThis.fetch = fetch; }
  assert.ok(report.businessRequests.length <= 2);
  assert.equal(report.blockedRequests, 0, 'No hidden retries should even be attempted.');
  for (const row of report.results) {
    assert.equal(row.businessRequests, 1, row.case + ' must have exactly one native business request.');
    assert.equal(row.success, true, row.case + ' must succeed, not just accept parameters in tools/list.');
    assert.equal(row.rawRepresentationsAgree, true);
    assert.equal(row.bodyPreservedExactly, true, 'Do not lose body evidence during local normalization.');
    if (row.case === 'rfc-headings') {
      assert.deepEqual(row.rawChecks.missing, []); assert.deepEqual(row.rawChecks.unexpected, []);
      for (const key of ['orderPreserved', 'levelsPreserved', 'headingOnlyBody', 'requestDirectives', 'responseDirectives', 'responseNoStore']) assert.equal(row.rawChecks[key], true, key);
      assert.equal(row.rawChecks.duplicateCount, 0);
    } else {
      for (const key of ['tableHeader', 'completeOrderedCommands', 'eachCommandExactlyOnce', 'prefixCheck', 'activationOptional', 'fullInterpreterPath', 'environmentVariableNotProof', 'nonPortable', 'recreateIfMoved', 'outsideSectionAbsent']) assert.equal(row.rawChecks[key], true, key);
    }
  }
});
