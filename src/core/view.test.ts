import { describe, expect, it } from 'vitest';
import type { RepoAggregate } from './schema.ts';
import { selectView, type RiverView } from './view.ts';

const utc = (day: string): string => `${day}T00:00:00.000Z`;
const SOURCE = { mode: 'full', authenticated: false, commitsTotal: 9, commitsSeen: 9, requests: 3 } as const;
const deepFreeze = <T>(o: T): T => {
  Object.values(o as object).forEach((v) => typeof v === 'object' && v !== null && deepFreeze(v));
  return Object.freeze(o);
};

// A small monorepo: src/ moves into packages/core/src during bucket 1.
const AGG: RepoAggregate = deepFreeze({
  schemaVersion: 1,
  repo: { owner: 'o', name: 'mono', defaultBranch: 'main', headSha: 'abc' },
  generatedAt: '2026-10-19T00:00:00.000Z',
  source: { ...SOURCE, truncatedBuckets: [], notes: [] },
  time: { unit: 'month', starts: ['2024-01-01', '2024-02-01', '2024-03-01'].map(utc), end: utc('2024-04-01') },
  totals: { commits: [3, 3, 3] },
  paths: {
    prefixes: ['', 'docs', 'packages/core', 'packages/core/src', 'packages/ui/src', 'src'],
    weights: [[5, 0, 1], [10, 10, 10], [0, 4, 0], [0, 50, 60], [0, 20, 30], [40, 5, 0]],
    transfers: [
      { from: 5, to: 3, bucket: 1, files: 12 },
      { from: 2, to: 3, bucket: 2, files: 1 },
    ],
  },
  contributors: {
    people: [
      { id: 'ada', label: 'ada', bot: false },
      { id: 'renovate[bot]', label: 'renovate[bot]', bot: true },
      { id: 'anon:0badf00d', label: 'Bo', bot: false },
      { id: 'cy', label: 'cy', bot: false },
    ],
    commits: [[2, 1, 1], [1, 1, 1], [0, 1, 0], [0, 0, 1]],
  },
});

const MOVE = { from: 'm:src', bucket: 1, files: 12 };
const ids = (v: RiverView): string[] => v.rivers.map((r) => r.id);
const columns = (v: RiverView): number[] => [0, 1, 2].map((i) => v.rivers.reduce((s, r) => s + (r.values[i] ?? 0), 0));

describe('selectView: modules', () => {
  it.each([
    [1, ['m:packages', 'm:src', 'm:docs', 'm:'], [{ ...MOVE, to: 'm:packages' }]],
    [2, ['m:packages/core', 'm:packages/ui', 'm:src', 'm:docs', 'm:'], [{ ...MOVE, to: 'm:packages/core' }]],
    [3, ['m:packages/core/src', 'm:packages/ui/src', 'm:src', 'm:docs', 'm:', 'm:packages/core'], [
      { ...MOVE, to: 'm:packages/core/src' },
      { from: 'm:packages/core', to: 'm:packages/core/src', bucket: 2, files: 1 },
    ]],
  ] as const)('collapses to depth %i; transfers inside one module disappear', (depth, rivers, transfers) => {
    const v = selectView(AGG, { dimension: 'modules', depth });
    expect(ids(v)).toEqual(rivers);
    expect(v.transfers).toEqual(transfers);
    expect(v.metric).toBe('lines changed');
  });

  it('auto depth is 2 for a monorepo', () => {
    expect(selectView(AGG, { dimension: 'modules' })).toEqual(selectView(AGG, { dimension: 'modules', depth: 2 }));
  });

  it('keeps the top N and sums the rest into a final "other", preserving column totals', () => {
    const v = selectView(AGG, { dimension: 'modules', depth: 3, topN: 2 });
    expect(ids(v)).toEqual(['m:packages/core/src', 'm:packages/ui/src', 'other']);
    expect(v.rivers.at(-1)).toMatchObject({ kind: 'other', values: [55, 19, 11], total: 85, peak: 55 });
    expect(columns(v)).toEqual([55, 89, 101]);
    expect(v.transfers.map((t) => [t.from, t.to, t.bucket, t.files])).toEqual([
      ['other', 'm:packages/core/src', 1, 12],
      ['other', 'm:packages/core/src', 2, 1],
    ]);
  });

  it('labels buckets and root files', () => {
    const v = selectView(AGG, { dimension: 'modules', depth: 1 });
    expect(v.buckets[2]).toEqual({ start: utc('2024-03-01'), end: utc('2024-04-01'), label: 'Mar 2024' });
    expect(v.rivers.find((r) => r.id === 'm:')?.label).toBe('(root files)');
  });
});

describe('selectView: contributors', () => {
  it('drops bots by default; top N folds the rest into "other"', () => {
    const v = selectView(AGG, { dimension: 'contributors', topN: 1 });
    expect(ids(v)).toEqual(['p:ada', 'other']);
    expect(v.metric).toBe('commits');
    expect(columns(v)).toEqual([2, 2, 2]);
    expect(ids(selectView(AGG, { dimension: 'contributors', includeBots: true }))).toContain('p:renovate[bot]');
  });
});

it('selectView is pure: deeply equal output, frozen input untouched', () => {
  const before = JSON.stringify(AGG);
  for (const dimension of ['modules', 'contributors'] as const) {
    expect(selectView(AGG, { dimension, topN: 1 })).toEqual(selectView(AGG, { dimension, topN: 1 }));
  }
  expect(JSON.stringify(AGG)).toBe(before);
});
