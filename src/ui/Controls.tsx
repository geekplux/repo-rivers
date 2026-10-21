import { useId } from 'react';
import type { ViewOptions } from '../core/view.ts';

/** What the controls set; feeds `selectView` (no refetch). */
export type ControlValue = Required<Pick<ViewOptions, 'dimension' | 'depth' | 'includeBots'>>;

const DIMENSIONS = [['modules', 'Modules'], ['contributors', 'Contributors']] as const;
const DEPTHS = ['auto', 1, 2, 3] as const;

/**
 * Modules | Contributors always visible; Depth auto/1/2/3 (modules only) and Include bots (contributors only) folded under "More options", as native inputs;
 * a disabled control shows why in a visible hint linked with `aria-describedby`. `disabled` turns them all off
 * (while a repo loads or failed to load, when there is no chart to change).
 */
export function Controls({ value, onChange, disabled = false }: { value: ControlValue; onChange: (v: ControlValue) => void; disabled?: boolean }) {
  const set = (patch: Partial<ControlValue>) => onChange({ ...value, ...patch });
  const modules = value.dimension === 'modules';
  const id = useId();
  const [depthHint, botsHint] = [`${id}depth`, `${id}bots`];
  const changed = [value.depth !== 'auto' && modules && `depth ${value.depth}`, value.includeBots && !modules && 'bots included'].filter(Boolean);
  return (
    <div className="rr-controls">
      <fieldset className="rr-seg" disabled={disabled}>
        <legend>Rivers by</legend>
        {DIMENSIONS.map(([d, text]) => (
          <label key={d}>
            <input type="radio" name="rr-dimension" checked={value.dimension === d} onChange={() => set({ dimension: d })} />
            {text}
          </label>
        ))}
      </fieldset>
      {/* Progressive disclosure: the fine-tuning controls stay folded until asked for; the summary names any non-default. */}
      <details className="rr-options">
        <summary>
          More options{changed.length > 0 && <span className="rr-muted">: {changed.join(', ')}</span>}
        </summary>
        <div className="rr-options-body">
          <div className="rr-ctl">
            <fieldset className="rr-seg" disabled={disabled || !modules} aria-describedby={modules ? undefined : depthHint}>
              <legend>Depth</legend>
              {DEPTHS.map((d) => (
                <label key={d}>
                  <input type="radio" name="rr-depth" checked={value.depth === d} onChange={() => set({ depth: d })} />
                  {d}
                </label>
              ))}
            </fieldset>
            {!modules && <span id={depthHint} className="rr-hint">(modules only)</span>}
          </div>
          <div className="rr-ctl">
            <label className="rr-check">
              <input type="checkbox" checked={value.includeBots} disabled={disabled || modules} aria-describedby={modules ? botsHint : undefined}
                onChange={(e) => set({ includeBots: e.target.checked })} />
              Include bots
            </label>
            {modules && <span id={botsHint} className="rr-hint">(contributors only)</span>}
          </div>
        </div>
      </details>
    </div>
  );
}
