import { Type } from '@earendil-works/pi-ai';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { SelectList, truncateToWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui';
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
        const column = Math.max(1, Math.min(72, Math.floor(width) || 1));
        const lines: string[] = [];
        const indented = (text: string, spaces = 2, color: 'muted' | 'text' | 'accent' = 'text') => {
          const margin = Math.min(spaces, column - 1);
          for (const part of wrapTextWithAnsi(text, Math.max(1, column - margin))) {
            lines.push(' '.repeat(margin) + theme.fg(color, part));
          }
        };
        indented('SIFTPATH', 2, 'accent');
        indented('v' + snapshot.version, 2, 'muted');
        lines.push(theme.fg('border', '─'.repeat(Math.max(1, column - 1))));
        indented(snapshot.selected === 'usage' ? 'SESSION USAGE' : 'OVERVIEW', 2, 'muted');
        lines.push('');

        for (const row of snapshot.rows) {
          if (column >= 46) {
            const prefix = '  ' + row.label.padEnd(17);
            const segments = wrapTextWithAnsi(row.value, Math.max(1, column - 19));
            for (const [i, part] of segments.entries()) {
              lines.push((i === 0 ? theme.fg('muted', prefix) : ' '.repeat(19)) +
                theme.fg('text', part));
            }
          } else {
            indented(row.label, 2, 'muted');
            indented(row.value, 4);
          }
        }

        lines.push('');
        // Long executable paths, Windows UNC paths and links must wrap rather
        // than get cut off by the final width guard.
        indented(snapshot.note, 2, 'muted');
        lines.push('');
        lines.push(theme.fg('border', '─'.repeat(Math.max(1, column - 1))));
        indented('ACTIONS', 2, 'muted');
        lines.push(...items.render(column));
        indented('↑↓ move · Enter choose · Esc close', 2, 'muted');
        return lines.map(line => truncateToWidth(line, column, ''));
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
