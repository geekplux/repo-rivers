import { useEffect, useId, useRef, useState } from 'react';
import type { SourceInfo } from '../core/schema.ts';
import { sourceLabel } from './headMeta.ts';

const MODE = { sampled: 'sampled', full: 'every commit', synthetic: 'synthetic' } as const;

/**
 * The source note (PLAN §3 Partial data): a dashed-underline disclosure button in the chart head's meta line,
 * "Estimated from n of m commits" (docs/redesign/DESIGN.md §3), whose panel lists the mode, the GitHub
 * requests used, the buckets truncated by the 300-file compare cap, and the aggregate's notes. Escape, or focus
 * or a press outside it, closes it.
 */
export function SourceNote({ source, buckets, unit }: { source: SourceInfo; buckets: number; unit: string }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const id = useId();
  const truncated = source.truncatedBuckets.length;
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !wrap.current?.contains(document.activeElement)) return;
      setOpen(false);
      button.current?.focus();
    };
    // Focus or a press outside the badge and its panel closes it (Tab away, click elsewhere).
    const onOutside = (e: Event) => {
      if (e.target instanceof Node && !wrap.current?.contains(e.target)) setOpen(false);
    };
    addEventListener('keydown', onKey);
    addEventListener('focusin', onOutside);
    addEventListener('pointerdown', onOutside);
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener('focusin', onOutside);
      removeEventListener('pointerdown', onOutside);
    };
  }, [open]);
  return (
    <div className="rr-source" ref={wrap}>
      <button ref={button} type="button" className="rr-badge" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        {sourceLabel(source)}
      </button>
      <div id={id} className="rr-popover" hidden={!open}>
        <dl>
          <dt>Mode</dt>
          <dd>{source.mode === 'sampled' ? `sampled, one comparison per ${unit}` : MODE[source.mode]}</dd>
          <dt>GitHub requests</dt>
          <dd>{source.requests.toLocaleString('en')}{source.authenticated ? ' (with a token)' : ''}</dd>
          <dt>Commits read</dt>
          <dd>{source.commitsSeen.toLocaleString('en')} of {source.commitsTotal.toLocaleString('en')}</dd>
          <dt>Truncated {unit}s</dt>
          <dd>{truncated ? `${truncated} of ${buckets} changed over 300 files` : 'none'}</dd>
        </dl>
        <ul>{source.notes.map((n) => <li key={n}>{n}</li>)}</ul>
      </div>
    </div>
  );
}

/** Says that this browser read GitHub directly (own quota) and that the result stays in this browser. */
export function FallbackNotice({ automatic }: { automatic: boolean }) {
  return (
    <p className="rr-notice" data-testid="fallback-notice">
      {automatic ? 'The Repo Rivers service didn’t answer, so your browser reads GitHub directly' : 'Your browser read GitHub directly'}, using
      your own quota of 60 requests an hour. The result is kept in this browser only.
    </p>
  );
}
