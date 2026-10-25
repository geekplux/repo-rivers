import { useId } from 'react';
import type { ViewOptions } from '../core/view.ts';

/** What the controls set; feeds `selectView` (no refetch). */
export type ControlValue = Required<Pick<ViewOptions, 'dimension' | 'depth' | 'includeBots'>>;

const DIMENSIONS = [['modules', 'Modules'], ['contributors', 'Contributors']] as const;
const DEPTHS = ['auto', 1, 2, 3] as const;

/**
 * The chart head's controls (docs/redesign/DESIGN.md §3), all native inputs: "Folder depth" (a select, modules
 * only) or "Include bots" (a checkbox, contributors only), then Modules | Contributors as a radio group.
 * `disabled` turns them all off (while a repo loads or failed to load, when there is no chart to change).
 */
export function Controls({ value, onChange, disabled = false }: { value: ControlValue; onChange: (v: ControlValue) => void; disabled?: boolean }) {
  const set = (patch: Partial<ControlValue>) => onChange({ ...value, ...patch });
  const depthId = useId();
  return (
    <div className="rr-controls">
      {value.dimension === 'modules' ? (
        <div className="rr-sel">
          <label htmlFor={depthId}>Folder depth</label>
          <span className="rr-sel-box">
            <select id={depthId} value={String(value.depth)} disabled={disabled}
              onChange={(e) => set({ depth: e.target.value === 'auto' ? 'auto' : (Number(e.target.value) as 1 | 2 | 3) })}>
              {DEPTHS.map((d) => <option key={d} value={String(d)}>{d === 'auto' ? 'Auto' : d}</option>)}
            </select>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
          </span>
        </div>
      ) : (
        <label className="rr-check">
          <input type="checkbox" checked={value.includeBots} disabled={disabled} onChange={(e) => set({ includeBots: e.target.checked })} />
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 8.2l2.6 2.6L12 5.4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
          Include bots
        </label>
      )}
      <div className="rr-seg" role="radiogroup" aria-label="Rivers by">
        {DIMENSIONS.map(([d, text]) => (
          <label key={d}>
            <input type="radio" name="rr-dimension" checked={value.dimension === d} disabled={disabled} onChange={() => set({ dimension: d })} />
            {text}
          </label>
        ))}
      </div>
    </div>
  );
}
