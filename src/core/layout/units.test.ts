import { describe, expect, it } from 'vitest';
import type { River } from '../view.ts';
import { ellipsize, hits } from './labels.ts';
import { laneOrder } from './order.ts';
import { edgeAt, link, ribbonPath } from './ribbons.ts';
import { band, linear, quantile, sqrt } from './scale.ts';

const river = (id: string, values: number[], kind: River['kind'] = 'module'): River =>
  ({ id, label: id, kind, bot: false, values, total: values.reduce((a, b) => a + b, 0), peak: Math.max(...values) });

describe('scales', () => {
  it('linear, sqrt, band and type-7 quantiles', () => {
    expect(linear([0, 10], [0, 100])(2.5)).toBe(25);
    expect(linear([5, 5], [1, 9])(7)).toBe(1);
    expect(sqrt(16, 8)(4)).toBe(4);
    expect(sqrt(0, 8)(4)).toBe(0);
    const b = band(4, 0, 100);
    expect([b.width, b.x(0), b.x(3)]).toEqual([25, 12.5, 87.5]);
    expect(quantile([10, 11, 12, 25], 0.25)).toBeCloseTo(10.75, 9);
    expect(quantile([10, 11, 12, 25], 0.75)).toBeCloseTo(15.25, 9);
  });
});

describe('laneOrder', () => {
  it('sorts by onset, total, id; puts "other" last; is stable for equal input', () => {
    const rs = [river('other', [1, 1, 1], 'other'), river('b', [0, 2, 2]), river('a', [0, 2, 2]), river('c', [1, 0, 0])];
    expect(laneOrder(rs, []).map((r) => r.id)).toEqual(['c', 'a', 'b', 'other']);
  });

  it('places children born from a transfer below the parent with the most files, siblings by total', () => {
    const rs = [river('p', [5, 5, 5]), river('q', [5, 5, 5, 0]), river('x', [0, 0, 1]), river('y', [0, 0, 9]), river('other', [1, 1, 1], 'other')];
    const moves = [
      { from: 'q', to: 'x', bucket: 2, files: 1 }, { from: 'p', to: 'x', bucket: 2, files: 4 },
      { from: 'p', to: 'y', bucket: 2, files: 2 },
    ];
    expect(laneOrder(rs, moves).map((r) => r.id)).toEqual(['p', 'y', 'x', 'q', 'other']);
  });

  it('ignores "other" as a parent, transfers outside the onset bucket, and parent cycles', () => {
    const rs = [river('a', [1, 1]), river('b', [0, 1]), river('other', [1, 1], 'other')];
    expect(laneOrder(rs, [{ from: 'other', to: 'b', bucket: 1, files: 9 }]).map((r) => r.id)).toEqual(['a', 'b', 'other']);
    const late = [river('a', [1, 1, 1]), river('m', [1, 0, 0]), river('b', [0, 1, 1])];
    expect(laneOrder(late, [{ from: 'm', to: 'b', bucket: 2, files: 9 }]).map((r) => r.id)).toEqual(['a', 'm', 'b']);
    const loop = [river('a', [0, 1]), river('b', [0, 1])];
    const cycle = [{ from: 'a', to: 'b', bucket: 1, files: 1 }, { from: 'b', to: 'a', bucket: 1, files: 1 }];
    expect(laneOrder(loop, cycle).map((r) => r.id).toSorted()).toEqual(['a', 'b']);
  });
});

describe('ribbons', () => {
  const xs = [0, 10, 30, 50, 60];

  it('builds one closed subpath per non-zero run, tapering to a point at zero columns', () => {
    const path = ribbonPath(xs, [5, 9, 1], [15, 9, 11], [3, 0, 3]);
    expect(path).toBe(
      'M0,5C5,5 5,5 10,5C20,5 20,9 30,9L30,9C20,9 20,15 10,15C5,15 5,15 0,15Z'
      + 'M30,9C40,9 40,1 50,1C55,1 55,1 60,1L60,11C55,11 55,11 50,11C40,11 40,9 30,9Z',
    );
    expect(ribbonPath(xs, [1, 1, 1], [1, 1, 1], [0, 0, 0])).toBe('');
    expect(link([10, 5.04], [30, 20])).toBe('M10,5C20,5 20,20 30,20');
  });

  it('edgeAt follows the drawn mid-x cubic exactly', () => {
    const ys = [0, 0, 40, 40, 40];
    for (const t of [0, 0.1, 0.37, 0.5, 0.8, 1]) {
      const x = 10 * (1 - t) ** 3 + 3 * 20 * (1 - t) ** 2 * t + 3 * 20 * (1 - t) * t * t + 30 * t ** 3;
      const y = 3 * 40 * (1 - t) * t * t + 40 * t ** 3;
      expect(edgeAt(xs, ys, x)).toBeCloseTo(y, 9);
    }
    expect(edgeAt(xs, ys, 5)).toBe(0);
    expect(edgeAt(xs, ys, 55)).toBe(40);
  });
});

describe('label helpers', () => {
  it('middle-ellipsizes long text to 26 characters', () => {
    expect(ellipsize('packages/create-vite')).toBe('packages/create-vite');
    const long = ellipsize('packages/vite/src/node/server/middlewares');
    expect(long).toHaveLength(26);
    expect(long).toBe('packages/vite…/middlewares');
  });

  it('treats boxes closer than 2 px as hitting', () => {
    const a = { x: 0, y: 0, width: 10, height: 14 };
    expect(hits(a, { ...a, x: 12 })).toBe(false);
    expect(hits(a, { ...a, x: 11.9 })).toBe(true);
    expect(hits(a, { ...a, y: 16 })).toBe(false);
  });
});
