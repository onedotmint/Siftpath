import { EvidenceEngine } from '../../dist/index.js';
import { serveStdio } from '../../dist/mcp/stdio.js';
import { fixtureProvider, providers } from '../helpers.mjs';
const p=fixtureProvider();
await serveStdio(new EvidenceEngine({providers:providers([p],[p])}));
