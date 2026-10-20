import { createClient } from '../../src/core/github/client.ts';
import { fetchRepoAggregate } from '../../src/core/github/fetchRepo.ts';
import type { RepoAggregate } from '../../src/core/schema.ts';
import { json, ndjson, type Send } from './http.ts';
import { cacheKey, isFresh, readEntry, writeEntry, type CacheEntry, type KvStore } from './kv.ts';

/** Bindings the route needs. `GITHUB_TOKEN` is optional and is never echoed or logged. */
export interface RepoEnv {
  RIVERS_KV: KvStore;
  GITHUB_TOKEN?: string;
}

/** Injection points for tests; production uses the defaults. */
export interface RouteDeps {
  fetch?: typeof fetch;
  now?: () => number;
  budget?: number;
  maxBuckets?: number;
}

const OWNER = /^[A-Za-z0-9-]{1,39}$/;
const NAME = /^[A-Za-z0-9._-]{1,100}$/;
const API = 'https://api.github.com';

/** True for names GitHub could host (PLAN §4.5); `.` and `..` are not repositories. */
export const validRepo = (owner: string, name: string): boolean =>
  OWNER.test(owner) && NAME.test(name) && name !== '.' && name !== '..';

/** The head-commit request that `fetchRepoAggregate` makes and revalidation repeats. */
const headPath = ({ owner, name, defaultBranch }: RepoAggregate['repo']): string =>
  `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits?sha=${encodeURIComponent(defaultBranch)}&per_page=1`;

/**
 * `GET /api/repo/:owner/:name`: 400 for invalid names, else an NDJSON stream. A KV entry under 24 h old is
 * served as is; an older one is revalidated with one `If-None-Match` request on the head (a 304 or the same
 * head sha extends freshness; a GitHub failure serves the stale entry); otherwise the repository is fetched
 * with progress lines, written to KV and returned.
 */
export function repoRoute(owner: string, name: string, env: RepoEnv, deps: RouteDeps = {}) {
  if (!validRepo(owner, name)) {
    return { response: json({ type: 'error', code: 'invalid', message: 'Not a valid GitHub owner/name' }, 400), done: Promise.resolve() };
  }
  const token = env.GITHUB_TOKEN || undefined;
  const now = deps.now ?? Date.now;
  const doFetch = deps.fetch ?? globalThis.fetch.bind(globalThis);
  const key = cacheKey(owner, name);
  const store = async (entry: CacheEntry): Promise<void> => {
    await writeEntry(env.RIVERS_KV, key, entry).catch(() => console.error('KV write failed'));
  };

  async function revalidate(cached: CacheEntry, send: Send, signal: AbortSignal): Promise<boolean> {
    try {
      const gh = createClient({ token, fetch: doFetch, signal });
      const res = await gh.get<{ sha: string }[]>(headPath(cached.aggregate.repo), cached.etag);
      if (res.status !== 304 && res.data[0]?.sha !== cached.headSha) return false;
      await store({ ...cached, etag: res.etag ?? cached.etag, fetchedAt: now() });
      await send({ type: 'result', cache: 'revalidated', aggregate: cached.aggregate });
    } catch (e) {
      if (signal.aborted) throw e;
      await send({ type: 'result', cache: 'stale', aggregate: cached.aggregate });
    }
    return true;
  }

  return ndjson(async (send, signal) => {
    const cached = await readEntry(env.RIVERS_KV, key);
    if (cached && isFresh(cached, now())) return send({ type: 'result', cache: 'hit', aggregate: cached.aggregate });
    if (cached && (await revalidate(cached, send, signal))) return;
    const etags = new Map<string, string>();
    const recording: typeof fetch = async (input, init) => {
      const res = await doFetch(input, init);
      const etag = res.headers.get('etag');
      if (etag) etags.set(String(input), etag);
      return res;
    };
    const aggregate = await fetchRepoAggregate({ owner, name }, {
      token,
      fetch: recording,
      signal,
      budget: deps.budget,
      maxBuckets: deps.maxBuckets,
      onProgress: (p) => void send({ type: 'progress', ...p }),
    });
    const etag = etags.get(API + headPath(aggregate.repo));
    await store({ aggregate, headSha: aggregate.repo.headSha, ...(etag ? { etag } : {}), fetchedAt: now() });
    await send({ type: 'result', cache: 'miss', aggregate });
  }, token);
}
