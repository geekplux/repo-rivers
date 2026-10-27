import type { RepoAggregate, SourceInfo } from '../core/schema.ts';
import type { RiverView } from '../core/view.ts';

const month = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const n = new Intl.NumberFormat('en-US');

/**
 * The chart head's meta line (docs/DESIGN.md §3): the measure and bucket unit of the view, then the span
 * from the first bucket to the day the aggregate was read, e.g. "Lines changed per quarter, Apr 2020 to Oct 2026."
 */
export function metaLine(agg: RepoAggregate, view: RiverView): string {
  const measure = view.metric === 'lines changed' ? 'Lines changed' : 'Commits';
  const first = Date.parse(view.buckets[0]?.start ?? agg.time.starts[0] ?? '');
  const span = Number.isFinite(first) ? `, ${month.format(first)} to ${month.format(Date.parse(agg.generatedAt))}` : '';
  return `${measure} per ${agg.time.unit}${span}.`;
}

/** The label of the button that opens the source notes: how much of the history was read. */
export function sourceLabel(source: SourceInfo): string {
  if (source.mode === 'synthetic') return 'Synthetic data';
  if (source.mode === 'full') return `Read from all ${n.format(source.commitsTotal)} commits`;
  return `Estimated from ${n.format(source.commitsSeen)} of ${n.format(source.commitsTotal)} commits`;
}
