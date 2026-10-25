import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { plain, type LegendItem, type Rich } from '../core/summary.ts';

export const PINNED_NOTE = 'Pinned: press Escape, or click or tap the background, to release.';

/**
 * The readout under the chart (DESIGN §4): the text shows at once, river names in italic and numbers bold; a
 * polite live region repeats it after 150 ms without changes, so moving quickly through the chart announces only
 * where you stop. Nothing is announced until `live` (the first user action); a change of `pinned` adds "Pinned"
 * or "Released" once. `spoken` (default the text) is what the live region says. `docked` (the phone, while a river
 * or era is pinned or has keyboard focus) fixes it to the bottom of the viewport; the page gets as much bottom
 * padding, so nothing hides behind it, and its slot keeps the height it had in flow, so nothing below moves.
 */
export function Readout({ text, spoken = typeof text === 'string' ? text : plain(text), pinned, live, docked = false }: {
  text: Rich | string; spoken?: string; pinned: boolean; live: boolean; docked?: boolean;
}) {
  const [said, setSaid] = useState('');
  const wasPinned = useRef(pinned);
  const ref = useRef<HTMLDivElement>(null);
  const [flow, setFlow] = useState(24); // the readout's height in flow, held by its slot while docked
  useLayoutEffect(() => {
    const el = ref.current;
    if (docked || !el) return;
    const ro = new ResizeObserver(() => setFlow(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [docked]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!docked || !el) return;
    const root = document.documentElement;
    const ro = new ResizeObserver(() => root.style.setProperty('--rr-dock', `${el.offsetHeight}px`));
    ro.observe(el);
    root.classList.add('rr-docked');
    return () => {
      ro.disconnect();
      root.classList.remove('rr-docked');
      root.style.removeProperty('--rr-dock');
    };
  }, [docked]);
  useEffect(() => {
    if (!live) {
      wasPinned.current = pinned;
      return;
    }
    const t = setTimeout(() => {
      const flip = pinned === wasPinned.current ? '' : pinned ? 'Pinned' : 'Released';
      wasPinned.current = pinned;
      setSaid(flip ? `${spoken}${/[.!?]$/.test(spoken) ? '' : '.'} ${flip}` : spoken);
    }, 150);
    return () => clearTimeout(t);
  }, [spoken, pinned, live]);
  return (
    <div className="rr-readout-slot" style={docked ? { height: flow } : undefined}>
    <div ref={ref} className={docked ? 'rr-readout rr-dock' : 'rr-readout'} data-testid="readout" data-docked={docked || undefined}>
      <p aria-hidden="true">{typeof text === 'string' ? text : text.map((t, i) => (typeof t === 'string' ? t : 'i' in t ? <i key={i}>{t.i}</i> : 'b' in t ? <b key={i}>{t.b}</b> : <span key={i} className="rr-muted">{t.m}</span>))}</p>
      {pinned && !docked && <p aria-hidden="true" className="rr-muted rr-note">{PINNED_NOTE}</p>}
      <p className="rr-sr" aria-live="polite" aria-atomic="true">{said}</p>
    </div>
    </div>
  );
}

/** The legend's glyphs (DESIGN §3), drawn like the marks they explain. */
const GLYPH: Record<LegendItem['kind'], ReactNode> = {
  estimated: <svg width="22" height="6"><line x1="0" x2="22" y1="3" y2="3" className="rr-estimated" /></svg>,
  partial: <svg width="6" height="14"><line x1="3" x2="3" y1="0" y2="14" className="rr-survey" /></svg>,
  moved: <svg width="22" height="8"><path d="M0,4h15" className="rr-transfer" strokeWidth="1.5" strokeDasharray="4 3" /><path d="M22,4l-7,-3.5v7z" className="rr-arrow" /></svg>,
  bot: <svg width="18" height="12"><rect x="1.5" y="1.5" width="15" height="9" className="rr-tone-0 rr-bot" /></svg>,
  ai: null,
};

/** The phone draws the chart transposed: its estimated runs are a vertical dotted column, the partial line horizontal. */
const TURNED: Partial<Record<LegendItem['kind'], ReactNode>> = {
  estimated: <svg width="6" height="22"><line x1="3" x2="3" y1="0" y2="22" className="rr-estimated" /></svg>,
  partial: <svg width="22" height="6"><line x1="0" x2="22" y1="3" y2="3" className="rr-survey" /></svg>,
};

/** The legend right of the readout: only the marks this view draws, glyphs `turned` with the phone chart. */
export function Legend({ items, turned = false }: { items: readonly LegendItem[]; turned?: boolean }) {
  if (!items.length) return null;
  return (
    <ul className="rr-legend" aria-label="Legend">
      {items.map((it) => {
        const glyph = (turned && TURNED[it.kind]) || GLYPH[it.kind];
        return <li key={it.kind} data-legend={it.kind}>{glyph && <span aria-hidden="true">{glyph}</span>}{it.text}</li>;
      })}
    </ul>
  );
}
