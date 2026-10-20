import { describe, expect, it } from 'vitest';
import { RateLimited, TooLittleHistory } from '../errors.ts';
import { planFetch, type PlanInput } from './plan.ts';

const DAY = 86_400_000;
const T0 = Date.UTC(2011, 2, 15);
const SPANS = { '2 months': 61 * DAY, '3 years': 3 * 365 * DAY, '15 years': 15 * 365 * DAY };
const input = (commits: number, span: number, over: Partial<PlanInput> = {}): PlanInput => {
  return { commits, first: T0, last: T0 + span, budget: 55, maxBuckets: 24, ...over };
};

describe('planFetch', () => {
  for (const [name, span] of Object.entries(SPANS)) {
    it.each([10, 500, 10_000, 200_000])(`stays within budgets for %i commits over ${name}`, (commits) => {
      const free = planFetch(input(commits, span));
      expect(free.requests).toBeLessThanOrEqual(55);
      expect(free.starts.length).toBeLessThanOrEqual(24);
      const token = planFetch(input(commits, span, { budget: 600, maxBuckets: 48 }));
      expect(token.requests).toBeLessThanOrEqual(600);
      expect(token.starts.length).toBeLessThanOrEqual(48);
      const planned = free.mode === 'sampled' ? 2 * free.starts.length + 2 + free.details : 3 + free.listPages + commits;
      expect(free.requests).toBe(planned);
    });
  }

  it('reads every commit of a small repository (full mode)', () => {
    const plan = planFetch(input(40, SPANS['3 years']));
    expect(plan).toMatchObject({ mode: 'full', listPages: 1, requests: 3 + 1 + 40, unit: 'quarter' });
  });

  it('samples once the full read would not fit', () => {
    const plan = planFetch(input(500, SPANS['3 years']));
    expect(plan).toMatchObject({ mode: 'sampled', unit: 'quarter', listPages: 0 });
    expect(plan.starts).toHaveLength(13);
    expect(plan.details).toBe(55 - (2 * 13 + 2));
  });

  it('shrinks the plan when little quota remains', () => {
    const plenty = planFetch(input(10_000, SPANS['3 years'], { remaining: 52 }));
    const low = planFetch(input(10_000, SPANS['3 years'], { remaining: 15 }));
    expect(low.starts.length).toBeLessThan(plenty.starts.length);
    expect(low.unit).toBe('year');
    expect(low.requests).toBeLessThanOrEqual(3 + 15);
  });

  it('raises RateLimited before fetching when even three buckets do not fit', () => {
    const resetAt = '2026-10-19T23:00:00.000Z';
    const plan = (): unknown => planFetch(input(10_000, SPANS['3 years'], { remaining: 4, resetAt }));
    expect(plan).toThrow(RateLimited);
    expect(plan).toThrow(/2026-10-19T23:00:00.000Z/);
    // A 15-year history needs 16 yearly buckets: 12 remaining requests are not enough.
    expect(() => planFetch(input(10_000, SPANS['15 years'], { remaining: 12 }))).toThrow(RateLimited);
  });

  it('reports too little history (< 10 commits or < 3 buckets)', () => {
    expect(() => planFetch(input(9, SPANS['3 years']))).toThrow(TooLittleHistory);
    expect(() => planFetch(input(50, 6 * DAY))).toThrow(TooLittleHistory);
  });
});
