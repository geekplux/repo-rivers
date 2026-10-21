import { describe, expect, it } from 'vitest';
import { yearTicks } from './Axis.tsx';

const at = (w: number) => yearTicks(quarters(2000, 80), 0, w).labels.map((l) => l.text);
const quarters = (from: number, n: number): string[] =>
  Array.from({ length: n }, (_, i) => new Date(Date.UTC(from, 3 * i, 1)).toISOString());

describe('yearTicks (docs/viz/rivers.md §5.7)', () => {
  it('draws a meridian at each year start and centres the year in its span', () => {
    const { lines, labels } = yearTicks(quarters(2020, 8).slice(2), 0, 50); // Q3 2020 … Q4 2021
    expect(lines).toEqual([100]);
    expect(labels).toEqual([{ x: 50, text: '2020' }, { x: 200, text: '2021' }]);
  });

  it('thins labels to every 2nd/5th/10th year so they stay ≥ 48 px apart', () => {
    expect(at(14)).toHaveLength(20); // 56 px per year
    expect(at(10)).toEqual(['2000', '2002', '2004', '2006', '2008', '2010', '2012', '2014', '2016', '2018']);
    expect(at(4)).toEqual(['2000', '2005', '2010', '2015']);
  });

  it('labels every bucket when the unit is a year and buckets are ≥ 48 px wide', () => {
    const years = Array.from({ length: 18 }, (_, i) => `${2009 + i}-01-01T00:00:00.000Z`);
    const { lines, labels } = yearTicks(years, 0, 56);
    expect([lines.length, labels.length, labels[0]]).toEqual([17, 18, { x: 28, text: '2009' }]);
  });
});
