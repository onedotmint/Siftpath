import { EngineError } from './errors.js';
import type { EvidencePack, SearchPack } from './types.js';
import { domainKey } from './urls.js';
export type TokenCounter = (text: string) => number;
function size(value: unknown, count: TokenCounter): number {
  const result = count(JSON.stringify(value));
  if (!Number.isSafeInteger(result) || result < 0) throw new EngineError('INVALID_TOKEN_COUNTER', 'Tokenizer must return a nonnegative safe integer.');
  return result;
}
function stamp<T extends SearchPack | EvidencePack>(pack: T, count: TokenCounter): T {
  for (let i = 0; i < 8; i++) { const next = size(pack, count); if (next === pack.usage.outputTokens) break; pack.usage.outputTokens = next; }
  return pack;
}
export function fitSearch(pack: SearchPack, budget: number, count: TokenCounter): SearchPack {
  while (size(stamp(pack, count), count) > budget) {
    const longest = pack.results.flatMap(result => result.excerpts.map((text, index) => ({ result, index, length: text.length })))
      .sort((a, b) => b.length - a.length)[0];
    if (longest && longest.length > 80) { longest.result.excerpts[longest.index] = longest.result.excerpts[longest.index]!.slice(0, Math.floor(longest.length * 0.65)); longest.result.truncated = true; }
    else if (pack.results.length > 1) pack.results.pop();
    else if (longest) { longest.result.excerpts.splice(longest.index, 1); longest.result.truncated = true; }
    else throw new EngineError('BUDGET_TOO_SMALL', 'Source metadata alone exceeds the output budget.');
  }
  return stamp(pack, count);
}
export function fitEvidence(pack: EvidencePack, budget: number, count: TokenCounter): EvidencePack {
  const synchronize = () => {
    const ids = new Set(pack.evidence.map(item => item.sourceId)); pack.sources = pack.sources.filter(source => ids.has(source.id));
    const trusted = pack.evidence.filter(item => !item.warnings?.length);
    if (!trusted.length) { pack.coverage = 'low'; pack.searchAgainRecommended = true; }
    else if (pack.coverage === 'good' && (new Set(trusted.map(item => domainKey(item.url))).size < 3 || trusted.some(item => item.truncated))) {
      pack.coverage = 'partial'; pack.searchAgainRecommended = true;
    }
    stamp(pack, count);
  };
  synchronize();
  while (size(pack, count) > budget) {
    const longest = pack.evidence.slice().sort((a, b) => b.text.length - a.text.length)[0];
    if (longest && longest.text.length > 96) {
      longest.text = longest.text.slice(0, Math.floor(longest.text.length * 0.7)).trimEnd(); longest.truncated = true;
    } else if (pack.evidence.length > 1) pack.evidence.pop();
    else throw new EngineError('BUDGET_TOO_SMALL', 'Evidence provenance cannot fit this budget; increase maxTokens.');
    synchronize();
  }
  return stamp(pack, count);
}
