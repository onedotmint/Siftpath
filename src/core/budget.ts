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
const sentenceBoundaries = new Intl.Segmenter('en', { granularity: 'sentence' });
function shorterPassage(text: string): string | undefined {
  // shortcut: sentence boundaries cannot prove complete meaning; prefixes remain marked truncated.
  if (/\b(?:MUST|SHOULD|SHALL|REQUIRED)\b|必须|不得|应当|```|~~~|[{};]|^\s*(?:const|let|function|class)\s/im.test(text)) return;
  const target = Math.floor(text.length * 0.7);
  if (/^\s*[|+]/.test(text) && text.split('\n').every(line => !line.trim() || /^\s*[|+]/.test(line))) {
    const end = text.indexOf('\n', target);
    return end > 0 && end < text.length - 1 ? text.slice(0, end).trimEnd() : undefined;
  }
  const contentEnd = text.replace(/[¶\s]+$/u, '').length;
  let sentences = 0;
  for (const part of sentenceBoundaries.segment(text)) {
    const end = part.index + part.segment.trimEnd().length;
    if (!/\p{L}/u.test(part.segment) || !/[.!?。！？][\p{Pe}\p{Pf}"'¶]*$/u.test(part.segment.trimEnd())) continue;
    sentences++;
    if (sentences >= 2 && end >= target && end < contentEnd &&
      !/^\s*¶?\s*(?:however\b|but\b|unless\b|otherwise\b|except\b|if\b|when\b|但是|但|除非|否则|如果)/i.test(text.slice(end)))
      return text.slice(0, end).trimEnd();
  }
  return;
}
export function fitEvidence(pack: EvidencePack, budget: number, count: TokenCounter): EvidencePack {
  let reduced = false;
  const synchronize = (value = pack) => {
    const ids = new Set(value.evidence.map(item => item.sourceId)); value.sources = value.sources.filter(source => ids.has(source.id));
    const trusted = value.evidence.filter(item => !item.warnings?.length);
    if (!trusted.length) { value.coverage = 'low'; value.searchAgainRecommended = true; }
    else if (value.coverage === 'good' && (reduced || new Set(trusted.map(item => domainKey(item.url))).size < 3 || trusted.some(item => item.truncated))) {
      value.coverage = 'partial'; value.searchAgainRecommended = true;
    }
    stamp(value, count);
  };
  synchronize();
  while (size(pack, count) > budget) {
    let shortened = false;
    for (const item of pack.evidence.slice().sort((a, b) => b.text.length - a.text.length)) {
      const prefix = shorterPassage(item.text);
      if (prefix) { item.text = prefix; item.truncated = true; shortened = true; break; }
    }
    if (!shortened) {
      if (pack.evidence.length > 1) {
        // Keep compact relevant units rather than repeatedly removing short tail evidence.
        const values = pack.evidence.map(item => (item.relevance ?? 0) / Math.max(1, size(item, count)));
        let remove = pack.evidence.findLastIndex(item => {
          const alone = { ...pack, evidence: [item], usage: { ...pack.usage } };
          synchronize(alone);
          return size(alone, count) > budget;
        });
        if (remove < 0) {
          remove = values.length - 1;
          for (let i = values.length - 2; i >= 0; i--) if (values[i]! < values[remove]!) remove = i;
        }
        pack.evidence.splice(remove, 1);
      }
      else throw new EngineError('BUDGET_TOO_SMALL', 'A complete evidence unit and its provenance cannot fit this budget; increase maxTokens.');
    }
    reduced = true;
    synchronize();
  }
  return stamp(pack, count);
}
