/** `layoutRivers`: pure timeline-sankey geometry for a {@link RiverView} (docs/viz/rivers.md §3–§5). */
import { assignColors } from '../palette.ts';
import type { RiverView } from '../view.ts';
import { LABEL_HEIGHT, placeLabels, type Box, type PlacedLabel } from './labels.ts';
import { laneOrder } from './order.ts';
import { extend, link, ribbonPath, type Point } from './ribbons.ts';
import { band, clipDomain, linear, sqrt } from './scale.ts';

/** Transfer stroke width on a fixed scale across datasets: 1 file ≈ 1.5 px, 100+ files = 6 px (§3.3). */
const strokeOf = (files: number): number => 1 + sqrt(100, 5)(Math.min(files, 100));

/** Inputs besides the view. All lengths are CSS px at the real container width (never viewBox-scaled). */
export interface LayoutOptions {
  /** Container width; on mobile the chart is `max(width, 720, 28·B)` wide inside a scroll region. */
  width: number;
  /** Plot height `H`; default `clamp(0.45·W, 320, 480)`, 360 on mobile. */
  height?: number;
  /** Gap between consecutive non-zero rivers (3). */
  gap?: number;
  /** `'linear'` (default, with outlier clipping) or `'sqrt'` of the column total (shares stay exact). */
  scale?: 'linear' | 'sqrt';
  /** Minimum band thickness for an inside label (18 = 14 px box + 2 px padding each side). */
  labelMinThickness?: number;
  /** Phone layout: no gutter, inside labels repeat every 360 px. */
  mobile?: boolean;
  /** When the data was read (`generatedAt`); marks a partial last bucket. */
  asOf?: string;
  /** Buckets whose values are estimates (`source.truncatedBuckets`). */
  truncatedBuckets?: readonly number[];
  /** Label text width; default 7.4 px per character (12 px mono). */
  measure?: (text: string) => number;
  /** Previous `id → color` so hues stay put across re-layouts. */
  previousColors?: Readonly<Record<string, number>>;
}

/** One river: a single path (closed subpath per non-zero run), per-column edges, and a palette index. */
export interface RiverShape {
  id: string;
  label: string;
  kind: 'module' | 'contributor' | 'other';
  bot: boolean;
  path: string;
  edges: { top: number[]; bottom: number[] };
  thickness: number[];
  /** Index into `PALETTES[theme].fills` (`OTHER_COLOR` for "other"). */
  color: number;
}

/** A file move drawn from the source at column `b−1` to the target at column `b` (column 0→1 for b = 0). */
export interface TransferShape {
  from: string;
  to: string;
  bucket: number;
  files: number;
  path: string;
  width: number;
  start: Point;
  end: Point;
  /** ≥ 3 files and ≥ 5% of the bucket's moved files; others only show while an end river is active. */
  alwaysVisible: boolean;
}

/** The full geometry; `rivers` are in lane order, top to bottom. */
export interface RiverLayout {
  width: number;
  height: number;
  plot: { left: number; right: number; top: number; bottom: number };
  bucketWidth: number;
  /** Thickness domain `D` and px per unit `k` (linear scale). */
  domain: number;
  unit: number;
  /** Per bucket: centre x, value total, stack top and height, clip factor `c_i`. */
  columns: { x: number; total: number; top: number; height: number; factor: number }[];
  rivers: RiverShape[];
  transfers: TransferShape[];
  labels: { placed: PlacedLabel[]; dropped: string[] };
  /** Outlier columns drawn at `factor` scale with a break mark (`mark`, near the stack top) and `text` (`↑ 224K`, in `box`). */
  clipped: { index: number; x: number; total: number; factor: number; text: string; box: Box; mark: Box }[];
  /** Survey line at `asOf` inside a partial last bucket, with its label. */
  partial: { x: number; text: string; box: Box } | null;
  /** Runs of truncated (estimated) buckets as x spans. */
  estimated: { from: number; to: number; x0: number; x1: number }[];
}

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 0 });
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/**
 * Lays out a {@link RiverView} as a timeline-sankey: stable lanes, centred column stacks with 3 px gaps,
 * linear thickness with outlier clipping, mid-x Bézier ribbons that taper to a point at zero, transfers,
 * colours and greedy direct labels. Pure and deterministic (same input, same output).
 */
export function layoutRivers(view: RiverView, options: LayoutOptions): RiverLayout {
  const first = build(view, options, 0);
  return options.mobile || first.gutter === 0 ? first.layout : build(view, options, first.gutter).layout;
}

