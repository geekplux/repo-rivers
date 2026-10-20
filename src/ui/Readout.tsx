import { useEffect, useRef, useState } from 'react';

export const PINNED_NOTE = 'Pinned: press Escape, or click or tap the background, to release.';

/**
 * The readout bar (docs/viz/rivers.md §6): the text shows at once; a polite live region repeats it after
 * 150 ms without changes, so moving quickly through the chart announces only where you stop. Nothing is
 * announced until `live` (the first user action); a change of `pinned` adds "Pinned" or "Released" once.
 */
export function Readout({ text, pinned, live }: { text: string; pinned: boolean; live: boolean }) {
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
      setSaid(flip ? `${text}. ${flip}` : text);
    }, 150);
    return () => clearTimeout(t);
  }, [text, pinned, live]);
  return (
    <div className="rr-readout" data-testid="readout">
      <p aria-hidden="true">{text}</p>
      {pinned && <p aria-hidden="true" className="rr-muted rr-note">{PINNED_NOTE}</p>}
      <p className="rr-sr" aria-live="polite" aria-atomic="true">{said}</p>
    </div>
  );
}
