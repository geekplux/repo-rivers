import { useEffect, useId, useMemo } from 'react';
import { layoutRivers } from '../core/layout/layout.ts';
import type { RepoAggregate } from '../core/schema.ts';
import { selectView } from '../core/view.ts';
import { Axis } from './Axis.tsx';

const fill = (c: number): string => `var(--rr-river-${c})`;

/**
 * The timeline-sankey in SVG, drawn from `layoutRivers` at real CSS-pixel width (never viewBox-scaled):
 * hatched "other", dotted bot outlines, dashed arrowed transfers, haloed mono labels, break marks, the partial
 * survey line and a once-per-dataset clip-path reveal (CSS; instant under reduced motion).
 */
export function RiverChart({ aggregate, width, mobile }: { aggregate: RepoAggregate; width: number; mobile: boolean }) {
  const id = useId();
  const view = useMemo(() => selectView(aggregate, { dimension: 'modules' }), [aggregate]);
  const L = useMemo(
    () => layoutRivers(view, { width, mobile, asOf: aggregate.generatedAt, truncatedBuckets: aggregate.source.truncatedBuckets }),
    [view, width, mobile, aggregate],
  );
  useEffect(() => {
    const frame = requestAnimationFrame(() => performance.mark('rivers-rendered', { detail: aggregate.repo.name }));
    return () => cancelAnimationFrame(frame);
  }, [aggregate]);

  const { repo, time } = aggregate;
  const top3 = view.rivers.toSorted((a, b) => b.total - a.total).slice(0, 3).map((r) => r.label);
  const summary = `River chart of ${view.metric} per ${time.unit} in ${repo.owner}/${repo.name}, ${view.buckets[0]?.label} to ` +
    `${view.buckets.at(-1)?.label}, ${view.rivers.length} rivers; largest: ${top3.join(', ')}.` +
    (L.transfers.some((t) => t.alwaysVisible) ? ' Dashed arrows mark files moved between modules.' : '');
  const { top, bottom } = L.plot;
  return (
    <svg data-testid="river-chart" role="img" aria-label={summary} width={L.width} height={L.height} viewBox={`0 0 ${L.width} ${L.height}`} className="rr-chart">
      <defs>
        <pattern id={`${id}h`} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <rect width="6" height="6" style={{ fill: fill(8) }} />
          <line x1="0" y1="0" x2="0" y2="6" className="rr-hatch" />
        </pattern>
        <marker id={`${id}a`} markerUnits="userSpaceOnUse" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
          <path d="M0,0L7,3.5L0,7Z" className="rr-ink" />
        </marker>
      </defs>
      <Axis layout={L} starts={aggregate.time.starts} />
      <g className="rr-reveal" key={`${repo.owner}/${repo.name}`}>
        {L.rivers.map((r) => (
          <path key={r.id} d={r.path} data-river={r.id} data-total={view.rivers.find((v) => v.id === r.id)?.total}
            className={r.bot ? 'rr-bot' : undefined} style={{ fill: r.kind === 'other' ? `url(#${id}h)` : fill(r.color) }} />
        ))}
        {L.clipped.map(({ index, mark: m, box, text }) => (
          <g key={index} data-clip={text}>
            <path d={`M${m.x},${m.y + 7}L${m.x + m.width},${m.y + 1}V${m.y + 5}L${m.x},${m.y + 11}Z`} className="rr-cut" />
            <path d={`M${m.x},${m.y + 7}L${m.x + m.width},${m.y + 1}M${m.x},${m.y + 11}L${m.x + m.width},${m.y + 5}`} className="rr-break" />
            <text x={box.x} y={box.y + 7} className="rr-label">{text}</text>
          </g>
        ))}
        {L.transfers.filter((t) => t.alwaysVisible).map((t) => (
          <g key={`${t.bucket}${t.from}${t.to}`} data-transfer={`${t.from}→${t.to}`}>
            <path d={t.path} className="rr-halo" style={{ strokeWidth: t.width + 2 }} />
            <path d={t.path} className="rr-transfer" style={{ strokeWidth: t.width }} markerEnd={`url(#${id}a)`} />
          </g>
        ))}
        {L.labels.placed.map((p) => (
          <g key={`${p.id}${p.x}`}>
            {p.leader && <line x1={p.leader[0]} y1={p.leader[1]} x2={p.leader[2]} y2={p.leader[3]} className="rr-leader" />}
            {p.kind === 'callout' && <circle cx={p.leader![0]} cy={p.leader![1]} r="2.5" className="rr-pin" />}
            <text x={p.x} y={p.y + 7} className="rr-label" data-label-for={p.id}>{p.text}</text>
          </g>
        ))}
      </g>
      {L.partial && (
        <g data-partial>
          <line x1={L.partial.x} x2={L.partial.x} y1={top} y2={bottom} className="rr-survey" />
          <text x={L.partial.box.x} y={L.partial.box.y + 7} className="rr-label rr-muted">{L.partial.text}</text>
        </g>
      )}
    </svg>
  );
}
