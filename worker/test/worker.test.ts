import { afterEach, describe, expect, it, vi } from 'vitest';
import recorded from '../../tests/fixtures/github/timeline-sankey.json' with { type: 'json' };
import sample from '../../src/samples/express.json' with { type: 'json' };
import { parseAggregate, type RepoAggregate } from '../../src/core/schema.ts';
import type { StreamLine } from '../src/http.ts';
import { handle, type WorkerEnv } from '../src/index.ts';
import { FRESH_MS, TTL_SECONDS, cacheKey, type CacheEntry } from '../src/kv.ts';
import { USER_AGENT, validRepo, type RouteDeps } from '../src/repoRoute.ts';

type Recorded = { status: number; headers: Record<string, string>; body: unknown };
const API = 'https://api.github.com';
const NOW = Date.UTC(2026, 9, 20, 12);
const HOUR = 3_600_000;
const TOKEN = 'fake-token-for-tests-0123456789';
const REPO = '/api/repo/geekplux/timeline-sankey';
const RECORDED = recorded.responses as Record<string, Recorded>;
const HEAD = '/repos/geekplux/timeline-sankey/commits?sha=main&per_page=1';

/** A Map-backed KV namespace that records every write. */
function fakeKv(initial: Record<string, unknown> = {}) {
  const data = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  const puts: { key: string; value: string; options?: { expirationTtl?: number } }[] = [];
  return {
    data,
    puts,
    get: async (key: string) => data.get(key) ?? null,
    put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
      puts.push({ key, value, options });
      data.set(key, value);
    },
  };
}

/** A fake `fetch` answering from `responses` by API path; any other request fails the test. */
function fakeFetch(responses: Record<string, Recorded>) {
  return vi.fn<typeof fetch>(async (url, init) => {
    init?.signal?.throwIfAborted();
    const hit = responses[String(url).replace(API, '')];
    if (!hit) throw new Error(`unexpected request ${String(url)}`);
    const body = hit.status === 304 ? null : JSON.stringify(hit.body);
    return new Response(body, { status: hit.status, headers: hit.headers });
  });
}

const headerOf = (args: Parameters<typeof fetch>, name: string): string | undefined =>
  new Headers(args[1]?.headers).get(name) ?? undefined;

/** Runs one request through the Worker and waits for the stream and its background work to finish. */
async function call(path: string, env: Partial<WorkerEnv>, deps: RouteDeps = {}, init?: RequestInit) {
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => void pending.push(p) };
  const res = await handle(new Request(`http://local${path}`, init), env as WorkerEnv, ctx, { now: () => NOW, ...deps });
  const text = await res.text();
  await Promise.all(pending);
  const lines = res.headers.get('content-type')?.includes('ndjson') ? text.trim().split('\n').map((l) => JSON.parse(l) as StreamLine) : [];
  return { res, text, lines };
}

const entry = (fetchedAt: number, extra: Partial<CacheEntry> = {}): CacheEntry => ({
  aggregate: parseAggregate(structuredClone(sample)) as RepoAggregate,
  headSha: sample.repo.headSha,
  etag: 'W/"cached-head"',
  fetchedAt,
  ...extra,
});
const KEY = cacheKey('geekplux', 'timeline-sankey');
const OPTS = { budget: recorded.budget, maxBuckets: recorded.maxBuckets };

afterEach(() => vi.restoreAllMocks());

describe('routing and validation', () => {
  it.each(['/api/repo/bad%20owner/x', '/api/repo/under_score/x', `/api/repo/${'o'.repeat(40)}/x`, '/api/repo/o/n%2Fm', '/api/repo/%E0%A4%A/x'])(
    'answers 400 without touching GitHub or KV for %s',
    async (path) => {
      const gh = fakeFetch({});
      const kv = fakeKv();
      const { res, text } = await call(path, { RIVERS_KV: kv as never }, { fetch: gh });
      expect(res.status).toBe(400);
      expect(JSON.parse(text)).toMatchObject({ type: 'error', code: 'invalid' });
      expect(gh).not.toHaveBeenCalled();
      expect(kv.puts).toEqual([]);
    },
  );

  it('rejects the dot names that URLs would normalise away anyway', () => {
    expect(validRepo('a', '.')).toBe(false);
    expect(validRepo('a', '..')).toBe(false);
    expect(validRepo('a', '.github')).toBe(true);
  });

  it('answers 404 for unknown API routes and 405 for non-GET methods', async () => {
    expect((await call('/api/nope', {})).res.status).toBe(404);
    const post = await call(REPO, {}, {}, { method: 'POST' });
    expect(post.res.status).toBe(405);
    expect(post.res.headers.get('allow')).toBe('GET');
  });

  it('answers 429 with resetAt when the per-IP limit binding refuses', async () => {
    const API_LIMIT = { limit: vi.fn<() => Promise<{ success: boolean }>>(async () => ({ success: false })) };
    const { res, text } = await call('/api/health', { API_LIMIT } as never);
    expect(res.status).toBe(429);
    expect(JSON.parse(text)).toMatchObject({ code: 'too_many_requests', resetAt: expect.any(String) });
  });
});

