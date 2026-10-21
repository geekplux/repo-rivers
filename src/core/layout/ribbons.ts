/**
 * Ribbon geometry: mid-x cubic Béziers with horizontal tangents (timeline-sankey "solution 2").
 * A river's edges are sampled at `xs = [left, x_0 … x_{B−1}, right]` (flat half-bucket stubs at both ends).
 */

/** A point `[x, y]`. */
export type Point = readonly [number, number];

const r1 = (v: number): string => String(Math.round(v * 10) / 10);
const pt = ([x, y]: Point): string => `${r1(x)},${r1(y)}`;

/** Per-column values extended with the flat stubs: `[v_0, v_0 … v_{B−1}, v_{B−1}]`, aligned with `xs`. */
export const extend = (ys: readonly number[]): number[] => [ys[0] ?? 0, ...ys, ys.at(-1) ?? 0];

/** `C` segments through `pts` (after the first), each with both control points at mid-x. */
export function curve(pts: readonly Point[]): string {
  return pts.slice(1).map((b, j) => {
    const a = pts[j]!;
    const m = (a[0] + b[0]) / 2;
    return `C${pt([m, a[1]])} ${pt([m, b[1]])} ${pt(b)}`;
  }).join('');
}

/** An open mid-x cubic from `a` to `b` (used for transfers). */
export const link = (a: Point, b: Point): string => `M${pt(a)}${curve([a, b])}`;

/**
 * One river's path: a closed subpath per maximal run of non-zero `values`, from the zero column before the
 * run (a point: the spring) or the left stub, to the zero column after it (the mouth) or the right stub.
 * `top` and `bottom` are per column (length B); coordinates are rounded to 0.1 px.
 */
export function ribbonPath(xs: readonly number[], top: readonly number[], bottom: readonly number[], values: readonly number[]): string {
  const [t, b] = [extend(top), extend(bottom)];
  let path = '';
  for (let a = 0; a < values.length; a++) {
    if (!((values[a] ?? 0) > 0) || (values[a - 1] ?? 0) > 0) continue;
    let end = a;
    while ((values[end + 1] ?? 0) > 0) end++;
    const idx = Array.from({ length: end - a + 3 }, (_, k) => a + k); // extended indices: spring … mouth
    const upper = idx.map((i): Point => [xs[i]!, t[i]!]);
    const lower = idx.toReversed().map((i): Point => [xs[i]!, b[i]!]);
    path += `M${pt(upper[0]!)}${curve(upper)}L${pt(lower[0]!)}${curve(lower)}Z`;
  }
  return path;
}

/** y of a mid-x cubic edge through `xs`/`ys` (extended arrays, equal spacing inside) at `x`; exact (Cardano). */
export function edgeAt(xs: readonly number[], ys: readonly number[], x: number): number {
  let j = 0;
  while (j < xs.length - 2 && x > xs[j + 1]!) j++;
  const [xa, xb, ya, yb] = [xs[j]!, xs[j + 1]!, ys[j]!, ys[j + 1]!];
  if (xb <= xa || ya === yb) return ya;
  // x(t)/Δx = t³ − 1.5t² + 1.5t; with t = s + ½ this is s³ + ¾s + ½ — one real root.
  const q = Math.min(1, Math.max(0, (x - xa) / (xb - xa))) - 0.5;
  const d = Math.sqrt((q * q) / 4 + 1 / 64);
  const t = 0.5 + Math.cbrt(q / 2 + d) + Math.cbrt(q / 2 - d);
  return ya + (yb - ya) * t * t * (3 - 2 * t);
}
