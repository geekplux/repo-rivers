import { describe, expect, it } from 'vitest';
import express from '../../samples/express.json';
import svelte from '../../samples/svelte.json';
import vite from '../../samples/vite.json';
import { parseAggregate } from '../schema.ts';
import { selectView } from '../view.ts';
import { riverNameWidth } from './guides.ts';
import { layoutRivers } from './layout.ts';
import { placeRiverNames, type NameInput, type NameRiver, type RiverName } from './riverNames.ts';

// 40 buckets of 20 px: plot x 0..800, mouth names must end by 940 (DESIGN §4 "River names").
const B = 40;
const plot = { left: 0, right: 800, top: 0, bottom: 480 };
const base: Omit<NameInput, 'rivers'> = { plot, bucketWidth: 20, measure: riverNameWidth, limit: 940, transfers: [] };
/** A river with centre `c(i)` and thickness `t(i)` (0 = absent: a point at the centre). */
const river = (id: string, c: (i: number) => number, t: (i: number) => number, text = id): NameRiver => {
  const thickness = Array.from({ length: B }, (_, i) => t(i));
  return { id, text, thickness, top: thickness.map((v, i) => c(i) - v / 2), bottom: thickness.map((v, i) => c(i) + v / 2) };
};
const name = (input: NameInput, id: string) => placeRiverNames(input).names.find((n) => n.id === id);
const steep = (s: number) => name({ ...base, rivers: [river('steep', (i) => 240 + s * 20 * (i - 20), () => 200)] }, 'steep')!;
const touching = (names: RiverName[]) => names.flatMap((a, i) => names.slice(i + 1).filter((b) =>
  a.box.x <= b.box.x + b.box.width && b.box.x <= a.box.x + a.box.width && a.box.y <= b.box.y + b.box.height && b.box.y <= a.box.y + a.box.height));

