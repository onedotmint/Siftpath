import { readFileSync } from 'node:fs';

// Both src/ and dist/ are one level below the packaged metadata.
export const packageVersion: string = (JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string }).version;
