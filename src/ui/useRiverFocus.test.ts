import { describe, expect, it } from 'vitest';
import { layoutRivers } from '../core/layout/layout.ts';
import { parseAggregate } from '../core/schema.ts';
import { selectView } from '../core/view.ts';
import vite from '../samples/vite.json';
import { EMPTY, hitTest, reconcile, startSpot, stepFocus, type FocusState } from './useRiverFocus.ts';

const AGG = parseAggregate(vite);
const view = selectView(AGG, { dimension: 'modules' });
const L = layoutRivers(view, { width: 1104 });
const lanes = L.rivers.map((r) => r.id);
const B = view.buckets.length;
const start = startSpot(view.rivers);
const step = (s: FocusState, ...keys: string[]): FocusState => keys.reduce((acc, k) => stepFocus(acc, k, lanes, B, start) ?? acc, s);

describe('startSpot', () => {
  it('is the largest named river at its peak bucket', () => {
    const big = view.rivers.filter((r) => r.kind !== 'other').toSorted((a, b) => b.total - a.total)[0]!;
    expect(start).toEqual({ river: big.id, bucket: big.values.indexOf(big.peak) });
    const people = selectView(AGG, { dimension: 'contributors' }).rivers;
    expect(people.at(-1)!.total).toBeGreaterThan(people[0]!.total); // "other" is the biggest here …
    expect(startSpot(people).river).toBe(people[0]!.id); // … but focus starts on a person
  });
});

describe('stepFocus (A3)', () => {
  it('enters from the empty state at the start spot', () => {
    expect(step(EMPTY, 'ArrowRight')).toEqual({ ...start, pinned: false });
  });
  it('moves through lanes with Up/Down and stops at the ends', () => {
    const s = { river: lanes[1]!, bucket: 3, pinned: false };
    expect(step(s, 'ArrowUp').river).toBe(lanes[0]);
    expect(step(s, 'ArrowUp', 'ArrowUp').river).toBe(lanes[0]);
    expect(step(s, 'ArrowDown').river).toBe(lanes[2]);
    expect(step(s, ...lanes.map(() => 'ArrowDown')).river).toBe(lanes.at(-1));
  });
  it('moves through buckets with Left/Right/Home/End, clamped', () => {
    const s = { river: lanes[0]!, bucket: 3, pinned: false };
    expect(step(s, 'ArrowLeft').bucket).toBe(2);
    expect(step(s, 'ArrowRight').bucket).toBe(4);
    expect(step(s, 'Home', 'ArrowLeft').bucket).toBe(0);
    expect(step(s, 'End', 'ArrowRight').bucket).toBe(B - 1);
  });
  it('pins with Enter/Space; Escape unpins, then clears', () => {
    const s = { river: lanes[0]!, bucket: 3, pinned: false };
    expect(step(s, 'Enter').pinned).toBe(true);
    expect(step(s, ' ', ' ').pinned).toBe(false);
    expect(step(s, 'Enter', 'Escape')).toEqual(s);
    expect(step(s, 'Escape')).toEqual(EMPTY);
    expect(stepFocus(EMPTY, 'Escape', lanes, B, start)).toBeNull();
    expect(stepFocus(s, 'a', lanes, B, start)).toBeNull();
  });
});

describe('reconcile', () => {
  it('keeps the bucket when the river disappears (dimension change) and falls back to the largest river', () => {
    const people = selectView(AGG, { dimension: 'contributors' });
    const ids = people.rivers.map((r) => r.id);
    const s = { river: lanes[0]!, bucket: 5, pinned: true };
    expect(reconcile(s, ids, B, startSpot(people.rivers))).toEqual({ river: startSpot(people.rivers).river, bucket: 5, pinned: false });
    expect(reconcile(s, lanes, B, start)).toEqual(s);
    expect(reconcile(EMPTY, lanes, B, start)).toEqual(EMPTY);
  });
});

describe('hitTest', () => {
  it('maps x to the bucket and y to the band under the pointer', () => {
    const i = 20;
    const c = L.columns[i]!;
    const j = L.rivers.findIndex((r) => r.thickness[i]! > 20);
    const r = L.rivers[j]!;
    const y = (r.edges.top[i]! + r.edges.bottom[i]!) / 2;
    expect(hitTest(L, c.x, y)).toEqual({ river: r.id, bucket: i });
    expect(hitTest(L, c.x + L.bucketWidth / 2 - 0.5, y)?.bucket).toBe(i);
  });
  it('gives no river off the bands, and nothing outside the plot', () => {
    const c = L.columns[20]!;
    expect(hitTest(L, c.x, L.plot.top - 6)).toEqual({ river: null, bucket: 20 });
    expect(hitTest(L, L.plot.right + 1, 100)).toBeNull();
  });
  it('gives thin bands an 8 px zone', () => {
    let found = false;
    L.rivers.forEach((r) => r.thickness.forEach((t, i) => {
      if (found || t <= 0.5 || t >= 3) return;
      const mid = (r.edges.top[i]! + r.edges.bottom[i]!) / 2;
      const hit = hitTest(L, L.columns[i]!.x, mid + 3.5);
      if (hit?.river === r.id) found = true;
    }));
    expect(found).toBe(true);
  });
});
