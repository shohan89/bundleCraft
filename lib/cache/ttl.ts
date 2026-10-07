/**
 * A tiny in-memory cache with a time-to-live and a size cap, for values that are cheap to
 * lose and safe to be a little stale. It is PER PROCESS: on a serverless host each instance has
 * its own copy, so a value can be up to `ttlMs` old on any instance, and `delete` only reaches
 * the instance that calls it. That is why it is used only for data that is public or global
 * and short-lived, never for authentication, permissions, billing, tokens or merchant data.
 *
 * A `ttlMs` of 0 disables it (every `get` misses), which the test suite uses so database
 * changes are seen immediately.
 */
export interface TtlCache<V> {
  get(key: string): V | undefined;
  set(key: string, value: V): void;
  delete(key: string): void;
  clear(): void;
  readonly size: number;
}

export function createTtlCache<V>(options: {
  ttlMs: number;
  maxEntries?: number;
  now?: () => number;
}): TtlCache<V> {
  const { ttlMs, maxEntries = 1000, now = Date.now } = options;
  const entries = new Map<string, { value: V; expires: number }>();

  return {
    get(key) {
      if (ttlMs <= 0) return undefined;
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expires <= now()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      if (ttlMs <= 0) return;
      // Bounded: at the cap, drop the oldest entry (Map keeps insertion order).
      if (!entries.has(key) && entries.size >= maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      entries.delete(key); // re-insert so a refreshed key becomes the newest
      entries.set(key, { value, expires: now() + ttlMs });
    },
    delete(key) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    },
    get size() {
      return entries.size;
    },
  };
}

/** Reads a TTL from the environment (milliseconds), falling back to `fallback` when unset or invalid. */
export function ttlFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
