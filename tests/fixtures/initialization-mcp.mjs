import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';

// Deliberately never answer initialize; remain alive until the transport closes us.
createInterface({ input: process.stdin }).on('line', line => {
  if (JSON.parse(line).method === 'initialize') writeFileSync(process.argv[2], String(process.pid));
});
setInterval(() => {}, 1000);
