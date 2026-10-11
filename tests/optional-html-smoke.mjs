/** Test-only smoke: optional extractor is genuinely installable and functional. */
import assert from 'node:assert/strict';
import { EvidenceEngine } from '../dist/core/engine.js';

const engine=new EvidenceEngine({providers:{search:[],fetch:[]}});
const html=`<!doctype html><html><head><title>Valid article</title></head><body>
<header><nav>Global menu Documentation Contact</nav></header>
<article><h1>Web cache validators</h1>
<p>HTTP ETag validators let a browser perform conditional requests using the If-None-Match request header.</p>
<p>When the representation has not changed, the server may reply with HTTP 304 Not Modified without sending the body again.</p>
<p>When the underlying resource has changed, the server instead returns the updated representation and its fresh validator.</p>
<p>This reduces repeated downloads and improves cache efficiency for frequently requested resources.</p>
</article><footer>Copyright legal privacy preferences</footer>
</body></html>`;
const result=await engine.fromHtml({url:'https://example.com/article',html,query:'ETag validators',
 extractor:'readability',maxTokens:1700});
assert.ok(result.evidence.some(e=>e.text.includes('If-None-Match')));
assert.ok(result.evidence.some(e=>e.text.includes('304 Not Modified')));
assert.equal(result.usage.httpRequests,0);
assert.equal(result.usage.providerCalls,0);
assert.equal(result.sources[0].provider,'local-html');
console.log(JSON.stringify({ok:true,extractor:'readability',passages:result.evidence.length,requests:0}));
