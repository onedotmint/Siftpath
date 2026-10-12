import { Type } from '@earendil-works/pi-ai';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { SelectList, truncateToWidth } from '@earendil-works/pi-tui';
import {
  registerPi, type PiApi, type TypeFactory,
  type SiftpathPanelAction, type SiftpathPanelSnapshot,
} from '../../dist/integrations/pi.js';

/** Uses Pi's own terminal renderer and color theme; never starts another TUI process. */
async function present(context: ExtensionContext, snapshot: SiftpathPanelSnapshot): Promise<SiftpathPanelAction> {
  if (context.mode !== 'tui') {
    context.ui.notify('Use /siftpath in Pi interactive TUI mode.', 'warning');
    return 'close';
  }
  return context.ui.custom<SiftpathPanelAction>((tui, theme, _keys, done) => {
    const actions: { value: SiftpathPanelAction; label: string; description?: string }[] = [
      { value: 'status', label: 'Overview', description: 'configured providers and status' },
      { value: 'usage', label: 'Usage', description: 'current session counters' },
      { value: 'reload', label: 'Reload', description: 'apply updated config (resets cache)' },
      { value: 'close', label: 'Close', description: 'return to conversation' },
    ];
    const items = new SelectList(actions, 4, {
      selectedPrefix: text => theme.fg('accent', text),
      selectedText: text => theme.fg('accent', text),
      description: text => theme.fg('muted', text),
      scrollInfo: text => theme.fg('dim', text),
      noMatch: text => theme.fg('warning', text),
    });
    items.setSelectedIndex(snapshot.selected === 'usage' ? 1 : 0);
    items.onSelect = item => done(item.value as SiftpathPanelAction);
    items.onCancel = () => done('close');
    return {
      render(width: number): string[] {
        const column = Math.max(1, Math.min(72, width));
        const rule = theme.fg('border', '─'.repeat(Math.max(1, column - 1)));
        const rows = snapshot.rows.map(row => {
          const label = theme.fg('muted', row.label.padEnd(17));
          return '  ' + label + theme.fg('text', row.value);
        });
        const lines = [
          theme.fg('accent', theme.bold('  SIFTPATH')) + theme.fg('dim', '   v' + snapshot.version),
          rule,
          theme.fg('muted', snapshot.selected === 'usage' ? '  SESSION USAGE' : '  OVERVIEW'),
          '',
          ...rows,
          '',
          theme.fg('muted', '  ' + snapshot.note),
          '',
          rule,
          theme.fg('muted', '  ACTIONS  ↑↓ navigate · Enter choose · Esc close'),
          ...items.render(column),
        ];
        return lines.map(line => truncateToWidth(line, Math.max(1, width), ''));
      },
      handleInput(data: string) { items.handleInput(data); tui.requestRender(); },
      invalidate() { items.invalidate(); },
    };
  });
}

export default function (pi: ExtensionAPI) {
  registerPi(pi as unknown as PiApi, Type as unknown as TypeFactory, undefined,
    (context, snapshot) => present(context as unknown as ExtensionContext, snapshot));
}
