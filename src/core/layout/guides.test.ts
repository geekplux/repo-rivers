import { describe, expect, it } from 'vitest';
import svelte from '../../samples/svelte.json';
import vite from '../../samples/vite.json';
import { parseAggregate } from '../schema.ts';
import { eraMarks, eraTitleWidth, fitLine, phoneEraWidth, phoneGuides, phoneSize, wrapTitle, yearTicks } from './guides.ts';

const quarters = (from: string, n: number): { start: string }[] => {
  const [y, m] = from.split('-').map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => ({ start: new Date(Date.UTC(y, m - 1 + 3 * i, 1)).toISOString() }));
};

describe('wrapTitle', () => {
  it('keeps a name that fits on one line', () => {
    expect(wrapTitle('The src era', 200)).toEqual(['The src era']);
  });

  it('wraps inside the width to at most two lines', () => {
    const max = eraTitleWidth('From src/node to');
    expect(wrapTitle('From src/node to packages/vite', max)).toEqual(['From src/node to', 'packages/vite']);
  });

  it('ends the second line with an ellipsis when words are left over', () => {
    const lines = wrapTitle('one two three four five six', eraTitleWidth('one two'));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('one two');
    expect(lines[1]!.endsWith('…')).toBe(true);
    expect(eraTitleWidth(lines[1]!)).toBeLessThanOrEqual(eraTitleWidth('one two'));
  });
});

describe('eraMarks', () => {
  it('puts each rule at the era start and wraps inside the era width minus 16', () => {
    const agg = parseAggregate(vite);
    const buckets = agg.time.starts.map((_, i) => ({ label: `B${i}` }));
    const marks = eraMarks(agg.eras!, buckets, 0, 40);
    marks.forEach((m, k) => {
      const e = agg.eras![k]!;
      expect([m.x0, m.x1]).toEqual([e.start * 40, (e.end + 1) * 40]);
      expect(m.lines.length).toBeLessThanOrEqual(2);
      expect(m.range).toBe(e.start === e.end ? `B${e.start}` : `B${e.start} to B${e.end}`);
      if (m.lines.length > 1 || !m.lines[0]!.includes(' ')) return;
      expect(eraTitleWidth(m.lines[0]!)).toBeLessThanOrEqual(m.x1 - m.x0 - 16);
    });
  });
});

describe('yearTicks', () => {
  it('ticks each year start, left-aligned, and the first bucket only when the next label is ≥ 3 buckets away', () => {
    expect(yearTicks(quarters('2020-04', 8), 0, 40)).toEqual([{ x: 0, text: '2020' }, { x: 120, text: '2021' }, { x: 280, text: '2022' }]);
    expect(yearTicks(quarters('2020-07', 8), 0, 40)).toEqual([{ x: 80, text: '2021' }, { x: 240, text: '2022' }]);
    expect(yearTicks(quarters('2020-01', 5), 0, 40)).toEqual([{ x: 0, text: '2020' }, { x: 160, text: '2021' }]);
  });

  it('labels every yearly bucket while they are wide enough, then thins to round years', () => {
    const years = Array.from({ length: 20 }, (_, i) => ({ start: `${2000 + i}-01-01T00:00:00.000Z` }));
    expect(yearTicks(years, 0, 50)).toHaveLength(20);
    expect(yearTicks(years, 0, 30).map((t) => t.text)).toEqual(['2000', '2002', '2004', '2006', '2008', '2010', '2012', '2014', '2016', '2018']);
  });

  it('matches the boards for the samples (Svelte starts in Q4 2016: no 2016 label)', () => {
    const sv = parseAggregate(svelte).time.starts.map((start) => ({ start }));
    expect(yearTicks(sv, 0, 10)[0]!.text).toBe('2017');
    const vi = parseAggregate(vite).time.starts.map((start) => ({ start }));
    expect(yearTicks(vi, 0, 40)[0]).toEqual({ x: 0, text: '2020' });
  });
});

describe('phone guides', () => {
  it('sizes the phone chart: 56 px per bucket, cross axis 58 px narrower than the column', () => {
    expect(phoneSize(358, 27)).toEqual({ length: 1512, cross: 300, height: 1560 });
    expect(phoneSize(600, 10).cross).toBe(542);
  });

  it('puts a year label 4 px under each year start (the first bucket too, 3 buckets clear) and an era rule at each era start with its name 18 px under it', () => {
    const buckets = quarters('2020-04', 8); // Q2 2020 .. Q1 2022
    const g = phoneGuides(buckets, [{ start: 0, title: 'The src era' }, { start: 3, title: 'The test era' }], 24, 56, 358);
    expect(g.years).toEqual([{ y: 28, text: '2020' }, { y: 24 + 3 * 56 + 4, text: '2021' }, { y: 24 + 7 * 56 + 4, text: '2022' }]);
    expect(g.eras.map(({ y, nameY, text }) => [y, nameY, text])).toEqual([[24, 42, 'The src era'], [24 + 3 * 56, 24 + 3 * 56 + 18, 'The test era']]);
    expect(g.eras[0]!.width).toBe(phoneEraWidth('The src era'));
  });

  it('keeps an era name on one line clear of the year column', () => {
    const long = 'From src/node to packages/vite and on to packages/create-vite and the docs';
    const [e] = phoneGuides(quarters('2020-01', 4), [{ start: 0, title: long }], 24, 56, 358).eras;
    expect(e!.text.endsWith('…')).toBe(true);
    expect(e!.width).toBeLessThanOrEqual(358 - 48);
    expect(fitLine('The src era', 100, phoneEraWidth)).toBe('The src era');
  });
});
