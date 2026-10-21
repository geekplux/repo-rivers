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
const at = (id: string, date: string) => ({
  sha: id.padEnd(40, '0'),
  commit: { author: { name: 'Dev', email: 'dev@example.invalid', date } },
  author: { login: 'dev', type: 'User' },
  parents: [{}],
});
const renamed = (to: string, from: string) => ({ filename: to, previous_filename: from, status: 'renamed', changes: 0 });
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

describe('fetchRepoAggregate (windowed long history)', () => {
  const base = '/repos/o/old';
  const head = at('head', '2025-06-01T00:00:00Z');
  const responses: Record<string, Recorded> = {
    [base]: ok({ default_branch: 'main', description: null }),
    [`${base}/commits?sha=main&per_page=1`]: ok([head], { link: `<${API}${base}/commits?per_page=1&page=5000>; rel="last"` }),
    [`${base}/commits?sha=main&per_page=1&page=5000`]: ok([at('first', '1996-01-10T00:00:00Z')]),
  };
  const bounds = [2021, 2022, 2023, 2024, 2025].map((y) => {
    const c = at(`b${y}`, `${y - 1}-12-31T12:00:00Z`);
    responses[`${base}/commits?sha=main&until=${y}-01-01T00:00:00Z&per_page=1`] = ok([c]);
    return c.sha;
  });
  bounds.push(head.sha);
  for (const [i, from] of bounds.slice(0, -1).entries()) {
    const commits = [1, 4, 7, 10].map((m) => at(`y${i}m${m}`, new Date(Date.UTC(2021 + i, m, 2)).toISOString()));
    const files = [{ filename: 'src/a.ts', status: 'modified', changes: 5 }];
    responses[`${base}/compare/${from}...${bounds[i + 1]}`] = ok({ total_commits: 100, commits, files });
  }

  it('compares from a looked-up base for bucket 0 and notes the hidden history', async () => {
    const fetch = fakeFetch(responses);
    const agg = await fetchRepoAggregate({ owner: 'o', name: 'old' }, { fetch, budget: 13, maxBuckets: 5 });
    expect(agg.source).toMatchObject({ mode: 'sampled', requests: 13 });
    expect(agg.time.starts[0]).toBe('2021-01-01T00:00:00.000Z');
    expect(agg.time.starts).toHaveLength(5);
    expect(agg.source.notes.join(' ')).toMatch(/History before 2021 is not shown/);
    expect(fetch.mock.calls.some(([url]) => String(url).includes('compare/first'))).toBe(false);
  });
});

