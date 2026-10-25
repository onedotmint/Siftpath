// Test-only extraction: ignore echoed questions and inspect only known body/snippet fields.
export function evidenceText(value) {
  if (typeof value === 'string') {
    try { return evidenceText(JSON.parse(value)); } catch { /* Native readers also return YAML or plain text. */ }
    // A locally clipped JSON text block can still contain a readable Markdown prefix.
    const prefix = value.match(/^\s*\{\s*"markdown"\s*:\s*"((?:[^"\\]|\\.)*)/s)?.[1];
    if (prefix !== undefined) {
      try { return JSON.parse('"' + prefix.replace(/\\$/, '') + '"'); } catch { /* Incomplete escape: keep the original text. */ }
    }
    const section = value.match(/^(?:snippets|content):[^\n]*\n((?:[ \t]+[^\n]*(?:\n|$)|\n)*)/m);
    if (section) return section[1];
    if (/^(?:question|snippet_source):/m.test(value)) return '';
    return value;
  }
  if (!value || typeof value !== 'object') return '';
  if (Array.isArray(value)) return value.map(evidenceText).join('\n');
  if (Array.isArray(value.snippets)) return value.snippets.map(evidenceText).join('\n');
  const parts = [];
  if (typeof value.content === 'string') parts.push(evidenceText(value.content));
  else if (Array.isArray(value.content)) for (const block of value.content) {
    if (block.type === 'text') parts.push(evidenceText(block.text));
  }
  if (value.structuredContent) parts.push(evidenceText(value.structuredContent));
  if (value.structuredData) parts.push(evidenceText(value.structuredData));
  if (value.data) parts.push(evidenceText(value.data));
  if (typeof value.markdown === 'string') parts.push(value.markdown);
  return [...new Set(parts)].join('\n');
}
export function readingFacts(result) {
  const text = evidenceText(result).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  return {
    perConnection: /enabled separately for each database connection/i.test(text),
    transaction: /not possible to enable or disable foreign key constraints in the middle of a multi-statement transaction/i.test(text),
    noEffect: /does not return an error;? it simply has no effect/i.test(text),
  };
}
export const sqliteRead = {
  url: 'https://sqlite.org/foreignkeys.html',
  focus: 'Return the original passages from section 2, Enabling Foreign Key Support, that establish whether foreign keys must be enabled separately for each database connection and whether PRAGMA foreign_keys can be changed inside an active multi-statement transaction. Preserve the exact wording about attempts returning no error but having no effect. Include the PRAGMA used to verify the setting.',
};
export const completeFacts = { perConnection: true, transaction: true, noEffect: true };
