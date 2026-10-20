/** Pure geometry for the chart's overlays: the cursor's bucket tag and the floating label of a dropped river. */
import { LABEL_HEIGHT, hits, type Box } from '../core/layout/labels.ts';
import type { RiverLayout, RiverShape } from '../core/layout/layout.ts';

const CHAR = 7.4; // 12 px mono

/** The cursor's bucket tag under the axis, kept inside the plot; `avoid` is the x span year labels must clear. */
export function cursorTag(text: string, x: number, left: number, right: number): { text: string; x: number; width: number; avoid: [number, number] } {
  const width = CHAR * text.length + 10;
  const cx = Math.min(Math.max(x, left + width / 2), right - width / 2);
  return { text, x: cx, width, avoid: [cx - width / 2 - 4, cx + width / 2 + 4] };
}

/** True when the closed spans `[a0, a1]` and `[b0, b1]` overlap. */
export const overlaps = ([a0, a1]: readonly [number, number], [b0, b1]: readonly [number, number]): boolean => a0 < b1 && b0 < a1;

/**
 * Where to draw a dropped river's label while it is active: centred on the bucket (clamped 4 px inside the plot),
 * above the river's top edge, or below its bottom edge when the top spot hits the partial or clip label boxes.
 * `x`, `y` are the text's centre (`text-anchor: middle`, `dominant-baseline: central`).
 */
export function floatLabel(L: RiverLayout, shape: RiverShape, bucket: number, text: string): { x: number; y: number } {
  const { left, right, top, bottom } = L.plot;
  const tw = CHAR * text.length;
  const x = Math.min(Math.max(L.columns[bucket]!.x, left + tw / 2 + 4), right - tw / 2 - 4);
  const half = LABEL_HEIGHT / 2;
  const boxAt = (y: number): Box => ({ x: x - tw / 2, y: y - half, width: tw, height: LABEL_HEIGHT });
  const obstacles = [...L.clipped.map((c) => c.box), ...(L.partial ? [L.partial.box] : [])];
  const above = Math.max(top + 7, shape.edges.top[bucket]! - 11);
  if (!obstacles.some((o) => hits(boxAt(above), o))) return { x, y: above };
  return { x, y: Math.min(bottom - 7, shape.edges.bottom[bucket]! + 11) };
}
