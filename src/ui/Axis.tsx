import type { RiverLayout } from '../core/layout/layout.ts';

/**
 * Year spans along x: graticule lines ("meridians") at year starts and centred year labels, thinned to every
 * 1st/2nd/5th/10th year so labels are ≥ 48 px apart (docs/viz/rivers.md §5.7). Pure, for tests.
 */
export function yearTicks(starts: readonly string[], left: number, w: number): { lines: number[]; labels: { x: number; text: string }[] } {
  const years = starts.map((s) => Number(s.slice(0, 4)));
  const lines = years.flatMap((y, i) => (i > 0 && y !== years[i - 1] ? [left + i * w] : []));
  const edges = [left, ...lines, left + years.length * w];
  const spans = edges.slice(1).map((x1, j) => ({ x: (edges[j]! + x1) / 2, year: years[Math.round((edges[j]! - left) / w)]! }));
  const thin = (step: number) => spans.filter((s) => s.year % step === 0);
  const step = [1, 2, 5, 10].find((n) => thin(n).every((s, j, a) => j === 0 || s.x - a[j - 1]!.x >= 48)) ?? 20;
  return { lines, labels: thin(step).map((s) => ({ x: s.x, text: String(s.year) })) };
}

/** Graticule, year labels, the axis line and the dotted "estimated" rule under truncated buckets. */
export function Axis({ layout: L, starts }: { layout: RiverLayout; starts: readonly string[] }) {
  const { left, right, top, bottom } = L.plot;
  const { lines, labels } = yearTicks(starts, left, L.bucketWidth);
  const yearY = bottom + 20;
  const first = L.estimated[0];
  const roomy = first && labels.every((l) => l.x + 18 < first.x0 || l.x - 18 > first.x0 + 72) && first.x0 + 72 <= right;
  return (
    <g className="rr-axis" aria-hidden="true">
      {lines.map((x) => <line key={x} x1={x} x2={x} y1={top} y2={bottom} className="rr-grid" />)}
      <line x1={left} x2={right} y1={bottom + 2} y2={bottom + 2} className="rr-grid" />
      {L.estimated.map((e) => <line key={e.from} x1={e.x0 + 1} x2={e.x1 - 1} y1={bottom + 5} y2={bottom + 5} className="rr-estimated" data-estimated />)}
      {roomy && <text x={first.x0 + 2} y={yearY} className="rr-tick">estimated</text>}
      {labels.map((l) => (
        <text key={l.text} x={Math.min(Math.max(l.x, left + 16), right - 16)} y={yearY} textAnchor="middle" className="rr-tick">{l.text}</text>
      ))}
    </g>
  );
}
