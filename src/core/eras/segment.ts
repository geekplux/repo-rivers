/**
 * Deterministic era boundaries (docs/PLAN.md §4.6): an optimal partition of the buckets, by dynamic
 * programming, into k contiguous segments that minimises the within-segment variance of each module's share
 * of activity plus the activity level. The model never chooses boundaries.
 */
import type { RepoAggregate } from '../schema.ts';
import { selectView, type RiverView } from '../view.ts';

/** Buckets `start..end`, inclusive. */
export interface Segment {
  start: number;
  end: number;
}

/** `k = clamp(round(B / 8), 3, 6)`, never more than `B`. */
export const eraCount = (buckets: number): number => Math.min(buckets, Math.max(3, Math.min(6, Math.round(buckets / 8))));

/** Per bucket: each river's share of the bucket, then `log1p(total) / max log1p(total)` (activity, 0..1). */
export function eraFeatures(view: RiverView): number[][] {
  const totals = view.buckets.map((_, i) => view.rivers.reduce((s, r) => s + (r.values[i] ?? 0), 0));
  const top = Math.max(...totals.map((t) => Math.log1p(t))) || 1;
  return totals.map((t, i) => [...view.rivers.map((r) => (t > 0 ? (r.values[i] ?? 0) / t : 0)), Math.log1p(t) / top]);
}

/**
 * Splits `features` (one vector per bucket) into `k` contiguous segments of at least `minLength` buckets with
 * the least total squared distance to each segment's mean. O(k·B²·d); ties keep the earliest split.
 */
export function partition(features: readonly (readonly number[])[], k: number, minLength = 1): Segment[] {
  const B = features.length;
  const d = features[0]?.length ?? 0;
  k = Math.max(1, Math.min(k, Math.floor(B / Math.max(1, minLength))));
  if (B === 0) return [];
  // Prefix sums of vectors and of squared norms: cost(i, j) for buckets i..j-1 in O(d).
  const S = [Array.from({ length: d }, () => 0)];
  const Q = [0];
  features.forEach((f, b) => {
    S.push(S[b]!.map((s, n) => s + (f[n] ?? 0)));
    Q.push(Q[b]! + f.reduce((a, v) => a + v * v, 0));
  });
  const cost = (i: number, j: number): number => {
    const sq = S[j]!.reduce((a, s, n) => a + (s - S[i]![n]!) ** 2, 0);
    return Q[j]! - Q[i]! - sq / (j - i);
  };
  // best[m][j]: least cost of m segments over buckets 0..j-1; from[m][j]: where the last one starts.
  const best = Array.from({ length: k + 1 }, () => Array.from({ length: B + 1 }, () => Infinity));
  const from = Array.from({ length: k + 1 }, () => Array.from({ length: B + 1 }, () => 0));
  best[0]![0] = 0;
  for (let m = 1; m <= k; m++) {
    for (let j = m * minLength; j <= B; j++) {
      for (let i = (m - 1) * minLength; i <= j - minLength; i++) {
        const c = best[m - 1]![i]! + cost(i, j);
        if (c < best[m]![j]! - 1e-12) [best[m]![j], from[m]![j]] = [c, i];
      }
    }
  }
  const out: Segment[] = [];
  for (let m = k, j = B; m > 0; j = from[m]![j]!, m--) out.unshift({ start: from[m]![j]!, end: j - 1 });
  return out;
}

/**
 * The era segments of an aggregate: {@link eraCount} segments over the default modules view, each at least
 * `floor(B / 2k)` buckets long so no era is a single spike. Pure and deterministic.
 */
export function segmentEras(agg: RepoAggregate): Segment[] {
  const view = selectView(agg, { dimension: 'modules' });
  const B = view.buckets.length;
  const k = eraCount(B);
  return partition(eraFeatures(view), k, Math.max(1, Math.floor(B / (2 * k))));
}