describe('placeRiverNames', () => {
  it('slants a name along a smooth, thick river, centred in its longest run', () => {
    const n = name({ ...base, rivers: [river('packages/vite', (i) => 100 + 2 * i, () => 40)] }, 'packages/vite')!;
    expect(n.kind).toBe('course');
    expect(n.angle).toBeCloseTo((Math.atan(0.1) * 180) / Math.PI, 6); // 2 px per 20 px bucket
    expect(n.x + n.box.width / 2).toBeCloseTo(10 + (39 * 20) / 2, 6);
    expect(n.y).toBeCloseTo(100 + 2 * ((n.x - 10) / 20), 6);
  });

  it('clamps the slope to ±0.35', () => {
    expect([steep(0.6).kind, Math.tan((steep(0.6).angle * Math.PI) / 180)]).toEqual(['course', expect.closeTo(0.35, 9)]);
    expect(Math.tan((steep(-0.6).angle * Math.PI) / 180)).toBeCloseTo(-0.35, 9);
  });

  it('falls back to a level name inside the thickest buckets when no run is long enough', () => {
    // Thick for 5 buckets (a run of 80 px), the name needs 73 px + 20.
    const n = name({ ...base, rivers: [river('short-river', () => 200, (i) => (i >= 3 && i <= 7 ? 40 - Math.abs(i - 5) : 0))] }, 'short-river')!;
    expect([n.kind, n.anchor, n.angle, n.x, n.y]).toEqual(['level', 'middle', 0, 110, 200]);
  });

  it('stacks mouth names 17 px apart in the gutter with leaders from the river ends, ending by the limit', () => {
    const thin = (id: string, y: number) => river(id, () => y, () => 5);
    const { names } = placeRiverNames({ ...base, rivers: [thin('a', 100), thin('b', 102), thin('c', 140), thin('d', 141)] });
    expect(names.map((n) => [n.id, n.kind, n.x, n.y])).toEqual([['a', 'mouth', 816, 100], ['b', 'mouth', 816, 117], ['c', 'mouth', 816, 140], ['d', 'mouth', 816, 157]]);
    expect(names[1]!.leader).toBe('M801,102C808,102 806,117 812,117');
    expect(names.every((n) => n.box.x + n.box.width <= 940)).toBe(true);
    // A name too long for the gutter is not cut: it goes above its peak instead.
    const long = name({ ...base, rivers: [river('x'.repeat(30), () => 100, (i) => 5 + i / 10)] }, 'x'.repeat(30))!;
    expect(long.kind).toBe('peak');
  });

  it('puts an ended river’s name above its peak with room, and drops it when that spot is taken', () => {
    const ended = (id: string, peak: number) => river(id, () => 300, (i) => (i < 20 ? 3 + (i === peak ? 4 : 0) : 0));
    const n = name({ ...base, rivers: [ended('docs', 10)] }, 'docs')!;
    expect([n.kind, n.anchor, n.x, n.y]).toEqual(['peak', 'middle', 210, 300 - 3.5 - 10.5]);
    expect(touching(placeRiverNames({ ...base, rivers: [ended('docs', 10), ended('site', 10), ended('test', 11)] }).names)).toEqual([]);
    const twice = placeRiverNames({ ...base, rivers: [ended('docs', 10), ended('site', 10)] });
    expect([twice.names.map((p) => p.id), twice.dropped]).toEqual([['docs'], ['site']]);
    const transfer = { start: [190, 270], end: [230, 296] } as const;
    expect(placeRiverNames({ ...base, transfers: [transfer], rivers: [ended('docs', 10)] }).dropped).toEqual(['docs']);
    // Nor into the era band above the plot.
    expect(placeRiverNames({ ...base, rivers: [river('top', () => 6, (i) => (i < 20 ? 4 : 0))] }).dropped).toEqual(['top']);
  });

  it('keeps names clear of obstacles: a covered course goes level, a covered peak is dropped', () => {
    const r = river('packages/vite', (i) => 100 + 2 * i, () => 40);
    const free = name({ ...base, rivers: [r] }, 'packages/vite')!;
    const pushed = name({ ...base, obstacles: [free.box], rivers: [r] }, 'packages/vite')!;
    expect(pushed.kind).toBe('level');
    expect(pushed.box.x > free.box.x + free.box.width || pushed.box.x + pushed.box.width < free.box.x).toBe(true);
    const ended = river('docs', () => 300, (i) => (i < 20 ? 3 + (i === 10 ? 4 : 0) : 0));
    const peak = name({ ...base, rivers: [ended] }, 'docs')!;
    expect(placeRiverNames({ ...base, obstacles: [{ x: peak.x - 2, y: peak.y - 2, width: 4, height: 4 }], rivers: [ended] }).dropped).toEqual(['docs']);
  });

  it('keeps names inside a river clear of transfers', () => {
    const r = river('packages/vite', (i) => 100 + 2 * i, () => 40);
    const free = name({ ...base, rivers: [r] }, 'packages/vite')!;
    const transfer = { start: [free.box.x + 10, free.y], end: [free.box.x + 30, free.y + 4] } as const;
    const moved = name({ ...base, transfers: [transfer], rivers: [r] }, 'packages/vite')!;
    expect(moved.kind).toBe('level');
    expect(moved.box.x > transfer.end[0] + 8 || moved.box.x + moved.box.width < transfer.start[0] - 4).toBe(true);
  });
});

describe('river names on the samples (desktop, 1200 wide, plot 0..1060)', () => {
  const layouts = [['vite', vite], ['svelte', svelte], ['express', express]].flatMap(([id, json]) => {
    const agg = parseAggregate(json);
    return (['modules', 'contributors'] as const).map((dimension) => {
      const L = layoutRivers(selectView(agg, { dimension }), { width: 1200, gap: 2, top: 92, inset: 0, labelRoom: 140, asOf: agg.generatedAt });
      return [`${id} ${dimension}`, L] as const;
    });
  });
  const kinds = Object.fromEntries(layouts.map(([key, L]) =>
    [key, Object.fromEntries([...L.labels.names.map((n) => [n.text, n.kind]), ...L.labels.dropped.map((d) => [d, 'none'])])]));

  it('never overlap, and mouth names end by the column edge', () => {
    expect(layouts.flatMap(([key, L]) => touching(L.labels.names).map((n) => `${key} ${n.id}`))).toEqual([]);
    expect(layouts.flatMap(([, L]) => L.labels.names.filter((n) => n.kind === 'mouth' && n.box.x + n.box.width > 1200))).toEqual([]);
  });

  it('match the kinds the boards were drawn with, deterministically', () => {
    expect(kinds['vite modules']).toMatchObject({ 'packages/vite': 'course', other: 'level', playground: 'mouth', 'docs/guide': 'mouth', '.github': 'peak' });
    expect(kinds['express contributors']).toMatchObject({ tj: 'course', dougwilson: 'level', blakeembrey: 'mouth', other: 'mouth', wesleytodd: 'peak' });
    expect(kinds).toMatchSnapshot();
  });
});
