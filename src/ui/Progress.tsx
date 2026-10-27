import type { LoadProgress } from '../data/loadRepo.ts';
import { FallbackNotice } from './SourceNote.tsx';
import { progressLine } from './states/copy.ts';

/**
 * Loading state (docs/DESIGN.md §7): a 0.5-bordered panel titled "Loading", "Reading
 * owner/name: n of m requests", a 2 px ink progress line on a 0.5 track that fills left to right with the
 * progress (eased; at once under reduced motion), and Cancel.
 */
export function Progress({ repo, progress, fellBack, onCancel }: { repo: string; progress: LoadProgress | null; fellBack: boolean; onCancel: () => void }) {
  const [done, total] = progress ? [progress.done, Math.max(progress.total, progress.done)] : [0, 0];
  const pct = total > 0 ? (done / total) * 100 : 0;
  const text = progress ? `${done} of ${total} requests` : 'connecting';
  return (
    <div className="rr-state rr-progress" data-testid="progress">
      {fellBack && <FallbackNotice automatic />}
      <p className="rr-state-title">Loading</p>
      <p className="rr-progress-line">{progressLine(repo, progress)}</p>
      <div role="progressbar" aria-label={`Reading the history of ${repo}`} aria-valuemin={0} aria-valuemax={total || 1} aria-valuenow={done} aria-valuetext={text} className="rr-bar">
        <svg width="100%" height="10" aria-hidden="true">
          <line className="rr-bar-track" x1="0" x2="100%" y1="5" y2="5" />
          {/* The whole track, scaled to the progress, so each step eases left to right (DESIGN §6). */}
          <line className="rr-bar-fill" x1="0" x2="100%" y1="5" y2="5" style={{ transform: `scaleX(${pct / 100})` }} />
        </svg>
      </div>
      <p className="rr-actions">
        <button type="button" onClick={onCancel}>Cancel</button>
      </p>
    </div>
  );
}
