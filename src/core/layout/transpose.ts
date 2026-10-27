/**
 * The phone chart (docs/redesign/DESIGN.md §5) is the desktop layout transposed: `layoutRivers` lays the rivers out
 * with time along x (about 56 px per bucket) and the rivers side by side along y, and the phone draws that geometry
 * with time running down the page. A {@link Flip} maps layout points to page points by swapping the axes and
 * shifting: layout `(x, y)` → page `(dx + y, dy + x)`. Pure: the drawing uses {@link flipMatrix} on a group for
 * the ribbons and transfers, and maps names, guides and pointer positions point by point.
 */
import type { RiverLayout } from './layout.ts';
import type { Point } from './ribbons.ts';
import type { Box, RiverName } from './riverNames.ts';

/** Page `(x, y)` = `(dx + layout y, dy + layout x)`. */
export interface Flip { dx: number; dy: number }

/** The flip that puts the plot's cross axis (`plot.top`) at page x `left` and its first bucket (`plot.left`) at page y `top`. */
export function flipOf(L: Pick<RiverLayout, 'plot'>, left: number, top: number): Flip {
  return { dx: left - L.plot.top, dy: top - L.plot.left };
}

/** A layout point on the page. */
export const toPage = (f: Flip, [x, y]: Point): Point => [f.dx + y, f.dy + x];

/** A page point back in layout coordinates (for hit-testing a tap). */
export const toLayout = (f: Flip, [px, py]: Point): Point => [py - f.dy, px - f.dx];

/** The SVG transform that draws layout geometry transposed (a reflection in the diagonal, then the shift). */
export const flipMatrix = (f: Flip): string => `matrix(0 1 1 0 ${f.dx} ${f.dy})`;

/** A layout box on the page (its width and height swap). */
export const flipBox = (f: Flip, b: Box): Box => ({ x: f.dx + b.y, y: f.dy + b.x, width: b.height, height: b.width });

/**
 * A river name on the page: its anchor transposed, its box swapped, and its angle reflected (`90 − angle`), so a
 * name level along the time axis reads downward (rotated 90°).
 */
export function flipName(f: Flip, n: RiverName): RiverName {
  const [x, y] = toPage(f, [n.x, n.y]);
  return { ...n, x, y, angle: 90 - n.angle, box: flipBox(f, n.box) };
}
