import { useId } from 'react';
import type { ErrorAction, ErrorCopy } from './copy.ts';

/** A failed load: a plain title, one sentence and 1–2 actions; the first action is primary. */
export function ErrorState({ copy, onAction }: { copy: ErrorCopy; onAction: (a: ErrorAction) => void }) {
  const id = useId();
  return (
    <div className="rr-state rr-error" role="group" aria-labelledby={id} data-testid="error-state">
      <h3 id={id}>{copy.title}</h3>
      <p>{copy.body}</p>
      <p className="rr-actions">
        {copy.actions.map((a, i) => (
          <button key={a.id} type="button" className={i === 0 ? 'rr-primary' : undefined} onClick={() => onAction(a.id)}>
            {a.label}
          </button>
        ))}
      </p>
    </div>
  );
}
