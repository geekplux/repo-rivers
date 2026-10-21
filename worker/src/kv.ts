import { parseAggregate, type RepoAggregate } from '../../src/core/schema.ts';

/** The subset of a KV namespace the Worker uses (lets tests pass a Map-backed fake). */
export interface KvStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/** A cached aggregate plus what is needed to revalidate it with one conditional request. */
export interface CacheEntry {
  aggregate: RepoAggregate;
  headSha: string;
  /** ETag of the head-commit request (`commits?sha=<branch>&per_page=1`), sent as `If-None-Match`. */
  etag?: string;
  /** UTC ms of the last fetch or successful revalidation. */
  fetchedAt: number;
}

/** Entries younger than this are served without asking GitHub. */
export const FRESH_MS = 24 * 3_600_000;
/** KV drops entries this long after their last write. */
export const TTL_SECONDS = 30 * 86_400;

/** `agg:v1:{owner}/{name}`, lowercased (GitHub names are case-insensitive). */
export const cacheKey = (owner: string, name: string): string => `agg:v1:${owner}/${name}`.toLowerCase();

/** True while `entry` is under {@link FRESH_MS} old. */
export const isFresh = (entry: CacheEntry, now: number): boolean => now - entry.fetchedAt < FRESH_MS;

/** Reads an entry; anything unparsable (old schema, corrupt) counts as a miss. */
export async function readEntry(kv: KvStore, key: string): Promise<CacheEntry | null> {
  const raw = await kv.get(key);
  if (raw === null) return null;
  try {
    const entry = JSON.parse(raw) as CacheEntry;
    parseAggregate(entry.aggregate);
    return typeof entry.headSha === 'string' && Number.isFinite(entry.fetchedAt) ? entry : null;
  } catch {
    return null;
  }
}

/** Writes an entry with a {@link TTL_SECONDS} expiry. */
export function writeEntry(kv: KvStore, key: string, entry: CacheEntry): Promise<void> {
  return kv.put(key, JSON.stringify(entry), { expirationTtl: TTL_SECONDS });
}
