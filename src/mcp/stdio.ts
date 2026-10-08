import type { Readable, Writable } from 'node:stream';
import type { EvidenceEngine } from '../core/engine.js';
import type { TraceEvent } from '../core/types.js';
import { McpSession, rpcError, type RpcMessage } from './session.js';

export async function serveStdio(engine: EvidenceEngine, input: Readable = process.stdin,
  output: Writable = process.stdout, trace?: (event: TraceEvent) => void): Promise<void> {
  const session = new McpSession(engine, trace), pending = new Set<Promise<void>>();
  let buffer = '', ended = false;
  let writes = Promise.resolve();
  const send = (message: RpcMessage) => {
    writes = writes.then(() => new Promise<void>((resolve, reject) => {
      output.write(JSON.stringify(message) + '\n', error => error ? reject(error) : resolve());
    }));
    // An EPIPE closes this session; it must not become an unhandled rejection.
    void writes.catch(() => session.close());
  };
  const handle = (line: string) => {
    if (!line.trim()) return;
    let value: unknown;
    try { value = JSON.parse(line); } catch { send(rpcError(null, -32700, 'Invalid JSON.')); return; }
    const work = session.dispatch(value, send).then(message => { if (message) send(message); })
      .catch(() => { send(rpcError(null, -32603, 'Internal protocol error.')); });
    pending.add(work); void work.finally(() => pending.delete(work));
  };
  await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      if (ended) return; ended = true;
      input.off('data', data); input.off('end', end); input.off('error', fail); output.off('error', fail);
      session.close();
      void Promise.allSettled([...pending]).then(() => writes).then(() => error ? reject(error) : resolve(), reject);
    };
    const data = (chunk: string) => {
      buffer += chunk;
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        if (Buffer.byteLength(line) > 1_048_576) { finish(new Error('MCP line exceeds 1 MiB.')); return; }
        handle(line);
      }
      if (Buffer.byteLength(buffer) > 1_048_576) finish(new Error('MCP line exceeds 1 MiB.'));
    };
    const end = () => { if (buffer.trim()) handle(buffer); finish(); };
    const fail = (error: Error) => finish(error);
    input.setEncoding('utf8'); input.on('data', data); input.once('end', end);
    input.once('error', fail); output.once('error', fail);
  });
}
