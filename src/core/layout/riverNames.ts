/**
 * River names on the desktop chart (docs/redesign/DESIGN.md §4 "River names"), ported from the label pass of
 * `chart()` in docs/redesign/target/gen.mjs. Each river, in lane order, gets the first of: a straight name slanted
 * along its course, a level name inside its thickest buckets, a name at the mouth right of the plot (rivers that
 * reach the present), a name above its peak; or none. Every name is checked against the boxes already taken
 * (names, always-visible transfers, obstacles). Pure and deterministic.
 */
import type { Point } from './ribbons.ts';

/** An axis-aligned box in CSS px. */
export interface Box { x: number; y: number; width: number; height: number }

/** Height of a small label box in px (13 px text plus padding): the clipped column's `↑ 224K` and the float label. */
export const LABEL_HEIGHT = 14;

/** True if the boxes overlap or come closer than a 2 px margin. */
export const hits = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width + 2 && b.x < a.x + a.width + 2 && a.y < b.y + b.height + 2 && b.y < a.y + a.height + 2;

/** Where a name went: `course` (slanted, inside), `level` (horizontal, inside), `mouth` (gutter), `peak` (above). */
export type NameKind = 'course' | 'level' | 'mouth' | 'peak';

/**
 * A placed name. `(x, y)` is the text anchor on its centre line (`dominant-baseline: central`), `anchor` the
 * text anchor, `angle` a rotation in degrees about `(x, y)`; `box` the space it takes (for collisions) and
 * `leader` the path of a mouth name's curve back to its river.
 */
export interface RiverName {
  id: string;
  text: string;
  kind: NameKind;
  x: number;
  y: number;
  angle: number;
  anchor: 'start' | 'middle';
  box: Box;
  leader?: string;
}

/** A river as the namer sees it: per-bucket edges and thickness, in lane order. */
export interface NameRiver {
  id: string;
  text: string;
  top: readonly number[];
  bottom: readonly number[];
  thickness: readonly number[];
}

/** Inputs to {@link placeRiverNames}: rivers in lane order, the plot, a text measure and what to keep clear of. */
export interface NameInput {
  rivers: readonly NameRiver[];
  plot: { left: number; right: number; top: number; bottom: number };
  bucketWidth: number;
  /** Width of a 13 px italic 500 name. */
  measure: (text: string) => number;
  /** Mouth names must end by this x (the column's right edge); at or left of `plot.right` there are none. */
  limit: number;
  /** Transfers drawn at rest: the names keep clear of them. */
  transfers: readonly { start: Point; end: Point }[];
  /** Other marks to keep clear of (the clipped column's break mark and its text). */
  obstacles?: readonly Box[];
  /**
   * The phone chart (DESIGN §5), laid out with time along x and drawn transposed: a name only where a smoothed run
   * fits it, straight along the river (slope 0, so it reads downward once transposed); no level, mouth or peak names.
   */
  phone?: boolean;
}

/** Thinnest bucket that holds a name inside (13 px text and 2 px of water each side). */
const MIN_THICK = 17;
/** Half the band a name inside needs: the river must contain the centre line ±8 px along the text. */
const HALF = 8;
const MAX_SLOPE = 0.35;
/** Mouth names: 17 px apart, the text 16 px right of the plot. */
const STEP = 17;
const GUTTER = 14;

const r1 = (v: number): number => Math.round(v * 10) / 10;
const overlap = (a: Box, b: Box): boolean =>
  a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
const span = (x0: number, x1: number, y0: number, y1: number): Box => ({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });

