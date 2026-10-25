/**
 * Deterministic text for screen readers and the readout bar (docs/viz/rivers.md §6): the prose summary of a
 * view, the idle line and the per-river/bucket readout. Every number comes from the {@link RiverView}.
 */
import type { BucketUnit, Era, RepoAggregate } from './schema.ts';
import type { River, RiverView } from './view.ts';

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

/** Rich readout text: plain strings, an italic river name `{ i }`, a bold number `{ b }` or a muted word `{ m }`. */
export type Rich = readonly (string | { i: string } | { b: string } | { m: string })[];

/** The text of a {@link Rich} line, for the live region and tests. */
export const plain = (r: Rich): string => r.map((s) => (typeof s === 'string' ? s : 'i' in s ? s.i : 'b' in s ? s.b : s.m)).join('');

/** True when a bot's name needs "bot" after it: not when the name already says so (`renovate[bot]`). */
export const tagsBot = (r: Pick<River, 'label' | 'bot'>): boolean => r.bot && !/\[bot\]$/i.test(r.label);

/** A river's name for the readout: italic, with "bot" muted after a bot's name unless it ends in `[bot]`. */
const riverName = (r: Pick<River, 'label' | 'bot'>): Rich => (tagsBot(r) ? [{ i: r.label }, ' ', { m: 'bot' }] : [{ i: r.label }]);

/**
 * The idle readout (DESIGN §4): `*packages/vite* carries 46% of all lines changed, and 167 files moved between
 * modules.` The largest named river (or "other" when it is alone); moves only when there are any.
 */
export function idleReadout(view: RiverView): Rich {
  const named0 = view.rivers.filter((r) => r.kind !== 'other');
  const top = (named0.length ? named0 : view.rivers).toSorted((a, b) => b.total - a.total)[0];
  if (!top) return [];
  const all = view.rivers.reduce((a, r) => a + r.total, 0);
  const moved = view.transfers.reduce((a, t) => a + t.files, 0);
  const by = view.rivers.some((r) => r.kind === 'contributor') ? 'contributors' : 'modules';
  return [...riverName(top), ` carries ${share(top.total, all)} of all ${view.metric}${moved ? `, and ${files(moved)} moved between ${by}` : ''}.`];
}

/**
 * The visible readout for river `riverId` (or the whole column when null) at `bucket` (DESIGN §4): the board
 * sentence `*packages*, Q2 2023: **7,732** lines changed, 21% of the quarter.` and the files moved in and out.
 * The caveats the chart draws (estimate, partial bucket, clipped column) are spoken only: {@link readoutCaveats}.
 */
export function focusReadout(view: RiverView, c: Caveats, riverId: string | null, bucket: number): Rich {
  const b = view.buckets[bucket];
  if (!b) return [];
  const total = columnTotals(view)[bucket] ?? 0;
  const river = view.rivers.find((r) => r.id === riverId);
  const out: (Rich[number])[] = [];
  const head = (n: number): Rich => [{ b: num.format(n) }, ` ${n === 1 ? (view.metric === 'commits' ? 'commit' : 'line changed') : view.metric}`];
  if (!river) out.push(`${b.label}: `, ...head(total), ` across ${view.rivers.length} rivers.`);
  else {
    const v = river.values[bucket] ?? 0;
    out.push(...riverName(river), `, ${b.label}: `);
    if (v > 0) out.push(...head(v), `, ${share(v, total)} of the ${c.unit}.`);
    else out.push(`no ${view.metric} this ${c.unit}.`);
    const here = view.transfers.filter((t) => t.bucket === bucket);
    out.push(...moves(view, here.filter((t) => t.to === river.id).map((t) => [t.files, t.from]), 'in from'));
    out.push(...moves(view, here.filter((t) => t.from === river.id).map((t) => [t.files, t.to]), 'out to'));
  }
  return out;
}

/**
 * What the chart shows about `bucket` by marks alone (the dotted axis, the dashed partial line, the break mark),
 * as sentences for the live region: ` This quarter is estimated. Quarter in progress, to 20 Oct.`
 */
export function readoutCaveats(view: RiverView, c: Caveats, bucket: number): string {
  const out: string[] = [];
  if (c.estimated.includes(bucket)) out.push(`This ${c.unit} is estimated.`);
  if (c.asOf !== null && bucket === view.buckets.length - 1) out.push(`${cap(c.unit)} in progress, to ${dayMonth.format(c.asOf)}.`);
  const f = c.clipped.get(bucket);
  if (f !== undefined) out.push(`Column drawn at ${Math.round(100 * f)}% scale.`);
  return out.map((s) => ` ${s}`).join('');
}

/**
 * One sentence for the files a river took in (or gave out) in a bucket, largest first: `952 files moved in from
 * *test*.`, `… from *test* and 231 from *src*.`, or `… from *test*, 231 from *src* and 9 from 2 more modules.`
 */
