import { defineTool } from '@deepseek-ai/dsh-tools';
import { toolDefinitions } from '@onedotmint/siftpath';
import { Config } from './config.js';
import { SiftpathRuntime } from './runtime.js';

export { Config } from './config.js';
export { SiftpathRuntime } from './runtime.js';
export const name = 'siftpath';

export const consumer = {
  name: 'siftpath-native',
  inject: ['siftpath', 'web', 'tools'],
  apply(ctx) {
    ctx.web.registerSearchProvider({
      id: 'siftpath',
      available: () => ctx.siftpath.available(),
      async search(request, signal) {
        const result = await ctx.siftpath.invoke('search', request, signal);
        return { content: JSON.stringify(result), sources: result.sources, truncated: result.sourcesTruncated };
      },
    });
    ctx.tools.register(defineTool({
      name: 'siftpath_read',
      description: toolDefinitions.find(t => t.name === 'web_read').description,
      parameters: {
        url: { type: 'string', required: true, description: 'Public HTTP(S) page URL.' },
        reader: { type: 'string', description: 'Explicit configured reader ID; no fallback.' },
        focus: { type: 'string', description: 'Native extraction focus; unsupported readers fail before fetching.' },
      },
      output: { schema: { type: 'json' }, render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }] },
      isConcurrencySafe: () => true,
      execute: (args, exec) => ctx.siftpath.invoke('read', args, exec.signal),
    }));
  },
};

export function apply(ctx, config) {
  ctx.plugin(SiftpathRuntime, config);
  // The shipped registry inherits global tools into presets; web provider maps are host-owned.
  ctx.plugin(consumer);
}
export default { name, Config, apply };
