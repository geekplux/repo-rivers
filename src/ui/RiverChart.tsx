import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { AXIS_ROOM, ERA_BAND, eraMarks, yearTicks } from '../core/layout/guides.ts';
import type { RiverLayout } from '../core/layout/layout.ts';
import type { RiverName } from '../core/layout/riverNames.ts';
import { link } from '../core/layout/ribbons.ts';
import type { Era, RepoAggregate } from '../core/schema.ts';
import { eraNote } from '../core/summary.ts';
import type { RiverView } from '../core/view.ts';
import { floatLabel } from './overlays.ts';
import type { FocusState } from './useRiverFocus.ts';

export const cls = (...names: (string | false | undefined)[]): string => names.filter(Boolean).join(' ');
/** Arrowhead length of a transfer (DESIGN §4). */
const ARROW = 7;

export interface RiverChartProps {
  aggregate: RepoAggregate;
  view: RiverView;
  /** Laid out with `top: ERA_BAND + 8` when `eras` are drawn: the band sits in the first 84 px of the SVG. */
  layout: RiverLayout;
  /** The active river and bucket (from `useRiverFocus`). */
  active: FocusState;
  /** Keyboard and focus handlers for the chart's single tab stop (ignored when not `interactive`). */
  chart?: { onFocus: () => void; onKeyDown: (e: KeyboardEvent<HTMLElement>) => void };
  /** Pointer handlers: hover, click to pin (ignored when not `interactive`). */
  svg?: { onPointerMove: (e: MouseEvent<Element>) => void; onPointerLeave: () => void; onClick: (e: MouseEvent<Element>) => void };
  /** Id of the prose summary (`aria-describedby`). */
  describedBy: string;
  /** Eras: a rule and a name each in the band above the plot; the selected one gets a band behind its span. */
  eras?: readonly Era[];
  activeEra?: number | null;
  /** Hover or focus of an era button (or null when it ends). */
  onEra?: (era: number | null) => void;
  /**
   * `false` draws a static picture (the `?embed=social` card): no tab stops and no pointer or key handlers.
   * Default `true`.
   */
  interactive?: boolean;
}

/** The chart's accessible name, a sentence: repository, measure, river count and time span. */
export function chartLabel(aggregate: RepoAggregate, view: RiverView): string {
  const { owner, name } = aggregate.repo;
  const first = view.buckets[0]?.label;
  const last = view.buckets.at(-1)?.label;
  const span = first && last ? `, ${first} to ${last}` : '';
  return `River chart of ${owner}/${name}: ${view.metric} per ${aggregate.time.unit} in ${view.rivers.length} rivers${span}.`;
}

/** Marks `rivers-rendered` once the chart for `aggregate` has painted (the browser checks time it). */
export function useRenderedMark(aggregate: RepoAggregate): void {
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
}

/**
 * The water, in layout coordinates (the phone draws it inside a transposing group): two-tone rivers with a hatched
 * "other" (pattern `hatch`), the clipped columns' break marks, and the transfers at rest or of the focused river.
 */
export function Waters({ L, view, on, hatch }: { L: RiverLayout; view: RiverView; on: string | null; hatch: string }) {
  return (
    <>
      {L.rivers.map((r) => (
        <path key={r.id} d={r.path} data-river={r.id} data-total={view.rivers.find((v) => v.id === r.id)?.total} data-tone={r.tone}
          className={cls('rr-river', r.kind === 'other' ? 'rr-other' : `rr-tone-${r.tone}`, r.id === on && 'rr-on', r.bot && 'rr-bot')}
          style={r.kind === 'other' ? { fill: `url(#${hatch})` } : undefined} />
      ))}
      {L.clipped.map(({ index, mark: m, text }) => (
        <g key={index} data-clip={text}>
          <path d={`M${m.x},${m.y + 7}L${m.x + m.width},${m.y + 1}V${m.y + 5}L${m.x},${m.y + 11}Z`} className="rr-cut" />
          <path d={`M${m.x},${m.y + 7}L${m.x + m.width},${m.y + 1}M${m.x},${m.y + 11}L${m.x + m.width},${m.y + 5}`} className="rr-break" />
        </g>
      ))}
      {L.transfers.filter((t) => t.alwaysVisible || t.from === on || t.to === on).map((t) => {
        // A ground casing, then the dash (width ≤ 3.5) ending under a 7 px arrowhead (DESIGN §4).
        const [ex, ey] = t.end;
        const d = link(t.start, [ex - ARROW + 1, ey]);
        const lit = t.from === on || t.to === on;
        return (
          <g key={`${t.bucket}${t.from}${t.to}`} data-transfer={`${t.from}→${t.to}`} className={cls('rr-xfer', lit && 'rr-on')}>
            <path d={d} className="rr-halo" style={{ strokeWidth: Math.max(1.5, t.width) + 2 }} />
            <path d={d} className="rr-transfer" style={{ strokeWidth: Math.min(t.width, 3.5) }} />
            <path d={`M${ex},${ey}l${-ARROW},${-ARROW / 2}v${ARROW}z`} className="rr-arrow" data-arrow={ARROW} />
          </g>
        );
      })}
    </>
  );
}

