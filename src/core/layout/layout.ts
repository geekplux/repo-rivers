/** `layoutRivers`: pure timeline-sankey geometry for a {@link RiverView} (docs/viz/rivers.md §3–§5). */
import { tones, type Tone } from '../tones.ts';
import { tagsBot } from '../summary.ts';
import type { RiverView } from '../view.ts';
import { MOUTH_ROOM, riverNameWidth } from './guides.ts';
import { laneOrder } from './order.ts';
import { link, ribbonPath, type Point } from './ribbons.ts';
import { LABEL_HEIGHT, placeRiverNames, type Box, type RiverName } from './riverNames.ts';
import { band, clipDomain, linear, sqrt } from './scale.ts';

/** Default horizontal inset of the plot inside the SVG (room for a focus ring drawn at the SVG edge). */
const INSET = 4;

/** Transfer stroke width on a fixed scale across datasets: 1 file ≈ 1.5 px, 100+ files = 6 px (§3.3). */
const strokeOf = (files: number): number => 1 + sqrt(100, 5)(Math.min(files, 100));

/** Inputs besides the view. All lengths are CSS px at the real container width (never viewBox-scaled). */
export interface LayoutOptions {
  /** Container width (the phone passes its time length, about 56 px per bucket, and draws it transposed). */
  width: number;
  /** Plot height `H`; default `clamp(0.45·W, 320, 480)`. */
  height?: number;
  /** Gap between consecutive non-zero rivers (3; the redesign draws 2). */
  gap?: number;
  /** Space above the plot (8): the desktop chart reserves its era band here. */
  top?: number;
  /** Horizontal inset of the plot inside the SVG (4). */
  inset?: number;
  /** Room right of the desktop plot for river names at the mouth (140, so the plot ends at 1180 of a 1440 page). */
  labelRoom?: number;
  /** `'linear'` (default, with outlier clipping) or `'sqrt'` of the column total (shares stay exact). */
  scale?: 'linear' | 'sqrt';
  /** Phone names (`placeRiverNames` with `phone`): only straight names in a smoothed run, for the transposed chart. */
  phone?: boolean;
  /** When the data was read (`generatedAt`); marks a partial last bucket. */
  asOf?: string;
  /** Buckets whose values are estimates (`source.truncatedBuckets`). */
  truncatedBuckets?: readonly number[];
  /** River name width; default the 13 px italic estimate (6.3 px per character + 4). */
  measure?: (text: string) => number;
}

/** One river: a single path (closed subpath per non-zero run), per-column edges, and its tone. */
export interface RiverShape {
  id: string;
  label: string;
  kind: 'module' | 'contributor' | 'other';
  bot: boolean;
  path: string;
  edges: { top: number[]; bottom: number[] };
  thickness: number[];
  /** Water A (0) or water B (1), from {@link tones}; "other" is hatched in water B (1). */
  tone: Tone;
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
  /** River names (DESIGN §4) and the rivers left without one. */
  labels: { names: RiverName[]; dropped: string[] };
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
 * two tones and greedy direct labels. Pure and deterministic (same input, same output).
 */
export function layoutRivers(view: RiverView, o: LayoutOptions): RiverLayout {
  const { gap = 3, phone = false, measure = riverNameWidth, top: pad = 8, inset = INSET } = o;
  const gutter = Math.max(0, (o.labelRoom ?? MOUTH_ROOM) - inset);
  const lanes = laneOrder(view.rivers, view.transfers);
  const B = view.buckets.length;
  const width = o.width;
  const H = o.height ?? Math.min(480, Math.max(320, 0.45 * width));
  const totals = view.buckets.map((_, i) => lanes.reduce((s, r) => s + (r.values[i] ?? 0), 0));
  const max = Math.max(0, ...totals);
  const { domain, clipped } = o.scale === 'sqrt' ? { domain: max, clipped: [] } : clipDomain(totals);
  const head = clipped.length ? LABEL_HEIGHT + 8 : 0; // room for the `↑ 224K` label above a full-height column
  // An inset on both sides (4 px by default) keeps a focus ring drawn at the SVG edge off the data and labels.
  const plot = { left: inset, right: width - gutter - inset, top: pad + head, bottom: pad + head + H };
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

  const text = (r: (typeof lanes)[number]): string => (tagsBot(r) ? `${r.label} bot` : r.label);
  const obstacles = markers.flatMap((m) => [m.box, m.mark]);
  const labels = placeRiverNames({
    rivers: lanes.map((r, j) => ({ id: r.id, text: text(r), top: tops[j]!, bottom: bots[j]!, thickness: thick[j]! })),
    plot, bucketWidth: w, measure, limit: width - inset, transfers: transfers.filter((t) => t.alwaysVisible), obstacles, phone,
  });
  const tone = tones(lanes);
  const rivers = lanes.map((r, j): RiverShape => ({
    id: r.id, label: r.label, kind: r.kind, bot: r.bot, tone: tone[j]!,
    path: ribbonPath(xs, tops[j]!, bots[j]!, r.values),
    edges: { top: tops[j]!, bottom: bots[j]! }, thickness: thick[j]!,
  }));
  return {
    width, height: plot.bottom + 30, plot, bucketWidth: w, domain, unit, columns, rivers, transfers,
    labels, clipped: markers, partial, estimated,
  };
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
