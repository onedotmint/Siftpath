#!/usr/bin/env node
/** Small labeled synthetic comparison: not a live relevance or provider-quality claim. */
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { rankEvidence } from '../dist/core/processing.js';
import { relevance } from '../dist/core/text.js';
import { runReplay } from './run.mjs';

const { cases } = JSON.parse(await readFile(new URL('./fixtures/bm25-cases.json', import.meta.url), 'utf8'));
const modes = ['legacy', 'bm25'];
const results = [];
for (const sample of cases) {
  const evidence = sample.passages.map((passage, index) => ({
    ...passage, relevance: relevance(sample.query, passage.text) + Math.max(0, 0.05 - index / 1000),
  }));
  const row = { id:sample.id };
  for (const mode of modes) {
    let selected;
    const start = performance.now();
    for (let n = 0; n < 120; n++) selected = rankEvidence(evidence, sample.query, mode);
    const rank = selected.findIndex(item => item.id === sample.gold) + 1;
    row[mode] = { rank, top1:rank===1, reciprocalRank:rank ? 1/rank : 0,
      avgMs:(performance.now()-start)/120 };
  }
  results.push(row);
}
const score = mode => ({
  top1Hits:results.filter(item=>item[mode].top1).length,
  mrr:Number((results.reduce((sum,item)=>sum+item[mode].reciprocalRank,0)/results.length).toFixed(4)),
  meanBatchMs:Number((results.reduce((sum,item)=>sum+item[mode].avgMs,0)/results.length).toFixed(5)),
});
const baseline = await runReplay('legacy'), experiment = await runReplay('bm25');
const summarize = report => {
  const ok = report.results.filter(row=>!row.failureRate);
  const avg = key => Number((ok.reduce((s,row)=>s+row[key],0)/Math.max(1,ok.length)).toFixed(4));
  return { runs:report.results.length, failures:report.results.length-ok.length,
    evidenceCoverage:avg('evidenceCoverage'), evidencePrecision:avg('evidencePrecision'),
    outputTokens:avg('outputTokens') };
};
console.log(JSON.stringify({
  kind:'experimental-bm25-comparison',
  notice:'Synthetic human-labeled passages and mock-provider replay. Not evidence of production gains.',
  passageRanking:{ cases:results.length, legacy:score('legacy'), bm25:score('bm25'), perCase:results },
  endToEndReplay:{legacy:summarize(baseline),bm25:summarize(experiment)},
},null,2));
