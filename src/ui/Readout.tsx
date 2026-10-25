import { useEffect, useRef, useState, type ReactNode } from 'react';
import { plain, type LegendItem, type Rich } from '../core/summary.ts';

export const PINNED_NOTE = 'Pinned: press Escape, or click or tap the background, to release.';

/**
 * The readout under the chart (DESIGN §4): the text shows at once, river names in italic and numbers bold; a
 * polite live region repeats it after 150 ms without changes, so moving quickly through the chart announces only
 * where you stop. Nothing is announced until `live` (the first user action); a change of `pinned` adds "Pinned"
 * or "Released" once. `spoken` (default the text) is what the live region says.
 */
export function Readout({ text, spoken = typeof text === 'string' ? text : plain(text), pinned, live }: { text: Rich | string; spoken?: string; pinned: boolean; live: boolean }) {
  const [said, setSaid] = useState('');
  const wasPinned = useRef(pinned);
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
    <div className="rr-readout" data-testid="readout">
      <p aria-hidden="true">{typeof text === 'string' ? text : text.map((t, i) => (typeof t === 'string' ? t : 'i' in t ? <i key={i}>{t.i}</i> : 'b' in t ? <b key={i}>{t.b}</b> : <span key={i} className="rr-muted">{t.m}</span>))}</p>
      {pinned && <p aria-hidden="true" className="rr-muted rr-note">{PINNED_NOTE}</p>}
      <p className="rr-sr" aria-live="polite" aria-atomic="true">{said}</p>
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

/** The legend right of the readout: only the marks this view draws. */
export function Legend({ items }: { items: readonly LegendItem[] }) {
  if (!items.length) return null;
  return (
    <ul className="rr-legend" aria-label="Legend">
      {items.map((it) => <li key={it.kind}>{GLYPH[it.kind] && <span aria-hidden="true">{GLYPH[it.kind]}</span>}{it.text}</li>)}
    </ul>
  );
}
