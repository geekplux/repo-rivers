import type { RiverLayout } from '../core/layout/layout.ts';
import type { Era } from '../core/schema.ts';
import type { RiverView } from '../core/view.ts';

/** Inset of each bracket from its bucket boundaries (a 6 px gap between neighbours). */
export const ERA_INSET = 3;
/** Brackets narrower than this put their title on a second row. */
export const ERA_NARROW = 96;

/** One bracket on the chart's x scale; `room` is the title's maximum width. */
export interface EraBox { x: number; width: number; row2: boolean; room: number }

/**
 * Era `{start, end}` spans `left + start·w` to `left + (end+1)·w`, inset 3 px (docs/viz/rivers.md §8). The track
 * is 48 px, or 72 px when a bracket is under 96 px; it depends only on the segments, never on the names.
 */
export function eraBoxes(eras: readonly Pick<Era, 'start' | 'end'>[], left: number, step: number, trackWidth: number): { boxes: EraBox[]; height: number } {
  const boxes = eras.map(({ start, end }): EraBox => {
    const width = (end - start + 1) * step - 2 * ERA_INSET;
    return { x: left + start * step + ERA_INSET, width, row2: width < ERA_NARROW, room: width - 8 };
  });
  // A row-2 title may run on until the next row-2 bracket (or the end of the track).
  boxes.forEach((b, i) => b.row2 && (b.room = (boxes.slice(i + 1).find((n) => n.row2)?.x ?? trackWidth) - b.x - 8));
  return { boxes, height: boxes.some((b) => b.row2) ? 72 : 48 };
}

export interface EraTrackProps {
  eras: readonly Era[];
  layout: RiverLayout;
  buckets: RiverView['buckets'];
  active: number | null;
  onActive: (era: number | null) => void;
}

/**
 * Era brackets above the chart: titles in (synthesized) italic Fraunces, one button per era in tab order after
 * the chart. Focus or hover shows the note in the readout; "named by AI" appears only when the names are AI's.
 */
export function EraTrack({ eras, layout: L, buckets, active, onActive }: EraTrackProps) {
  const { boxes, height } = eraBoxes(eras, L.plot.left, L.bucketWidth, L.width);
  return (
    <div className="rr-eras" style={{ width: L.width, height }} role="group" aria-label="Eras" data-testid="era-track">
      {eras.map((e, i) => {
        const b = boxes[i]!;
        return (
          <button key={`${e.start}-${e.end}`} type="button" className="rr-era" data-era={i} data-source={e.source} data-active={i === active || undefined}
            style={{ left: b.x, width: b.width }} onFocus={() => onActive(i)} onBlur={() => onActive(null)}
            onPointerEnter={() => onActive(i)} onPointerLeave={() => onActive(null)}>
            <span className={b.row2 ? 'rr-era-title rr-era-row2' : 'rr-era-title'} style={{ maxWidth: Math.max(0, b.room) }}>{e.title}</span>
            <span className="rr-sr">{`, ${buckets[e.start]?.label}–${buckets[e.end]?.label}. ${e.note}${e.source === 'ai' ? ' Named by AI.' : ''}`}</span>
            <span className="rr-era-bracket" aria-hidden="true" />
          </button>
        );
      })}
      {eras.some((e) => e.source === 'ai') && <span className="rr-era-ai" aria-hidden="true">named by AI</span>}
    </div>
  );
}