function build(view: RiverView, o: LayoutOptions, gutter: number): { layout: RiverLayout; gutter: number } {
  const { gap = 3, mobile = false, measure = (t: string) => 7.4 * t.length } = o;
  const lanes = laneOrder(view.rivers, view.transfers);
  const B = view.buckets.length;
  const width = mobile ? Math.max(o.width, 720, 28 * B) : o.width;
  const H = o.height ?? (mobile ? 360 : Math.min(480, Math.max(320, 0.45 * width)));
  const totals = view.buckets.map((_, i) => lanes.reduce((s, r) => s + (r.values[i] ?? 0), 0));
  const max = Math.max(0, ...totals);
  const { domain, clipped } = o.scale === 'sqrt' ? { domain: max, clipped: [] } : clipDomain(totals);
  const head = clipped.length ? LABEL_HEIGHT + 8 : 0; // room for the `↑ 224K` label above a full-height column
  const plot = { left: 0, right: width - gutter, top: 8 + head, bottom: 8 + head + H };
  const { width: w, x } = band(B, plot.left, plot.right);
  const xs = [plot.left, ...view.buckets.map((_, i) => x(i)), plot.right];
  const avail = Math.max(0, H - gap * (lanes.length - 1));
  const unit = domain > 0 ? linear([0, domain], [0, avail])(1) : 0;
  const factor = totals.map((t) => (t > domain ? domain / t : 1));
  const root = sqrt(max, avail);
  const perUnit = totals.map((t, i) => (o.scale === 'sqrt' ? (t > 0 ? root(t) / t : 0) : unit * factor[i]!));

  const thick = lanes.map((r) => totals.map((_, i) => (r.values[i] ?? 0) * perUnit[i]!));
  const tops = lanes.map(() => [] as number[]);
  const bots = lanes.map(() => [] as number[]);
  const columns = totals.map((total, i) => {
    const live = lanes.flatMap((r, j) => ((r.values[i] ?? 0) > 0 ? [j] : []));
    const height = live.reduce((s, j) => s + thick[j]![i]!, 0) + gap * Math.max(0, live.length - 1);
    const top = plot.top + (H - height) / 2;
    let y = top;
    for (const j of live) {
      tops[j]![i] = y;
      bots[j]![i] = y += thick[j]![i]!;
      y += gap;
    }
    lanes.forEach((_, j) => {
      if (live.includes(j)) return;
      const above = live.findLast((n) => n < j);
      const below = live.find((n) => n > j);
      const p = above !== undefined && below !== undefined ? (bots[above]![i]! + tops[below]![i]!) / 2 : below !== undefined ? top : top + height;
      tops[j]![i] = bots[j]![i] = p;
    });
    return { x: x(i), total, top, height, factor: factor[i]! };
  });

  const laneOf = new Map(lanes.map((r, j) => [r.id, j]));
  const moved = new Map<number, number>();
  view.transfers.forEach((t) => moved.set(t.bucket, (moved.get(t.bucket) ?? 0) + t.files));
  const transfers = view.transfers.flatMap((t): TransferShape[] => {
    const [s, d] = [laneOf.get(t.from), laneOf.get(t.to)];
    const [a, b] = t.bucket === 0 ? [0, 1] : [t.bucket - 1, t.bucket];
    if (s === undefined || d === undefined || b >= B) return [];
    const start: Point = [x(a), d > s ? bots[s]![a]! : tops[s]![a]!];
    const end: Point = [x(b), d > s ? tops[d]![b]! : bots[d]![b]!];
    const alwaysVisible = t.files >= 3 && t.files >= 0.05 * moved.get(t.bucket)!;
    return [{ ...t, path: link(start, end), width: strokeOf(t.files), start, end, alwaysVisible }];
  });

  const markers = clipped.map((index) => {
    const text = `↑ ${compact.format(totals[index]!)}`;
    const bw = measure(text);
    const c = columns[index]!;
    const box = { x: Math.max(plot.left, c.x - bw / 2), y: Math.max(0, c.top - 4 - LABEL_HEIGHT), width: bw, height: LABEL_HEIGHT };
    const mark = { x: c.x - w / 2, y: c.top + 6, width: w, height: 10 };
    return { index, x: c.x, total: c.total, factor: c.factor, text, box, mark };
  });
  const partial = partialMarker(view, o.asOf, plot.left, w, measure);
  const runs = [...new Set(o.truncatedBuckets ?? [])].filter((i) => i >= 0 && i < B).toSorted((p, q) => p - q);
  const estimated = runs.flatMap((i, n) => (runs[n - 1] === i - 1 ? [] : [i])).map((from) => {
    let to = from;
    while (runs.includes(to + 1)) to++;
    return { from, to, x0: plot.left + from * w, x1: plot.left + (to + 1) * w };
  });

  const labels = placeLabels({
    bands: lanes.map((r, j) => ({
      id: r.id, text: r.bot ? `${r.label} · bot` : r.label, total: r.total, other: r.kind === 'other',
      values: r.values, top: extend(tops[j]!), bottom: extend(bots[j]!),
    })),
    xs, plot, bucketWidth: w, measure, gutter: !mobile, gutterRoom: gutter, window: mobile ? 360 : Infinity,
    minThickness: o.labelMinThickness ?? 18,
    obstacles: [...markers.flatMap((m) => [m.box, m.mark]), ...(partial ? [partial.box] : [])],
  });
  const colors = assignColors(lanes, o.previousColors);
  const rivers = lanes.map((r, j): RiverShape => ({
    id: r.id, label: r.label, kind: r.kind, bot: r.bot, color: colors[j]!,
    path: ribbonPath(xs, tops[j]!, bots[j]!, r.values),
    edges: { top: tops[j]!, bottom: bots[j]! }, thickness: thick[j]!,
  }));
  const layout: RiverLayout = {
    width, height: plot.bottom + 28, plot, bucketWidth: w, domain, unit, columns, rivers, transfers,
    labels: { placed: labels.placed, dropped: labels.dropped }, clipped: markers, partial, estimated,
  };
  return { layout, gutter: labels.gutterWidth };
}

/** The `asOf` survey line when it falls inside the last bucket (the value there is not extrapolated). */
function partialMarker(view: RiverView, asOf: string | undefined, left: number, w: number, measure: (t: string) => number): RiverLayout['partial'] {
  const last = view.buckets.at(-1);
  const t = asOf ? Date.parse(asOf) : NaN;
  if (!last || !(t >= Date.parse(last.start) && t < Date.parse(last.end))) return null;
  const x = left + (view.buckets.length - 1 + (t - Date.parse(last.start)) / (Date.parse(last.end) - Date.parse(last.start))) * w;
  const text = `to ${day.format(t)}`;
  const bw = measure(text);
  return { x, text, box: { x: Math.max(left, x - 4 - bw), y: 8, width: bw, height: LABEL_HEIGHT } };
}
