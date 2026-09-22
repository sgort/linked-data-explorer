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

  test('clear() with no key empties the cache', () => {
    const cache = createTtlCache<string>({ name: 'test-e', ttlMs: 5000 });
    cache.set('a', '1');
    cache.clear();
    expect(cache.get('a')).toBeUndefined();
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
