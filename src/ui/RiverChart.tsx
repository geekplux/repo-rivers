import { useEffect, useId, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import type { RiverLayout } from '../core/layout/layout.ts';
import { link } from '../core/layout/ribbons.ts';
import type { RepoAggregate } from '../core/schema.ts';
import type { RiverView } from '../core/view.ts';
import { Axis } from './Axis.tsx';
import type { FocusState } from './useRiverFocus.ts';

const fill = (c: number): string => `var(--rr-river-${c})`;
const cls = (...names: (string | false)[]): string => names.filter(Boolean).join(' ');

export interface RiverChartProps {
  aggregate: RepoAggregate;
  view: RiverView;
  layout: RiverLayout;
  mobile: boolean;
  /** The active river and bucket (from `useRiverFocus`). */
  active: FocusState;
  /** Keyboard and focus handlers for the chart's single tab stop. */
  chart: { onFocus: () => void; onKeyDown: (e: KeyboardEvent<SVGGElement>) => void };
  /** Pointer handlers (hover, click to pin). */
  svg: { onPointerMove: (e: MouseEvent<SVGSVGElement>) => void; onPointerLeave: () => void; onClick: (e: MouseEvent<SVGSVGElement>) => void };
  /** Id of the prose summary (`aria-describedby`). */
  describedBy: string;
}

/**
 * The timeline-sankey in SVG, drawn from `layoutRivers` at real CSS-pixel width (never viewBox-scaled), with
 * one focusable group for keyboard exploration, dimming of the other rivers, the active river's outline and
 * transfers, and a bucket cursor (docs/viz/rivers.md §6).
 */
export function RiverChart({ aggregate, view, layout: L, mobile, active, chart, svg, describedBy }: RiverChartProps) {
  const id = useId();
  const ref = useRef<SVGGElement>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => performance.mark('rivers-rendered', { detail: aggregate.repo.name }), 0);
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [aggregate]);

  const { river: on, bucket } = active;
  const col = bucket === null ? undefined : L.columns[bucket];
  // Mobile: keep the keyboard's bucket inside the scroll region.
  useEffect(() => {
    const region = ref.current?.ownerSVGElement?.parentElement;
    if (!mobile || !col || !region || document.activeElement !== ref.current) return;
    if (col.x < region.scrollLeft + 40 || col.x > region.scrollLeft + region.clientWidth - 40) region.scrollLeft = col.x - region.clientWidth / 2;
  }, [mobile, col]);

  const { repo, time } = aggregate;
  const { left, right, top, bottom } = L.plot;
  const dims = (rid: string) => cls('rr-dimmable', rid === on && 'rr-on');
  const shape = L.rivers.find((r) => r.id === on);
  const float = shape && col && bucket !== null && L.labels.dropped.includes(shape.id)
    ? { text: shape.bot ? `${shape.label} · bot` : shape.label, x: col.x, y: Math.max(top + 7, shape.edges.top[bucket]! - 11) }
    : null;
  const tag = col && bucket !== null ? view.buckets[bucket]!.label : '';
  const tagW = 7.4 * tag.length + 10;
  const tagX = col ? Math.min(Math.max(col.x, left + tagW / 2), right - tagW / 2) : 0;
  return (
    <svg data-testid="river-chart" aria-label={`River chart of ${repo.owner}/${repo.name}`} width={L.width} height={L.height}
      viewBox={`0 0 ${L.width} ${L.height}`} className="rr-chart" {...svg}>
      <defs>
        <pattern id={`${id}h`} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <rect width="6" height="6" style={{ fill: fill(8) }} />
          <line x1="3" y1="0" x2="3" y2="6" className="rr-hatch" />
        </pattern>
      </defs>
      <Axis layout={L} starts={time.starts} />
      <g ref={ref} tabIndex={0} role="group" aria-roledescription="river chart" className="rr-plot" aria-describedby={describedBy} {...chart}
        data-active={on ?? ''} data-bucket={bucket ?? ''} data-pinned={active.pinned}
        aria-label={`${view.metric} per ${time.unit}. Arrow keys move between rivers and ${time.unit}s, Enter pins, Escape clears.`}>
        <rect x={left + 1} y={top - 5} width={right - left - 2} height={bottom - top + 10} rx="3" className="rr-ring" />
        <g aria-hidden="true">
          <g className={cls('rr-reveal', on !== null && 'rr-focusing')} key={`${repo.owner}/${repo.name}`}>
            {L.rivers.map((r) => (
              <path key={r.id} d={r.path} data-river={r.id} data-total={view.rivers.find((v) => v.id === r.id)?.total}
                className={cls(dims(r.id), 'rr-river', r.bot && 'rr-bot')} style={{ fill: r.kind === 'other' ? `url(#${id}h)` : fill(r.color) }} />
            ))}
            {L.clipped.map(({ index, mark: m, box, text }) => (
              <g key={index} data-clip={text}>
                <path d={`M${m.x},${m.y + 7}L${m.x + m.width},${m.y + 1}V${m.y + 5}L${m.x},${m.y + 11}Z`} className="rr-cut" />
                <path d={`M${m.x},${m.y + 7}L${m.x + m.width},${m.y + 1}M${m.x},${m.y + 11}L${m.x + m.width},${m.y + 5}`} className="rr-break" />
                <text x={box.x} y={box.y + 7} className="rr-label">{text}</text>
              </g>
            ))}
            {L.transfers.filter((t) => t.alwaysVisible || t.from === on || t.to === on).map((t) => {
              // Arrowhead sized per transfer so it stays visible on wide lines; the dash ends under the head.
              const a = Math.max(7, 2 * t.width + 2);
              const [ex, ey] = t.end;
              const d = link(t.start, [ex - a + 1, ey]);
              const lit = t.from === on || t.to === on;
              return (
                <g key={`${t.bucket}${t.from}${t.to}`} data-transfer={`${t.from}→${t.to}`} className={cls('rr-dimmable', lit && 'rr-on')}>
                  <path d={d} className="rr-halo" style={{ strokeWidth: t.width + 2 }} />
                  <path d={d} className="rr-transfer" style={{ strokeWidth: t.width }} />
                  <path d={`M${ex - a},${ey - a / 2}L${ex},${ey}L${ex - a},${ey + a / 2}Z`} className="rr-arrow" data-arrow={a} />
                </g>
              );
            })}
            {L.labels.placed.map((p) => (
              <g key={`${p.id}${p.x}`} className={dims(p.id)}>
                {p.leader && <line x1={p.leader[0]} y1={p.leader[1]} x2={p.leader[2]} y2={p.leader[3]} className="rr-leader-halo" />}
                {p.leader && <line x1={p.leader[0]} y1={p.leader[1]} x2={p.leader[2]} y2={p.leader[3]} className="rr-leader" />}
                {p.kind === 'callout' && <circle cx={p.leader![0]} cy={p.leader![1]} r="2.5" className="rr-pin" />}
                <text x={p.x} y={p.y + 7} className="rr-label" data-label-for={p.id}>{p.text}</text>
              </g>
            ))}
          </g>
          {col && (
            <g data-cursor={bucket}>
              <line x1={col.x} x2={col.x} y1={top} y2={bottom} className="rr-cursor" />
              <rect x={tagX - tagW / 2} y={bottom + 7} width={tagW} height={18} rx="2" className="rr-cursor-box" />
              <text x={tagX} y={bottom + 16} textAnchor="middle" className="rr-cursor-tag">{tag}</text>
            </g>
          )}
          {float && <text x={Math.min(Math.max(float.x, left + 4), right - 7.4 * float.text.length - 4)} y={float.y} className="rr-label" data-float>{float.text}</text>}
        </g>
      </g>
      {L.partial && (
        <g data-partial aria-hidden="true">
          <line x1={L.partial.x} x2={L.partial.x} y1={top} y2={bottom} className="rr-survey-halo" />
          <line x1={L.partial.x} x2={L.partial.x} y1={top} y2={bottom} className="rr-survey" />
          <text x={L.partial.box.x} y={L.partial.box.y + 7} className="rr-label rr-muted">{L.partial.text}</text>
        </g>
      )}
    </svg>
  );
}
