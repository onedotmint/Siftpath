import { Service } from '@deepseek-ai/cordis';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { WebError } from '@deepseek-ai/dsh-web';
import { Siftpath, providerCatalog, safeError } from '@onedotmint/siftpath';
import { coreConfiguration, validateSettings } from './config.js';

function abortable(promise, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => reject(new WebError('Siftpath operation cancelled.', 'ABORTED'));
    const cleanup = () => signal.removeEventListener('abort', abort);
    Promise.resolve(promise).then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}

export class SiftpathRuntime extends Service {
  static inject = ['credentials'];
  constructor(ctx, config, Router = Siftpath) {
    super(ctx, 'siftpath');
    this.owner = ctx;
    this.config = config;
    this.Router = Router;
    this.routers = new Set();
    this.current = new Map();
    this.settingsSignature = '';
    this.shutdown = new AbortController();
    ctx.effect(() => () => this.close());
  }
  available() {
    if (this.shutdown.signal.aborted) return false;
    try {
      const s = validateSettings(this.config.settings.get());
      const id = s[`${s.defaultIntent}Provider`] || s.searchProvider;
      return !!s[`${id}Enabled`] && providerCatalog.some(p => p.id === id && p.search);
    } catch { return false; }
  }
  async invoke(kind, args, caller) {
    const s = validateSettings(this.config.settings.get());
    const signal = AbortSignal.any([this.shutdown.signal, AbortSignal.timeout(s.timeoutMs), ...(caller ? [caller] : [])]);
    try {
      signal.throwIfAborted();
      const config = coreConfiguration(s);
      const signature = JSON.stringify(s);
      if (this.settingsSignature !== signature) {
        for (const lease of this.current.values()) { lease.retired = true; if (!lease.active) void this.release(lease); }
        this.current.clear();
        this.settingsSignature = signature;
      }
      // Native DSH configuration has no fallback routes; only this operation's selected provider needs a key.
      const id = kind === 'read' ? args.reader ?? config.routes.read : config.routes.intents[args.intent ?? config.routes.defaultIntent] ?? config.routes.search;
      const needed = providerCatalog.filter(p => p.id === id && s[`${p.id}Enabled`] && !s[`${p.id}Anonymous`]);
      const credentials = await abortable(Promise.all(needed.map(async p => {
        const resolved = await this.owner.credentials.resolve(credentialRef(s[`${p.id}CredentialRef`]));
        return [p.key, resolved?.value];
      })), signal);
      signal.throwIfAborted();
      config.credentials = Object.fromEntries(credentials.filter(([, value]) => value?.trim()));
      const fingerprint = JSON.stringify(config);
      const slot = `${kind}:${id}`;
      const currentSnapshot = signature === this.settingsSignature;
      let lease = currentSnapshot ? this.current.get(slot) : undefined;
      if (!lease || lease.fingerprint !== fingerprint) {
        if (lease) { lease.retired = true; if (!lease.active) void this.release(lease); }
        lease = { router: new this.Router(config, {}), fingerprint, active: 0, retired: !currentSnapshot };
        this.routers.add(lease);
        if (currentSnapshot) this.current.set(slot, lease);
      }
      lease.active++;
      try { return await lease.router[kind](args, { signal }); }
      finally { lease.active--; if (lease.retired && !lease.active) await this.release(lease); }
    } catch (error) {
      if (signal.aborted) throw new WebError(this.shutdown.signal.aborted ? 'Siftpath is closed.' : caller?.aborted ? 'Siftpath operation cancelled.' : 'Siftpath deadline exceeded.', this.shutdown.signal.aborted ? 'CLOSED' : caller?.aborted ? 'ABORTED' : 'TIMEOUT');
      const safe = safeError(error);
      // The core's safe serializer never exposes transport errors or credential values.
      throw new WebError(JSON.stringify(safe), safe.code);
    }
  }
  release(lease) {
    return lease.closing ??= Promise.resolve().then(() => lease.router.close()).catch(() => {}).finally(() => { this.routers.delete(lease); lease.fingerprint = ''; });
  }
  async close() {
    this.shutdown.abort();
    this.current.clear();
    await Promise.allSettled([...this.routers].map(lease => this.release(lease)));
  }
}
