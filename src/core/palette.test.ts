import { describe, expect, it } from 'vitest';
import {
  OTHER_COLOR,
  PALETTES,
  assignColors,
  contrast,
  deltaE2000,
  hexToLab,
  labToHex,
  type Cvd,
  type Theme,
  type Triple,
} from './palette.ts';

// Sharma, Wu & Dalal (2005), Table 1: L1 a1 b1 L2 a2 b2 ΔE00.
const SHARMA = `
50 2.6772 -79.7751 50 0 -82.7485 2.0425|50 3.1571 -77.2803 50 0 -82.7485 2.8615|50 2.8361 -74.02 50 0 -82.7485 3.4412
50 -1.3802 -84.2814 50 0 -82.7485 1|50 -1.1848 -84.8006 50 0 -82.7485 1|50 -0.9009 -85.5211 50 0 -82.7485 1
50 0 0 50 -1 2 2.3669|50 -1 2 50 0 0 2.3669|50 2.49 -0.001 50 -2.49 0.0009 7.1792|50 2.49 -0.001 50 -2.49 0.001 7.1792
50 2.49 -0.001 50 -2.49 0.0011 7.2195|50 2.49 -0.001 50 -2.49 0.0012 7.2195|50 -0.001 2.49 50 0.0009 -2.49 4.8045
50 -0.001 2.49 50 0.001 -2.49 4.8045|50 -0.001 2.49 50 0.0011 -2.49 4.7461|50 2.5 0 50 0 -2.5 4.3065
50 2.5 0 73 25 -18 27.1492|50 2.5 0 61 -5 29 22.8977|50 2.5 0 56 -27 -3 31.903|50 2.5 0 58 24 15 19.4535
50 2.5 0 50 3.1736 0.5854 1|50 2.5 0 50 3.2972 0 1|50 2.5 0 50 1.8634 0.5757 1|50 2.5 0 50 3.2592 0.335 1
60.2574 -34.0099 36.2677 60.4626 -34.1751 39.4387 1.2644|63.0109 -31.0961 -5.8663 62.8187 -29.7946 -4.0864 1.263
61.2901 3.7196 -5.3901 61.4292 2.248 -4.962 1.8731|35.0831 -44.1164 3.7933 35.0232 -40.0716 1.5901 1.8645
22.7233 20.0904 -46.694 23.0331 14.973 -42.5619 2.0373|36.4612 47.858 18.3852 36.2715 50.5065 21.2231 1.4146
90.8027 -2.0831 1.441 91.1528 -1.6435 0.0447 1.4441|90.9257 -0.5406 -0.9208 88.6381 -0.8985 -0.7239 1.5381
6.7747 -0.2908 -2.4247 5.8714 -0.0985 -2.2286 0.6377|2.0776 0.0795 -1.135 0.9033 -0.0636 -0.5514 0.9082`
  .trim()
  .split(/[|\n]/)
  .map((row) => row.trim().split(' ').map(Number));

const THEMES: Theme[] = ['light', 'dark'];
const VISIONS: (Cvd | undefined)[] = [undefined, 'protanopia', 'deuteranopia', 'tritanopia'];
const minDelta = (fills: readonly string[], cvd?: Cvd): number => {
  const labs = fills.map((f) => hexToLab(f, cvd));
  return Math.min(...labs.flatMap((a, i) => labs.slice(i + 1).map((b) => deltaE2000(a, b))));
};

describe('colour science', () => {
  it('matches all 34 Sharma 2005 CIEDE2000 test pairs to ±0.0001 (C3), symmetrically', () => {
    expect(SHARMA).toHaveLength(34);
    for (const [l1, a1, b1, l2, a2, b2, want] of SHARMA as [number, number, number, number, number, number, number][]) {
      expect(deltaE2000([l1, a1, b1], [l2, a2, b2])).toBeCloseTo(want, 4);
      expect(deltaE2000([l2, a2, b2], [l1, a1, b1])).toBeCloseTo(want, 4);
    }
  });

  it('round-trips sRGB through Lab and knows the reference points', () => {
    for (const hex of [...PALETTES.light.fills, ...PALETTES.dark.fills, '#000000', '#ffffff']) {
      expect(labToHex(hexToLab(hex))).toBe(hex.toLowerCase());
    }
    const white = hexToLab('#FFFFFF') as Triple;
    expect(white[0]).toBeCloseTo(100, 2);
    expect(Math.abs(white[1]) + Math.abs(white[2])).toBeLessThan(0.01);
  });

  it('computes WCAG contrast (black on white is 21:1, order-independent)', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 6);
    expect(contrast('#FFFFFF', '#000000')).toBeCloseTo(21, 6);
    expect(contrast('#777777', '#777777')).toBe(1);
  });
});

describe('palettes', () => {
  it('has 8 hues plus the other grey in both themes', () => {
    for (const t of THEMES) expect(PALETTES[t].fills).toHaveLength(OTHER_COLOR + 1);
  });

  // §4 minima as measured by the spec's prototype checker; C3 asks for ±0.2.
  const SPEC_MIN: Record<Theme, number[]> = { light: [15.8, 10.3, 10.3, 10.4], dark: [17.9, 10.7, 10.4, 10.5] };

  for (const theme of THEMES) {
    it(`${theme}: all 36 pairs ΔE00 ≥ 8 under normal and CVD vision (C1) and reproduce the §4 minima (C3)`, () => {
      VISIONS.forEach((cvd, i) => {
        const d = minDelta(PALETTES[theme].fills, cvd);
        expect(d).toBeGreaterThanOrEqual(8);
        expect(Math.abs(d - SPEC_MIN[theme][i]!)).toBeLessThanOrEqual(0.2);
      });
    });

    it(`${theme}: fills ≥ 3:1, text ≥ 4.5:1, focus ring ≥ 3:1 against the background (C2)`, () => {
      const p = PALETTES[theme];
      expect(Math.min(...p.fills.map((fill) => contrast(fill, p.background)))).toBeGreaterThanOrEqual(3);
      expect(contrast(p.ink, p.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.secondary, p.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.focus, p.background)).toBeGreaterThanOrEqual(3);
    });
  }
});

const lane = (id: string, values: number[], kind: 'module' | 'other' = 'module') => ({ id, kind, values });

describe('assignColors', () => {
  it('prefers lane mod 8, skips hues of co-adjacent rivers, greys "other"', () => {
    const lanes = Array.from({ length: 9 }, (_, i) => lane(`r${i}`, [1, i === 8 ? 1 : 0, 1]));
    lanes.push(lane('other', [1, 1, 1], 'other'));
    const colors = assignColors(lanes);
    expect(colors.slice(0, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(colors[8]).toBe(0); // lane 8 mod 8; r0 never touches r8, r7 does (hue 7)
    expect(colors[9]).toBe(OTHER_COLOR);
  });

  it('never gives two rivers touching through a zero-valued lane the same hue', () => {
    // a and c touch in column 1 because b is zero there.
    const colors = assignColors([lane('a', [1, 1]), lane('b', [1, 0]), lane('c', [1, 1])], { c: 0 });
    expect(colors[0]).not.toBe(colors[2]);
    expect(colors[2]).toBe(0); // sticky wins; the newcomer moves instead
  });

  it('keeps previous hues when they cause no conflict', () => {
    const lanes = [lane('x', [1, 1]), lane('y', [1, 1]), lane('z', [0, 1])];
    expect(assignColors(lanes, { x: 5, y: 2, z: 7 })).toEqual([5, 2, 7]);
    expect(assignColors(lanes, { x: 5, y: 5 })).toEqual([5, 1, 2]);
  });
});
