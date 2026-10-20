import { describe, expect, it } from 'vitest';
import { MAX_PEOPLE, MAX_PREFIXES, OTHERS_ID, buildAggregate, type AggregateMeta } from './aggregate.ts';
import { TooLittleHistory, assertEnoughHistory } from './errors.ts';
import { selectView } from './view.ts';
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

  it('rejects observations outside the time range and invalid scales', () => {
    expect(() => buildAggregate([obs(2, [commit()])], meta(2))).toThrow(RangeError);
    for (const scale of [0.5, Number.NaN, Infinity]) {
      expect(() => buildAggregate([obs(0, [commit()], [], scale)], meta(1))).toThrow(/bad scale/);
    }
  });

  it('rounds scaled counts by largest remainder so people sum to the column total', () => {
    const people = ['a', 'b', 'c'].map((login) => commit({ login }));
    const agg = buildAggregate([obs(0, people, [], 2.5), obs(1, people.slice(0, 2), [], 1.7)], meta(2));
    expect(agg.totals.commits).toEqual([8, 3]); // 7.5 -> 8, 3.4 -> 3
    expect(agg.contributors.commits).toEqual([[3, 2], [3, 1], [2, 0]]);
  });

  it(`caps prefixes at ${MAX_PREFIXES}, rolling the lightest deep prefixes into their parents`, () => {
    const files = Array.from({ length: 70 }, (_, i) => file(`pkg/m${String(i).padStart(2, '0')}/x.ts`, 100 + i));
    files.push(file('docs/a.md', 1), moved('docs/x.ts', 'pkg/m00/x.ts'), moved('pkg/m69/y.ts', 'docs/y.ts'));
    const agg = buildAggregate([obs(0, [], files)], meta(1));
    expect(agg.paths.prefixes).toHaveLength(MAX_PREFIXES);
    expect(agg.paths.prefixes).toContain('pkg');
    expect(agg.paths.prefixes).not.toContain('pkg/m00'); // lightest rolled up first
    expect(agg.paths.prefixes).toContain('pkg/m69'); // heaviest kept
    const total = agg.paths.weights.flat().reduce((a, b) => a + b, 0);
    expect(total).toBe(1 + files.slice(0, 70).reduce((a, f) => a + f.changes, 0));
    const name = (i: number): string | undefined => agg.paths.prefixes[i];
    expect(agg.paths.transfers.map((t) => [name(t.from), name(t.to), t.files])).toEqual([
      ['docs', 'pkg/m69', 1],
      ['pkg', 'docs', 1],
    ]);
    expect(() => parseAggregate(agg)).not.toThrow();
  });

  it(`caps people at ${MAX_PEOPLE}, folding the rest into ${OTHERS_ID}, which the view shows as "other"`, () => {
    const commits = Array.from({ length: 35 }, (_, i) =>
      Array.from({ length: 40 - i }, () => commit({ login: `dev${String(i).padStart(2, '0')}` })),
    ).flat();
    const agg = buildAggregate([obs(0, commits)], meta(1));
    const { people, commits: counts } = agg.contributors;
    expect(people).toHaveLength(MAX_PEOPLE);
    expect(people.at(-1)).toEqual({ id: OTHERS_ID, label: 'others', bot: false });
    expect(counts.at(-1)).toEqual([11 + 10 + 9 + 8 + 7 + 6]); // dev29..dev34
    expect(counts.flat().reduce((a, b) => a + b, 0)).toBe(agg.totals.commits[0]);
    const view = selectView(agg, { dimension: 'contributors', topN: 50 });
    expect(view.rivers.map((r) => r.id)).not.toContain(`p:${OTHERS_ID}`);
    expect(view.rivers.at(-1)).toMatchObject({ id: 'other', values: [51] });
  });
});

describe('too little history', () => {
  it('needs at least 10 commits over at least 3 buckets', () => {
    expect(() => assertEnoughHistory(9, 24)).toThrow(TooLittleHistory);
    expect(() => assertEnoughHistory(500, 2)).toThrow(TooLittleHistory);
    expect(() => assertEnoughHistory(10, 3)).not.toThrow();
    expect(() => assertEnoughHistory(9, 24)).toThrow(expect.objectContaining({ code: 'too_little' }));
  });
});
