import { describe, expect, it } from 'vitest';
import { hits } from '../core/layout/labels.ts';
import { layoutRivers } from '../core/layout/layout.ts';
import { parseAggregate } from '../core/schema.ts';
import { selectView } from '../core/view.ts';
import svelte from '../samples/svelte.json';
import vite from '../samples/vite.json';
import { yearTicks } from './Axis.tsx';
import { cursorTag, floatLabel, overlaps } from './overlays.ts';

const lay = (json: unknown) => {
  const agg = parseAggregate(json);
  const view = selectView(agg, { dimension: 'modules' });
  return { agg, view, L: layoutRivers(view, { width: 1104, height: 440, asOf: agg.generatedAt, truncatedBuckets: agg.source.truncatedBuckets }) };
};

describe('cursorTag', () => {
  it('stays inside the plot and reports a 4 px padded span to avoid', () => {
    const t = cursorTag('2024 Q3', 6, 4, 1000);
    expect(t.width).toBeCloseTo(7.4 * 7 + 10);
    expect(t.x - t.width / 2).toBeCloseTo(4);
    expect(t.avoid).toEqual([t.x - t.width / 2 - 4, t.x + t.width / 2 + 4]);
    expect(cursorTag('2024 Q3', 999, 4, 1000).x + t.width / 2).toBeCloseTo(1000);
  });

  it('hides the year labels it would cover (Axis uses this test)', () => {
    const { agg, L } = lay(vite);
    const ticks = yearTicks(agg.time.starts, L.plot.left, L.bucketWidth).labels;
    const tag = cursorTag('2022 Q2', L.columns[13]!.x, L.plot.left, L.plot.right);
    const kept = ticks.filter((l) => !overlaps([l.x - 3.7 * l.text.length, l.x + 3.7 * l.text.length], tag.avoid));
    expect(kept.length).toBeLessThan(ticks.length);
    expect(kept.every((l) => l.x + 3.7 * l.text.length <= tag.avoid[0] || l.x - 3.7 * l.text.length >= tag.avoid[1])).toBe(true);
  });
});

describe('floatLabel', () => {
  it('centres on the bucket, clamped 4 px inside the plot, above the river', () => {
    const { L } = lay(vite);
    const shape = L.rivers[0]!;
    const text = 'x'.repeat(20);
    const f = floatLabel(L, shape, 0, text);
    expect(f.x).toBeCloseTo(L.plot.left + (7.4 * 20) / 2 + 4);
    expect(f.y).toBe(Math.max(L.plot.top + 7, shape.edges.top[0]! - 11));
    expect(floatLabel(L, shape, L.columns.length - 1, text).x).toBeCloseTo(L.plot.right - (7.4 * 20) / 2 - 4);
  });

  it('falls back below the river when the top spot hits a clip or partial label', () => {
    const { L } = lay(svelte);
    const clip = L.clipped[0]!;
    const shape = L.rivers.find((r) => r.edges.top[clip.index]! - 11 <= clip.box.y + clip.box.height)!;
    const text = shape.label;
    const f = floatLabel(L, shape, clip.index, text);
    const box = { x: f.x - (7.4 * text.length) / 2, y: f.y - 7, width: 7.4 * text.length, height: 14 };
    expect(hits(box, clip.box)).toBe(false);
    expect(f.y).toBe(Math.min(L.plot.bottom - 7, shape.edges.bottom[clip.index]! + 11));
  });
});
