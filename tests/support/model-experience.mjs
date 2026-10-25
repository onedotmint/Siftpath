// Controlled evidence fixtures, not live-provider recordings or a semantic judge.
// SQLite/RFC quotations reuse the prior Reader investigation; layout and missing-evidence
// boundaries are constructed. The v9.7 API/table is deliberately fictional.
export const experienceCases = [
  {
    id: 'sqlite', url: 'https://sqlite.org/foreignkeys.html',
    prompt: 'Using https://sqlite.org/foreignkeys.html, explain whether foreign keys must be enabled per connection, whether PRAGMA foreign_keys can change inside a multi-statement transaction, and whether the attempt errors or has an effect. Cite the evidence.',
    initial: { snippets: [
      'Foreign key constraints are disabled by default (for backwards compatibility), so must be enabled separately for each database connection.',
      'It is not possible to enable or disable foreign key constraints in the middle of a multi-statement transaction (when SQLite is not in autocommit mode). Attempting to do so does not return an error; it simply has no effect.',
    ], snippet_source: 'content' },
  },
  {
    id: 'rfc', url: 'https://www.rfc-editor.org/rfc/rfc9111.html',
    prompt: 'Using RFC 9111 at https://www.rfc-editor.org/rfc/rfc9111.html, compare unqualified no-cache and no-store RESPONSE directives: validation/reuse, private versus shared caches, the exact non-volatile/volatile storage requirements, and privacy guarantees. Support each conclusion with a passage from the tool, not remembered knowledge.',
    initial: { snippets: [
      '5.2.2.4. no-cache: The no-cache response directive, in its unqualified form (without an argument), indicates that the response MUST NOT be used to satisfy any other request without forwarding it for validation and receiving a successful response.',
      '5.2.1.5. no-store: The no-store request directive indicates that a cache MUST NOT store any part of either this request or any response to it.',
    ], snippet_source: 'content' },
    followupFocus: 'no-store|5\\.2\\.2\\.5|volatile|privacy',
    followup: { snippets: [
      '5.2.2.5. no-store: The no-store response directive indicates that a cache MUST NOT store any part of either the immediate request or the response and MUST NOT use the response to satisfy any other request.',
      'This directive applies to both private and shared caches. "MUST NOT store" in this context means that the cache MUST NOT intentionally store the information in non-volatile storage and MUST make a best-effort attempt to remove the information from volatile storage as promptly as possible after forwarding it.',
      'This directive is not a reliable or sufficient mechanism for ensuring privacy. In particular, malicious or compromised caches might not recognize or obey this directive, and communications networks might be vulnerable to eavesdropping.',
      'Note that the must-understand cache directive overrides no-store in certain circumstances; see Section 5.2.2.3.',
    ], snippet_source: 'content' },
  },
  {
    id: 'long-spec', url: 'https://www.rfc-editor.org/rfc/rfc9111.html',
    prompt: 'Read https://www.rfc-editor.org/rfc/rfc9111.html without focus. Does the returned evidence establish that you have the complete specification and can enumerate ALL Cache-Control directives? Explain the limits of what you actually received; do not enumerate from memory.',
    initial: { content: 'RFC 9111 HTTP Caching\nAbstract\nThis document defines HTTP caches and the associated header fields that control cache behavior or indicate cacheable response messages.\n4. Constructing Responses from Caches\n6. Relationship to Applications and Other Caches', snippet_source: 'full_content' },
  },
  {
    id: 'code-table', url: 'https://example.com/client-v9.7',
    prompt: 'Read https://example.com/client-v9.7 for this fictional client API version 9.7. Show the exact connect example, list ALL supported modes from the table, and explain exactly what retries: 0 means. Base the answer only on returned evidence and cite it.',
    initial: { snippets: ['Client v9.7\n```js\nconnect({ retries: 0, mode: "safe" });\n```\nModes (selected rows):\n| Mode | Deferred writes |\n| safe | no |'], snippet_source: 'content' },
    followupFocus: 'mode|table|retr|connect|9\\.7',
    followup: { markdown: 'Client v9.7\n```js\nconnect({ retries: 0, mode: "safe" });\n```\nretries: 0 disables retries; it does not mean unlimited retries.\nComplete supported modes table for v9.7:\n| Mode | Deferred writes |\n| safe | no |\n| buffered | yes |\n| audit | no |' },
  },
];
export function nativeReply(scenario, followup = false) {
  const data = { url: scenario.url, ...(followup ? scenario.followup : scenario.initial) };
  // Known duplicate structured fields nested in a text envelope with extra diagnostics.
  return { content: [{ type: 'text', text: JSON.stringify({ ...data, reader: 'controlled-fixture' }) }], structuredContent: data };
}
export function selectReply(scenario, index, args) {
  return nativeReply(scenario, index > 0 && !!scenario.followup &&
    typeof args.question === 'string' && new RegExp(scenario.followupFocus, 'i').test(args.question));
}
