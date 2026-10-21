import type { RepoRef } from '../core/github/repoRef.ts';
import { parseAggregate, type RepoAggregate } from '../core/schema.ts';

/** How many repositories the browser keeps (least recently used are evicted first). */
export const CACHE_ENTRIES = 8;
/** Entries older than this are not served (the Worker revalidates cheaply instead). */
export const CACHE_FRESH_MS = 24 * 60 * 60 * 1000;
const INDEX = 'rr:agg:v1:index';

/** `rr:agg:v1:{owner}/{name}`, lowercased (GitHub names are case-insensitive). */
export const cacheKey = (ref: RepoRef): string => `rr:agg:v1:${ref.owner}/${ref.name}`.toLowerCase();

/** A browser cache of aggregates; every failure (quota, privacy mode, corrupt data) degrades to a miss. */
export interface AggregateCache {
  get(ref: RepoRef): RepoAggregate | null;
  /** Returns false when nothing could be stored. */
  put(ref: RepoRef, aggregate: RepoAggregate): boolean;
}

function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** A localStorage LRU of {@link CACHE_ENTRIES} entries with {@link CACHE_FRESH_MS} freshness. */
export function createCache(storage: Storage | null = defaultStorage(), now: () => number = Date.now): AggregateCache {
  const index = (): string[] => {
    try {
      const keys: unknown = JSON.parse(storage?.getItem(INDEX) ?? '[]');
      return Array.isArray(keys) ? keys.filter((k): k is string => typeof k === 'string') : [];
    } catch {
      return [];
    }
  };
  const touch = (key: string): string[] => [key, ...index().filter((k) => k !== key)];
  return {
    get(ref) {
      const key = cacheKey(ref);
      try {
        const entry = JSON.parse(storage?.getItem(key) ?? 'null') as { savedAt?: number; aggregate?: unknown } | null;
        const age = now() - Number(entry?.savedAt);
        if (!entry || !(age >= 0 && age < CACHE_FRESH_MS)) return null;
        const aggregate = parseAggregate(entry.aggregate);
        storage!.setItem(INDEX, JSON.stringify(touch(key)));
        return aggregate;
      } catch {
        return null;
      }
    },
    put(ref, aggregate) {
      if (!storage) return false;
      const key = cacheKey(ref);
      const keys = touch(key);
      const value = JSON.stringify({ savedAt: now(), aggregate });
      try {
        for (const old of keys.splice(CACHE_ENTRIES)) storage.removeItem(old);
        for (;;) {
          try {
            storage.setItem(key, value);
            storage.setItem(INDEX, JSON.stringify(keys));
            return true;
          } catch {
            // Over quota: drop the least recently used entry and retry; give up when only this one is left.
            if (keys.length <= 1) break;
            storage.removeItem(keys.pop()!);
          }
        }
        storage.removeItem(key);
        storage.setItem(INDEX, JSON.stringify(keys.filter((k) => k !== key)));
      } catch {
        // storage unusable: no cache
      }
      return false;
    },
  };
}
