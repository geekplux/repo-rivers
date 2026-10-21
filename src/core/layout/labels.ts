/**
 * Greedy direct-label placement (docs/viz/rivers.md §5.6): inside → end gutter → stack edge → dropped, then a
 * peak callout for dropped top-3 rivers and, on mobile, callouts until every full window holds 2 labels (L9 a, b).
 */
import { edgeAt } from './ribbons.ts';

/** An axis-aligned box in CSS px. */
export interface Box { x: number; y: number; width: number; height: number }

/** A placed label; `leader` is a gutter or callout label's `[x1, y1, x2, y2]` line back to its river. */
export interface PlacedLabel extends Box {
  id: string;
  text: string;
  kind: 'inside' | 'gutter' | 'edge' | 'callout';
  leader?: readonly [number, number, number, number];
}

/** A river as the label placer sees it; `top`/`bottom` are extended edge arrays aligned with `xs`. */
export interface LabelBand {
  id: string;
  text: string;
  total: number;
  other: boolean;
  values: readonly number[];
  top: readonly number[];
  bottom: readonly number[];
}

/** Inputs to {@link placeLabels}: river bands in lane order, column centres, the plot box and obstacles. */
export interface LabelInput {
  bands: readonly LabelBand[]; // lane order
  xs: readonly number[];
  plot: { left: number; right: number; top: number; bottom: number };
  bucketWidth: number;
  measure: (text: string) => number;
  minThickness: number;
  gutter: boolean;
  /** Width already reserved right of the plot (0 on the first pass, which only measures the request). */
  gutterRoom: number;
  /** Mobile: inside labels repeat once per window of this many px. */
  window: number;
  obstacles: readonly Box[];
}

/** Height of a label box in px (12 px mono text plus padding). */
export const LABEL_HEIGHT = 14;
const MARGIN = 2;
const MAX_CHARS = 26;

/** Middle ellipsis to at most `max` characters: `packages/compi…ate-vite`. */
export function ellipsize(text: string, max = MAX_CHARS): string {
  if (text.length <= max) return text;
  const head = Math.ceil((max - 1) / 2);
  return `${text.slice(0, head)}…${text.slice(text.length - (max - 1 - head))}`;
}

/** True if the boxes overlap or come closer than the 2 px margin. */
export const hits = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width + MARGIN && b.x < a.x + a.width + MARGIN && a.y < b.y + b.height + MARGIN && b.y < a.y + a.height + MARGIN;

/** Max (or min) of a mid-x edge over `[a, b]`: edges are monotone between columns, so ends + knots suffice. */
function span(xs: readonly number[], ys: readonly number[], a: number, b: number, pick: (...v: number[]) => number): number {
  return pick(edgeAt(xs, ys, a), edgeAt(xs, ys, b), ...xs.flatMap((x, k) => (x > a && x < b ? [ys[k]!] : [])));
}

/**
 * Places labels for all bands, largest total first ("other" last). Returns placed boxes (mobile may repeat
 * an inside label per window), dropped ids, and the gutter width the labels asked for (0 if none).
 */
