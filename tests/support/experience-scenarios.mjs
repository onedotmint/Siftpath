// Fixed, repeatable tasks for judging real use: does the agent find the right
// source, read the decisive conditions, keep the raw evidence, and use it?
// Attribution is mechanical and per anchor, so a failure is never blamed on the
// wrong layer: vendor_missing / siftpath_clipped / model_misread / ok.
export const scenarios = [
  {
    id: 'discovery',
    title: 'Search discovers the official technical source',
    prompt: 'Search the web for the official Node.js documentation of the timers module. '
      + 'Use web_search at most twice, then name the official URL and one concrete timer API documented there. '
      + 'Do not use web_read. Cite only URLs the search actually returned.',
    tools: ['web_search'],
    anchors: [
      { id: 'official-source', answer: /nodejs\.org/i, expect: true },
      { id: 'no-mirror', answer: /(w3schools|geeksforgeeks|tutorialspoint|javatpoint)/i, expect: false },
    ],
  },
  {
    id: 'api-doc',
    title: 'Known API document: read the exact behavior, not a summary',
    url: 'https://nodejs.org/api/timers.html',
    prompt: 'Using only web_read on https://nodejs.org/api/timers.html, answer: '
      + 'does unref() keep the event loop alive, and what exactly happens when a timeout callback throws? '
      + 'Quote the passages you rely on. If the returned evidence does not cover a part, say so instead of guessing.',
    tools: ['web_read'],
    anchors: [
      // A correct answer denies it in several ways ("no", "the opposite", "removes the
      // hold"); the heuristic only needs to see a denial next to the event loop.
      { id: 'unref-behavior', source: /\bunref\(\)/i, answer: /(?:\bno\b|\bnot\b|opposite|removes|doesn't|cannot|can't)[\s\S]{0,250}(?:event loop|alive)/i, expect: true },
      { id: 'throw-unknown', source: null, answer: /(unknown|not (covered|included|shown)|does not cover|no passage|found no|no evidence|无法确定|未覆盖|没有)/i, expect: true },
    ],
    // The page documents TimeoutError and callback-throw behavior. If the evidence the
    // model received never contained them, "read the known API doc" did not happen.
    require: [/TimeoutError/i, /(throws?|throwing)[^.]{0,120}callback/i],
  },
  {
    id: 'spec-exceptions',
    title: 'Long specification: answer the question including its exceptions',
    url: 'https://www.rfc-editor.org/rfc/rfc9111.html',
    focus: 'no-store response directive, must-understand override, volatile and non-volatile storage, privacy',
    prompt: 'Read https://www.rfc-editor.org/rfc/rfc9111.html (focus: the no-store response directive and every exception or qualification stated for it). '
      + 'Answer: what does no-store require, which directives or conditions override or limit it, and what privacy guarantee does the spec explicitly deny? '
      + 'State any part the returned evidence does not cover. Do not answer from memory.',
    tools: ['web_read'],
    anchors: [
      { id: 'no-store-requirement', source: /MUST NOT store/i, answer: /must not store/i, expect: true },
      { id: 'must-understand-override', source: /must-understand/i, answer: /must-understand/i, expect: true },
      { id: 'privacy-denied', source: /not a reliable or sufficient mechanism/i, answer: /(not|no)[^.]{0,60}(reliable|sufficient)[^.]{0,60}(privacy|guarantee)/i, expect: true },
    ],
  },
];

const plain = text => text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

/** Everything the Reader itself returned, focused and plain, for layer comparison. */
function upstream(raw) {
  if (!raw) return '';
  return plain([raw.focused?.text, raw.plain?.text].filter(Boolean).join('\n'));
}

/**
 * One attribution per anchor. The losing layer is decided by where the passage stopped
 * existing, not by which answer looked weakest, so a vendor omission is never "fixed" in
 * Siftpath and a local clip is never blamed on the provider.
 */
export function attribute(scenario, { raw, output, answer }) {
  const visible = plain(output ?? '');
  const native = upstream(raw);
  return scenario.anchors.map(anchor => {
    const answerOk = anchor.answer.test(plain(answer ?? '')) === anchor.expect;
    // No upstream passage is required for the "state the gap" anchors, and a search
    // scenario has no single Reader body; only the answer is judged there.
    if (!anchor.source) return { id: anchor.id, layer: answerOk ? 'ok' : 'model_misread' };
    if (visible && anchor.source.test(visible)) return { id: anchor.id, layer: answerOk ? 'ok' : 'model_misread' };
    if (anchor.source.test(native)) return { id: anchor.id, layer: 'siftpath_clipped' };
    // Retrieval is per-call: the Reader returned the passage in the agent's own call but not
    // in this capture. Absence here is not proof of a vendor omission, so say so.
    if (answerOk) return { id: anchor.id, layer: 'unverified' };
    return { id: anchor.id, layer: 'vendor_missing' };
  });
}

/** Task requirement check: was the passage offered to the model at all? */
export function requireMissing(scenario, { output, answer }) {
  if (!scenario.require) return [];
  const seen = plain([output, answer].filter(Boolean).join('\n'));
  return scenario.require.map(pattern => ({ pattern: String(pattern), present: pattern.test(seen) }));
}

/** Every layer that lost or could not prove something, so ownership is never flattened. */
export function layers(results) {
  return [...new Set(results.flatMap(row => row.attribution.map(entry => entry.layer)).filter(layer => layer !== 'ok'))];
}
