import { rm } from 'node:fs/promises';
// Prevent removed engine/plugin code surviving in a previously built dist/.
await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