export function placeLabels(input: LabelInput): { placed: PlacedLabel[]; dropped: string[]; gutterWidth: number } {
  const { bands, xs, plot, bucketWidth: w, measure, gutter, window, obstacles } = input;
  const pad = (input.minThickness - LABEL_HEIGHT) / 2;
  const placed: PlacedLabel[] = [];
  const dropped: string[] = [];
  const queued: { band: LabelBand; cy: number }[] = [];
  const free = (box: Box): boolean => ![...obstacles, ...placed].some((o) => hits(box, o));
  const B = xs.length - 2;
  const order = bands.toSorted((a, b) => Number(a.other) - Number(b.other) || b.total - a.total);

  for (const band of order) {
    const text = ellipsize(band.text);
    const width = measure(text);
    const peak = band.values.indexOf(Math.max(...band.values));
    let found = false;
    for (let lo = plot.left; lo < plot.right; lo += window) {
      const hi = Math.min(plot.right, lo + window);
      let best: { box: Box; clear: number; dist: number } | undefined;
      for (let k = 1; k < 2 * B; k++) {
        const x = plot.left + (k * w) / 2 - width / 2;
        if (x < lo || x + width > hi) continue;
        const top = span(xs, band.top, x, x + width, Math.max);
        const bottom = span(xs, band.bottom, x, x + width, Math.min);
        const clear = (bottom - top - LABEL_HEIGHT) / 2;
        const box = { x, y: (top + bottom - LABEL_HEIGHT) / 2, width, height: LABEL_HEIGHT };
        const dist = Math.abs(x + width / 2 - xs[peak + 1]!);
        if (clear < pad || !free(box)) continue;
        if (!best || clear > best.clear + 1e-9 || (clear > best.clear - 1e-9 && dist < best.dist)) best = { box, clear, dist };
      }
      if (best) placed.push({ ...best.box, id: band.id, text, kind: 'inside' });
      found ||= best !== undefined;
    }
    if (found) continue;
    if (gutter && (band.values[B - 1] ?? 0) > 0) {
      queued.push({ band, cy: (band.top[B]! + band.bottom[B]!) / 2 });
      continue;
    }
    const edge = stackEdge(input, band, peak, text, width);
    if (edge && free(edge)) placed.push(edge);
    else dropped.push(band.id);
  }

  const gutterWidth = queued.length ? Math.min(180, Math.max(...queued.map((q) => measure(ellipsize(q.band.text)))) + 24) : 0;
  const half = LABEL_HEIGHT / 2;
  for (let fit = queued; fit.length; ) {
    const sorted = fit.toSorted((a, b) => a.cy - b.cy);
    const ys = sorted.map((q) => q.cy);
    ys.forEach((y, i) => (ys[i] = Math.max(y, plot.top + half, i ? ys[i - 1]! + 16 : -Infinity)));
    for (let i = ys.length - 1; i >= 0; i--) ys[i] = Math.min(ys[i]!, plot.bottom - half, ys[i + 1] === undefined ? Infinity : ys[i + 1]! - 16);
    if (ys[0]! >= plot.top + half - 1e-9) {
      sorted.forEach(({ band, cy }, i) => {
        let text = ellipsize(band.text);
        for (let n = MAX_CHARS - 1; n > 3 && measure(text) > (input.gutterRoom || gutterWidth) - 12; n--) text = ellipsize(band.text, n);
        const y = ys[i]!;
        const leader = [plot.right, cy, plot.right + 6, y] as const;
        placed.push({ x: plot.right + 8, y: y - half, width: measure(text), height: LABEL_HEIGHT, id: band.id, text, kind: 'gutter', leader });
      });
      break;
    }
    const smallest = fit.reduce((m, q) => (q.band.total < m.band.total ? q : m));
    dropped.push(smallest.band.id);
    fit = fit.filter((q) => q !== smallest);
  }

  const rescue = (band: LabelBand, lo: number, hi: number): boolean => {
    const label = callout(input, band, lo, hi, [...obstacles, ...placed]);
    if (label) placed.push(label);
    if (label && dropped.includes(band.id)) dropped.splice(dropped.indexOf(band.id), 1);
    return label !== undefined;
  };
  const ranked = bands.toSorted((a, b) => b.total - a.total);
  for (const band of ranked.slice(0, 3)) if (dropped.includes(band.id)) rescue(band, plot.left, plot.right);
  for (let lo = plot.left; Number.isFinite(window) && lo + window <= plot.right; lo += window) {
    const inside = (p: Box): boolean => p.x >= lo && p.x + p.width <= lo + window;
    for (const band of ranked) {
      if (placed.filter(inside).length >= 2) break;
      if (!placed.some((p) => p.id === band.id && inside(p))) rescue(band, lo, lo + window);
    }
  }
  return { placed, dropped, gutterWidth };
}