function moves(view: RiverView, list: [number, string][], dir: 'in from' | 'out to'): Rich {
  const [a, b, ...rest] = list.toSorted((p, q) => q[0] - p[0] || p[1].localeCompare(q[1]));
  if (!a) return [];
  const out: Rich[number][] = [` ${files(a[0])} moved ${dir} `, { i: labelOf(view, a[1]) }];
  const more = rest.reduce((n, [f]) => n + f, 0);
  if (b) out.push(rest.length ? ', ' : ' and ', `${num.format(b[0])} ${dir.split(' ')[1]} `, { i: labelOf(view, b[1]) });
  if (rest.length) out.push(` and ${num.format(more)} ${dir.split(' ')[1]} ${rest.length} more ${rest.length === 1 ? 'module' : 'modules'}`);
  return [...out, '.'];
}

/** The legend under the chart (DESIGN §3): only the marks this view draws. */
export type LegendItem = { kind: 'estimated' | 'partial' | 'moved' | 'bot' | 'ai'; text: string };
export function legendItems(o: { unit: BucketUnit; estimated: boolean; partial: boolean; moved: boolean; bots: boolean; ai: boolean }): LegendItem[] {
  const items: (LegendItem | false)[] = [
    o.estimated && { kind: 'estimated', text: 'estimated' },
    o.partial && { kind: 'partial', text: `${o.unit} in progress` },
    o.moved && { kind: 'moved', text: 'files moved' },
    o.bots && { kind: 'bot', text: 'bot' },
    o.ai && { kind: 'ai', text: 'era names by AI' },
  ];
  return items.filter((i): i is LegendItem => i !== false);
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Prose summary of a view for `aria-describedby`: the period, the top river and its share, the busiest bucket,
 * (flagged when estimated or drawn clipped), the largest transfer of ≥ 3 files, and the partial/estimated caveats.
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
  const flags = [c.estimated.includes(busiest) && 'estimated', c.clipped.has(busiest) && 'drawn clipped'].filter(Boolean);
  const parts = [
    head,
    `The largest river is ${top.label}, with ${share(top.total, grand)} of all ${metric}.`,
    `The busiest ${c.unit} was ${buckets[busiest]!.label}, with ${amount(totals[busiest]!, metric)}${flags.length ? ` (${flags.join('; ')})` : ''}.`,
  ];
  // A move under 3 files is noise (the always-visible transfer threshold, docs/viz/rivers.md §3.3).
  if (big && big.files >= 3) parts.push(`The largest move was ${files(big.files)} from ${labelOf(view, big.from)} to ${labelOf(view, big.to)} in ${buckets[big.bucket]?.label}.`);
  else if (by === 'module') parts.push('No significant moves between these modules.');
  if (c.asOf !== null) parts.push(`The last ${c.unit} is partial, to ${fullDay.format(c.asOf)}.`);
  if (c.estimated.length) parts.push(`${c.estimated.length} of ${B} ${c.unit}s are estimated from sampled commits.`);
  return parts.join(' ');
}

const span = (view: RiverView, e: Pick<Era, 'start' | 'end'>): string => `${view.buckets[e.start]?.label ?? ''}–${view.buckets[e.end]?.label ?? ''}`;

/** `Q2 2020 to Q1 2021`, or one label when the era is one bucket long (DESIGN §4). */
export function eraRange(buckets: readonly { label: string }[], e: Pick<Era, 'start' | 'end'>): string {
  const [a, b] = [buckets[e.start]?.label ?? '', buckets[e.end]?.label ?? ''];
  return a === b ? a : `${a} to ${b}`;
}

/** An era note as a sentence: first letter capitalised, `; ` read as `, `, ending with a full stop. */
export function eraNote(note: string): string {
  const t = note.trim().replace(/; /g, ', ');
  return t ? `${cap(t)}${/[.!?]$/.test(t) ? '' : '.'}` : '';
}

/** The readout for a focused or hovered era: `{title}, Q2 2020 to Q1 2021. {Note.}` */
export function eraLine(view: RiverView, era: Era): string {
  const note = eraNote(era.note);
  return `${era.title}, ${eraRange(view.buckets, era)}.${note ? ` ${note}` : ''}`;
}

/** The eras for the prose summary: `3 eras: The test era (Q4 2016–Q3 2018); … .`, noting AI-written names. */
export function describeEras(view: RiverView, eras: readonly Era[]): string {
  if (eras.length === 0) return '';
  const list = eras.map((e) => `${e.title} (${span(view, e)})`).join('; ');
  return `${eras.length} eras: ${list}.${eras.some((e) => e.source === 'ai') ? ' Era names were written by AI.' : ''}`;
}
