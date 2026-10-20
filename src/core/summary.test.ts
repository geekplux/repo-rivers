import { describe, expect, it } from 'vitest';
import { layoutRivers } from './layout/layout.ts';
import { parseAggregate, type RepoAggregate } from './schema.ts';
import { amount, caveats, columnTotals, describeView, idleLine, readoutLine, share } from './summary.ts';
import { selectView } from './view.ts';
import express from '../samples/express.json';
import svelte from '../samples/svelte.json';
import vite from '../samples/vite.json';

const SAMPLES: [string, RepoAggregate][] = [['vite', vite], ['svelte', svelte], ['express', express]].map(([n, j]) => [n as string, parseAggregate(j)]);
const VITE = parseAggregate(vite);
const SVELTE = parseAggregate(svelte);

describe('formatting', () => {
  it('formats amounts with en grouping and singular units', () => {
    expect(amount(4811, 'lines changed')).toBe('4,811 lines changed');
    expect(amount(1, 'lines changed')).toBe('1 line changed');
    expect(amount(1, 'commits')).toBe('1 commit');
  });
  it('rounds shares and shows <1% below 0.5%', () => {
    expect(share(56, 100)).toBe('56%');
    expect(share(4, 1000)).toBe('<1%');
    expect(share(0, 10)).toBe('0%');
    expect(share(0, 0)).toBe('0%');
  });
});

describe('caveats', () => {
  it('marks estimated buckets for lines changed only, and the partial last bucket', () => {
    const mods = caveats(VITE, selectView(VITE, { dimension: 'modules' }));
    expect(mods.estimated).toEqual(VITE.source.truncatedBuckets);
    expect(mods.asOf).toBe(Date.parse(VITE.generatedAt));
    expect(caveats(VITE, selectView(VITE, { dimension: 'contributors' })).estimated).toEqual([]);
  });
});

describe('readoutLine', () => {
  const view = selectView(VITE, { dimension: 'modules' });
  const c = caveats(VITE, view);
  const totals = columnTotals(view);

  it('follows the template with numbers from the view model', () => {
    const r = view.rivers.find((x) => x.id === 'm:packages/vite')!;
    const i = r.values.indexOf(r.peak);
    const line = readoutLine(view, c, r.id, i);
    const parts = line.split(' · ');
    expect(parts.slice(0, 4)).toEqual([
      'packages/vite', view.buckets[i]!.label, `${new Intl.NumberFormat('en').format(r.values[i]!)} lines changed`,
      `${Math.round((100 * r.values[i]!) / totals[i]!)}% of the quarter`,
    ]);
    expect(c.estimated).toContain(i);
    expect(parts[4]).toBe('estimated (GitHub listed only 300 files)');
  });

  it('reads zero values as "no changes" and appends the partial flag on the last bucket', () => {
    const r = view.rivers.find((x) => x.values.at(-1) === 0)!;
    const line = readoutLine(view, c, r.id, view.buckets.length - 1);
    expect(line).toBe(`${r.label} · ${view.buckets.at(-1)!.label} · no lines changed this quarter · partial quarter, to 20 Oct`);
  });

  it('lists transfers in and out of the river, in order after the estimate flags', () => {
    const t = view.transfers.find((x) => x.files > 1)!;
    const to = view.rivers.find((x) => x.id === t.to)!;
    const from = view.rivers.find((x) => x.id === t.from)!;
    expect(readoutLine(view, c, t.to, t.bucket)).toContain(`${t.files} files moved in from ${from.label}`);
    expect(readoutLine(view, c, t.from, t.bucket)).toContain(`${t.files} files moved out to ${to.label}`);
  });

  it('flags clipped columns and bots, and reads a whole column when no river is active', () => {
    const sv = selectView(SVELTE, { dimension: 'modules' });
    const L = layoutRivers(sv, { width: 1104 });
    const sc = caveats(SVELTE, sv, L.clipped);
    expect(readoutLine(sv, sc, sv.rivers[0]!.id, 9)).toContain(' · column clipped, drawn at 23% scale');
    expect(readoutLine(sv, sc, null, 9)).toMatch(/^Q1 2019 · [\d,]+ lines changed across \d+ rivers/);
    const people = selectView(SVELTE, { dimension: 'contributors', includeBots: true });
    const bot = people.rivers.find((r) => r.bot)!;
    expect(readoutLine(people, caveats(SVELTE, people), bot.id, bot.values.indexOf(bot.peak))).toMatch(/ · bot$/);
  });

  it('names every river, including the ones whose labels are dropped', () => {
    const L = layoutRivers(view, { width: 1104 });
    for (const r of view.rivers) expect(readoutLine(view, c, r.id, 0).startsWith(`${r.label} · `)).toBe(true);
    expect(L.labels.placed.length + L.labels.dropped.length).toBeGreaterThanOrEqual(view.rivers.length);
  });

  it('has an idle line', () => {
    expect(idleLine(VITE, view)).toBe(`vitejs/vite · ${view.buckets[0]!.label}–${view.buckets.at(-1)!.label} · 27 quarters · ${view.rivers.length} rivers by lines changed. Hover, tap or Tab into the chart.`);
  });
});

describe('describeView', () => {
  it.each(SAMPLES)('%s: period, top river and share, busiest bucket, largest transfer, caveats', (_, agg) => {
    for (const dimension of ['modules', 'contributors'] as const) {
      const view = selectView(agg, { dimension });
      const c = caveats(agg, view);
      const text = describeView(agg, view, c);
      const totals = columnTotals(view);
      const top = view.rivers.filter((r) => r.kind !== 'other').toSorted((a, b) => b.total - a.total)[0]!;
      const grand = totals.reduce((a, b) => a + b, 0);
      expect(text).toContain(`${view.buckets[0]!.label} to ${view.buckets.at(-1)!.label}`);
      expect(text).toContain(`The largest river is ${top.label}, with ${share(top.total, grand)} of all ${view.metric}.`);
      const busiest = view.buckets[totals.indexOf(Math.max(...totals))]!.label;
      expect(text).toContain(`The busiest ${agg.time.unit} was ${busiest}, with ${amount(Math.max(...totals), view.metric)}.`);
      const big = view.transfers.toSorted((a, b) => b.files - a.files)[0];
      expect(text.includes('The largest move was')).toBe(big !== undefined);
      expect(text).toContain(big ? `The largest move was ${big.files} files` : '');
      expect(text).toContain(`The last ${agg.time.unit} is partial, to 20 Oct 2026.`);
      expect(text.includes('estimated')).toBe(c.estimated.length > 0);
      expect(text).toContain(c.estimated.length ? `${c.estimated.length} of ${view.buckets.length} ${agg.time.unit}s are estimated from sampled commits.` : '');
    }
  });

  it('describes an empty selection', () => {
    const view = { ...selectView(VITE, { dimension: 'contributors' }), rivers: [] };
    expect(describeView(VITE, view, caveats(VITE, view))).toMatch(/No commits to draw for this selection\.$/);
  });
});
