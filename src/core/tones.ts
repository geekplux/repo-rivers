/**
 * Two-tone river fills (docs/redesign/DESIGN.md §4): every river is water A (0) or water B (1), two blues that
 * differ in lightness, never in hue. Rivers "touch" in a column when they are consecutive among the column's
 * non-zero lanes ("other" is hatched and takes no part). A greedy two-colouring, heaviest first, gives each river
 * the tone that its already-coloured neighbours use in fewer touching columns. Pure.
 */
export type Tone = 0 | 1;

/** A lane as the colouring sees it, in lane order (top to bottom). */
export interface ToneLane {
  kind: 'module' | 'contributor' | 'other';
  values: readonly number[];
}

/** `w[i][j]`: in how many columns lanes `i` and `j` touch. */
export function touchCounts(lanes: readonly ToneLane[]): number[][] {
  const n = lanes.length;
  const w = Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
  const columns = Math.max(0, ...lanes.map((l) => l.values.length));
  for (let i = 0; i < columns; i++) {
    const live = lanes.flatMap((l, j) => ((l.values[i] ?? 0) > 0 && l.kind !== 'other' ? [j] : []));
    for (let k = 1; k < live.length; k++) {
      w[live[k - 1]!]![live[k]!]!++;
      w[live[k]!]![live[k - 1]!]!++;
    }
  }
  return w;
}

/** The tone of each lane (in lane order). Deterministic; "other" gets 1 (its hatch is drawn in water B). */
export function tones(lanes: readonly ToneLane[]): Tone[] {
  const w = touchCounts(lanes);
  const out: Tone[] = lanes.map(() => 1);
  const done = lanes.map(() => false);
  const weight = w.map((row) => row.reduce((a, b) => a + b, 0));
  const order = [...lanes.keys()].toSorted((a, b) => weight[b]! - weight[a]! || a - b);
  for (const j of order) {
    if (lanes[j]!.kind === 'other') continue;
    const c: [number, number] = [0, 0];
    w[j]!.forEach((n, k) => done[k] && (c[out[k]!] += n));
    out[j] = c[0] <= c[1] ? 0 : 1;
    done[j] = true;
  }
  return out;
}

/** Number of columns in which two touching lanes share a tone (what {@link tones} keeps low). */
export function sameToneTouches(lanes: readonly ToneLane[], t: readonly Tone[]): number {
  const w = touchCounts(lanes);
  let n = 0;
  w.forEach((row, i) => row.forEach((c, j) => j > i && t[i] === t[j] && (n += c)));
  return n;
}
