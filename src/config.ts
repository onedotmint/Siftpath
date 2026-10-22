import { readFile, mkdir, writeFile, rename, lstat, chmod, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { SiftpathError, type Diagnostic } from './errors.js';
import { intentSchema } from './inputs.js';
import { defaultProviders, defaultRoutes } from './defaults.js';

export const configurationMaxBytes = 65536;
const clean = z.string().min(1).max(4096).regex(/^[^\r\n\0]+$/);
const bindingSchema = z.strictObject({ name: clean, arguments: z.record(z.string(), z.unknown()).default({}),
  // Some official tools reject fewer results than their native minimum; the Router raises the request and warns.
  minResults: z.number().int().min(1).max(20).optional() });
const connectionSchema = z.discriminatedUnion('transport', [
  z.strictObject({ transport: z.literal('stdio'), command: clean.refine(value => !value.includes('${')), args: z.array(clean.refine(value => !value.includes('${'))).default([]), env: z.record(z.string(), clean).default({}) }),
  z.strictObject({ transport: z.literal('http'), url: clean.refine(value => {
    try {
      const url = new URL(value);
      return !url.username && !url.password && !url.hash && !value.includes('${') &&
        ![...url.searchParams.keys()].some(key => /api.?key|^key$|^token$|access.?token|auth|secret|credential/i.test(key)) &&
        (url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
    } catch { return false; }
  }), headers: z.record(z.string(), clean).default({}) }),
]);
const timeout = z.number().int().min(100).max(120000);
const providerSchema = z.strictObject({ enabled: z.boolean().default(true), connection: connectionSchema,
  timeoutMs: timeout.optional(), search: bindingSchema.optional(), read: bindingSchema.optional() });
const routesSchema = z.strictObject({ defaultIntent: intentSchema.default(defaultRoutes.defaultIntent), search: clean.default(defaultRoutes.search), read: clean.default(defaultRoutes.read),
  intents: z.strictObject({ general: clean.optional(), semantic: clean.optional(), research: clean.optional() }).default(defaultRoutes.intents),
  searchFallback: z.array(clean).max(10).default(defaultRoutes.searchFallback), readFallback: z.array(clean).max(10).default(defaultRoutes.readFallback) });
const schema = z.strictObject({ version: z.literal(2).default(2), credentials: z.record(z.string().regex(/^[A-Z][A-Z0-9_]*$/), clean).default({}),
  providers: z.record(z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/), providerSchema).default(defaultProviders),
  routes: routesSchema.default(defaultRoutes), timeoutMs: timeout.default(60000), providerTimeoutMs: timeout.default(20000),
  maxOutputChars: z.number().int().min(2000).max(50000).default(16000) });
export type Configuration = z.infer<typeof schema>;
export type Provider = z.infer<typeof providerSchema>;
export type Binding = z.infer<typeof bindingSchema>;
export function parseConfiguration(value: unknown): Configuration {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new SiftpathError('INVALID_CONFIG', 'Invalid configuration (version 2 required). See docs/CONFIGURATION.md; values are never echoed.');
  const config = structuredClone(parsed.data);
  for (const id of [config.routes.search, config.routes.read, ...Object.values(config.routes.intents), ...config.routes.searchFallback, ...config.routes.readFallback]) {
    // Built-in routes may refer to absent optional providers; unknown custom IDs are still diagnosed by doctor.
    if (id && !/^[a-z][a-z0-9_-]{0,63}$/.test(id)) throw new SiftpathError('INVALID_CONFIG', 'Invalid route provider ID.');
  }
  return config;
}
export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.SIFTPATH_CONFIG ?? env.SMARTSEARCH_CONFIG;
  if (override) return override;
  const root = env.XDG_CONFIG_HOME || join(homedir(), '.config');
  const current = join(root, 'siftpath', 'config.json'), legacy = join(root, 'smartsearch', 'config.json');
  return existsSync(current) || !existsSync(legacy) ? current : legacy;
}
export async function readConfiguration(path = configPath(), env: NodeJS.ProcessEnv = process.env): Promise<Configuration> {
  let raw: unknown = {};
  try {
    const stats = await lstat(path);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size > configurationMaxBytes) throw new SiftpathError('INVALID_CONFIG', 'Configuration must be a regular JSON file of at most 64 KiB.');
    raw = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      if (error instanceof SiftpathError) throw error;
      throw new SiftpathError('CONFIG_READ_FAILED', 'Cannot read configuration JSON. Check format and permissions.');
    }
  }
  // Old credentials can be reused, but old engine options must never silently change the new routes.
  if (raw && typeof raw === 'object' && 'version' in raw && raw.version === 1) {
    const old = raw as { credentials?: Record<string, string>; disabled?: string[] };
    raw = { version: 2, credentials: old.credentials ?? {}, providers: Object.fromEntries(
      Object.entries(defaultProviders).map(([id, provider]) => [id, { ...provider, enabled: provider.enabled && !old.disabled?.includes(id) }])) };
  }
  const config = parseConfiguration(raw);
  const names = new Set([...Object.keys(config.credentials), ...[...JSON.stringify(config.providers).matchAll(/\$\{([A-Z][A-Z0-9_]*)\}/g)].map(match => match[1]!)]);
  for (const name of names) if (env[name]?.trim()) config.credentials[name] = env[name]!.trim();
  return parseConfiguration(config);
}
/** Private user storage, never a workspace .env file; atomic replace with mode 0600. */
export async function writePrivateJson(path: string, value: unknown, maxBytes = Infinity): Promise<void> {
  const serialized = JSON.stringify(value, null, 2) + '\n';
  if (Buffer.byteLength(serialized) > maxBytes) throw new SiftpathError('CONFIG_TOO_LARGE', 'Formatted configuration exceeds the size limit; existing file was not changed.');
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  try { if ((await lstat(path)).isSymbolicLink()) throw new SiftpathError('UNSAFE_CONFIG_PATH', 'Refusing to replace a symbolic link.'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, serialized, { flag: 'wx', mode: 0o600 });
  try { await rename(temporary, path); if (process.platform !== 'win32') await chmod(path, 0o600); }
  finally { await rm(temporary, { force: true }); }
}
export function resolveSecret(value: string, config: Configuration, env: NodeJS.ProcessEnv): string {
  return value.replace(/\$\{([A-Z][A-Z0-9_]*)\}/g, (_, name: string) => env[name]?.trim() || config.credentials[name] || '');
}
export function providerStatus(id: string, config: Configuration, env: NodeJS.ProcessEnv): Diagnostic {
  const provider = Object.hasOwn(config.providers, id) ? config.providers[id] : undefined;
  if (!provider) return { provider: id, code: 'NOT_CONFIGURED' };
  if (!provider.enabled) return { provider: id, code: 'DISABLED' };
  const needs = [...new Set([...JSON.stringify(provider.connection).matchAll(/\$\{([A-Z][A-Z0-9_]*)\}/g)].map(m => m[1]!))]
    .filter(name => !env[name]?.trim() && !config.credentials[name]);
  return { provider: id, code: needs.length ? 'MISSING_CREDENTIALS' : 'READY', ...(needs.length ? { needs } : {}) };
}
export function diagnostics(config: Configuration, env: NodeJS.ProcessEnv = process.env) {
  const ids = new Set([...Object.keys(config.providers), config.routes.search, config.routes.read, ...Object.values(config.routes.intents),
    ...config.routes.searchFallback, ...config.routes.readFallback].filter((id): id is string => !!id));
  return { runtime: process.version, networkChecked: false, providers: [...ids].map(id => ({ ...providerStatus(id, config, env), operations: ['search', 'read'].filter(kind => !!config.providers[id]?.[kind as 'search' | 'read']) })), routes: config.routes };
}
