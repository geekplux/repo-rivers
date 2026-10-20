import { describe, expect, it } from 'vitest';
import { bucketIndex, bucketLabel, bucketStarts, chooseUnit, startOf } from './buckets.ts';

const t = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);
const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

describe('chooseUnit', () => {
  const first = t('2024-01-01'); // a Monday
  it.each([
    ['2024-06-16', 'week'], // 24 weeks
    ['2024-06-17', 'month'], // 25 weeks
    ['2025-12-31', 'month'], // 24 months
    ['2026-01-01', 'quarter'], // 25 months
    ['2029-12-31', 'quarter'], // 24 quarters
    ['2030-01-01', 'year'], // 25 quarters
    ['2060-01-01', 'year'], // more than 24 years still falls back to years
  ])('up to %s with maxBuckets 24 -> %s', (last, unit) => {
    expect(chooseUnit(first, t(last), 24)).toBe(unit);
  });
  it('allows more buckets with a token budget', () => {
    expect(chooseUnit(first, t('2024-11-24'), 48)).toBe('week');
  });
});

describe('UTC weeks start on Monday', () => {
  it('across a year boundary', () => {
    expect(iso(startOf(t('2024-12-31'), 'week'))).toBe('2024-12-30');
    expect(iso(startOf(Date.parse('2025-01-05T23:59:59Z'), 'week'))).toBe('2024-12-30');
    expect(iso(startOf(t('2025-01-06'), 'week'))).toBe('2025-01-06');
    const starts = bucketStarts(t('2024-12-25'), t('2025-01-08'), 'week');
    expect(starts.map(iso)).toEqual(['2024-12-23', '2024-12-30', '2025-01-06']);
    expect(bucketIndex(starts, t('2025-01-01'))).toBe(1);
    expect(bucketIndex(starts, t('2024-12-01'))).toBe(-1);
    expect(bucketLabel(starts[1]!, 'week')).toBe('30 Dec 2024');
  });
  it('labels and aligns quarters and years', () => {
    expect(iso(startOf(t('2024-08-15'), 'quarter'))).toBe('2024-07-01');
    expect(bucketLabel(t('2024-07-01'), 'quarter')).toBe('Q3 2024');
    expect(bucketLabel(t('2024-01-01'), 'year')).toBe('2024');
    expect(bucketLabel(t('2024-02-01'), 'month')).toBe('Feb 2024');
  });
});