/** Places every river's name; `dropped` lists the rivers left without one (the Rivers table names them). */
export function placeRiverNames(input: NameInput): { names: RiverName[]; dropped: string[] } {
  const { rivers, plot, bucketWidth: bw, measure, limit } = input;
  const B = rivers[0]?.thickness.length ?? 0;
  const taken: Box[] = [
    ...(input.obstacles ?? []),
    ...input.transfers.map(({ start: s, end: e }) =>
      span(Math.min(s[0], e[0]) - 4, Math.max(s[0], e[0]) + 8, Math.min(s[1], e[1]) - 4, Math.max(s[1], e[1]) + 4)),
  ];
  const free = (box: Box): boolean => !taken.some((q) => overlap(q, box));
  const cx = (i: number): number => plot.left + bw * (i + 0.5);
  const names: RiverName[] = [];
  const put = (name: RiverName): void => void (taken.push(name.box), names.push(name));
  const rest: NameRiver[] = [];

  const maxSlope = input.phone ? 0 : MAX_SLOPE;
  for (const r of rivers) {
    const name = inside(r) ?? (input.phone ? undefined : level(r));
    if (name) put(name);
    else rest.push(r);
  }
  if (input.phone) return { names, dropped: rest.map((r) => r.id) };

  // Rivers that reach the present: names stacked down the gutter, each with a leader curve from the river's end.
  let last = -Infinity;
  const gx = plot.right + GUTTER;
  const unnamed = rest.filter((r) => {
    if (!(r.thickness[B - 1]! > 0)) return true;
    const w = measure(r.text);
    const ry = (r.top[B - 1]! + r.bottom[B - 1]!) / 2;
    const y = Math.max(ry, last + STEP);
    if (gx + 2 + w > limit || y > plot.bottom) return true;
    last = y;
    const leader = `M${r1(plot.right + 1)},${r1(ry)}C${r1(gx - 6)},${r1(ry)} ${r1(gx - 8)},${r1(y)} ${r1(gx - 2)},${r1(y)}`;
    put({ id: r.id, text: r.text, kind: 'mouth', x: gx + 2, y, angle: 0, anchor: 'start', box: span(gx + 2, gx + 2 + w, y - 8, y + 8), leader });
    return false;
  });

  // The rest: above the peak, if that spot is free and below the era band.
  const dropped: string[] = [];
  for (const r of unnamed) {
    const k = r.thickness.reduce((m, t, i) => (t > r.thickness[m]! ? i : m), 0);
    const w = measure(r.text);
    const x = Math.min(plot.right - w / 2, Math.max(plot.left + w / 2, cx(k)));
    const y = r.top[k]! - 10.5;
    const box = span(x - w / 2, x + w / 2, y - 8, y + 8);
    if (box.y >= plot.top - 8 && free(box)) put({ id: r.id, text: r.text, kind: 'peak', x, y, angle: 0, anchor: 'middle', box });
    else dropped.push(r.id);
  }
  return { names, dropped };

  /** Linear interpolation of a per-bucket edge between bucket centres (flat beyond the ends). */
  function at(arr: readonly number[], x: number): number {
    const f = (x - plot.left) / bw - 0.5;
    const i = Math.max(0, Math.min(B - 1, Math.floor(f)));
    const k = Math.min(B - 1, i + 1);
    const t = Math.max(0, Math.min(1, f - i));
    return arr[i]! + (arr[k]! - arr[i]!) * t;
  }
  /**
   * Does the river contain the line `y(x)` ±8 px along `[x0, x0 + w]`? The edges are linear between bucket
   * centres, so checking the ends and the centres in between is exact (gen.mjs sampled 11 or 13 points).
   */
  function contains(r: NameRiver, x0: number, w: number, y: (x: number) => number): boolean {
    const xs = [x0, x0 + w, ...r.thickness.map((_, i) => cx(i)).filter((x) => x > x0 && x < x0 + w)];
    return xs.every((x) => at(r.top, x) <= y(x) - HALF && at(r.bottom, x) >= y(x) + HALF);
  }

  /** 1. Slanted along the course: the longest run where the smoothed centre stays well inside, a fitted line. */
  function inside(r: NameRiver): RiverName | undefined {
    const mid = (i: number): number => (r.top[i]! + r.bottom[i]!) / 2;
    const sm = r.thickness.map((_, i) => {
      let [a, n] = [0, 0];
      for (let k = Math.max(0, i - 2); k <= Math.min(B - 1, i + 2); k++) if (r.thickness[k]! > 0) [a, n] = [a + mid(k), n + 1];
      return n ? a / n : mid(i);
    });
    const ok = (i: number): boolean => r.thickness[i]! >= MIN_THICK && Math.abs(sm[i]! - mid(i)) <= (r.thickness[i]! - 15) / 2;
    let best: { a: number; b: number; len: number } | undefined;
    for (let a = 0; a < B; a++) {
      if (!ok(a) || (a > 0 && ok(a - 1))) continue;
      let b = a;
      while (b + 1 < B && ok(b + 1)) b++;
      if (!best || (b - a) * bw > best.len) best = { a, b, len: (b - a) * bw };
    }
    const w = measure(r.text);
    if (!best || best.len < w + 20) return undefined;
    const x0 = cx(best.a) + Math.max(0, (best.len - w) / 2);
    const pts: Point[] = [];
    for (let i = best.a; i <= best.b; i++) if (cx(i) >= x0 - bw && cx(i) <= x0 + w + bw) pts.push([cx(i), sm[i]!]);
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const sxx = pts.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
    const sxy = pts.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0);
    const slope = Math.max(-maxSlope, Math.min(maxSlope, sxx ? sxy / sxx : 0));
    const y = (x: number): number => my + slope * (x - mx);
    const box = span(x0, x0 + w, Math.min(y(x0), y(x0 + w)) - 9, Math.max(y(x0), y(x0 + w)) + 9);
    if (!contains(r, x0, w, y) || !free(box)) return undefined;
    return { id: r.id, text: r.text, kind: 'course', x: x0, y: y(x0), angle: (Math.atan(slope) * 180) / Math.PI, anchor: 'start', box };
  }

  /** 2. Level inside the river at its thickest buckets, nudged up to 6 px off the centre. */
  function level(r: NameRiver): RiverName | undefined {
    const w = measure(r.text);
    const order = r.thickness.map((t, i) => [t, i] as const).toSorted((p, q) => q[0] - p[0]);
    for (const [t, i] of order) {
      if (t < MIN_THICK) break;
      const x = Math.min(plot.right - w / 2 - 4, Math.max(plot.left + w / 2 + 4, cx(i)));
      for (const dy of [0, -3, 3, -6, 6]) {
        const y = (r.top[i]! + r.bottom[i]!) / 2 + dy;
        const box = span(x - w / 2, x + w / 2, y - 9, y + 9);
        if (contains(r, x - w / 2, w, () => y) && free(box)) return { id: r.id, text: r.text, kind: 'level', x, y, angle: 0, anchor: 'middle', box };
      }
    }
    return undefined;
  }
}