describe('fetchRepoAggregate (truncated compares and the move-finder)', () => {
  // Four quarters of 2024 with 2000 commits: sampled. Buckets 1 and 2 hit the 300-file compare cap; only
  // bucket 2 introduces a folder (`packages/`), which the move-finder traces to a two-page commit of renames out of `src/`.
  const base = '/repos/o/big';
  const head = at('head', '2024-12-20T00:00:00Z');
  const first = at('first', '2024-01-05T00:00:00Z');
  const move = at('move', '2024-08-01T00:00:00Z');
  const responses: Record<string, Recorded> = {
    [base]: ok({ default_branch: 'main', description: null }),
    [`${base}/commits?sha=main&per_page=1`]: ok([head], { link: `<${API}${base}/commits?per_page=1&page=2000>; rel="last"` }),
    [`${base}/commits?sha=main&per_page=1&page=2000`]: ok([first]),
  };
  const bounds = [first.sha];
  for (const month of ['04', '07', '10']) {
    const c = at(`b${month}`, `2024-${month}-01T00:00:00Z`);
    responses[`${base}/commits?sha=main&until=2024-${month}-01T00:00:00Z&per_page=1`] = ok([c]);
    bounds.push(c.sha);
  }
  bounds.push(head.sha);
  const capped = Array.from({ length: 300 }, (_, i) => ({ filename: `lib/f${String(i).padStart(3, '0')}.ts`, status: 'modified', changes: 1 }));
  bounds.slice(0, -1).forEach((from, q) => {
    const commits = Array.from({ length: 20 }, (_, i) => at(`q${q}c${i}`, `2024-${String(3 * q + 2).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}T00:00:00Z`));
    const truncated = q === 1 || q === 2;
    const known = ['src/a.ts', 'lib/f000.ts', 'zz/tail.ts'].map((filename) => ({ filename, status: 'modified', changes: 1 }));
    const files = truncated ? capped : known;
    responses[`${base}/compare/${from}...${bounds[q + 1]}`] = ok({ total_commits: truncated ? 500 : 20, commits, files });
    for (const c of commits) {
      const tail = q === 1 ? 'zz/tail.ts' : 'packages/core/a.ts';
      const detail = [{ filename: 'lib/f001.ts', status: 'modified', changes: 9 }, { filename: tail, status: 'modified', changes: 1 }];
      responses[`${base}/commits/${c.sha}`] = ok({ ...c, files: detail });
    }
  });
  const query = `${base}/commits?sha=main&path=packages&since=2024-07-01T00:00:00Z&until=2024-10-01T00:00:00Z&per_page=1`;
  responses[query] = ok([head], { link: `<${API}${query}&page=3>; rel="last"` });
  responses[`${query}&page=3`] = ok([move]);
  responses[`${base}/commits/${move.sha}`] = ok({ ...move, files: [renamed('packages/core/a.ts', 'src/a.ts')] }, {
    link: `<${API}${base}/commits/${move.sha}?page=2>; rel="last"`,
  });
  responses[`${base}/commits/${move.sha}?page=2`] = ok({ ...move, files: [renamed('packages/core/b.ts', 'src/b.ts')] });

  it('estimates files past the cap from sampled commits and traces the new folder to its renames', async () => {
    const fetch = fakeFetch(responses);
    const events: FetchProgress[] = [];
    const agg = await fetchRepoAggregate({ owner: 'o', name: 'big' }, { fetch, budget: 60, maxBuckets: 4, onProgress: (p) => events.push(p) });
    expect(parseAggregate(agg)).toBe(agg);
    const planned = events.at(-1)!.total;
    expect(planned).toBe(2 * 4 + 2 + 40 + 10); // probe, lookups and compares (2B + 2), details, move reserve
    expect(agg.source).toMatchObject({ mode: 'sampled', truncatedBuckets: [1, 2] });
    // 3 probe + 3 lookups + 4 compares + 2×10 details + 4 move-finder requests.
    expect(agg.source.requests).toBe(34);
    expect(fetch.mock.calls.length).toBe(agg.source.requests);
    expect(agg.source.requests).toBeLessThanOrEqual(planned);
    const weight = (p: string) => agg.paths.weights[agg.paths.prefixes.indexOf(p)];
    // Each sampled commit stands for 500 / 10 = 50 commits: 10 × 1 line × 50; `lib/f001.ts` was already seen.
    expect(weight('zz')).toEqual([1, 500, 0, 1]);
    expect(weight('lib')).toEqual([1, 300, 300, 1]);
    expect(weight('packages/core')).toEqual([0, 0, 500, 0]);
    const name = (i: number) => agg.paths.prefixes[i];
    expect(agg.paths.transfers.map((t) => [name(t.from), name(t.to), t.bucket, t.files])).toEqual([['src', 'packages/core', 2, 2]]);
    expect(agg.source.notes.join(' ')).toMatch(/Renames into 1 new folder were traced/);
  });

  it('skips the move-finder when the plan has no requests left', async () => {
    const fetch = fakeFetch(responses);
    const agg = await fetchRepoAggregate({ owner: 'o', name: 'big' }, { fetch, budget: 30, maxBuckets: 4 });
    expect(agg.source.requests).toBe(30);
    expect(agg.paths.transfers).toEqual([]);
    expect(fetch.mock.calls.some(([url]) => String(url).includes('path='))).toBe(false);
  });
});

describe('fetchRepoAggregate (full mode over a long history)', () => {
  const base = '/repos/o/long';
  const commits = Array.from({ length: 24 }, (_, i) => at(`l${i}`, new Date(Date.UTC(2021 - Math.floor(i / 2), i % 2 ? 0 : 6, 3)).toISOString()));
  const responses: Record<string, Recorded> = {
    [base]: ok({ default_branch: 'main', description: null }),
    [`${base}/commits?sha=main&per_page=1`]: ok([commits[0]], { link: `<${API}${base}/commits?per_page=1&page=24>; rel="last"` }),
    [`${base}/commits?sha=main&per_page=1&page=24`]: ok([commits[23]]),
    [`${base}/commits?sha=main&per_page=100&page=1`]: ok(commits),
  };
  for (const c of commits) responses[`${base}/commits/${c.sha}`] = ok({ ...c, files: [{ filename: 'src/a.ts', status: 'modified', changes: 1 }] });

  it('keeps only the latest maxBuckets years and reads no commits before them', async () => {
    const fetch = fakeFetch(responses);
    const agg = await fetchRepoAggregate({ owner: 'o', name: 'long' }, { fetch, maxBuckets: 5 });
    expect(agg.time.starts).toEqual([2017, 2018, 2019, 2020, 2021].map((y) => `${y}-01-01T00:00:00.000Z`));
    expect(agg.source).toMatchObject({ mode: 'full', commitsSeen: 10, requests: 3 + 1 + 10 });
    expect(agg.totals.commits).toEqual([2, 2, 2, 2, 2]);
    expect(agg.source.notes.join(' ')).toMatch(/History before 2017 is not shown/);
  });
});