describe('/api/health', () => {
  it.each([[TOKEN, true], [undefined, false], ['', false]] as const)('reports token: boolean only (token %#)', async (token, has) => {
    const { res, text } = await call('/api/health', { GITHUB_TOKEN: token });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(JSON.parse(text)).toEqual({ ok: true, ai: false, token: has });
    expect(text).not.toContain('fake-token');
  });
});

describe('GET /api/repo/:owner/:name cache paths', () => {
  it('serves a KV entry under 24 h old with no GitHub request', async () => {
    const gh = fakeFetch({});
    const kv = fakeKv({ [KEY]: entry(NOW - FRESH_MS + HOUR) });
    const { res, lines } = await call(REPO, { RIVERS_KV: kv as never }, { fetch: gh });
    expect(res.headers.get('content-type')).toContain('application/x-ndjson');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ type: 'result', cache: 'hit', aggregate: { repo: { name: 'express' } } });
    expect(gh).not.toHaveBeenCalled();
    expect(kv.puts).toEqual([]);
  });

  it('treats the owner/name case-insensitively for the cache key', async () => {
    const gh = fakeFetch({});
    const kv = fakeKv({ [KEY]: entry(NOW - HOUR) });
    const { lines } = await call('/api/repo/GeekPlux/Timeline-Sankey', { RIVERS_KV: kv as never }, { fetch: gh });
    expect(lines[0]).toMatchObject({ cache: 'hit' });
    expect(gh).not.toHaveBeenCalled();
  });

  it('revalidates a stale entry with If-None-Match; a 304 extends freshness with one request', async () => {
    const old = entry(NOW - FRESH_MS - HOUR);
    const head = `/repos/${old.aggregate.repo.owner}/${old.aggregate.repo.name}/commits?sha=${old.aggregate.repo.defaultBranch}&per_page=1`;
    const gh = fakeFetch({ [head]: { status: 304, headers: { 'x-ratelimit-remaining': '59' }, body: null } });
    const kv = fakeKv({ [KEY]: old });
    const { lines } = await call(REPO, { RIVERS_KV: kv as never }, { fetch: gh });
    expect(gh).toHaveBeenCalledTimes(1);
    expect(headerOf(gh.mock.calls[0]!, 'If-None-Match')).toBe('W/"cached-head"');
    expect(lines).toEqual([expect.objectContaining({ type: 'result', cache: 'revalidated' })]);
    expect(kv.puts).toHaveLength(1);
    const written = JSON.parse(kv.puts[0]!.value) as CacheEntry;
    expect(written).toMatchObject({ fetchedAt: NOW, etag: 'W/"cached-head"', headSha: old.headSha });
    expect(kv.puts[0]!.options).toEqual({ expirationTtl: TTL_SECONDS });
    // The extended entry is now fresh: the next call makes no request at all.
    const again = await call(REPO, { RIVERS_KV: kv as never }, { fetch: gh });
    expect(again.lines[0]).toMatchObject({ cache: 'hit' });
    expect(gh).toHaveBeenCalledTimes(1);
  });

  it('serves the stale entry when revalidation fails (GitHub down)', async () => {
    const gh = vi.fn<typeof fetch>(async () => new Response('{"message":"boom"}', { status: 502 }));
    const kv = fakeKv({ [KEY]: entry(NOW - 2 * FRESH_MS) });
    const { lines } = await call(REPO, { RIVERS_KV: kv as never }, { fetch: gh });
    expect(lines).toEqual([expect.objectContaining({ type: 'result', cache: 'stale' })]);
    expect(kv.puts).toEqual([]);
  });

  it('re-fetches when the stale entry is for an older head', async () => {
    const gh = fakeFetch(RECORDED);
    const stale = entry(NOW - 2 * FRESH_MS, { headSha: 'old', aggregate: { ...entry(0).aggregate, repo: { ...recordedRepo(), headSha: 'old' } } });
    const kv = fakeKv({ [KEY]: stale });
    const { lines } = await call(REPO, { RIVERS_KV: kv as never }, { ...OPTS, fetch: gh });
    expect(headerOf(gh.mock.calls[0]!, 'If-None-Match')).toBe('W/"cached-head"');
    expect(lines.at(-1)).toMatchObject({ type: 'result', cache: 'miss', aggregate: { repo: { name: 'timeline-sankey' } } });
  });

  it('on a miss streams progress lines, then the result, and writes KV with the head ETag', async () => {
    const gh = fakeFetch(RECORDED);
    const kv = fakeKv();
    const { lines } = await call(REPO, { RIVERS_KV: kv as never }, { ...OPTS, fetch: gh });
    const progress = lines.slice(0, -1);
    expect(progress.length).toBeGreaterThan(3);
    expect(progress.every((l) => l.type === 'progress')).toBe(true);
    expect(progress.map((l) => (l.type === 'progress' ? l.done : -1))).toEqual(progress.map((_, i) => i + 1));
    const last = lines.at(-1)!;
    expect(last).toMatchObject({ type: 'result', cache: 'miss' });
    const agg = last.type === 'result' ? last.aggregate : undefined;
    expect(parseAggregate(agg)).toEqual(agg);
    expect(agg?.source).toMatchObject({ authenticated: false, requests: gh.mock.calls.length });
    expect(gh.mock.calls.every((c) => headerOf(c, 'Authorization') === undefined)).toBe(true);
    expect(gh.mock.calls.every((c) => headerOf(c, 'User-Agent') === USER_AGENT)).toBe(true);
    expect(kv.puts).toHaveLength(1);
    expect(kv.puts[0]).toMatchObject({ key: KEY, options: { expirationTtl: TTL_SECONDS } });
    const written = JSON.parse(kv.puts[0]!.value) as CacheEntry;
    expect(written).toMatchObject({ headSha: agg?.repo.headSha, etag: RECORDED[HEAD]!.headers.etag, fetchedAt: NOW });
  });

  it('turns a GitHub rate limit (403) into an NDJSON github_rate_limited error with resetAt and caches nothing', async () => {
    const reset = 1_792_466_128;
    const gh = vi.fn<typeof fetch>(async () =>
      new Response('{"message":"API rate limit exceeded for 203.0.113.9."}', {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) },
      }),
    );
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const kv = fakeKv();
    const { res, lines } = await call(REPO, { RIVERS_KV: kv as never }, { fetch: gh });
    expect(res.status).toBe(200);
    expect(lines.at(-1)).toEqual({ type: 'error', code: 'github_rate_limited', message: expect.any(String), resetAt: new Date(reset * 1000).toISOString() });
    expect(kv.puts).toEqual([]);
  });

  it('turns a GitHub 429 (secondary limit, retry-after) into github_rate_limited too', async () => {
    const gh = vi.fn<typeof fetch>(async () => new Response('{"message":"Too many requests"}', { status: 429, headers: { 'retry-after': '120' } }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { lines } = await call(REPO, { RIVERS_KV: fakeKv() as never }, { fetch: gh });
    expect(lines.at(-1)).toMatchObject({ type: 'error', code: 'github_rate_limited', resetAt: expect.any(String) });
  });

  it('maps a missing repository to not_found', async () => {
    const gh = vi.fn<typeof fetch>(async () => new Response('{"message":"Not Found"}', { status: 404 }));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { lines } = await call('/api/repo/o/missing', { RIVERS_KV: fakeKv() as never }, { fetch: gh });
    expect(lines.at(-1)).toMatchObject({ type: 'error', code: 'not_found' });
  });
});

