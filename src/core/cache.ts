/** In-memory, bounded, copy-on-read TTL cache. No secrets or persistence. */
export class TtlCache<T> {
  private readonly values = new Map<string, { value: T; expires: number }>();
  constructor(private readonly maxEntries = 256, private readonly now = Date.now) {}
  get(key: string): T | undefined {
    const entry = this.values.get(key);
    if (!entry) return;
    if (entry.expires <= this.now()) { this.values.delete(key); return; }
    this.values.delete(key); this.values.set(key, entry);
    return structuredClone(entry.value);
  }
  set(key: string, value: T, ttlMs: number): void {
    if (ttlMs <= 0 || this.maxEntries <= 0) return;
    this.values.delete(key);
    this.values.set(key, { value: structuredClone(value), expires: this.now() + ttlMs });
    while (this.values.size > this.maxEntries) this.values.delete(this.values.keys().next().value!);
  }
  clear(): void { this.values.clear(); }
  get size(): number { return this.values.size; }
}
