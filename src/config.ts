import { readFile, mkdir, writeFile, rename, lstat, chmod, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { EvidenceEngine } from './core/engine.js';
import { EngineError } from './core/errors.js';
import { JsonHttp, type FetchTransport } from './core/http.js';
import type { EvidenceRanking, ProviderBase, Providers, Usage } from './core/types.js';
import { selectProviders } from './core/processing.js';
import { exa } from './providers/exa.js';
import { parallel } from './providers/parallel.js';
import { tavily } from './providers/tavily.js';
import { brave } from './providers/brave.js';
import { firecrawl } from './providers/firecrawl.js';
import { jina } from './providers/jina.js';
import { cloudflare } from './providers/cloudflare.js';

export const credentialNames = ['EXA_API_KEY', 'PARALLEL_API_KEY', 'TAVILY_API_KEY', 'BRAVE_API_KEY',
  'FIRECRAWL_API_KEY', 'JINA_API_KEY', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'] as const;
export type CredentialName = typeof credentialNames[number];
export interface Configuration {
  version?: 1; credentials?: Partial<Record<CredentialName, string>>;
  disabled?: string[]; priorities?: Record<string, number>;
  timeoutMs?: number; providerTimeoutMs?: number; jinaModel?: string; clefModel?: 'clef' | 'clef-flash';
  evidenceRanking?: EvidenceRanking;
}
export interface ProviderStatus { id: string; roles: string[]; state: 'ready' | 'missing' | 'disabled' | 'invalid'; needs: string[] }
const providerIds = ['exa', 'parallel', 'tavily', 'brave', 'firecrawl', 'jina', 'cloudflare'];
const bad = (): never => { throw new EngineError('INVALID_CONFIG', 'Invalid Siftpath configuration. See docs/CONFIGURATION.md; credential values are never echoed.'); };
export function parseConfiguration(value: unknown): Configuration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return bad();
  const raw = value as Record<string, unknown>;
  const allowed = ['version', 'credentials', 'disabled', 'priorities', 'timeoutMs', 'providerTimeoutMs', 'jinaModel', 'clefModel', 'evidenceRanking'];
  if (Object.keys(raw).some(key => !allowed.includes(key)) || raw.version !== undefined && raw.version !== 1) return bad();
  for (const field of ['timeoutMs', 'providerTimeoutMs']) if (raw[field] !== undefined &&
    (typeof raw[field] !== 'number' || !Number.isInteger(raw[field]) || raw[field] < 1 || raw[field] > 120000)) return bad();
  if (raw.jinaModel !== undefined && (typeof raw.jinaModel !== 'string' || !/^[a-zA-Z0-9_.:/-]{1,100}$/.test(raw.jinaModel))) return bad();
  if (raw.clefModel !== undefined && raw.clefModel !== 'clef' && raw.clefModel !== 'clef-flash') return bad();
  if (raw.evidenceRanking !== undefined && raw.evidenceRanking !== 'legacy' && raw.evidenceRanking !== 'bm25') return bad();
  if (raw.disabled !== undefined && (!Array.isArray(raw.disabled) || !raw.disabled.every(key => providerIds.includes(key)))) return bad();
  for (const field of ['credentials', 'priorities']) {
    const item = raw[field]; if (item === undefined) continue;
    if (!item || typeof item !== 'object' || Array.isArray(item)) return bad();
    for (const [key, val] of Object.entries(item)) {
      if (field === 'credentials') {
        if (!(credentialNames as readonly string[]).includes(key) || typeof val !== 'string' || val.length > 4096 || /[\r\n\0]/.test(val)) return bad();
      } else if (!providerIds.includes(key) || typeof val !== 'number' || !Number.isFinite(val) || val < 0 || val > 1000) return bad();
    }
  }
  return structuredClone(value) as Configuration;
}
/** New names take precedence; legacy environment names remain read-only aliases. */
export function siftpathEnv(name: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env[`SIFTPATH_${name}`] ?? env[`SMARTSEARCH_${name}`];
}
export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = siftpathEnv('CONFIG', env);
  if (override) return override;
  const root = env.XDG_CONFIG_HOME || join(homedir(), '.config');
  const current = join(root, 'siftpath', 'config.json');
  const legacy = join(root, 'smartsearch', 'config.json');
  // Reuse existing credentials without silently moving or overwriting the old file.
  return existsSync(current) || !existsSync(legacy) ? current : legacy;
}
export async function readConfiguration(path = configPath(), env: NodeJS.ProcessEnv = process.env): Promise<Configuration> {
  let saved: Configuration = {};
  try {
    const stats = await lstat(path);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size > 65536) return bad();
    saved = parseConfiguration(JSON.parse(await readFile(path, 'utf8')) as unknown);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      if (error instanceof EngineError) throw error;
      throw new EngineError('CONFIG_READ_FAILED', 'Cannot read configuration JSON. Check its format and file permissions.');
    }
  }
  const credentials = { ...saved.credentials };
  for (const key of credentialNames) if (env[key]?.trim()) credentials[key] = env[key]!.trim();
  if (!credentials.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_AUTH_TOKEN?.trim()) credentials.CLOUDFLARE_API_TOKEN = env.CLOUDFLARE_AUTH_TOKEN.trim();
  const rankOverride = siftpathEnv('EVIDENCE_RANKING', env);
  return parseConfiguration({ ...saved, credentials, ...(rankOverride === undefined ? {} : { evidenceRanking: rankOverride }) });
}
/** Private user storage, never a workspace .env file; atomic replace with mode 0600. */
export async function writePrivateJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  try { if ((await lstat(path)).isSymbolicLink()) throw new EngineError('UNSAFE_CONFIG_PATH', 'Refusing to replace a symbolic link.'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  try {
    await rename(temporary, path);
    if (process.platform !== 'win32') await chmod(path, 0o600);
  } finally { await rm(temporary, { force: true }); }
}
export function configureProviders(config: Configuration, transport?: FetchTransport): { providers: Providers; statuses: ProviderStatus[] } {
  const validated = parseConfiguration(config), keys = validated.credentials ?? {}, http = new JsonHttp(transport);
  const providers: Providers = { search: [], fetch: [] }, statuses: ProviderStatus[] = [];
  const definitions: { id: string; roles: string[]; needs: CredentialName[]; create: () => ProviderBase }[] = [
    { id: 'exa', roles: ['search', 'fetch'], needs: ['EXA_API_KEY'], create: () => exa(keys.EXA_API_KEY!, http) },
    { id: 'parallel', roles: ['search', 'fetch'], needs: ['PARALLEL_API_KEY'], create: () => parallel(keys.PARALLEL_API_KEY!, http) },
    { id: 'tavily', roles: ['search', 'fetch'], needs: ['TAVILY_API_KEY'], create: () => tavily(keys.TAVILY_API_KEY!, http) },
    { id: 'brave', roles: ['search'], needs: ['BRAVE_API_KEY'], create: () => brave(keys.BRAVE_API_KEY!, http) },
    { id: 'firecrawl', roles: ['fetch'], needs: ['FIRECRAWL_API_KEY'], create: () => firecrawl(keys.FIRECRAWL_API_KEY!, http) },
    { id: 'jina', roles: ['rerank'], needs: ['JINA_API_KEY'], create: () => jina(keys.JINA_API_KEY!, http, validated.jinaModel) },
    { id: 'cloudflare', roles: ['decision'], needs: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'],
      create: () => cloudflare(keys.CLOUDFLARE_ACCOUNT_ID!, keys.CLOUDFLARE_API_TOKEN!, http, validated.clefModel) },
  ];
  for (const entry of definitions) {
    const needs = entry.needs.filter(key => !keys[key]?.trim());
    const status: ProviderStatus = { id: entry.id, roles: entry.roles, needs,
      state: validated.disabled?.includes(entry.id) ? 'disabled' : needs.length ? 'missing' : 'ready' };
    if (status.state === 'ready') {
      try {
        const provider = entry.create();
        if (validated.priorities?.[entry.id] !== undefined) provider.priority = validated.priorities[entry.id];
        if ('search' in provider) providers.search.push(provider as Providers['search'][number]);
        if ('fetch' in provider) providers.fetch.push(provider as Providers['fetch'][number]);
        if ('rerank' in provider) providers.rerank = provider as NonNullable<Providers['rerank']>;
        if ('decide' in provider) providers.decision = provider as NonNullable<Providers['decision']>;
      } catch { status.state = 'invalid'; }
    }
    statuses.push(status);
  }
  return { providers, statuses };
}
export function createEngine(config: Configuration, transport?: FetchTransport): EvidenceEngine {
  return new EvidenceEngine({ providers: configureProviders(config, transport).providers,
    timeoutMs: config.timeoutMs, providerTimeoutMs: config.providerTimeoutMs, evidenceRanking: config.evidenceRanking });
}
export function diagnostics(config: Configuration) {
  const { providers, statuses } = configureProviders(config);
  return {
    runtime: process.version, supportedRuntime: Number(process.versions.node.split('.')[0]) >= 22,
    evidenceRanking: config.evidenceRanking ?? 'legacy',
    providers: statuses,
    routes: {
      fast: selectProviders(providers.search, { query: 'diagnostic', mode: 'fast', maxResults: 8 }, 1).map(p => p.id),
      quality: selectProviders(providers.search, { query: 'diagnostic', mode: 'quality', maxResults: 8 }, 2).map(p => p.id),
      fetch: [...providers.fetch].sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50)).map(p => p.id),
    },
    readyForSearch: providers.search.length > 0, readyForFetch: providers.fetch.length > 0,
    networkChecked: false, integrations: 'Run siftpath integration <pi|codex|cursor|claude-code|deepseek-harness> for setup.',
  };
}
export function usagePath(path = configPath()): string { return join(dirname(path), 'last-usage.json'); }
export async function saveUsage(usage: Usage, path = usagePath()): Promise<void> {
  await writePrivateJson(path, { recordedAt: new Date().toISOString(), scope: 'last CLI operation', usage,
    costNote: 'Vendor-reported estimates only, when supplied. Not a complete bill.' });
}
