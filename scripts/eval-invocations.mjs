#!/usr/bin/env node
/** Score recorded host decisions; this script does not simulate an LLM. */
import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export async function gradeInvocations(observations) {
  const fixture = JSON.parse(await readFile(new URL('../benchmarks/fixtures/agent-invocations.json', import.meta.url), 'utf8'));
  const expected = new Map(fixture.cases.map(item => [item.id, item]));
  const seen = new Set();
  const results = observations.map(row => {
    if (!row || !expected.has(row.id) || seen.has(row.id)) throw new Error('Unknown or duplicate scenario ID.');
    if (!(row.actualTool === null || typeof row.actualTool === 'string')) throw new Error('actualTool must be a tool name or null.');
    seen.add(row.id);
    const tool = row.actualTool === null ? null : ['web_search', 'web_fetch', 'web_gather'].find(name => row.actualTool === name || row.actualTool.endsWith(`__${name}`)) ?? row.actualTool;
    return { id: row.id, expected: expected.get(row.id).expectedTool, actual: tool, correct: expected.get(row.id).expectedTool === tool };
  });
  return { kind: 'recorded-agent-invocations', tested: results.length, totalScenarios: expected.size,
    scenarioCoverage: results.length / expected.size, accuracy: results.length ? results.filter(r => r.correct).length / results.length : null, results };
}
async function main() {
  const path = process.argv[2];
  if (!path) throw new Error('Usage: node scripts/eval-invocations.mjs observations.jsonl (rows: {id,actualTool})');
  const observations = (await readFile(path, 'utf8')).split('\n').filter(line => line.trim()).map(JSON.parse);
  const result = await gradeInvocations(observations); console.log(JSON.stringify(result, null, 2));
  if (result.scenarioCoverage !== 1 || result.accuracy !== 1) process.exitCode = 1;
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
