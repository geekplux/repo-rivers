import { useId } from 'react';
import type { Era } from '../core/schema.ts';
import { eraNote, eraRange } from '../core/summary.ts';

/**
 * The Eras section (DESIGN §3): each era's range, then its title and its note as a sentence. Rule-based and AI
 * names read the same; AI names say so to screen readers (the legend says it on screen). Nothing without eras.
 */
export function EraList({ eras, buckets }: { eras: readonly Era[]; buckets: readonly { label: string }[] }) {
  const id = useId();
  if (eras.length === 0) return null;
  return (
    <section className="rr-sec" aria-labelledby={id}>
      <h2 id={id} className="rr-at-row">Eras</h2>
      <ol className="rr-era-list">
        {eras.map((e) => {
          const note = eraNote(e.note);
          return (
            <li key={e.start}>
              <span className="rr-era-when">{eraRange(buckets, e)}</span>
              <div>
                <div className="rr-era-title">{e.title}{e.source === 'ai' && <span className="rr-sr">, named by AI</span>}</div>
                {note && <div className="rr-muted">{note}</div>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
