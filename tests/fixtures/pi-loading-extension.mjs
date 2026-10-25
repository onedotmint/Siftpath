// Observation only: builtin:mcp and the production extension must register the real tools.
import { writeFile } from 'node:fs/promises';
import { Socket } from 'node:net';
import { setTimeout } from 'node:timers/promises';

// Also preloaded through NODE_OPTIONS, before Pi (and its Node children) can use the network.
if (process.env.SIFTPATH_PI_LOADING_REPORT) {
  const forbidden = () => {
    process.stderr.write('pi-loading: network/model activity forbidden\n');
    process.exit(86);
  };
  globalThis.fetch = forbidden;
  Socket.prototype.connect = forbidden;
}

export default function (pi) {
  const forbidden = () => {
    process.stderr.write('pi-loading: model run forbidden\n');
    process.exit(86);
  };
  pi.on('before_agent_start', forbidden);
  pi.on('before_provider_headers', forbidden);
  pi.on('before_provider_request', forbidden);
  pi.on('cache_warming_decision', () => ({ action: 'stop' }));
  pi.on('session_start', (_event, ctx) => {
    // Built-ins may receive session_start after file extensions. Do not block their startup.
    void observe(pi, ctx).catch(forbidden);
  });
}

async function observe(pi, ctx) {
  // MCP discovery runs in the background; do not mistake a startup race for missing tools.
  const deadline = Date.now() + 15000;
  let tools;
  do {
    tools = pi.getAllTools().filter(tool => tool.name.startsWith('mcp__siftpath__'));
    if (tools.length >= 2) break;
    await setTimeout(25);
  } while (Date.now() < deadline);
  await writeFile(process.env.SIFTPATH_PI_LOADING_REPORT, JSON.stringify({
    mode: ctx.mode,
    tools: tools.map(({ name, parameters, exposure }) => ({ name, parameters, exposure })),
    activeTools: pi.getActiveTools(),
  }), { mode: 0o600 });
  ctx.ui.notify('pi-loading:observed', 'info');
}