/** River names (`aria-hidden` with the rest of the image): on water inside a river; "other", mouth and peak names ink with a ground halo. */
export function Names({ L, names, on }: { L: RiverLayout; names: readonly RiverName[]; on: string | null }) {
  return names.map((n) => {
    const r = L.rivers.find((x) => x.id === n.id);
    const water = (n.kind === 'course' || n.kind === 'level') && r?.kind !== 'other';
    const text = r?.bot && n.text.endsWith(' bot') ? <>{n.text.slice(0, -4)} <tspan className="rr-label-muted">bot</tspan></> : n.text;
    return (
      <g key={`${n.id}@${n.x},${n.y}`} className={cls('rr-lab', n.id === on && 'rr-on')} data-name={n.kind}>
        {n.leader && <path d={n.leader} className="rr-leader" />}
        <text x={n.x} y={n.y} textAnchor={n.anchor === 'middle' ? 'middle' : undefined} transform={n.angle ? `rotate(${n.angle.toFixed(1)} ${n.x} ${n.y})` : undefined}
          className={cls('rr-label', water && 'rr-on-water', n.kind === 'peak' && 'rr-peak')} data-label-for={n.id}>{text}</text>
      </g>
    );
  });
}

/** The hatch of "other": water B lines every 6 px at 45° on ground (DESIGN §4). */
export function Hatch({ id }: { id: string }) {
  return (
    <pattern id={id} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
      <rect width="6" height="6" className="rr-hatch-ground" />
      <line x1="0" y1="0" x2="0" y2="6" className="rr-hatch" />
    </pattern>
  );
}

/**
 * The timeline-sankey (docs/redesign/DESIGN.md §4), drawn from `layoutRivers` at real CSS-pixel width: the era
 * band, two-tone rivers with a hatched "other", dashed transfers, the axis, and the focus fade with its rule and
 * dot. The drawing is one `role="img"` SVG named by a sentence and described by the prose summary; the keyboard
 * target (`role="application"`) and the era buttons are HTML siblings laid over it, so no focusable element sits
 * inside the image.
 */
