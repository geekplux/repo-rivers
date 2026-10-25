import { useId, type KeyboardEvent } from 'react';
import type { BucketUnit } from '../core/schema.ts';
import { tagsBot } from '../core/summary.ts';
import type { River, RiverView } from '../core/view.ts';
import { activeSpan, indexHeads, shareText, sparkPath } from './riverIndex.ts';

const num = new Intl.NumberFormat('en');
/** The sparkline's drawing box (DESIGN §3); CSS sizes it (360×24, 100×20 on the phone). */
const [SW, SH] = [360, 24];

export interface RiverIndexProps {
  view: RiverView;
  unit: BucketUnit;
  /** owner/name, for the caption. */
  repo: string;
  /** The river the chart is focused on (hover, keyboard or pin), and whether it is pinned. */
  active: string | null;
  pinned: boolean;
  /** A row's button: Enter, Space or a click anywhere on the row. */
  onPick: (river: River) => void;
  /** Escape on a row. */
  onClear: () => void;
}

/**
 * The Rivers section (DESIGN §3): every river, largest first, with a sparkline scaled to its own peak, its total,
 * its share and the years it was active. Each row's name is a button that focuses the river in the chart; the
 * row of the river focused in the chart has the band background.
 */
export function RiverIndex({ view, unit, repo, active, pinned, onPick, onClear }: RiverIndexProps) {
  const id = useId();
  const all = view.rivers.reduce((s, r) => s + r.total, 0);
  const heads = indexHeads(view, unit);
  const escape = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || active === null) return;
    e.preventDefault();
    onClear();
  };
  return (
    <section className="rr-sec" aria-labelledby={id}>
      <h2 id={id} className="rr-at-head">Rivers</h2>
      <table className="rr-index">
        <caption className="rr-sr">Every river of {repo} by {view.metric}, largest first{view.rivers.some((r) => r.kind === 'other') ? ', then other' : ''}</caption>
        <thead>
          <tr>
            <th scope="col" className="rr-c-name">{heads.name}</th>
            <th scope="col" className="rr-c-spark"><span className="rr-wide">{heads.spark}</span><span className="rr-narrow">Over time</span></th>
            <th scope="col" className="rr-c-amount">{heads.amount}</th>
            <th scope="col" className="rr-c-share">Share</th>
            <th scope="col" className="rr-c-span">Active</th>
          </tr>
        </thead>
        <tbody>
          {view.rivers.map((r) => {
            const peak = r.values.indexOf(r.peak);
            return (
              <tr key={r.id} data-row={r.id} className={active === r.id ? 'rr-on' : undefined}>
                <th scope="row">
                  <button type="button" className="rr-pick" aria-pressed={pinned && active === r.id} onClick={() => onPick(r)} onKeyDown={escape}>
                    <span className="rr-rname">{r.label}</span>{tagsBot(r) && <> <span className="rr-muted">bot</span></>}
                  </button>
                </th>
                <td className="rr-c-spark">
                  <svg viewBox={`0 0 ${SW} ${SH}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
                    <path d={sparkPath(r.values, SW, SH)} className={r.kind === 'other' ? 'rr-spark-other' : 'rr-spark'} />
                  </svg>
                  <span className="rr-sr">peak {num.format(r.peak)} in {view.buckets[peak]?.label}</span>
                </td>
                <td className="rr-c-amount">{num.format(r.total)}</td>
                <td className="rr-c-share">{shareText(r.total, all)}</td>
                <td className="rr-c-span">{activeSpan(r.values, view.buckets)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
