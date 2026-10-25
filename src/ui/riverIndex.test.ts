import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseAggregate } from '../core/schema.ts';
import { selectView } from '../core/view.ts';
import svelte from '../samples/svelte.json';
import vite from '../samples/vite.json';
import { RiverIndex, type RiverIndexProps } from './RiverIndex.tsx';
import { activeSpan, indexHeads, shareText, sparkPath } from './riverIndex.ts';

const B = (...years: number[]) => years.map((y) => ({ start: `${y}-01-01T00:00:00.000Z` }));

describe('sparkPath', () => {
  it('closes an area from the baseline, each value scaled to the series peak', () => {
    expect(sparkPath([0, 5, 10], 360, 24)).toBe('M0,24L0,24L180,12L360,0L360,24Z');
    expect(sparkPath([3, 3], 100, 20)).toBe('M0,20L0,0L100,0L100,20Z');
  });
  it('lies flat for an all-zero series and spans the box for one bucket', () => {
    expect(sparkPath([0, 0, 0], 10, 4)).toBe('M0,4L0,4L5,4L10,4L10,4Z');
    expect(sparkPath([7], 10, 4)).toBe('M0,4L0,0L10,0L10,4Z');
  });
});

describe('shareText', () => {
  it('rounds from 10% up, one decimal below, <0.1% for the smallest', () => {
    expect(shareText(46, 100)).toBe('46%');
    expect(shareText(9.96, 100)).toBe('10.0%');
    expect(shareText(4.24, 100)).toBe('4.2%');
    expect(shareText(0.04, 100)).toBe('<0.1%');
    expect(shareText(0, 100)).toBe('0.0%');
    expect(shareText(1, 0)).toBe('0.0%');
  });
});

describe('activeSpan', () => {
  const buckets = B(2020, 2020, 2021, 2024, 2026);
  it('reads "to now" when the river runs into the last bucket', () => expect(activeSpan([0, 1, 0, 0, 2], buckets)).toBe('2020 to now'));
  it('gives first and last years, or one year', () => {
    expect(activeSpan([0, 0, 1, 3, 0], buckets)).toBe('2021 to 2024');
    expect(activeSpan([1, 2, 0, 0, 0], buckets)).toBe('2020');
    expect(activeSpan([0, 0, 0, 0, 0], buckets)).toBe('');
  });
});

describe('indexHeads', () => {
  it('names the dimension, the unit and the measure', () => {
    expect(indexHeads({ metric: 'lines changed' }, 'quarter')).toEqual({ name: 'Module', spark: 'Each quarter, scaled to its own peak', amount: 'Lines changed' });
    expect(indexHeads({ metric: 'commits' }, 'year')).toEqual({ name: 'Contributor', spark: 'Each year, scaled to its own peak', amount: 'Commits' });
  });
});

const VITE = parseAggregate(vite);
const html = (p: Partial<RiverIndexProps> & Pick<RiverIndexProps, 'view'>) =>
  renderToStaticMarkup(createElement(RiverIndex, { unit: 'quarter', repo: 'vitejs/vite', active: null, pinned: false, onPick: () => {}, onClear: () => {}, ...p }));
const rows = (h: string) => [...h.match(/<tbody>(.*)<\/tbody>/)![1]!.matchAll(/<tr ([^>]*)>(.*?)<\/tr>/g)].map((m) => ({ attrs: m[1]!, cells: m[2]!.split(/<\/t[hd]>/).slice(0, 5).map((c) => c.replace(/<[^>]+>/g, '')) }));

describe('RiverIndex', () => {
  const view = selectView(VITE, { dimension: 'modules' });
  it('has one row per river, largest first, with total, share and span; the head follows the board', () => {
    const h = html({ view });
    expect(h).toMatch(/<caption class="rr-sr">Every river of vitejs\/vite by lines changed, largest first, then other<\/caption>/);
    const head = [...h.match(/<thead>(.*)<\/thead>/)![1]!.matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, '|'));
    expect(head).toEqual(['Module', '|Each quarter, scaled to its own peak||Over time|', 'Lines changed', 'Share', 'Active']);
    const all = view.rivers.reduce((s, r) => s + r.total, 0);
    const r = rows(h);
    expect(r.map((x) => x.cells[0])).toEqual(view.rivers.map((v) => v.label));
    expect(r.map((x) => x.cells[2])).toEqual(view.rivers.map((v) => v.total.toLocaleString('en')));
    expect(r.map((x) => x.cells[3])).toEqual(view.rivers.map((v) => shareText(v.total, all)));
    expect(r[0]!.cells[4]).toBe('2020 to now');
    expect(h.match(/<svg[^>]*aria-hidden="true"/g)).toHaveLength(view.rivers.length);
    expect(h.match(/class="rr-spark-other"/g)).toHaveLength(1);
    expect(h).not.toContain('·');
  });
  it('marks the focused river’s row and presses its button only when pinned', () => {
    const id = view.rivers[2]!.id;
    const hovered = rows(html({ view, active: id }));
    expect(hovered.filter((x) => x.attrs.includes('rr-on')).map((x) => x.attrs)).toEqual([`data-row="${id}" class="rr-on"`]);
    expect(html({ view, active: id })).not.toContain('aria-pressed="true"');
    expect(html({ view, active: id, pinned: true }).match(/aria-pressed="true"/g)).toHaveLength(1);
  });
  it('contributors: commits, and "bot" only after a bot name without [bot]', () => {
    const people = selectView(parseAggregate(svelte), { dimension: 'contributors', includeBots: true });
    const h = html({ view: people });
    expect(h).toContain('<th scope="col" class="rr-c-name">Contributor</th>');
    expect(h).toContain('>Commits</th>');
    const names = rows(h).map((x) => x.cells[0]!);
    expect(names.some((n) => /\[bot\]$/i.test(n))).toBe(true);
    expect(names.some((n) => /\[bot\] bot$/i.test(n))).toBe(false);
  });
});
