import test from 'node:test';
import assert from 'node:assert/strict';
import { packReports } from '../scripts/lib/pack-report.mjs';
import { auditFindings, auditGate } from '../scripts/lib/audit-gate.mjs';

const report = (extra = {}) => ({ id: '@onedotmint/siftpath@2.1.0', filename: 'onedotmint-siftpath-2.1.0.tgz', integrity: 'sha512-x', shasum: 'abc',
  files: [{ path: 'dist/cli.js' }, ...(extra.files ?? [])], ...extra });

test('npm pack --json array (npm 11) and object-by-name (npm 12) both normalise to one report', () => {
  assert.deepEqual(packReports(JSON.stringify([report()])), report());
  assert.deepEqual(packReports(JSON.stringify({ '@onedotmint/siftpath': report() })), report());
  // Ambiguity is a failure: never pick one of several tarball reports by accident.
  assert.throws(() => packReports(JSON.stringify([report(), fake()])), 'Several reports must not be guessed at.');
});

test('an unrecognised or empty pack report is an error, never an empty-but-passing tarball', () => {
  for (const json of ['[]', '{}', 'null', '""', 'not json']) assert.throws(() => packReports(json), 'Report must be rejected.');
  assert.throws(() => packReports(JSON.stringify([{ id: 'x' }])), 'A report without filename/files is unusable.');
  assert.throws(() => packReports(JSON.stringify([report({ files: [{ path: 42 }] })])), 'File entries must carry paths.');
});

function fake() { return report({ id: 'other@1.0.0', filename: 'other-1.0.0.tgz' }); }

test('the production audit gate blocks High/Critical and passes anything lower or empty', () => {
  const counts = (values = {}) => ({ info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0, ...values });
  assert.equal(auditGate({ metadata: { vulnerabilities: counts() } }).blocked, false);
  assert.equal(auditGate({ metadata: { vulnerabilities: counts({ moderate: 3, low: 2 }) } }).blocked, false);
  assert.equal(auditGate({ metadata: { vulnerabilities: counts({ high: 1 }) } }).blocked, true);
  assert.equal(auditGate({ metadata: { vulnerabilities: counts({ critical: 1 }) } }).blocked, true);
  // No report, an empty body or a JSON-encoded string is unusable: fail, never pass.
  for (const value of [undefined, null, {}, { metadata: {} }, { metadata: { vulnerabilities: null } }, '']) {
    assert.throws(() => auditGate(value), 'Unusable audit output must throw.');
  }
});

test('audit findings name the advisory URL so a blocked release says what to fix', () => {
  const findings = auditFindings({ vulnerabilities: { 'body-parser': { severity: 'high', range: '2.0.0 - 2.3.0',
    via: [{ url: 'https://github.com/advisories/GHSA-27r3-jxmh-p828' }, 'express'] } } });
  assert.deepEqual(findings, [{ name: 'body-parser', severity: 'high', range: '2.0.0 - 2.3.0',
    advisories: ['https://github.com/advisories/GHSA-27r3-jxmh-p828'] }]);
});
