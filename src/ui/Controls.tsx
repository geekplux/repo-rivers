import type { ViewOptions } from '../core/view.ts';

/** What the controls set; feeds `selectView` (no refetch). */
export type ControlValue = Required<Pick<ViewOptions, 'dimension' | 'depth' | 'includeBots'>>;

const DIMENSIONS = [['modules', 'Modules'], ['contributors', 'Contributors']] as const;
const DEPTHS = ['auto', 1, 2, 3] as const;

/** Modules | Contributors, Depth auto/1/2/3 (modules only) and Include bots (contributors only), as native inputs. */
export function Controls({ value, onChange }: { value: ControlValue; onChange: (v: ControlValue) => void }) {
  const set = (patch: Partial<ControlValue>) => onChange({ ...value, ...patch });
  const modules = value.dimension === 'modules';
  return (
    <div className="rr-controls">
      <fieldset className="rr-seg">
        <legend>Rivers by</legend>
        {DIMENSIONS.map(([d, text]) => (
          <label key={d}>
            <input type="radio" name="rr-dimension" checked={value.dimension === d} onChange={() => set({ dimension: d })} />
            {text}
          </label>
        ))}
      </fieldset>
      <fieldset className="rr-seg" disabled={!modules}>
        <legend>Depth</legend>
        {DEPTHS.map((d) => (
          <label key={d}>
            <input type="radio" name="rr-depth" checked={value.depth === d} onChange={() => set({ depth: d })} />
            {d}
          </label>
        ))}
      </fieldset>
      <label className="rr-check">
        <input type="checkbox" checked={value.includeBots} disabled={modules} onChange={(e) => set({ includeBots: e.target.checked })} />
        Include bots
      </label>
    </div>
  );
}
