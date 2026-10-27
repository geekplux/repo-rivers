import { bucketStarts, chooseUnit, nextStart } from '../buckets.ts';
import { MIN_BUCKETS, RateLimited, assertEnoughHistory } from '../errors.ts';
import type { BucketUnit } from '../schema.ts';

/** Requests spent by the probe: repository, head commit (+ count), first commit. */
export const PROBE_REQUESTS = 3;
/** Default budgets: 55 of the 60/h unauthenticated quota (5 kept as headroom), 600 with a token. */
export const BUDGET = { unauthenticated: 55, token: 600 } as const;
/** Default bucket caps: 24 unauthenticated, 48 with a token. */
export const MAX_BUCKETS = { unauthenticated: 24, token: 48 } as const;
/** At most this many commit details are read per truncated bucket. */
export const DETAILS_PER_BUCKET = 10;
/** Requests reserved for the move-finder (≤ 6 per new module) when the budget has room after details. */
export const MOVE_REQUESTS = 24;

/** What the probe found, plus the limits to plan within. Times are UTC ms. */
export interface PlanInput {
  commits: number;
  first: number;
  last: number;
  budget: number;
  maxBuckets: number;
  /** Quota left after the probe (`x-ratelimit-remaining`); omit to plan on the budget alone. */
  remaining?: number;
  resetAt?: string;
}

/**
 * How to fetch. `full`: list every commit (`listPages` pages of 100) and read each non-merge commit.
 * `sampled`: B−1 boundary lookups and B compares (2B+2 requests with the probe), then up to `details`
 * commit reads to estimate files beyond the 300-file compare cap. `windowed`: even yearly buckets would
 * exceed the cap, so `starts` keeps only the most recent years and one extra boundary lookup finds the
 * base of bucket 0 (2B+3 requests); earlier history is not shown. Sampled plans reserve up to `moves`
 * requests (plus unused detail reads) for the move-finder. A full plan whose history needs more yearly
 * buckets than the cap is windowed to the latest years too. `requests` is the planned maximum, probe included.
 */
export interface FetchPlan {
  mode: 'full' | 'sampled';
  unit: BucketUnit;
  starts: number[];
  end: number;
  listPages: number;
  details: number;
  moves: number;
  requests: number;
  windowed: boolean;
}

/**
 * Chooses full or sampled mode and the bucket unit so that the whole fetch stays within
 * `min(budget, probe + remaining)` requests. Pure. Throws `TooLittleHistory` (fewer than 10 commits or 3
 * buckets) and `RateLimited` only when the remaining quota does not fit even three buckets. Histories too long
 * for the cap in yearly buckets are windowed to the most recent years.
 */
export function planFetch(input: PlanInput): FetchPlan {
  const { commits, first, last, maxBuckets } = input;
  const available = Math.min(input.budget, PROBE_REQUESTS + (input.remaining ?? Infinity));
  const buckets = (cap: number): Pick<FetchPlan, 'unit' | 'starts' | 'end'> => {
    const unit = chooseUnit(first, last, cap);
    const starts = bucketStarts(first, last, unit);
    return { unit, starts, end: nextStart(starts.at(-1)!, unit) };
  };
  assertEnoughHistory(commits, buckets(maxBuckets).starts.length);
  const listPages = Math.ceil(commits / 100);
  const full = PROBE_REQUESTS + listPages + commits;
  if (full <= available) {
    const all = buckets(maxBuckets);
    const windowed = all.starts.length > maxBuckets;
    if (windowed) all.starts = all.starts.slice(-maxBuckets);
    return { mode: 'full', ...all, listPages, details: 0, moves: 0, requests: full, windowed };
  }
  const cap = Math.min(maxBuckets, Math.floor((available - 2) / 2));
  const sampled = buckets(Math.max(cap, 1));
  const windowed = sampled.starts.length > cap;
  if (windowed) {
    // Even yearly buckets exceed the cap: keep the latest years; bucket 0 needs its own boundary lookup.
    const keep = Math.max(0, Math.min(maxBuckets, Math.floor((available - 3) / 2)));
    sampled.starts = sampled.starts.slice(sampled.starts.length - keep);
  }
  const B = sampled.starts.length;
  if (B < MIN_BUCKETS) {
    const resetAt = input.resetAt ?? new Date(Date.now() + 3_600_000).toISOString();
    throw new RateLimited(resetAt, `Too little GitHub quota left to sample this history; it resets at ${resetAt}`);
  }
  const base = 2 * B + 2 + (windowed ? 1 : 0);
  const details = Math.max(0, Math.min(available - base, B * DETAILS_PER_BUCKET));
  const moves = Math.max(0, Math.min(available - base - details, MOVE_REQUESTS));
  return { mode: 'sampled', ...sampled, listPages: 0, details, moves, requests: base + details + moves, windowed };
}
