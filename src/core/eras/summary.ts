/**
 * `EraSummary`: the only input the era-naming model sees (docs/PLAN.md §4.6). At most 2 KB, built from the
 * modules view and contributor counts. It never contains a person's id, name or email, nor commit messages.
 */
import { OTHERS_ID } from '../aggregate.ts';
import type { BucketUnit, RepoAggregate } from '../schema.ts';
import { selectView } from '../view.ts';
import { segmentEras, type Segment } from './segment.ts';

/** The facts about one era. Module names are identifiers (see `IDENT` in validate.ts). */
export interface EraFacts {
  start: number;
  end: number;
  /** `YYYY-MM` of the era's first and last month. */
  from: string;
  to: string;
  /** Up to 4 `[module, % of this era's lines changed]`, largest first. */
  top: [string, number][];
  /** Activity within the era. */
  trend: 'rising' | 'falling' | 'steady';
  /** Mean activity per bucket against the whole history's mean. */
  activity: 'low' | 'medium' | 'high';
  /** Distinct (non-bot) contributors, and those whose first commit is in this era. */
  contributors: number;
  newcomers: number;
  /** Up to 2 `[from module, to module, files]`, at least 3 files each. */
  moves: [string, string, number][];
}

/** The model input for one repository. */
export interface EraSummary {
  v: 1;
  /** The repository's name (not its owner, who may be a person). */
  repo: string;
  unit: BucketUnit;
  eras: EraFacts[];
}

/** Hard size limit of a serialised summary, in bytes. */
export const SUMMARY_MAX_BYTES = 2048;
const MAX_IDENT = 40;

/** A module name as an identifier: `(root)` for root files, other characters → `_`, at most 40 characters. */
export const ident = (name: string): string =>
  (name === '' || name === '(root files)' ? '(root)' : name.replace(/[^A-Za-z0-9._@+/()-]/g, '_')).slice(0, MAX_IDENT);

const month = (t: number): string => new Date(t).toISOString().slice(0, 7);
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const bytes = (s: EraSummary): number => new TextEncoder().encode(JSON.stringify(s)).length;

/**
 * Summarises `agg` over `segments` (default {@link segmentEras}). If the result is over
 * {@link SUMMARY_MAX_BYTES}, moves and then top modules are trimmed until it fits.
 */
export function summarizeForEras(agg: RepoAggregate, segments: readonly Segment[] = segmentEras(agg)): EraSummary {
  const view = selectView(agg, { dimension: 'modules' });
  const totals = view.buckets.map((_, i) => sum(view.rivers.map((r) => r.values[i] ?? 0)));
  const mean = sum(totals) / Math.max(1, totals.length);
  const { people, commits } = agg.contributors;
  const humans = people.flatMap((p, i) => (p.bot || p.id === OTHERS_ID ? [] : [commits[i] ?? []]));
  const firstSeen = humans.map((row) => row.findIndex((c) => c > 0));
  const label = new Map(view.rivers.map((r) => [r.id, ident(r.label)]));

  const eras = segments.map(({ start, end }): EraFacts => {
    const span = totals.slice(start, end + 1);
    const all = sum(span);
    const top = view.rivers
      .filter((r) => r.kind !== 'other')
      .map((r) => [ident(r.label), sum(r.values.slice(start, end + 1))] as [string, number])
      .filter(([, v]) => v > 0)
      .toSorted((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([m, v]): [string, number] => [m, Math.round((100 * v) / Math.max(1, all))]);
    const half = Math.ceil(span.length / 2);
    const [early, late] = [sum(span.slice(0, half)) / half, sum(span.slice(half)) / Math.max(1, span.length - half)];
    const trend = span.length < 2 || Math.abs(late - early) <= 0.25 * Math.max(early, late) ? 'steady' : late > early ? 'rising' : 'falling';
    const level = all / span.length / Math.max(1e-9, mean);
    const moves = view.transfers
      .filter((t) => t.bucket >= start && t.bucket <= end && t.files >= 3)
      .toSorted((a, b) => b.files - a.files || a.bucket - b.bucket)
      .slice(0, 2)
      .map((t): [string, string, number] => [label.get(t.from) ?? 'other', label.get(t.to) ?? 'other', t.files]);
    const last = Date.parse(view.buckets[end]!.end) - 1;
    return {
      start, end, from: month(Date.parse(view.buckets[start]!.start)), to: month(last), top,
      trend, activity: level < 0.6 ? 'low' : level > 1.5 ? 'high' : 'medium',
      contributors: humans.filter((row) => row.slice(start, end + 1).some((c) => c > 0)).length,
      newcomers: firstSeen.filter((f) => f >= start && f <= end).length,
      moves,
    };
  });
  const summary: EraSummary = { v: 1, repo: agg.repo.name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, MAX_IDENT), unit: agg.time.unit, eras };
  for (const e of eras) if (bytes(summary) > SUMMARY_MAX_BYTES) e.moves = e.moves.slice(0, 1);
  for (const keep of [3, 2, 1]) for (const e of eras) if (bytes(summary) > SUMMARY_MAX_BYTES) e.top = e.top.slice(0, keep);
  for (const e of eras) if (bytes(summary) > SUMMARY_MAX_BYTES) e.moves = [];
  return summary;
}
