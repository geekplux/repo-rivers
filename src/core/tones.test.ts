import { describe, expect, it } from 'vitest';
import express from '../samples/express.json';
import svelte from '../samples/svelte.json';
import vite from '../samples/vite.json';
import { laneOrder } from './layout/order.ts';
import { parseAggregate } from './schema.ts';
import { sameToneTouches, tones, touchCounts, type Tone, type ToneLane } from './tones.ts';
import { selectView } from './view.ts';

const lane = (values: number[], kind: ToneLane['kind'] = 'module'): ToneLane => ({ kind, values });

describe('tones', () => {
  it('alternates a simple stack', () => {
    expect(tones([lane([1, 1]), lane([1, 1]), lane([1, 1])])).toEqual([1, 0, 1]);
    expect(sameToneTouches([lane([1, 1]), lane([1, 1]), lane([1, 1])], [1, 0, 1])).toBe(0);
  });

  it('counts touches through a zero-valued lane and ignores "other"', () => {
    const lanes = [lane([1, 1]), lane([1, 0]), lane([1, 1]), lane([1, 1], 'other')];
    // a–b in column 0, b–c in column 0, a–c in column 1 (b is zero there); "other" touches nothing.
    expect(touchCounts(lanes)).toEqual([[0, 1, 1, 0], [1, 0, 1, 0], [1, 1, 0, 0], [0, 0, 0, 0]]);
    expect(tones(lanes)[3]).toBe(1);
  });

  it('is deterministic and puts the most-touching river first on water A', () => {
    const lanes = [lane([1, 0, 0]), lane([1, 1, 1]), lane([0, 1, 1])];
    expect(tones(lanes)).toEqual(tones(lanes));
    expect(tones(lanes)[1]).toBe(0);
  });

  const all = { vite, svelte, express };
  for (const [name, json] of Object.entries(all)) {
    for (const dimension of ['modules', 'contributors'] as const) {
      it(`${name} ${dimension}: at most half of the touching columns share a tone (the greedy bound)`, () => {
        const view = selectView(parseAggregate(json), { dimension });
        const lanes = laneOrder(view.rivers, view.transfers);
        const t = tones(lanes);
        const best = sameToneTouches(lanes, t);
        const total = touchCounts(lanes).flat().reduce((a, b) => a + b, 0) / 2;
        expect(total).toBeGreaterThan(0);
        expect(best).toBeLessThanOrEqual(total / 2);
        // Far better than one tone for all.
        expect(best).toBeLessThan(sameToneTouches(lanes, lanes.map((): Tone => 0)) / 2);
      });
    }
  }
});
