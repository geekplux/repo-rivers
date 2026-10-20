import type { BucketUnit } from './schema.ts';

const DAY = 86_400_000;
const UNITS: readonly BucketUnit[] = ['week', 'month', 'quarter', 'year'];
const MONTHS = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');

/** Start (UTC ms) of the bucket containing `t`. Weeks start on Monday 00:00 UTC. */
export function startOf(t: number, unit: BucketUnit): number {
  const d = new Date(t);
  const [y, m] = [d.getUTCFullYear(), d.getUTCMonth()];
  if (unit === 'week') return Date.UTC(y, m, d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  if (unit === 'month') return Date.UTC(y, m, 1);
  return unit === 'quarter' ? Date.UTC(y, m - (m % 3), 1) : Date.UTC(y, 0, 1);
}

/** The start of the bucket after the one starting at `start`. */
export function nextStart(start: number, unit: BucketUnit): number {
  if (unit === 'week') return start + 7 * DAY;
  const d = new Date(start);
  const months = unit === 'month' ? 1 : unit === 'quarter' ? 3 : 12;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1);
}

/** Bucket starts (UTC ms) covering `first..last` inclusive; stops early once `limit` is exceeded. */
export function bucketStarts(first: number, last: number, unit: BucketUnit, limit = Infinity): number[] {
  const starts: number[] = [];
  for (let s = startOf(first, unit); s <= last && starts.length <= limit; s = nextStart(s, unit)) starts.push(s);
  return starts;
}

/** The smallest unit (week → month → quarter → year) giving at most `maxBuckets` buckets. */
export function chooseUnit(first: number, last: number, maxBuckets: number): BucketUnit {
  return UNITS.find((u) => bucketStarts(first, last, u, maxBuckets).length <= maxBuckets) ?? 'year';
}

/** Index of the bucket containing `t` (the last start <= t), or -1 if `t` is before the first. */
export function bucketIndex(starts: readonly number[], t: number): number {
  let i = starts.length - 1;
  while (i >= 0 && (starts[i] ?? 0) > t) i--;
  return i;
}

/** Short UTC label: `"6 Jan 2025"`, `"Jan 2025"`, `"Q1 2025"` or `"2025"`. */
export function bucketLabel(start: number, unit: BucketUnit): string {
  const d = new Date(start);
  const [y, m] = [d.getUTCFullYear(), d.getUTCMonth()];
  if (unit === 'week') return `${d.getUTCDate()} ${MONTHS[m]} ${y}`;
  if (unit === 'month') return `${MONTHS[m]} ${y}`;
  return unit === 'quarter' ? `Q${Math.floor(m / 3) + 1} ${y}` : String(y);
}
