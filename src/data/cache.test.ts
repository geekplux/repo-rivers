import { describe, expect, it } from 'vitest';
import demo from '../../tests/fixtures/demo.json' with { type: 'json' };
import { parseAggregate } from '../core/schema.ts';
import { CACHE_ENTRIES, CACHE_FRESH_MS, cacheKey, createCache } from './cache.ts';

const agg = parseAggregate(demo);
const ref = (i: number) => ({ owner: 'Octo', name: `repo-${i}` });

/** An in-memory Storage; `limit` caps the total characters stored (like a quota). */
function memoryStorage(limit = Infinity): Storage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  const size = () => [...map].reduce((n, [k, v]) => n + k.length + v.length, 0);
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (k) => map.get(k) ?? null,
    setItem(k, v) {
      const old = map.get(k);
      map.set(k, v);
      if (size() > limit) {
        if (old === undefined) map.delete(k);
        else map.set(k, old);
        throw new DOMException('quota', 'QuotaExceededError');
      }
    },
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
  };
}

describe('aggregate cache', () => {
  it('round-trips under a lowercased key and serves only fresh entries', () => {
    let now = 1_000_000;
    const storage = memoryStorage();
    const cache = createCache(storage, () => now);
    expect(cache.put(ref(1), agg)).toBe(true);
    expect(storage.map.has('rr:agg:v1:octo/repo-1')).toBe(true);
    expect(cacheKey({ owner: 'OCTO', name: 'Repo-1' })).toBe('rr:agg:v1:octo/repo-1');
    expect(cache.get({ owner: 'octo', name: 'REPO-1' })).toEqual(agg);
    now += CACHE_FRESH_MS - 1;
    expect(cache.get(ref(1))).not.toBeNull();
    now += 1;
    expect(cache.get(ref(1))).toBeNull();
  });

  it(`keeps the ${CACHE_ENTRIES} most recently used entries`, () => {
    const storage = memoryStorage();
    const cache = createCache(storage, () => 0);
    for (let i = 0; i < CACHE_ENTRIES; i++) cache.put(ref(i), agg);
    expect(cache.get(ref(0))).not.toBeNull(); // 0 becomes most recent; 1 is now the oldest
    cache.put(ref(99), agg);
    expect(cache.get(ref(1))).toBeNull();
    expect(cache.get(ref(0))).not.toBeNull();
    expect([...storage.map.keys()].filter((k) => k !== 'rr:agg:v1:index')).toHaveLength(CACHE_ENTRIES);
  });

  it('evicts old entries when over quota, and gives up without throwing when one entry cannot fit', () => {
    const one = JSON.stringify({ savedAt: 0, aggregate: agg }).length + 40;
    const storage = memoryStorage(one * 2 + 200);
    const cache = createCache(storage, () => 0);
    expect(cache.put(ref(1), agg)).toBe(true);
    expect(cache.put(ref(2), agg)).toBe(true);
    expect(cache.put(ref(3), agg)).toBe(true); // evicted repo-1 to fit
    expect(cache.get(ref(1))).toBeNull();
    expect(cache.get(ref(3))).not.toBeNull();
    const tiny = createCache(memoryStorage(100), () => 0);
    expect(tiny.put(ref(1), agg)).toBe(false);
    expect(tiny.get(ref(1))).toBeNull();
  });

  it('treats missing storage, throwing storage and corrupt entries as misses', () => {
    expect(createCache(null).put(ref(1), agg)).toBe(false);
    expect(createCache(null).get(ref(1))).toBeNull();
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => undefined } as unknown as Storage;
    expect(createCache(broken).put(ref(1), agg)).toBe(false);
    expect(createCache(broken).get(ref(1))).toBeNull();
    const storage = memoryStorage();
    storage.setItem(cacheKey(ref(1)), '{"savedAt":0,"aggregate":{"schemaVersion":2}}');
    storage.setItem(cacheKey(ref(2)), 'not json');
    const cache = createCache(storage, () => 0);
    expect(cache.get(ref(1))).toBeNull();
    expect(cache.get(ref(2))).toBeNull();
  });
});
