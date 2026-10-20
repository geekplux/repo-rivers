/**
 * Deterministic text for screen readers and the readout bar (docs/viz/rivers.md §6): the prose summary of a
 * view, the idle line and the per-river/bucket readout. Every number comes from the {@link RiverView}.
 */
import type { BucketUnit, RepoAggregate } from './schema.ts';
import type { RiverView } from './view.ts';

const num = new Intl.NumberFormat('en');
const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fullDay = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** The caveats of the data behind a view: estimated buckets, a partial last bucket and clipped columns. */
export interface Caveats {
  unit: BucketUnit;
  /** Buckets whose lines changed are estimates (modules only: the 300-file compare cap). */
  estimated: readonly number[];
  /** `generatedAt` (ms) when it falls inside the last bucket, else null. */
  asOf: number | null;
  /** Clipped column index → drawn scale factor (from the layout). */
  clipped: ReadonlyMap<number, number>;
}

/** Builds {@link Caveats} for `view`; `clipped` comes from `layoutRivers(...).clipped`. */
export function caveats(agg: RepoAggregate, view: RiverView, clipped: readonly { index: number; factor: number }[] = []): Caveats {
  const last = view.buckets.at(-1);
  const t = Date.parse(agg.generatedAt);
  const asOf = last && t >= Date.parse(last.start) && t < Date.parse(last.end) ? t : null;
  const estimated = view.metric === 'lines changed' ? agg.source.truncatedBuckets : [];
  return { unit: agg.time.unit, estimated, asOf, clipped: new Map(clipped.map((c) => [c.index, c.factor])) };
}

/** `4,811 lines changed`, `1 commit`. */
export function amount(n: number, metric: RiverView['metric']): string {
  const one = metric === 'commits' ? 'commit' : 'line changed';
  return `${num.format(n)} ${n === 1 ? one : metric}`;
}

/** `56%`; shares under 0.5% read `<1%`. */
export function share(v: number, total: number): string {
  const p = total > 0 ? (100 * v) / total : 0;
  return p > 0 && p < 0.5 ? '<1%' : `${Math.round(p)}%`;
}

/** Column totals over every river in the view. */
export const columnTotals = (view: RiverView): number[] =>
  view.buckets.map((_, i) => view.rivers.reduce((s, r) => s + (r.values[i] ?? 0), 0));

const files = (n: number): string => `${num.format(n)} ${n === 1 ? 'file' : 'files'}`;
const labelOf = (view: RiverView, id: string): string => view.rivers.find((r) => r.id === id)?.label ?? id;

/** `{owner/name} · {first}–{last} · {B} {unit}s · {R} rivers by {metric}. Hover, tap or Tab into the chart.` */
export function idleLine(agg: RepoAggregate, view: RiverView): string {
  const { buckets, rivers, metric } = view;
  return `${agg.repo.owner}/${agg.repo.name} · ${buckets[0]?.label ?? ''}–${buckets.at(-1)?.label ?? ''} · ` +
    `${buckets.length} ${agg.time.unit}s · ${rivers.length} rivers by ${metric}. Hover, tap or Tab into the chart.`;
}

/**
 * The readout for river `riverId` (or the whole column when null) at `bucket`:
 * `{label} · {bucket} · {value} {metric} · {share}% of the {unit}` plus flags, in the spec's order.
 */
export function readoutLine(view: RiverView, c: Caveats, riverId: string | null, bucket: number): string {
  const b = view.buckets[bucket];
  if (!b) return '';
  const total = columnTotals(view)[bucket] ?? 0;
  const river = view.rivers.find((r) => r.id === riverId);
  const flags: string[] = [];
  if (c.estimated.includes(bucket)) flags.push('estimated (GitHub listed only 300 files)');
  if (c.asOf !== null && bucket === view.buckets.length - 1) flags.push(`partial ${c.unit}, to ${dayMonth.format(c.asOf)}`);
  const f = c.clipped.get(bucket);
  if (f !== undefined) flags.push(`column clipped, drawn at ${Math.round(100 * f)}% scale`);
  if (!river) return [b.label, `${amount(total, view.metric)} across ${view.rivers.length} rivers`, ...flags].join(' · ');
  const here = view.transfers.filter((t) => t.bucket === bucket);
  here.filter((t) => t.to === river.id).forEach((t) => flags.push(`${files(t.files)} moved in from ${labelOf(view, t.from)}`));
  here.filter((t) => t.from === river.id).forEach((t) => flags.push(`${files(t.files)} moved out to ${labelOf(view, t.to)}`));
  if (river.bot) flags.push('bot');
  const v = river.values[bucket] ?? 0;
  const main = v > 0 ? [amount(v, view.metric), `${share(v, total)} of the ${c.unit}`] : [`no ${view.metric} this ${c.unit}`];
  return [river.label, b.label, ...main, ...flags].join(' · ');
}

/**
 * Prose summary of a view for `aria-describedby`: the period, the top river and its share, the busiest bucket,
 * the largest transfer, and the partial/estimated caveats.
 */
export function describeView(agg: RepoAggregate, view: RiverView, c: Caveats): string {
  const { buckets, rivers, metric } = view;
  const B = buckets.length;
  const by = metric === 'commits' ? 'contributor' : 'module';
  const head = `${agg.repo.owner}/${agg.repo.name}: ${metric} per ${c.unit} by ${by}, ${buckets[0]?.label ?? ''} to ` +
    `${buckets.at(-1)?.label ?? ''} (${B} ${c.unit}s, ${rivers.length} rivers).`;
  if (rivers.length === 0) return `${head} No ${metric} to draw for this selection.`;
  const totals = columnTotals(view);
  const grand = totals.reduce((a, b) => a + b, 0);
  const named = rivers.filter((r) => r.kind !== 'other');
  const top = (named.length ? named : rivers).toSorted((a, b) => b.total - a.total)[0]!;
  const busiest = totals.indexOf(Math.max(...totals));
  const big = view.transfers.toSorted((a, b) => b.files - a.files || a.bucket - b.bucket)[0];
  const parts = [
    head,
    `The largest river is ${top.label}, with ${share(top.total, grand)} of all ${metric}.`,
    `The busiest ${c.unit} was ${buckets[busiest]!.label}, with ${amount(totals[busiest]!, metric)}.`,
  ];
  if (big) parts.push(`The largest move was ${files(big.files)} from ${labelOf(view, big.from)} to ${labelOf(view, big.to)} in ${buckets[big.bucket]?.label}.`);
  else if (by === 'module') parts.push('No files moved between these modules.');
  if (c.asOf !== null) parts.push(`The last ${c.unit} is partial, to ${fullDay.format(c.asOf)}.`);
  if (c.estimated.length) parts.push(`${c.estimated.length} of ${B} ${c.unit}s are estimated from sampled commits.`);
  return parts.join(' ');
}
