import { createTtlCache, allCacheStats, clearNamedCaches } from './ttl-cache';

describe('createTtlCache', () => {
  test('returns a stored value before the TTL elapses', () => {
    let t = 1000;
    const cache = createTtlCache<string>({ name: 'test-a', ttlMs: 5000, now: () => t });
    cache.set('k', 'v');
    t = 4999;
    expect(cache.get('k')).toBe('v');
  });

  test('drops a value once the TTL has elapsed', () => {
    let t = 1000;
    const cache = createTtlCache<string>({ name: 'test-b', ttlMs: 5000, now: () => t });
    cache.set('k', 'v');
    t = 6001;
    expect(cache.get('k')).toBeUndefined();
  });

  // Item 12: the two cases above sit comfortably either side of the boundary
  // (999ms remaining, 1001ms over), so `now - storedAt > ttlMs` versus `>=`
  // was pinned by nothing. Decision: an entry aged EXACTLY ttlMs is still
  // live — `set()` records `storedAt = t`, so an entry read at `t + ttlMs`
  // has age `ttlMs`, and treating that instant as already-expired would
  // shave real time off the advertised TTL for every caller (a 5-minute
  // cache would in practice guarantee under 5 minutes). "Live through the
  // full TTL, gone the instant after" is the more useful contract, and it is
  // what `>` (not `>=`) already implements — this only makes it explicit and
  // failure-visible.
  test('a value aged exactly ttlMs is still live: the boundary is inclusive', () => {
    let t = 1000;
    const cache = createTtlCache<string>({ name: 'test-b2', ttlMs: 5000, now: () => t });
    cache.set('k', 'v');
    t = 1000 + 5000;
    expect(cache.get('k')).toBe('v');
  });

  test('returns undefined for a key never set', () => {
    const cache = createTtlCache<string>({ name: 'test-c', ttlMs: 5000 });
    expect(cache.get('absent')).toBeUndefined();
  });

  test('clear() with a key removes only that key', () => {
    const cache = createTtlCache<string>({ name: 'test-d', ttlMs: 5000 });
    cache.set('a', '1');
    cache.set('b', '2');
    cache.clear('a');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe('2');
  });

  // Item 13: asserting only that one previously-set key is gone doesn't prove
  // the cache is actually empty — a clear() that (say) only ever dropped the
  // first-inserted key would still pass a single-key version of this test.
  // Two entries and a `stats().size === 0` check close that gap. The clock
  // never advances, so any emptiness here is caused by clear(), not by the
  // TTL lazily expiring entries out from under the assertion.
  test('clear() with no key empties the cache, not merely expires entries', () => {
    const t = 1000;
    const cache = createTtlCache<string>({ name: 'test-e', ttlMs: 5000, now: () => t });
    cache.set('a', '1');
    cache.set('b', '2');
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.stats().size).toBe(0);
  });

  test('stats report size, ttl and the oldest entry age', () => {
    let t = 1000;
    const cache = createTtlCache<string>({ name: 'test-f', ttlMs: 5000, now: () => t });
    cache.set('a', '1');
    t = 3000;
    expect(cache.stats()).toEqual({ size: 1, ttlSeconds: 5, oldestAgeSeconds: 2 });
  });

  test('a registered cache appears in allCacheStats and is cleared by name', () => {
    const cache = createTtlCache<string>({ name: 'test-g', ttlMs: 5000 });
    cache.set('a', '1');
    expect(allCacheStats()['test-g'].size).toBe(1);
    clearNamedCaches('test-g');
    expect(cache.get('a')).toBeUndefined();
  });

  test('stats reports the age of the oldest entry across multiple entries, not just the last one', () => {
    let t = 1000;
    const cache = createTtlCache<string>({ name: 'test-h', ttlMs: 5000, now: () => t });
    cache.set('a', '1');
    t = 2000;
    cache.set('b', '2');
    t = 5000;
    // 'a' is 4s old, 'b' is 3s old: the oldest must stay 4, proving the
    // comparison does not simply take the most-recently-iterated entry.
    expect(cache.stats().oldestAgeSeconds).toBe(4);
  });

  test('an entry never read again is swept out of stats().size once its TTL elapses and another set() runs', () => {
    let t = 1000;
    const cache = createTtlCache<string>({ name: 'test-k', ttlMs: 5000, now: () => t });
    cache.set('a', '1');
    // Nobody ever calls get('a') — the lazy expiry inside get() never fires
    // for this key. Only a later set() should sweep it.
    t = 6001;
    cache.set('b', '2');
    expect(cache.stats().size).toBe(1);
  });

  test('stats() does not count expired-but-unswept entries', () => {
    let t = 1000;
    const cache = createTtlCache<string>({ name: 'test-l', ttlMs: 5000, now: () => t });
    cache.set('a', '1');
    cache.set('b', '2');
    t = 8000;
    // 'a' and 'b' are both expired now; a fresh set() sweeps them before
    // stats() is read, so oldestAgeSeconds must reflect only the live 'c',
    // not the stale entries that would otherwise overstate it.
    cache.set('c', '3');
    expect(cache.stats()).toEqual({ size: 1, ttlSeconds: 5, oldestAgeSeconds: 0 });
  });

  test('stats() ignores expired entries even when polled with no intervening set()', () => {
    let t = 1000;
    const cache = createTtlCache<string>({ name: 'test-m', ttlMs: 5000, now: () => t });
    cache.set('a', '1');
    cache.set('b', '2');
    t = 8000; // both expired; nothing else calls set() or get() before stats()
    expect(cache.stats()).toEqual({ size: 0, ttlSeconds: 5, oldestAgeSeconds: null });
  });

  test('clearNamedCaches() with no name clears every registered cache', () => {
    const cacheI = createTtlCache<string>({ name: 'test-i', ttlMs: 5000 });
    const cacheJ = createTtlCache<string>({ name: 'test-j', ttlMs: 5000 });
    cacheI.set('a', '1');
    cacheJ.set('b', '2');

    clearNamedCaches();

    expect(cacheI.get('a')).toBeUndefined();
    expect(cacheJ.get('b')).toBeUndefined();
  });
});
