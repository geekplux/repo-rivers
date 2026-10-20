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
  const { lines, labels: ticks } = yearTicks(starts, left, L.bucketWidth);
  const labels = ticks.map((l) => ({ ...l, x: Math.min(Math.max(l.x, left + 16), right - 16) }));
  const yearY = bottom + 20;
  // "estimated" sits on the dotted rule's line, left-aligned 6 px after the first run, only where it is clear of
  // the year labels (half-width 7.4·chars/2 + 8), the next run and the plot edge.
  const [first, next] = L.estimated;
  const tx = first ? first.x1 + 6 : 0;
  const tw = 7.4 * 'estimated'.length;
  const roomy = first && tx + tw <= Math.min(right, next ? next.x0 - 6 : Infinity) &&
    labels.every((l) => { const half = (7.4 * l.text.length) / 2 + 8; return l.x + half <= tx || l.x - half >= tx + tw; });
  return (
    <g className="rr-axis" aria-hidden="true">
      {lines.map((x) => <line key={x} x1={x} x2={x} y1={top} y2={bottom} className="rr-grid" />)}
      <line x1={left} x2={right} y1={bottom + 2} y2={bottom + 2} className="rr-grid" />
      {L.estimated.map((e) => <line key={e.from} x1={e.x0 + 1} x2={e.x1 - 1} y1={bottom + 5} y2={bottom + 5} className="rr-estimated" data-estimated />)}
      {roomy && <text x={tx} y={bottom + 5} className="rr-tick rr-estimated-label">estimated</text>}
      {labels.map((l) => (
        <text key={l.text} x={l.x} y={yearY} textAnchor="middle" className="rr-tick">{l.text}</text>
      ))}
    </g>
  );
}
