/** Minimal scales for the river layout (no d3). */

/** Maps a domain value to a range value. */
export type Scale = (v: number) => number;

/** Linear map of `[d0, d1]` onto `[r0, r1]`; a zero-width domain maps everything to `r0`. */
export function linear([d0, d1]: readonly [number, number], [r0, r1]: readonly [number, number]): Scale {
  const s = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  return (v) => r0 + (v - d0) * s;
}

/** Square-root map of `[0, d1]` onto `[0, r1]`; an empty domain maps everything to 0. */
export function sqrt(d1: number, r1: number): Scale {
  return (v) => (d1 > 0 ? r1 * Math.sqrt(Math.max(0, v) / d1) : 0);
}

/** `n` even bands across `[left, right]`: `width` per band, `x(i)` = centre of band `i`. */
export function band(n: number, left: number, right: number): { width: number; x: Scale } {
  const width = n > 0 ? (right - left) / n : 0;
  return { width, x: (i) => left + (i + 0.5) * width };
}

/** Quantile of ascending `sorted` values by linear interpolation (Hyndman-Fan type 7). */
export function quantile(sorted: readonly number[], p: number): number {
  const h = (sorted.length - 1) * p;
  const lo = Math.floor(h);
  return (sorted[lo] ?? 0) + (h - lo) * ((sorted[lo + 1] ?? sorted[lo] ?? 0) - (sorted[lo] ?? 0));
}

/**
 * Thickness domain with outlier clipping (docs/viz/rivers.md §3.2): columns above the Tukey far fence
 * `Q3 + 3·IQR` of the non-zero totals are clipped only if there are 1–2 of them and the largest total is
 * ≥ 2.5× the largest remaining one. Returns the domain `D` and the clipped column indices.
 */
export function clipDomain(totals: readonly number[]): { domain: number; clipped: number[] } {
  const max = Math.max(0, ...totals);
  const sorted = totals.filter((t) => t > 0).toSorted((a, b) => a - b);
  const [q1, q3] = [quantile(sorted, 0.25), quantile(sorted, 0.75)];
  const fence = q3 + 3 * (q3 - q1);
  const clipped = totals.flatMap((t, i) => (t > fence ? [i] : []));
  const d0 = Math.max(0, ...totals.filter((t) => t <= fence));
  const clip = clipped.length > 0 && clipped.length <= 2 && d0 > 0 && max / d0 >= 2.5;
  return clip ? { domain: d0, clipped } : { domain: max, clipped: [] };
}
