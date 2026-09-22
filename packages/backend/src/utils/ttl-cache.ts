/**
 * The one caching mechanism in this package.
 *
 * `sparql.service.ts` keeps its own private `dmnCacheMap` — migrating it is a
 * deliberate non-goal (see the design doc). Anything new caches here, so the
 * repository does not acquire a third hand-rolled cache.
 */

export interface TtlCacheStats {
  size: number;
  ttlSeconds: number;
  /** Age of the oldest live entry, or null when the cache is empty. */
  oldestAgeSeconds: number | null;
}

export interface TtlCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  /** Removes one key, or every key when called with no argument. */
  clear(key?: string): void;
  stats(): TtlCacheStats;
}

interface Entry<T> {
  value: T;
  storedAt: number;
}

const registry = new Map<string, TtlCache<unknown>>();

export function createTtlCache<T>(opts: {
  name: string;
  ttlMs: number;
  /** Injected so expiry is tested without waiting. */
  now?: () => number;
}): TtlCache<T> {
  const { name, ttlMs, now = () => Date.now() } = opts;
  const entries = new Map<string, Entry<T>>();

  const cache: TtlCache<T> = {
    get(key) {
      const hit = entries.get(key);
      if (!hit) return undefined;
      if (now() - hit.storedAt > ttlMs) {
        entries.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key, value) {
      // Expiry is otherwise only checked lazily, inside `get(key)`, for that
      // one key. With no sweeper and no max size, an entry nobody reads
      // again — such as an annotation graph for a municipality visited once
      // — stays resident for the process lifetime; one such entry is ~8.7MB.
      // O(n) over entries, run on every write, keeps this simple without an
      // API change (no timer, nothing to tear down).
      const t = now();
      for (const [k, entry] of entries) {
        if (t - entry.storedAt > ttlMs) entries.delete(k);
      }
      entries.set(key, { value, storedAt: t });
    },
    clear(key) {
      if (key === undefined) entries.clear();
      else entries.delete(key);
    },
    stats() {
      let oldest: number | null = null;
      const t = now();
      for (const entry of entries.values()) {
        const age = Math.floor((t - entry.storedAt) / 1000);
        if (oldest === null || age > oldest) oldest = age;
      }
      return { size: entries.size, ttlSeconds: Math.floor(ttlMs / 1000), oldestAgeSeconds: oldest };
    },
  };

  registry.set(name, cache as TtlCache<unknown>);
  return cache;
}

export function allCacheStats(): Record<string, TtlCacheStats> {
  const out: Record<string, TtlCacheStats> = {};
  for (const [name, cache] of registry) out[name] = cache.stats();
  return out;
}

export function clearNamedCaches(name?: string): void {
  if (name === undefined) {
    for (const cache of registry.values()) cache.clear();
    return;
  }
  registry.get(name)?.clear();
}
