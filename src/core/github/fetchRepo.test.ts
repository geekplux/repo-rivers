import { describe, expect, it, vi } from 'vitest';
import recorded from '../../../tests/fixtures/github/timeline-sankey.json' with { type: 'json' };
import { EmptyRepo, NotFound } from '../errors.ts';
import { parseAggregate } from '../schema.ts';
import { fetchRepoAggregate, type FetchProgress } from './fetchRepo.ts';

type Recorded = { status: number; headers: Record<string, string>; body: unknown };
const API = 'https://api.github.com';

/** A fake `fetch` serving recorded (or hand-made) responses by path; anything else fails the test. */
function fakeFetch(responses: Record<string, Recorded>) {
  return vi.fn<typeof fetch>(async (url, init) => {
    init?.signal?.throwIfAborted();
    const hit = responses[String(url).replace(API, '')];
    if (!hit) throw new Error(`unexpected request ${String(url)}`);
    return new Response(JSON.stringify(hit.body), { status: hit.status, headers: hit.headers });
  });
}
const ok = (body: unknown, headers: Record<string, string> = {}): Recorded => ({ status: 200, headers, body });
const REF = { owner: 'geekplux', name: 'timeline-sankey' };
const sha = (i: number): string => `c${String(i).padStart(39, '0')}`;
const commit = (i: number) => ({
  sha: sha(i),
  commit: { author: { name: `Dev ${i % 3}`, email: `dev${i % 3}@example.invalid`, date: new Date(Date.UTC(2024, i, 3)).toISOString() } },
  author: { login: `dev${i % 3}`, type: 'User' },
  parents: i === 6 ? [{}, {}] : [{}],
});
const OPTIONS = { budget: recorded.budget, maxBuckets: recorded.maxBuckets };

describe('fetchRepoAggregate with recorded responses (sampled mode)', () => {
  it('builds a valid aggregate and reports monotonic progress up to the planned total', async () => {
    const fetch = fakeFetch(recorded.responses as Record<string, Recorded>);
    const events: FetchProgress[] = [];
    const agg = await fetchRepoAggregate(REF, { ...OPTIONS, fetch, onProgress: (p) => events.push(p) });
    expect(parseAggregate(agg)).toBe(agg);
    expect(agg.source).toMatchObject({ mode: 'sampled', authenticated: false, commitsTotal: 22, requests: 9 });
    expect(agg.source.requests).toBe(fetch.mock.calls.length);
    expect(agg.time.unit).toBe('quarter');
    expect(agg.totals.commits.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(10);
    expect(JSON.stringify(agg)).not.toMatch(/example\.invalid/);
    // Steps: 3 probe requests, then the plan (2B + 2 + details = 16); skipped steps still advance.
    expect(events.map((e) => e.done)).toEqual(events.map((_, i) => i + 1));
    expect(events.slice(3).every((e) => e.total === 16)).toBe(true);
    expect(events.at(-1)).toMatchObject({ done: 16, total: 16 });
  });

  it('stops requesting as soon as the signal aborts', async () => {
    const fetch = fakeFetch(recorded.responses as Record<string, Recorded>);
    const controller = new AbortController();
    const onProgress = (p: FetchProgress): void => void (p.done === 4 && controller.abort());
    const run = fetchRepoAggregate(REF, { ...OPTIONS, fetch, onProgress, signal: controller.signal });
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});

describe('fetchRepoAggregate (full mode and errors)', () => {
  const commits = Array.from({ length: 12 }, (_, i) => commit(11 - i)); // newest first, like GitHub
  const base = '/repos/o/small';
  const responses: Record<string, Recorded> = {
    [base]: ok({ default_branch: 'main', description: 'A small repo' }),
    [`${base}/commits?sha=main&per_page=1`]: ok([commits[0]], { link: `<${API}${base}/commits?per_page=1&page=12>; rel="last"` }),
    [`${base}/commits?sha=main&per_page=1&page=12`]: ok([commits[11]]),
    [`${base}/commits?sha=main&per_page=100&page=1`]: ok(commits),
  };
  for (const c of commits) {
    const dir = Number(c.sha.slice(-2)) < 6 ? 'src' : 'packages/core/src';
    responses[`${base}/commits/${c.sha}`] = ok({ ...c, files: [{ filename: `${dir}/a.ts`, status: 'modified', changes: 10 }] });
  }

  it('reads every non-merge commit of a small repository', async () => {
    const fetch = fakeFetch(responses);
    const agg = await fetchRepoAggregate({ owner: 'o', name: 'small' }, { fetch });
    expect(agg.source).toMatchObject({ mode: 'full', requests: 3 + 1 + 11, commitsSeen: 12, truncatedBuckets: [] });
    expect(agg.totals.commits.reduce((a, b) => a + b, 0)).toBe(11); // the merge is not counted
    expect(agg.paths.prefixes).toEqual(['packages/core/src', 'src']);
    expect(agg.paths.weights.flat().reduce((a, b) => a + b, 0)).toBe(110);
    expect(agg.repo).toMatchObject({ defaultBranch: 'main', headSha: sha(11), description: 'A small repo' });
  });

  it('maps a missing repository and an empty one to typed errors', async () => {
    const missing = fakeFetch({ [base]: { status: 404, headers: {}, body: { message: 'Not Found' } } });
    await expect(fetchRepoAggregate({ owner: 'o', name: 'small' }, { fetch: missing })).rejects.toBeInstanceOf(NotFound);
    const empty = fakeFetch({
      [base]: responses[base]!,
      [`${base}/commits?sha=main&per_page=1`]: { status: 409, headers: {}, body: { message: 'Git Repository is empty.' } },
    });
    await expect(fetchRepoAggregate({ owner: 'o', name: 'small' }, { fetch: empty })).rejects.toBeInstanceOf(EmptyRepo);
  });
});
