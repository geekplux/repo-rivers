import { useId, useLayoutEffect, useState } from 'react';
import type { RiverLayout } from '../core/layout/layout.ts';
import type { Era } from '../core/schema.ts';
import type { RiverView } from '../core/view.ts';

/** Inset of each bracket from its bucket boundaries (a 6 px gap between neighbours). */
export const ERA_INSET = 3;
/** When any bracket is narrower than this, titles alternate between two rows. */
export const ERA_NARROW = 200;

/** One bracket on the chart's x scale; `room` is the title's maximum width. */
export interface EraBox { x: number; width: number; row2: boolean; room: number }

/**
 * Era `{start, end}` spans `left + start·w` to `left + (end+1)·w`, inset 3 px (docs/viz/rivers.md §8). The track
 * is 48 px with one row of titles, or 72 px when a bracket is under 200 px: then even eras keep row 1 and odd
 * eras take row 2, and each title may run on to the next same-row bracket (era i+2) or the end of the track.
 * The height depends only on the segments, never on the names.
 */
export function eraBoxes(eras: readonly Pick<Era, 'start' | 'end'>[], left: number, step: number, trackWidth: number): { boxes: EraBox[]; height: number } {
  const boxes = eras.map(({ start, end }): EraBox => {
    const width = (end - start + 1) * step - 2 * ERA_INSET;
    return { x: left + start * step + ERA_INSET, width, row2: false, room: width - 8 };
  });
  const rows = boxes.some((b) => b.width < ERA_NARROW);
  if (rows) boxes.forEach((b, i) => Object.assign(b, { row2: i % 2 === 1, room: (boxes[i + 2]?.x ?? trackWidth) - b.x - 8 }));
  return { boxes, height: rows ? 72 : 48 };
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
 * the chart. Focus or hover shows the note in the readout (hover wins while it lasts); the button's name is the
 * title, dates and provenance, and its description the note. "named by AI" appears only when the names are AI's.
 */
export function EraTrack({ eras, layout: L, buckets, active, onActive }: EraTrackProps) {
  const { boxes, height } = eraBoxes(eras, L.plot.left, L.bucketWidth, L.width);
  const id = useId();
  const [hovered, setHovered] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  useLayoutEffect(() => onActive(hovered ?? focused), [hovered, focused, onActive]); // before paint: no frame without the readout
  return (
    <div className="rr-eras" style={{ width: L.width, height }} role="group" aria-label="Eras" data-testid="era-track">
      {eras.map((e, i) => {
        const b = boxes[i]!;
        const span = `${buckets[e.start]?.label}–${buckets[e.end]?.label}`;
        return (
          <button key={`${e.start}-${e.end}`} type="button" className="rr-era" data-era={i} data-source={e.source} data-active={i === active || undefined}
            aria-label={`${e.title}, ${span}${e.source === 'ai' ? ', named by AI' : ''}`} aria-describedby={`${id}-${i}`}
            style={{ left: b.x, width: b.width }} onFocus={() => setFocused(i)} onBlur={() => setFocused(null)}
            onPointerEnter={() => setHovered(i)} onPointerLeave={() => setHovered(null)}>
            <span className={b.row2 ? 'rr-era-title rr-era-row2' : 'rr-era-title'} style={{ maxWidth: Math.max(0, b.room) }}>{e.title}</span>
            <span className="rr-sr" id={`${id}-${i}`}>{e.note}</span>
            <span className="rr-era-bracket" aria-hidden="true" />
          </button>
        );
      })}
      {eras.some((e) => e.source === 'ai') && <span className="rr-era-ai" aria-hidden="true">named by AI</span>}
    </div>
  );
}
