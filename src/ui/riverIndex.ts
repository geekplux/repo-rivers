import type { BucketUnit } from '../core/schema.ts';
import type { RiverView } from '../core/view.ts';

const r1 = (n: number): number => Math.round(n * 10) / 10;

/**
 * A sparkline as a closed area path in a `w`×`h` box: one point per bucket, spread evenly from x 0 to `w`, each
 * value scaled to the series' own peak (an all-zero series lies flat on the baseline).
 */
export function sparkPath(values: readonly number[], w: number, h: number): string {
  const max = Math.max(0, ...values) || 1;
  const n = values.length;
  const pts = n === 1 ? [[0, values[0]!], [w, values[0]!]] : values.map((v, i) => [(i / Math.max(1, n - 1)) * w, v]);
  return `M0,${h}${pts.map(([x, v]) => `L${r1(x!)},${r1(h - (v! / max) * h)}`).join('')}L${w},${h}Z`;
}

/** Share of all rivers' totals: `46%`, one decimal below 10% (`4.2%`), `<0.1%` for the smallest. */
export function shareText(v: number, all: number): string {
  const p = all > 0 ? (100 * v) / all : 0;
  if (p >= 10) return `${Math.round(p)}%`;
  return p > 0 && p < 0.05 ? '<0.1%' : `${p.toFixed(1)}%`;
}

/** The years a river is active: `2020 to now` (still active in the last bucket), `2021 to 2026`, or `2020`. */
export function activeSpan(values: readonly number[], buckets: readonly { start: string }[]): string {
  const first = values.findIndex((v) => v > 0);
  if (first < 0) return '';
  const last = values.findLastIndex((v) => v > 0);
  const year = (i: number): string => buckets[i]?.start.slice(0, 4) ?? '';
  if (last === buckets.length - 1) return `${year(first)} to now`;
  return year(first) === year(last) ? year(first) : `${year(first)} to ${year(last)}`;
}

/** The Rivers table's column heads (DESIGN §3); the sparkline head names the bucket unit. */
export function indexHeads(view: Pick<RiverView, 'metric'>, unit: BucketUnit) {
  const people = view.metric === 'commits';
  return { name: people ? 'Contributor' : 'Module', spark: `Each ${unit}, scaled to its own peak`, amount: people ? 'Commits' : 'Lines changed' };
}
