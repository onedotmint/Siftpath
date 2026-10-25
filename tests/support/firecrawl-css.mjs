import { markdownHeadings } from './selective-reading.mjs';

// Test-only parameter set. No private configuration or provider fallback is read.
export const cssCases = [
  { id: 'rfc-headings', page: 'rfc9111', url: 'https://www.rfc-editor.org/rfc/rfc9111.html',
    selector: 'h1, h2, h3, h4, h5, h6',
    objective: 'Return the actual heading elements of this page as Markdown navigation, preserving their document order, levels and existing links. Do not summarize or infer headings.' },
  { id: 'venv-container', page: 'python-venv', url: 'https://docs.python.org/3/library/venv.html',
    selector: 'section#how-venvs-work',
    objective: 'Read only the selected existing section container as Markdown, preserving its paragraphs, table and inline code. Do not summarize or generate an answer.' },
];
export function cssArguments(item) {
  return { url: item.url, formats: ['markdown'], includeTags: [item.selector], onlyMainContent: false, objective: item.objective };
}
// Use explicit provider fields, never echoed objectives or headings in metadata as evidence.
export function markdownRepresentations(raw) {
  const found = [];
  const add = (value, path) => {
    if (typeof value?.markdown === 'string') found.push({ path: path + '.markdown', text: value.markdown });
    if (typeof value?.data?.markdown === 'string') found.push({ path: path + '.data.markdown', text: value.data.markdown });
  };
  add(raw.structuredContent, 'structuredContent');
  for (const [index, block] of (raw.content ?? []).entries()) {
    if (block.type !== 'text') continue;
    try { add(JSON.parse(block.text), 'content[' + index + ']'); } catch { /* Unknown layout is not accepted as body evidence. */ }
  }
  return found;
}
export function headingLabel(value) {
  return value.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\\([\\`*{}[\]()#+.!_>~-])/g, '$1')
    .replace(/[¶`]/g, '').replace(/\s+/g, ' ').trim();
}
export function headingChecks(body, expected) {
  const actual = markdownHeadings(body).map(row => ({ level: row.level, title: headingLabel(row.title) }));
  const wanted = expected.map(row => ({ level: row.level, title: row.text }));
  const missing = wanted.filter(row => !actual.some(found => found.title === row.title));
  const unexpected = actual.filter(row => !wanted.some(found => found.title === row.title));
  let cursor = -1;
  const ordered = actual.every(row => {
    const next = wanted.findIndex((entry, index) => index > cursor && entry.title === row.title);
    cursor = next; return next >= 0;
  });
  return { expectedCount: wanted.length, actualCount: actual.length, missing, unexpected,
    orderPreserved: ordered, levelsPreserved: actual.every(row => wanted.some(found => found.title === row.title && found.level === row.level)),
    requestDirectives: actual.some(row => row.title === '5.2.1. Request Directives'),
    responseDirectives: actual.some(row => row.title === '5.2.2. Response Directives'),
    responseNoStore: actual.some(row => row.title === '5.2.2.5. no-store'),
    noBodyEvidence: !body.includes('MUST NOT store any part'),
    headingOnlyBody: body.split('\n').every(line => !line.trim() || /^#{1,6}\s/.test(line)),
    duplicateCount: actual.length - new Set(actual.map(row => row.title)).size };
}
export function venvChecks(body, expectedRows) {
  const plain = body.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[`*]/g, '').replace(/\s+/g, ' ');
  const rows = body.split('\n').filter(line => /^\s*\|/.test(line) && !/^\s*\|[- :|]+\|\s*$/.test(line))
    .map(line => line.trim().slice(1, -1).split('|').map(cell => cell.replace(/`/g, '').trim()));
  // Source HTML has platform rowspans; Markdown may repeat or leave blank the
  // platform cell. Shell+command pairs must remain complete, ordered and distinct.
  const wanted = expectedRows.slice(1).map(row => row.slice(-2));
  const actual = rows.slice(1).map(row => row.slice(-2));
  const pairCounts = wanted.map(pair => actual.filter(row => JSON.stringify(row) === JSON.stringify(pair)).length);
  return { tableRows: rows, expectedCommandRows: wanted.length,
    completeOrderedCommands: JSON.stringify(wanted) === JSON.stringify(actual),
    eachCommandExactlyOnce: pairCounts.every(count => count === 1),
    tableHeader: JSON.stringify(rows[0]) === JSON.stringify(expectedRows[0]),
    prefixCheck: plain.includes('sys.prefix != sys.base_prefix'),
    activationOptional: /don[’']t specifically _?need_? to activate a virtual environment/.test(plain),
    fullInterpreterPath: plain.includes('specify the full path to that environment'),
    environmentVariableNotProof: /VIRTUAL_ENV.*cannot be relied upon/.test(plain),
    nonPortable: plain.includes('inherently non-portable'),
    recreateIfMoved: /recreate it at the desired location/.test(plain),
    selectedHeading: /## How venvs work/.test(body),
    outsideSectionAbsent: !/^## (?:Creating virtual environments|API|An example of extending)/m.test(body),
    fencedCodeIndentation: null };
}
