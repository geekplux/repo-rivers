import { useEffect, useId, useRef, type MouseEvent } from 'react';
import { PHONE, phoneGuides } from '../core/layout/guides.ts';
import { flipMatrix, flipName, toPage, type Flip } from '../core/layout/transpose.ts';
import { eraRange } from '../core/summary.ts';
import { chartLabel, cls, Drawing, EraButtons, Hatch, Names, useChartMotion, useRenderedMark, Waters, type RiverChartProps } from './RiverChart.tsx';

export interface PhoneChartProps extends Omit<RiverChartProps, 'interactive'> {
  /** The chart's width (the column's content width). */
  width: number;
  /** The transposition: `layout` is laid out with time along x (`layoutRivers` at `phoneSize`). */
  flip: Flip;
}

/**
 * The phone chart (docs/redesign/DESIGN.md §5): the desktop layout transposed, so time runs down the page about
 * 56 px per bucket and the page scrolls through history (no horizontal scrolling). Year labels in the left column,
 * a full-width rule at each era start with the era name right-aligned under it, river names only where a smoothed
 * run fits them, reading downward. The water is drawn in layout coordinates inside a transposing group; the
 * focus is a horizontal rule at the bucket and a dot on the river. Same `role="img"` and HTML layers as desktop.
 */
export function PhoneChart({ aggregate, view, layout: L, width, flip, active, chart, svg, describedBy, eras = [], activeEra = null, onEra, arrive, viewKey }: PhoneChartProps) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useRenderedMark(aggregate);
  const { river: on, bucket } = active;
  const { svgRef, waterRef, eraRef, eraNameRef } = useChartMotion(arrive, on, true);
  const col = bucket === null ? undefined : L.columns[bucket];
  const shape = L.rivers.find((r) => r.id === on);
  const { left, right, top, bottom } = L.plot;
  const height = PHONE.top + (right - left) + PHONE.bottom;
  const guides = phoneGuides(view.buckets, eras, flip.dy + left, L.bucketWidth, width);
  const selected = activeEra === null ? undefined : eras[activeEra];
  const yOf = (b: number): number => flip.dy + left + b * L.bucketWidth;
  const axis = bottom + 8; // the desktop axis line, on the phone a column right of the rivers: estimated runs only
  const { repo, time } = aggregate;
  const pointer = svg && { ...svg, onClick: (e: MouseEvent<Element>) => (ref.current?.focus({ preventScroll: true, focusVisible: false }), svg.onClick(e)) };
  const dot = col && shape && bucket !== null ? toPage(flip, [col.x, (shape.edges.top[bucket]! + shape.edges.bottom[bucket]!) / 2]) : null;
  const ruleY = col ? flip.dy + col.x : null;
  // On focus, every key move and after a tap (the chart then has focus), keep the rule and dot on screen above the
  // docked readout: the page scrolls by the least amount, instantly under reduced motion.
  useEffect(() => {
    const plot = ref.current;
    if (ruleY === null || !plot || document.activeElement !== plot) return;
    const y = plot.parentElement!.getBoundingClientRect().top + ruleY;
    const dock = document.querySelector('[data-docked]')?.getBoundingClientRect().top ?? innerHeight;
    const [lo, hi] = [y - 24, y + 24];
    const by = lo < 0 ? lo : hi > dock ? hi - dock : 0;
    if (by) scrollBy({ top: by, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }, [ruleY]);
  return (
    <div className="rr-stack" style={{ width }}>
      <svg ref={svgRef} data-testid="river-chart" data-phone width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="rr-chart" role="img"
        aria-label={chartLabel(aggregate, view)} aria-describedby={describedBy} {...pointer}>
        <defs><Hatch id={`${id}h`} /></defs>
        {selected && <rect x={0} y={yOf(selected.start)} width={width} height={yOf(selected.end + 1) - yOf(selected.start)} className="rr-era-band" data-era-band={activeEra} />}
        <g ref={eraRef}>{guides.eras.map((g, i) => <line key={i} x1={0} x2={width} y1={g.y} y2={g.y} className="rr-rule" data-era-mark={i} />)}</g>
        {guides.years.map((t) => <text key={t.text} x={0} y={t.y} className="rr-tick rr-phone-year" data-year={t.text}>{t.text}</text>)}
        <Drawing className={cls('rr-reveal', on !== null && 'rr-focusing')} key={`${repo.owner}/${repo.name}`} innerRef={waterRef} arrive={arrive} viewKey={viewKey}>
          <g transform={flipMatrix(flip)}>
            <Waters L={L} view={view} on={on} hatch={`${id}h`} />
            {L.estimated.map((e) => <line key={e.from} x1={e.x0} x2={e.x1} y1={axis} y2={axis} className="rr-estimated" data-estimated />)}
            {L.partial && <line x1={L.partial.x} x2={L.partial.x} y1={top - 8} y2={axis} className="rr-survey" data-partial />}
          </g>
          {L.clipped.map(({ index, x, text }) => {
            const [px, py] = toPage(flip, [x, L.columns[index]!.top + 20]);
            // The column is cut at its left on the phone, so its arrow points left.
            return <text key={index} x={px} y={py} className="rr-label rr-clip-label">{text.replace('↑', '←')}</text>;
          })}
          <Names L={L} names={L.labels.names.map((n) => flipName(flip, n))} on={on} />
        </Drawing>
        <g ref={eraNameRef}>{guides.eras.map((g, i) => <text key={i} x={width} y={g.nameY} textAnchor="end" className="rr-phone-era">{g.text}</text>)}</g>
        {col && <line x1={0} x2={width} y1={flip.dy + col.x} y2={flip.dy + col.x} className="rr-cursor" data-cursor-line />}
        {dot && <circle cx={dot[0]} cy={dot[1]} r="4.5" className="rr-dot" data-cursor={bucket} />}
      </svg>
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- role="application": the chart's one tab stop (arrow keys) */}
      <div ref={ref} className="rr-plot" tabIndex={0} role="application" aria-roledescription="river chart" aria-describedby={describedBy}
        aria-label={`${repo.owner}/${repo.name}, ${view.metric} per ${time.unit}. Left and Right arrows change river, Up and Down change ${time.unit}, Home and End jump to the ends, Enter pins, Escape clears.`}
        data-active={on ?? ''} data-bucket={bucket ?? ''} data-pinned={active.pinned} {...chart}
        style={{ left: flip.dx + top - 8, top: flip.dy + left - 8, width: bottom - top + 16, height: right - left + 16 }} />
      {eras.length > 0 && (
        <EraButtons eras={eras} ranges={eras.map((e) => eraRange(view.buckets, e))} active={activeEra} onActive={onEra} style={{ width, height }}
          place={guides.eras.map((g) => ({ left: width - g.width - 8, width: g.width + 12, top: g.nameY - 26, height: 44 }))} />
      )}
    </div>
  );
}
