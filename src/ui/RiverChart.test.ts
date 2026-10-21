import { describe, expect, it } from 'vitest';
import { parseAggregate } from '../core/schema.ts';
import { selectView } from '../core/view.ts';
import vite from '../samples/vite.json';
import { staticChartLabel } from './RiverChart.tsx';

describe('staticChartLabel', () => {
  it('names the static chart by repository, measure, river count and time span', () => {
    const agg = parseAggregate(vite);
    const view = selectView(agg, { dimension: 'modules' });
    const label = staticChartLabel(agg, view);
    expect(label).toBe(`River chart of vitejs/vite: ${view.metric} per ${agg.time.unit} in ${view.rivers.length} rivers, ${view.buckets[0]!.label} to ${view.buckets.at(-1)!.label}`);
  });
});
