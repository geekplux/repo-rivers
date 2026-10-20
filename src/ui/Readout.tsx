import { useEffect, useState } from 'react';

/**
 * The readout bar (docs/viz/rivers.md §6): the text shows at once; a polite live region repeats it after
 * 150 ms without changes, so moving quickly through the chart announces only where you stop.
 */
export function Readout({ text, note = '' }: { text: string; note?: string }) {
  const full = note ? `${text}. ${note}` : text;
  const [said, setSaid] = useState(full);
  useEffect(() => {
    const t = setTimeout(() => setSaid(full), 150);
    return () => clearTimeout(t);
  }, [full]);
  return (
    <div className="rr-readout" data-testid="readout">
      <p aria-hidden="true">{text}</p>
      {note && <p aria-hidden="true" className="rr-muted rr-note">{note}</p>}
      <p className="rr-sr" aria-live="polite" aria-atomic="true">{said}</p>
    </div>
  );
}
