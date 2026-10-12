/** Bounded, in-memory BM25 for short, already-extracted evidence passages. No index or external runtime. */
const WORDS = /[\p{Script=Han}]+|[\p{Script=Latin}\p{N}]+|[\p{L}\p{N}]+/gu;
const HAN = /^\p{Script=Han}+$/u;
const STOP = new Set(['the', 'and', 'for', 'with', 'what', 'how', 'are', 'that', 'this', 'from', 'into', 'does', 'about']);

/** Unlike the existing terms() helper, this preserves term frequency. */
function tokens(value: string): string[] {
  const output: string[] = [];
  for (const word of value.toLocaleLowerCase().match(WORDS) ?? []) {
    if (HAN.test(word)) {
      const characters = [...word];
      if (characters.length === 1) output.push(word);
      else for (let i = 0; i < characters.length - 1; i++) output.push(characters[i]! + characters[i + 1]!);
    } else if (word.length >= 2 && !STOP.has(word)) output.push(word);
  }
  return output;
}

/**
 * Returns undefined when BM25 should defer to legacy ranking:
 * missing query terms, fewer than two passages, or an oversized corpus.
 * Scores are batch-relative, not semantic probabilities.
 */
export function bm25Scores(query: string, documents: readonly string[]): number[] | undefined {
  if (documents.length < 2 || documents.length > 512 || !query.trim()) return;
  const queryTerms = [...new Set(tokens(query))].slice(0, 64);
  if (!queryTerms.length) return;
  const wanted = new Set(queryTerms), frequencies: Map<string, number>[] = [];
  const lengths: number[] = [], documentFrequency = new Map<string, number>();
  for (const document of documents) {
    const words = tokens(document), counts = new Map<string, number>();
    lengths.push(words.length);
    for (const word of words) if (wanted.has(word)) counts.set(word, (counts.get(word) ?? 0) + 1);
    for (const word of counts.keys()) documentFrequency.set(word, (documentFrequency.get(word) ?? 0) + 1);
    frequencies.push(counts);
  }
  const count = documents.length;
  const averageLength = Math.max(1, lengths.reduce((sum, length) => sum + length, 0) / count);
  const k1 = 1.2, b = 0.75;
  return frequencies.map((frequency, index) => {
    let score = 0;
    for (const term of queryTerms) {
      const tf = frequency.get(term) ?? 0;
      if (!tf) continue;
      const df = documentFrequency.get(term)!;
      const idf = Math.log1p((count - df + 0.5) / (df + 0.5));
      score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * lengths[index]! / averageLength));
    }
    return score;
  });
}
