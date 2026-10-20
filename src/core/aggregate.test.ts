import { describe, expect, it } from 'vitest';
import { buildAggregate, type AggregateMeta } from './aggregate.ts';
import type { BucketObservation, CommitMeta, FileChange } from './commits.ts';
import { parseAggregate } from './schema.ts';

const ADA = { sha: 'a', date: '2024-01-02T00:00:00Z', parents: 1, login: 'ada', name: 'Ada', email: 'ada@example.com' };
const commit = (over: Partial<CommitMeta> = {}): CommitMeta => ({ ...ADA, ...over });
const file = (path: string, changes: number, over: Partial<FileChange> = {}): FileChange =>
  Object.assign({ path, changes, status: 'modified' as const }, over);
const moved = (path: string, previousPath: string): FileChange => file(path, 0, { status: 'renamed', previousPath });
const obs = (bucket: number, commits: CommitMeta[], files: FileChange[] = [], scale = 1): BucketObservation => {
  return { bucket, commits, files, scale };
};
const SOURCE = { mode: 'full', authenticated: false, commitsTotal: 9, commitsSeen: 9, requests: 3 } as const;
const month = (i: number): string => new Date(Date.UTC(2024, i, 1)).toISOString();
const meta = (buckets: number): AggregateMeta => ({
  repo: { owner: 'o', name: 'r', defaultBranch: 'main', headSha: 'abc' },
  generatedAt: '2026-10-19T00:00:00.000Z',
  source: { ...SOURCE, truncatedBuckets: [], notes: [] },
  time: { unit: 'month', starts: Array.from({ length: buckets }, (_, i) => month(i)), end: month(buckets) },
});

describe('buildAggregate', () => {
  it('excludes merges, hashes emails, flags bots and passes parseAggregate', () => {
    const bot = commit({ login: 'dependabot[bot]', userType: 'Bot' });
    const anon = commit({ login: undefined, name: 'Anon', email: 'x@secret.dev' });
    const agg = buildAggregate([obs(0, [commit(), commit(), commit({ parents: 2 })]), obs(1, [bot, anon])], meta(2));
    expect(parseAggregate(agg)).toBe(agg);
    expect(agg.totals.commits).toEqual([2, 2]);
    expect(agg.contributors.people.map((p) => [p.label, p.bot])).toEqual([
      ['ada', false],
      ['Anon', false],
      ['dependabot[bot]', true],
    ]);
    expect(agg.contributors.commits).toEqual([[2, 0], [0, 1], [0, 1]]);
    expect(JSON.stringify(agg)).not.toMatch(/example\.com|secret\.dev/);
  });

  it('drops ignore-listed files and caps each file at 2,000 lines per bucket', () => {
    const noise = ['pnpm-lock.yaml', 'dist/x.js', 'src/a.min.js', 'src/a.js.map', 'src/__snapshots__/a.snap'];
    const real = [file('src/a.ts', 1500), file('src/b.ts', 10), file('README.md', 3)];
    const first = [...noise.map((p) => file(p, 5000)), ...real];
    const agg = buildAggregate(
      [obs(0, [], first), obs(0, [], [file('src/a.ts', 1500)]), obs(1, [], [file('src/a.ts', 1500)])],
      meta(2),
    );
    expect(agg.paths.prefixes).toEqual(['', 'src']);
    expect(agg.paths.weights).toEqual([[3, 0], [2010, 1500]]);
  });

  it('turns cross-prefix renames into transfers (counted in files)', () => {
    const files = ['a', 'b'].map((f) => moved(`pkg/core/src/${f}.ts`, `src/${f}.ts`));
    files.push(moved('src/c.ts', 'src/d.ts')); // same prefix: no transfer
    const agg = buildAggregate([obs(1, [], files)], meta(2));
    expect(agg.paths.prefixes).toEqual(['pkg/core/src', 'src']);
    expect(agg.paths.transfers).toEqual([{ from: 1, to: 0, bucket: 1, files: 2 }]);
    expect(() => parseAggregate(agg)).not.toThrow();
  });

  it('extrapolates commit counts by the scale factor, not file weights', () => {
    const commits = [commit(), commit(), commit({ login: 'bo' })];
    const agg = buildAggregate([obs(0, commits, [file('a/x.ts', 10)], 2.5)], meta(1));
    expect(agg.totals.commits).toEqual([8]); // 3 x 2.5 = 7.5, rounded
    expect(agg.contributors.commits).toEqual([[5], [3]]); // 5 and 2.5, rounded
    expect(agg.paths.weights).toEqual([[10]]); // files already cover the whole bucket
  });

  it('rejects observations outside the time range', () => {
    expect(() => buildAggregate([obs(2, [commit()])], meta(2))).toThrow(RangeError);
  });
});