describe('GITHUB_TOKEN handling', () => {
  it('sends the token only when set and never echoes it in responses or logs', async () => {
    const logs: unknown[] = [];
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logs.push(...args));
    }
    const withToken = fakeFetch(RECORDED);
    const ok = await call(REPO, { RIVERS_KV: fakeKv() as never, GITHUB_TOKEN: TOKEN }, { ...OPTS, fetch: withToken });
    expect(withToken.mock.calls.length).toBeGreaterThan(0);
    expect(withToken.mock.calls.every((c) => headerOf(c, 'Authorization') === `Bearer ${TOKEN}`)).toBe(true);
    expect(ok.lines.at(-1)).toMatchObject({ type: 'result', aggregate: { source: { authenticated: true } } });
    expect(ok.text).not.toContain(TOKEN);

    // An upstream error whose message contains the token (worst case) is redacted before it is streamed.
    const leaky = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ message: `bad credentials ${TOKEN}` }), { status: 401 }));
    const failed = await call(REPO, { RIVERS_KV: fakeKv() as never, GITHUB_TOKEN: TOKEN }, { fetch: leaky });
    expect(failed.lines.at(-1)).toMatchObject({ type: 'error', code: 'upstream' });
    expect(failed.text).not.toContain(TOKEN);
    expect(failed.text).toContain('[redacted]');
    expect(JSON.stringify(logs.map(String))).not.toContain(TOKEN);

    const without = fakeFetch(RECORDED);
    await call(REPO, { RIVERS_KV: fakeKv() as never, GITHUB_TOKEN: '' }, { ...OPTS, fetch: without });
    expect(without.mock.calls.every((c) => headerOf(c, 'Authorization') === undefined)).toBe(true);
  });
});

/** The `repo` block an aggregate of the recorded repository would carry. */
function recordedRepo(): RepoAggregate['repo'] {
  const head = RECORDED[HEAD]!.body as { sha: string }[];
  return { owner: 'geekplux', name: 'timeline-sankey', defaultBranch: 'main', headSha: head[0]!.sha };
}