export function RiverChart({ aggregate, view, layout: L, active, chart, svg, describedBy, eras = [], activeEra = null, onEra, interactive = true }: RiverChartProps) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  useRenderedMark(aggregate);

  const { river: on, bucket } = active;
  const col = bucket === null ? undefined : L.columns[bucket];

  const { repo, time } = aggregate;
  const { left, right, top, bottom } = L.plot;
  const banded = eras.length > 0;
  const height = bottom + AXIS_ROOM;
  const axisY = bottom + 8;
  const ruleTop = banded ? 8 : top;
  const shape = L.rivers.find((r) => r.id === on);
  const floatText = shape && col && bucket !== null && L.labels.dropped.includes(shape.id) ? shape.label : '';
  const float = shape && floatText && bucket !== null ? { text: floatText, ...floatLabel(L, shape, bucket, floatText) } : null;
  const marks = eraMarks(eras, view.buckets, left, L.bucketWidth);
  const selected = activeEra === null ? undefined : marks[activeEra];
  const unit = time.unit;
  // A click moves keyboard focus to the chart (so Escape and the arrows apply), then pins or releases a river.
  const pointer = svg && { ...svg, onClick: (e: MouseEvent<Element>) => (ref.current?.focus({ preventScroll: true, focusVisible: false }), svg.onClick(e)) };
  return (
    <div className="rr-stack" style={{ width: L.width }}>
      <svg data-testid="river-chart" data-static={!interactive || undefined} width={L.width} height={height} viewBox={`0 0 ${L.width} ${height}`}
        className="rr-chart" role="img" aria-label={chartLabel(aggregate, view)} aria-describedby={describedBy} {...(interactive ? pointer : {})}>
        <defs><Hatch id={`${id}h`} /></defs>
        {selected && <rect x={selected.x0} y={8} width={selected.x1 - selected.x0} height={axisY - 8} className="rr-era-band" data-era-band={activeEra} />}
        {banded && (
          <g className="rr-era-marks">
            {marks.map((m, i) => (
              <g key={eras[i]!.start} data-era-mark={i}>
                <line x1={m.x0} x2={m.x0} y1={ERA_BAND - 8} y2={axisY} className="rr-rule" />
                {m.lines.map((line, k) => (
                  <text key={k} x={m.x0} y={ERA_BAND - 30 - (m.lines.length - 1 - k) * 20} className="rr-era-name">{line}</text>
                ))}
                <text x={m.x0} y={ERA_BAND - 14} className="rr-era-range">{m.range}</text>
              </g>
            ))}
          </g>
        )}
        <g className={cls('rr-reveal', on !== null && 'rr-focusing')} key={`${repo.owner}/${repo.name}`}>
          <Waters L={L} view={view} on={on} hatch={`${id}h`} />
          {L.clipped.map(({ index, box, text }) => <text key={index} x={box.x} y={box.y + 7} className="rr-label rr-clip-label">{text}</text>)}
          <Names L={L} names={L.labels.names} on={on} />
        </g>
        {col && <line x1={col.x} x2={col.x} y1={ruleTop} y2={axisY} className="rr-cursor" data-cursor-line />}
        {col && shape && bucket !== null && (
          <circle cx={col.x} cy={(shape.edges.top[bucket]! + shape.edges.bottom[bucket]!) / 2} r="4.5" className="rr-dot" data-cursor={bucket} />
        )}
        {float && <g className="rr-lab rr-on"><text x={float.x} y={float.y} textAnchor="middle" className="rr-label" data-float>{float.text}</text></g>}
        <g className="rr-axis">
          <line x1={left} x2={right} y1={axisY} y2={axisY} className="rr-rule rr-axis-line" />
          {L.estimated.map((e) => <line key={e.from} x1={e.x0} x2={e.x1} y1={axisY} y2={axisY} className="rr-estimated" data-estimated />)}
          {yearTicks(view.buckets, left, L.bucketWidth).map((t) => (
            <g key={t.text}>
              <line x1={t.x} x2={t.x} y1={axisY} y2={axisY + 8} className="rr-rule" />
              <text x={t.x} y={axisY + 24} className="rr-tick">{t.text}</text>
            </g>
          ))}
        </g>
        {L.partial && <line x1={L.partial.x} x2={L.partial.x} y1={banded ? ERA_BAND : top - 8} y2={axisY} className="rr-survey" data-partial />}
      </svg>
      {interactive && (
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- role="application": the chart's one tab stop (arrow keys)
        <div ref={ref} className="rr-plot" tabIndex={0} role="application" aria-roledescription="river chart" aria-describedby={describedBy}
          aria-label={`${repo.owner}/${repo.name}, ${view.metric} per ${unit}. Up and Down arrows change river, Left and Right change ${unit}, Home and End jump to the ends, Enter pins, Escape clears.`}
          data-active={on ?? ''} data-bucket={bucket ?? ''} data-pinned={active.pinned} {...chart}
          style={{ left, top: top - 8, width: right - left, height: axisY - top + 16 }} />
      )}
      {interactive && banded && (
        <EraButtons eras={eras} ranges={marks.map((m) => m.range)} active={activeEra} onActive={onEra} style={{ width: L.width, height: ERA_BAND - 8 }}
          place={marks.map((m) => ({ left: m.x0 - 4, width: Math.max(8, m.x1 - m.x0 - 8) }))} />
      )}
    </div>
  );
}

/**
 * One button per era over its name (in the desktop band, or over the phone's era name), after the chart in tab
 * order. Hover or focus selects the era (its band and its note in the readout; hover wins while it lasts). The
 * name is the title, range and provenance, the description the note. `place` positions each button in the layer.
 */
export function EraButtons({ eras, ranges, active, onActive, style, place }: {
  eras: readonly Era[]; ranges: readonly string[]; active: number | null; onActive?: (era: number | null) => void; style: CSSProperties; place: readonly CSSProperties[];
}) {
  const id = useId();
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  useLayoutEffect(() => onActive?.(hovered ?? focused), [hovered, focused, onActive]); // before paint: no frame without the readout
  return (
    <div className="rr-eras" style={style} role="group" aria-label="Eras" data-testid="era-track">
      {eras.map((e, i) => {
        const range = ranges[i]!;
        return (
          <button key={`${e.start}-${e.end}`} type="button" className="rr-era" data-era={i} data-source={e.source} data-active={i === active || undefined}
            aria-label={`${e.title}, ${range}${e.source === 'ai' ? ', named by AI' : ''}`} aria-describedby={`${id}-${i}`}
            style={place[i]} onFocus={() => setFocused(i)} onBlur={() => setFocused(null)}
            onPointerEnter={() => setHovered(i)} onPointerLeave={() => setHovered(null)}>
            <span className="rr-sr" id={`${id}-${i}`}>{eraNote(e.note)}</span>
          </button>
        );
      })}
    </div>
  );
}
