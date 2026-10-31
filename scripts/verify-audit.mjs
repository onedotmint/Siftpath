#!/usr/bin/env node
/** Production audit is the release gate; the full tree is recorded. An unavailable or unparsable audit is a failure, not a pass. */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { auditFindings, auditGate } from './lib/audit-gate.mjs';

const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Run with npm run verify:audit.');
const root = fileURLToPath(new URL('..', import.meta.url));

function audit(args) {
  let json;
  try {
    json = execFileSync(process.execPath, [npmCli, 'audit', ...args, '--json'], { cwd: root, encoding: 'utf8', timeout: 180000 });
  } catch (error) {
    // npm exits non-zero when it reports findings; only stdout carrying a report is usable.
    if (!error.stdout) throw new Error(`npm audit ${args.join(' ')} produced no report (exit ${error.status}).`, { cause: error });
    json = error.stdout;
  }
  return JSON.parse(json);
}

let productionReport, fullReport, production;
try {
  productionReport = audit(['--omit=dev']);
  fullReport = audit([]);
  production = auditGate(productionReport);
  auditGate(fullReport);
} catch (error) {
  console.error(`Security audit unavailable: ${error.message}`);
  process.exit(1);
}
console.log(JSON.stringify({
  productionGate: 'high/critical', production: production.counts, development: fullReport.metadata.vulnerabilities,
  productionFindings: auditFindings(productionReport), fullTreeFindings: auditFindings(fullReport),
}));
if (production.blocked) process.exitCode = 1;
