import { fileURLToPath } from 'node:url';

/**
 * Pi command: registers Siftpath as a Pi MCP server (only web_search/web_read reach the model) and
 * configures it through Pi's own UI. Configuration, credential, route and storage logic are shared
 * with the CLI; this file only contributes the interactive shell. No secret is ever printed, logged,
 * passed on a command line, or stored in Pi's transcript.
 */
const SERVER = 'siftpath';
export function validateSecret(value) {
  if (/[\r\n\0]/.test(value) || value.length > 4096) return 'Key 格式无效（不能包含换行或控制字符）。';
  return undefined;
}
/** Dependency-free masked input: Pi has no native password dialog, and ctx.ui.input echoes in plain text. */
function secretPrompt(ui, title) {
  return ui.custom((tui, theme, _keybindings, done) => {
    let value = '', error = '';
    const render = width => {
      const mask = value ? '•'.repeat(Math.min(value.length, 40)) + (value.length > 40 ? ` (${value.length})` : '') : theme.fg('dim', '（未输入）');
      const lines = [theme.fg('accent', title), '  ' + mask, theme.fg('dim', error || 'Enter 确认 · Esc 取消 · 输入不回显、不进入聊天记录')];
      return lines.map(line => line.length > width ? line.slice(0, Math.max(0, width - 1)) + '…' : line);
    };
    return {
      render,
      handleInput(data) {
        if (data === '\r' || data === '\n') {
          const problem = validateSecret(value); if (problem) { error = problem; tui.requestRender(); return; }
          done(value.trim()); return;
        }
        if (data === '\x1b' || data === '\x03') { done(undefined); return; }
        if (data === '\x7f' || data === '\b') value = value.slice(0, -1);
        else if (data.length > 1) value += data.replace(/\x1b\[[0-9;~]*[A-Za-z~]/g, '').replace(/[\r\n\0]/g, '');
        else if (data >= ' ' && data !== '\x7f') value += data;
        error = ''; tui.requestRender();
      },
      invalidate() {},
    };
  });
}
/** Static scrollable text; keeps long status out of notifications and out of the model context. */
function infoScreen(ui, title, lines) {
  return ui.custom((tui, theme, _keybindings, done) => {
    let offset = 0;
    const height = 18;
    return {
      render(width) {
        const visible = lines.slice(offset, offset + height);
        visible.push(theme.fg('dim', offset + height < lines.length ? '↑/↓ 滚动 · Enter/Esc 关闭' : 'Enter/Esc 关闭'));
        return [theme.fg('accent', title), ...visible].map(line => line.length > width ? line.slice(0, Math.max(0, width - 1)) + '…' : line);
      },
      handleInput(data) {
        if (data === '\x1b[A') offset = Math.max(0, offset - 1);
        else if (data === '\x1b[B') offset = Math.min(Math.max(0, lines.length - height), offset + 1);
        else if (data === '\x1b' || data === '\r' || data === '\n' || data === '\x03' || data === 'q') { done(undefined); return; }
        else return;
        tui.requestRender();
      },
      invalidate() {},
    };
  });
}

export default function (pi) {
  const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
  const running = new Set();
  let catalog = [], modules;
  /** The runtime is imported on first use: a missing dependency becomes a clear message, not a broken Pi startup. */
  const core = () => modules ??= Promise.all([import('../dist/config.js'), import('../dist/defaults.js'), import('../dist/setup-plan.js')])
    .then(([config, defaults, plan]) => { catalog = plan.providerCatalog; return { config, defaults, plan }; });
  const label = id => catalog.find(entry => entry.id === id)?.label ?? id;
  const option = id => `${label(id)} (${id})`;
  const pick = (ui, title, ids, extra) => ui.select(title, [...ids.map(option), ...(extra ? [extra] : [])]);
  const resolve = (ids, choice, extra) => choice === undefined ? undefined : extra && choice === extra ? null : ids.find(id => option(id) === choice);
  // Registering the same name again replaces the earlier registration, so a reload never duplicates tools.
  pi.registerMcpServer(SERVER, {
    command: process.execPath, args: [cli, 'mcp'], exposure: 'direct', timeout: 180,
    description: 'Siftpath: web search and webpage reading through the configured official provider MCP servers.',
  });
  pi.on('session_shutdown', () => { for (const controller of running) controller.abort(); });
  pi.on('session_start', async (_event, ctx) => {
    if (!ctx.hasUI) return;
    try {
      const { config, plan } = await core();
      if (plan.needsSetup(await config.readConfiguration(config.configPath()), process.env))
        ctx.ui.notify('Siftpath 已安装，但还没有可用的搜索或阅读服务。运行 /siftpath 完成快速配置（约 1 分钟）。', 'info');
    } catch (error) {
      ctx.ui.notify(error?.code === 'ERR_MODULE_NOT_FOUND'
        ? 'Siftpath 安装不完整（缺少运行时依赖）。用 pi install npm:@onedotmint/siftpath 安装，或在包目录运行 npm install。'
        : 'Siftpath 配置文件无法读取。运行 /siftpath 修复或重新配置。', 'warning');
    }
  });
  const exec = async (ctx, args) => {
    const controller = new AbortController(); running.add(controller);
    try {
      const result = await pi.exec(process.execPath, [cli, ...args], { cwd: ctx.cwd, signal: controller.signal });
      // Nonzero exit is expected for failed/skipped tests; their safe report is still on stdout.
      const report = JSON.parse(result.stdout || result.stderr || '{}');
      if (typeof report.code === 'string' && typeof report.message === 'string') throw Object.assign(new Error(), report);
      return report;
    } finally { running.delete(controller); }
  };
  const statusOf = async ctx => {
    try { return await exec(ctx, ['status', '--json']); }
    catch { ctx.ui.notify('Siftpath 状态读取失败：请检查安装是否完整（dist/ 与运行时依赖）以及配置文件。', 'error'); return null; }
  };
  const toolsLine = () => {
    try {
      const tools = (pi.getAllTools?.() ?? []).map(tool => tool.name).filter(name => name.startsWith(`mcp__${SERVER}__`));
      return tools.length ? `${tools.join(', ')}（已接入模型）` : '尚未接入（重启 Pi 或运行 /reload 后生效）';
    } catch { return '无法读取工具列表'; }
  };
  const showStatus = async (ctx, report) => {
    const data = report ?? await statusOf(ctx); if (!data) return;
    const chain = (primary, fallback) => primary === 'unconfigured' ? '未配置'
      : [primary, ...fallback].map(id => `${id} (${data.providers.find(row => row.provider === id)?.code ?? 'NOT_CONFIGURED'})`).join(' → ');
    const lines = [
      `配置来源: ${data.configPath}`,
      `Pi 工具: ${toolsLine()}`,
      `搜索: ${chain(data.routes.search, data.routes.searchFallback)}`,
      `阅读: ${chain(data.routes.read, data.routes.readFallback)}`,
      `意图: 默认=${data.routes.defaultIntent} · 语义=${data.routes.intents.semantic ?? '无'} · 研究=${data.routes.intents.research ?? '无'}`,
      '服务:',
      ...data.providers.map(provider => `  ${provider.provider}: ${provider.code}${provider.needs?.length ? ` · 缺少 ${provider.needs.join(', ')}` : ''}`
        + ` · ${provider.operations.join('/') || '无工具'} · ${provider.lastTest ? `${provider.lastTestStale ? '配置已变更 · ' : ''}最近测试 ${provider.lastTest.outcome}` : '未测试'}`),
      '',
      'READY 只表示配置可用，不代表已验证可用。',
      `下一步: ${data.nextStep}`,
    ];
    await infoScreen(ctx.ui, `Siftpath ${data.version}`, lines);
  };
  /** One provider decision through Pi's native UI; returns null when the user cancelled the whole flow. */
  const configure = async (ctx, draft, id) => {
    const { config, defaults, plan } = await core();
    const info = plan.providerInfo(id);
    const status = config.providerStatus(id, draft, process.env), saved = process.env[info.key]?.trim() || draft.credentials[info.key];
    const options = [
      ...(status.code === 'READY' ? ['保留当前连接'] : []),
      ...(saved ? ['继续使用已保存的 API Key'] : []),
      saved ? '输入新的 API Key（替换现有）' : '输入 API Key',
      ...(defaults.anonymousPresets[id] ? ['使用官方匿名访问'] : []),
      '暂不配置此服务',
    ];
    const choice = await ctx.ui.select(`${info.label} 凭据`, options);
    if (choice === undefined) return null;
    if (choice === '暂不配置此服务') return draft;
    if (choice === '保留当前连接') return plan.applySelection(draft, { id, mode: 'keep' });
    if (choice === '继续使用已保存的 API Key') return plan.applySelection(draft, { id, mode: 'existing' });
    if (choice === '使用官方匿名访问') return plan.applySelection(draft, { id, mode: 'anonymous' });
    if (process.env[info.key]?.trim()) ctx.ui.notify(`${info.key} 已由环境变量提供，环境变量优先于本地保存的 Key。`, 'warning');
    const value = await secretPrompt(ctx.ui, `${info.label} API Key`);
    if (value === undefined) return null;
    if (!value) { if (!saved) ctx.ui.notify('未输入 Key，该服务保持未配置。', 'warning'); return draft; }
    return plan.applySelection(draft, { id, mode: 'key', key: value });
  };
  const save = async (ctx, draft) => {
    const { config } = await core();
    const path = config.configPath();
    await config.writePrivateJson(path, config.parseConfiguration(draft), config.configurationMaxBytes);
    ctx.ui.notify(`Siftpath 配置已保存到 ${path}。下一次搜索/阅读即使用新配置，无需重启。`, 'info');
  };
  const quick = async ctx => {
    const { config, plan } = await core();
    let draft = await config.readConfiguration(config.configPath());
    const searches = catalog.filter(entry => entry.search).map(entry => entry.id);
    const readers = catalog.filter(entry => entry.read).map(entry => entry.id);
    const search = resolve(searches, await pick(ctx.ui, '用哪个服务搜索网页？', searches, '不配置搜索'), '不配置搜索');
    if (search === undefined) return;
    const read = resolve(readers, await pick(ctx.ui, '用哪个服务阅读网页？', readers, '不配置阅读'), '不配置阅读');
    if (read === undefined) return;
    const chosen = [search, read].filter(Boolean);
    if (!chosen.length) { ctx.ui.notify('没有选择任何服务，未保存。', 'warning'); return; }
    for (const id of chosen) { const next = await configure(ctx, draft, id); if (!next) return; draft = next; }
    for (const entry of catalog) if (!chosen.includes(entry.id) && draft.providers[entry.id]) draft.providers[entry.id].enabled = false;
    draft = plan.applyRecommendedRoutes(draft, process.env);
    if (draft.routes.search === 'unconfigured' && draft.routes.read === 'unconfigured') {
      ctx.ui.notify('所选服务仍缺少凭据，未保存。运行 /siftpath 重新配置，或选择官方匿名访问。', 'error'); return;
    }
    const route = (primary, fallback) => primary === 'unconfigured' ? '未配置' : `${primary}（后备: ${fallback.join(' → ') || '无'}）`;
    const summary = `搜索: ${route(draft.routes.search, draft.routes.searchFallback)}`
      + `\n阅读: ${route(draft.routes.read, draft.routes.readFallback)}`
      + `\n保存到: ${config.configPath()}\nKey 只写入本地私有配置（0600），不进入聊天记录或日志。`;
    if (!await ctx.ui.confirm('保存 Siftpath 配置？', summary)) { ctx.ui.notify('未保存任何更改。', 'info'); return; }
    await save(ctx, draft);
  };
  const advanced = async ctx => {
    const { config, plan } = await core();
    let draft = await config.readConfiguration(config.configPath());
    const order = async (title, ids) => {
      const picked = []; let remaining = [...ids];
      while (remaining.length) {
        const choice = await ctx.ui.select(`${title}（第 ${picked.length + 1} 位）`, [...remaining.map(option), '结束选择']);
        if (choice === undefined) return null;
        if (choice === '结束选择') break;
        const id = remaining.find(candidate => option(candidate) === choice);
        if (id) { picked.push(id); remaining = remaining.filter(candidate => candidate !== id); }
      }
      return picked;
    };
    while (true) {
      const action = await ctx.ui.select('Siftpath 高级配置', ['配置或更换某个服务的凭据', '停用某个服务', '设置搜索意图', '设置阅读服务与后备顺序', '保存并退出']);
      if (action === undefined) { ctx.ui.notify('未保存任何更改。', 'info'); return; }
      if (action === '保存并退出') break;
      if (action === '配置或更换某个服务的凭据') {
        const id = resolve(catalog.map(entry => entry.id), await pick(ctx.ui, '选择服务', catalog.map(entry => entry.id)));
        if (!id) continue;
        const next = await configure(ctx, draft, id); if (!next) return; draft = next; continue;
      }
      if (action === '停用某个服务') {
        const enabled = Object.keys(draft.providers).filter(id => draft.providers[id].enabled);
        if (!enabled.length) { ctx.ui.notify('没有已启用的服务。', 'info'); continue; }
        const choice = await ctx.ui.select('停用哪个服务？', enabled.map(option));
        const id = enabled.find(candidate => option(candidate) === choice);
        if (id) draft = plan.disableProvider(draft, id);
        continue;
      }
      if (action === '设置搜索意图') {
        const choices = plan.readyFor(draft, process.env, 'search');
        if (!choices.length) { ctx.ui.notify('还没有可用的搜索服务：先配置凭据。', 'warning'); continue; }
        for (const intent of ['general', 'semantic', 'research']) {
          const chosen = await ctx.ui.select(`${intent} 搜索使用哪个服务？`, choices.map(option));
          if (chosen === undefined) return;
          const id = choices.find(candidate => option(candidate) === chosen);
          if (!id) continue;
          if (intent === 'general') draft.routes.search = id; else draft.routes.intents[intent] = id;
        }
        draft.routes.intents.general = draft.routes.search;
        const fallback = await order('搜索后备顺序', choices.filter(id => id !== draft.routes.search));
        if (!fallback) return; draft.routes.searchFallback = fallback;
        continue;
      }
      const readers = plan.readyFor(draft, process.env, 'read');
      if (!readers.length) { ctx.ui.notify('还没有可用的阅读服务：先配置凭据。', 'warning'); continue; }
      const chosen = await ctx.ui.select('默认阅读服务', readers.map(option));
      if (chosen === undefined) return;
      draft.routes.read = readers.find(id => option(id) === chosen) ?? readers[0];
      const fallback = await order('阅读后备顺序', readers.filter(id => id !== draft.routes.read));
      if (!fallback) return; draft.routes.readFallback = fallback;
    }
    await save(ctx, draft);
  };
  const runTest = async (ctx, target) => {
    ctx.ui.notify('Siftpath: 逐个测试服务（不启用后备），可能消耗 API 额度。', 'info');
    try {
      const report = await exec(ctx, ['test', target, '--json']);
      await infoScreen(ctx.ui, 'Siftpath 测试结果', String(report.summary ?? '').split('\n'));
    } catch (error) {
      ctx.ui.notify(typeof error.code === 'string' ? `${error.code}: ${error.message}${error.hint ? ` — ${error.hint}` : ''}` : 'Siftpath 测试没有返回诊断结果。', 'warning');
    }
  };
  pi.registerCommand('siftpath', {
    description: '配置、查看状态或测试 Siftpath 的 web_search / web_read',
    handler: async (args, ctx) => {
      const words = args.trim().split(/\s+/).filter(Boolean);
      if (!ctx.hasUI) { ctx.ui.notify('Siftpath 配置需要交互模式：在 Pi 中运行 /siftpath，或在终端运行 siftpath setup。', 'warning'); return; }
      if (words.length) {
        // Documented non-interactive forms: /siftpath test <provider|all>, /siftpath status.
        if (words[0] === 'status') return showStatus(ctx);
        if (words[0] !== 'test' || words.length !== 2 || !/^(all|[a-z][a-z0-9_-]{0,63})$/.test(words[1]))
          { ctx.ui.notify('用法: /siftpath | /siftpath status | /siftpath test <provider|all>', 'warning'); return; }
        return runTest(ctx, words[1]);
      }
      if (ctx.mode && ctx.mode !== 'tui') {
        const report = await statusOf(ctx);
        if (report) ctx.ui.notify(String(report.summary ?? ''), report.ok ? 'info' : 'warning');
        else ctx.ui.notify('Siftpath 配置需要在交互模式（TUI）中进行，或在终端运行 siftpath setup。', 'warning');
        return;
      }
      try { await core(); }
      catch (error) {
        ctx.ui.notify(error?.code === 'ERR_MODULE_NOT_FOUND'
          ? 'Siftpath 安装不完整（缺少运行时依赖）。用 pi install npm:@onedotmint/siftpath 安装，或在包目录运行 npm install。'
          : 'Siftpath 运行时无法加载。', 'error');
        return;
      }
      const report = await statusOf(ctx);
      const firstTime = !report?.providers?.some(provider => provider.code === 'READY');
      const menu = firstTime ? ['快速配置（推荐）', '高级配置', '查看服务状态', '测试连接'] : ['查看服务状态', '快速配置', '高级配置', '测试连接'];
      const choice = await ctx.ui.select('Siftpath', menu);
      if (choice === '快速配置（推荐）' || choice === '快速配置') return quick(ctx);
      if (choice === '高级配置') return advanced(ctx);
      if (choice === '查看服务状态') return showStatus(ctx, report);
      if (choice === '测试连接') {
        const ids = (report?.providers ?? []).filter(provider => provider.code === 'READY').map(provider => provider.provider);
        if (!ids.length) { await showStatus(ctx, report); ctx.ui.notify('没有 READY 的服务可以测试：先完成快速配置。', 'warning'); return; }
        const target = await ctx.ui.select('测试哪个服务？（会真实请求，可能消耗额度）', ['all', ...ids]);
        if (!target) return;
        if (!await ctx.ui.confirm('真实请求', `逐个测试 ${target}，不使用后备。这会消耗 API 额度或匿名配额。`)) return;
        return runTest(ctx, target);
      }
    },
  });
}
