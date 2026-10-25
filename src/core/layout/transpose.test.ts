import { describe, expect, it } from 'vitest';
import express from '../../samples/express.json';
import svelte from '../../samples/svelte.json';
import vite from '../../samples/vite.json';
import { parseAggregate } from '../schema.ts';
import { selectView } from '../view.ts';
import { PHONE, phoneSize } from './guides.ts';
import { layoutRivers } from './layout.ts';
import { flipBox, flipMatrix, flipName, flipOf, toLayout, toPage } from './transpose.ts';

/** The phone layout as App.tsx makes it at a 390 page (358 px column). */
function phone(sample: unknown, dimension: 'modules' | 'contributors', width = 358) {
  const agg = parseAggregate(sample);
  const view = selectView(agg, { dimension });
  const size = phoneSize(width, view.buckets.length);
  const L = layoutRivers(view, { width: size.length, height: size.cross, top: 0, inset: 0, labelRoom: 0, gap: 2, phone: true, asOf: agg.generatedAt });
  return { L, f: flipOf(L, PHONE.left, PHONE.top), size, view };
}

describe('transpose', () => {
  const f = { dx: 34, dy: 24 };
  it('swaps the axes and shifts, and maps back exactly', () => {
    expect(toPage(f, [100, 7])).toEqual([41, 124]);
    expect(toLayout(f, toPage(f, [100, 7]))).toEqual([100, 7]);
    expect(toPage(f, toLayout(f, [200, 300]))).toEqual([200, 300]);
  });
  it('draws with the matching SVG matrix: (x, y) → (y + dx, x + dy)', () => {
    expect(flipMatrix(f)).toBe('matrix(0 1 1 0 34 24)');
    const [a, b, c, d, e, g] = flipMatrix(f).slice(7, -1).split(' ').map(Number) as number[];
    const [x, y] = [100, 7];
    expect([a! * x + c! * y + e!, b! * x + d! * y + g!]).toEqual(toPage(f, [x, y]));
  });
  it('swaps a box and turns a level name to read downward', () => {
    expect(flipBox(f, { x: 10, y: 2, width: 60, height: 16 })).toEqual({ x: 36, y: 34, width: 16, height: 60 });
    const n = flipName(f, { id: 'a', text: 'src', kind: 'course', x: 10, y: 2, angle: 0, anchor: 'start', box: { x: 10, y: -6, width: 30, height: 16 } });
    expect(n).toMatchObject({ x: 36, y: 34, angle: 90, box: { x: 28, y: 34, width: 16, height: 30 } });
  });
  it('puts the phone plot at x 50..350 of a 390 page and the first bucket at y 24, 56 px per bucket', () => {
    const { L, f: flip, size, view } = phone(vite, 'modules');
    expect(L.bucketWidth).toBe(PHONE.step);
    expect(size.cross).toBe(300);
    expect(size.height).toBe(24 + 56 * view.buckets.length + 24);
    expect(toPage(flip, [L.plot.left, L.plot.top])).toEqual([34, 24]); // + the 16 px margin: page x 50
    expect(toPage(flip, [L.plot.right, L.plot.bottom])).toEqual([334, 24 + 56 * view.buckets.length]); // page x 350
    expect(size.height).toBeGreaterThan(358); // taller than wide
  });
  it('keeps every river inside the cross axis and every column on its bucket row', () => {
    const bad = [vite, svelte, express].flatMap((s) => (['modules', 'contributors'] as const).flatMap((d) => {
      const { L, f: flip } = phone(s, d);
      return L.rivers.flatMap((r) => r.edges.top.flatMap((t, i) => {
        const [x0, y] = toPage(flip, [L.columns[i]!.x, t]);
        const [x1] = toPage(flip, [L.columns[i]!.x, r.edges.bottom[i]!]);
        return x0 >= 34 - 1e-6 && x1 <= 334 + 22 + 1e-6 && Math.abs(y - (24 + 56 * (i + 0.5))) < 1e-6 ? [] : [`${r.id}@${i}`];
      }));
    }));
    expect(bad).toEqual([]);
  });
});

describe('phone river names', () => {
  it('names rivers only inside a run, straight along time, so they read downward on the page', () => {
    const bad = [vite, svelte, express].flatMap((s) => (['modules', 'contributors'] as const).flatMap((d) => {
      const { L, f: flip } = phone(s, d);
      return L.labels.names.flatMap((n) => {
        const r = L.rivers.find((x) => x.id === n.id)!;
        const p = flipName(flip, n);
        const i = Math.floor((n.x - L.plot.left) / L.bucketWidth);
        const inside = r.edges.top[i]! <= n.y && n.y <= r.edges.bottom[i]!;
        return n.kind === 'course' && n.angle === 0 && p.angle === 90 && inside && p.box.y >= 24 ? [] : [`${n.id} ${n.kind}`];
      });
    }));
    expect(bad).toEqual([]);
  });
  it('names the main rivers of the samples and leaves the rest to the Rivers table', () => {
    const { L } = phone(vite, 'modules');
    expect(L.labels.names.length).toBeGreaterThanOrEqual(1);
    expect(L.labels.names.length + L.labels.dropped.length).toBe(L.rivers.length);
    expect(L.labels.names.every((n) => !n.leader)).toBe(true);
  });
});