/** Does the `[x1, y1, x2, y2]` segment pass through `box` (2 px margin)? Sampled every 2 px. */
function crosses([x1, y1, x2, y2]: readonly number[], box: Box): boolean {
  const n = Math.ceil(Math.hypot(x2! - x1!, y2! - y1!) / 2);
  return Array.from({ length: n + 1 }, (_, k) => k / Math.max(1, n)).some((t) =>
    hits({ x: x1! + t * (x2! - x1!), y: y1! + t * (y2! - y1!), width: 0, height: 0 }, box));
}

/**
 * Peak callout: the label sits clear of the whole stack (above or below it), at most 4 columns from the river's
 * peak inside `[lo, hi]`, with a leader from the river's centre at that peak to the label.
 */
function callout(input: LabelInput, band: LabelBand, lo: number, hi: number, taken: readonly (Box & { leader?: readonly number[] })[]): PlacedLabel | undefined {
  const { bands, xs, plot, bucketWidth: w, measure } = input;
  const text = ellipsize(band.text);
  const width = measure(text);
  const cols = xs.slice(1, -1).flatMap((x, i) => (x >= lo && x < hi && (band.values[i] ?? 0) > 0 ? [i] : []));
  if (!cols.length) return undefined;
  const peak = cols.reduce((m, i) => (band.values[i]! > band.values[m]! ? i : m));
  const [ax, ay] = [xs[peak + 1]!, (band.top[peak + 1]! + band.bottom[peak + 1]!) / 2];
  for (const k of [0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6, -6, 7, -7, 8, -8]) {
    const x = Math.max(lo, plot.left, Math.min(ax + (k * w) / 2 - width / 2, Math.min(hi, plot.right) - width));
    const above = Math.min(...bands.map((b) => span(xs, b.top, x, x + width, Math.min))) - 6 - LABEL_HEIGHT;
    const below = Math.max(...bands.map((b) => span(xs, b.bottom, x, x + width, Math.max))) + 6;
    for (const y of [above, below].toSorted((p, q) => Math.abs(p - ay) - Math.abs(q - ay))) {
      if (y < plot.top || y + LABEL_HEIGHT > plot.bottom) continue;
      const box = { x, y, width, height: LABEL_HEIGHT };
      const leader = [ax, ay, Math.min(Math.max(ax, x + 4), x + width - 4), y > ay ? y : y + LABEL_HEIGHT] as const;
      const clash = taken.some((o) => hits(box, o) || crosses(leader, o) || (o.leader !== undefined && crosses(o.leader, box)));
      if (!clash) return { ...box, id: band.id, text, kind: 'callout', leader };
    }
  }
  return undefined;
}

/** A label 4 px above (or below) the stack at the peak column, if this river is the top (bottom) lane there. */
function stackEdge(input: LabelInput, band: LabelBand, peak: number, text: string, width: number): PlacedLabel | undefined {
  const { bands, xs, plot } = input;
  const live = bands.filter((b) => (b.values[peak] ?? 0) > 0);
  const x = Math.min(Math.max(xs[peak + 1]! - width / 2, plot.left), plot.right - width);
  const above = Math.min(...bands.map((b) => span(xs, b.top, x, x + width, Math.min)));
  const below = Math.max(...bands.map((b) => span(xs, b.bottom, x, x + width, Math.max)));
  const [up, down] = [band.top[peak + 1]! - 4 - LABEL_HEIGHT, band.bottom[peak + 1]! + 4];
  const tries = [
    live[0] === band && up + LABEL_HEIGHT + MARGIN <= above ? up : NaN,
    live.at(-1) === band && down - MARGIN >= below ? down : NaN,
  ];
  const y = tries.find((t) => t >= plot.top && t + LABEL_HEIGHT <= plot.bottom);
  return y === undefined ? undefined : { x, y, width, height: LABEL_HEIGHT, id: band.id, text, kind: 'edge' };
}
