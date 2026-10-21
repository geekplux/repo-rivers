import type { LoadProgress } from '../data/loadRepo.ts';
import { FallbackNotice } from './SourceNote.tsx';

/**
 * Loading state (PLAN §3): "Reading history · n of m requests", a determinate bar whose dashes flow
 * (static under reduced motion), why sampling happens, and Cancel.
 */
export function Progress({ repo, progress, fellBack, onCancel }: { repo: string; progress: LoadProgress | null; fellBack: boolean; onCancel: () => void }) {
  const [done, total] = progress ? [progress.done, Math.max(progress.total, progress.done)] : [0, 0];
  const pct = total > 0 ? (done / total) * 100 : 0;
  const text = progress ? `${done} of ${total} requests` : 'connecting';
  return (
    <div className="rr-state rr-progress" data-testid="progress">
      {fellBack && <FallbackNotice automatic />}
      <p className="rr-progress-line">Reading history · {text}</p>
      <div role="progressbar" aria-label={`Reading the history of ${repo}`} aria-valuemin={0} aria-valuemax={total || 1} aria-valuenow={done} aria-valuetext={text} className="rr-bar">
        <svg width="100%" height="6" aria-hidden="true">
          <line className="rr-bar-track" x1="0" x2="100%" y1="3" y2="3" />
          {pct > 0 && <line className="rr-bar-fill" x1="0" x2={`${pct}%`} y1="3" y2="3" />}
          <line className="rr-bar-end" x1="100%" x2="100%" y1="0" y2="6" />
        </svg>
      </div>
      <p className="rr-muted">
        {progress?.label ? `${progress.label}. ` : ''}Long histories are sampled to stay within GitHub’s hourly request limit.
      </p>
      <button type="button" onClick={onCancel}>Cancel</button>
    </div>
  );
}
