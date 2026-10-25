// Public samples and narrow evidence checks, not an LLM judge or a universal benchmark.
export const readerPages = [
  { id: 'sqlite', category: 'technical', url: 'https://sqlite.org/foreignkeys.html',
    focus: 'Does SQLite require foreign keys to be enabled separately for each connection? Can this setting change in a transaction, and does an attempt raise an error or have any effect?',
    checks: [
      ['per-connection', /enabled separately for each database connection/i],
      ['transaction', /not possible to enable or disable foreign key constraints in the middle of a multi-statement transaction/i],
      ['no-error-no-effect', /does not return an error;? it simply has no effect/i],
    ] },
  { id: 'cache-control', category: 'technical', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control',
    focus: 'What do the no-cache, no-store, and private response directives permit or prohibit? Include whether a no-cache response may be stored and needs validation before reuse.',
    checks: [
      ['no-cache-storage', /no-cache.{0,1000}(?:can be stored|allows caches to store|allows.*stor)/i],
      ['no-store', /no-store.{0,1000}(?:not store|must not store|should not store)/i],
      ['private-cache', /private.{0,1000}(?:only.*private cache|stored only in a private cache|only by the browser)/i],
    ] },
  { id: 'rfc9111', category: 'long-spec', url: 'https://www.rfc-editor.org/rfc/rfc9111.html',
    checks: [
      ['no-cache-validation', /no-cache.{0,1400}without successful validation/i],
      ['no-store', /no-store.{0,1400}MUST NOT store/i],
      ['privacy-limit', /NOT a reliable or sufficient mechanism for ensuring privacy/i],
    ] },
  { id: 'npm-ci', category: 'commands', url: 'https://docs.npmjs.com/cli/v11/commands/npm-ci',
    checks: [
      ['lockfile', /(?:package-lock\.json|npm-shrinkwrap\.json)/i],
      ['removes-node-modules', /node_modules.{0,500}(?:removed|remove)/i],
      ['does-not-write', /never write.{0,200}(?:package\.json|package-lock)/i],
    ] },
  { id: 'python-venv', category: 'commands', url: 'https://docs.python.org/3/library/venv.html',
    checks: [
      ['create-command', /python\S*\s+-m\s+venv/i],
      ['posix-activate', /bin\/activate/],
      ['windows-activate', /Scripts[\\/](?:Activate\.ps1|activate\.bat)/i],
    ] },
  { id: 'http-methods', category: 'table', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Methods',
    checks: [
      ['GET-read', /GET.{0,400}(?:retriev|request.*represent|read.only)/i],
      ['POST-submit', /POST.{0,400}(?:submit|send|process)/i],
      ['DELETE-remove', /DELETE.{0,400}(?:delet|remov)/i],
    ] },
  { id: 'mime-types', category: 'table', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/MIME_types/Common_types',
    checks: [
      ['html-type', /(?:\.html|HTML).{0,250}text\/html/i],
      ['json-type', /(?:\.json|JSON).{0,250}application\/json/i],
      ['png-type', /(?:\.png|PNG).{0,250}image\/png/i],
    ] },
  { id: 'quotes-js', category: 'dynamic', url: 'https://quotes.toscrape.com/js/',
    checks: [
      ['rendered-quote', /The world as we have created it/i],
      ['quote-author', /Albert Einstein/],
      ['second-quote', /It is our choices/i],
    ] },
];
export function checkPage(text, page) {
  const plain = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  return Object.fromEntries(page.checks.map(([name, pattern]) => [name, pattern.test(plain)]));
}
export function htmlNoise(text) {
  const chars = [...text.matchAll(/<\/?[A-Za-z][^>]*>/g)].reduce((total, match) => total + match[0].length, 0);
  return { tagChars: chars, tagFraction: Number((chars / Math.max(text.length, 1)).toFixed(4)) };
}
