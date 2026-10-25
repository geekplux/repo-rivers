import { describe, expect, it } from 'vitest';
import { layoutRivers } from './layout/layout.ts';
import { parseAggregate, type RepoAggregate } from './schema.ts';
import { amount, caveats, columnTotals, describeView, eraNote, eraRange, focusReadout, idleReadout, legendItems, plain, share } from './summary.ts';
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

describe('focusReadout', () => {
  const view = selectView(VITE, { dimension: 'modules' });
  const c = caveats(VITE, view);
  const totals = columnTotals(view);
  const line = (id: string | null, i: number, v = view, cv = c) => plain(focusReadout(v, cv, id, i));

  it('follows the board copy with numbers from the view model; the name italic and the value bold', () => {
    const r = view.rivers.find((x) => x.id === 'm:packages/vite')!;
    const i = r.values.indexOf(r.peak);
    const rich = focusReadout(view, c, r.id, i);
    expect(rich[0]).toEqual({ i: 'packages/vite' });
    expect(rich).toContainEqual({ b: new Intl.NumberFormat('en').format(r.values[i]!) });
    expect(c.estimated).toContain(i);
    expect(plain(rich)).toBe(`packages/vite, ${view.buckets[i]!.label}: ${new Intl.NumberFormat('en').format(r.values[i]!)} lines changed, `
      + `${Math.round((100 * r.values[i]!) / totals[i]!)}% of the quarter. This quarter is estimated.`);
  });

  it('reads zero values as "no changes" and adds the partial bucket on the last one', () => {
    const r = view.rivers.find((x) => x.values.at(-1) === 0)!;
    expect(line(r.id, view.buckets.length - 1)).toBe(`${r.label}, ${view.buckets.at(-1)!.label}: no lines changed this quarter. Quarter in progress, to 20 Oct.`);
  });

  it('lists transfers in and out of the river', () => {
    const t = view.transfers.find((x) => x.files > 1)!;
    const to = view.rivers.find((x) => x.id === t.to)!;
    const from = view.rivers.find((x) => x.id === t.from)!;
    expect(line(t.to, t.bucket)).toContain(` ${t.files} files moved in from ${from.label}`);
    expect(focusReadout(view, c, t.to, t.bucket)).toContainEqual({ i: from.label });
    expect(line(t.from, t.bucket)).toContain(` ${t.files} files moved out to ${to.label}`);
  });

  it('groups many moves into one sentence, largest first (the board copy for Svelte packages, Q2 2023)', () => {
    const sv = selectView(SVELTE, { dimension: 'modules' });
    const b = sv.buckets.findIndex((x) => x.label === 'Q2 2023');
    const text = plain(focusReadout(sv, caveats(SVELTE, sv), 'm:packages', b));
    expect(text).toMatch(/^packages, Q2 2023: 7,732 lines changed, 21% of the quarter\. 952 files moved in from test, 231 from src and \d+ from \d+ more modules\./);
  });

  it('flags clipped columns and bots, and reads a whole column when no river is active', () => {
    const sv = selectView(SVELTE, { dimension: 'modules' });
    const L = layoutRivers(sv, { width: 1104 });
    const sc = caveats(SVELTE, sv, L.clipped);
    expect(line(sv.rivers[0]!.id, 9, sv, sc)).toContain(' Column drawn at 23% scale.');
    expect(line(null, 9, sv, sc)).toMatch(/^Q1 2019: [\d,]+ lines changed across \d+ rivers\./);
    const people = selectView(SVELTE, { dimension: 'contributors', includeBots: true });
    const bot = people.rivers.find((r) => r.bot)!;
    const rich = focusReadout(people, caveats(SVELTE, people), bot.id, bot.values.indexOf(bot.peak));
    expect(rich.slice(0, 3)).toEqual([{ i: bot.label }, ' ', { m: 'bot' }]);
    expect(plain(rich)).toMatch(/ commits?, /);
  });

  it('names every river, never with a middle dot', () => {
    for (const r of view.rivers) {
      expect(line(r.id, 0).startsWith(`${r.label}, `)).toBe(true);
      expect(line(r.id, 0)).not.toContain('·');
    }
  });
});

describe('idleReadout', () => {
  it('names the largest river, its share and the files moved (DESIGN §4)', () => {
    const view = selectView(VITE, { dimension: 'modules' });
    const top = view.rivers.filter((r) => r.kind !== 'other').toSorted((a, b) => b.total - a.total)[0]!;
    const all = view.rivers.reduce((a, r) => a + r.total, 0);
    const moved = view.transfers.reduce((a, t) => a + t.files, 0);
    expect(top.label).toBe('packages/vite');
    expect(idleReadout(view)[0]).toEqual({ i: 'packages/vite' });
    expect(plain(idleReadout(view))).toBe(`packages/vite carries ${Math.round((100 * top.total) / all)}% of all lines changed, and ${new Intl.NumberFormat('en').format(moved)} files moved between modules.`);
  });

  it('uses commits for contributors and leaves out moves when there are none', () => {
    const people = selectView(VITE, { dimension: 'contributors' });
    expect(plain(idleReadout(people))).toMatch(/^.+ carries \d+% of all commits\.$/);
  });
});

describe('legendItems', () => {
  it('lists only the marks the view draws, the unit word following the bucket unit', () => {
    const all = { estimated: true, partial: true, moved: true, bots: false, ai: false };
    expect(legendItems({ unit: 'quarter', ...all }).map((i) => i.text)).toEqual(['estimated', 'quarter in progress', 'files moved']);
    expect(legendItems({ unit: 'year', ...all, estimated: false, moved: false }).map((i) => i.text)).toEqual(['year in progress']);
    expect(legendItems({ unit: 'month', estimated: false, partial: false, moved: false, bots: true, ai: true }).map((i) => i.kind)).toEqual(['bot', 'ai']);
  });
});

describe('era text', () => {
  const view = selectView(VITE, { dimension: 'modules' });
  it('ranges read "Q2 2020 to Q1 2021", or one label for a one-bucket era', () => {
    expect(eraRange(view.buckets, { start: 0, end: 3 })).toBe(`${view.buckets[0]!.label} to ${view.buckets[3]!.label}`);
    expect(eraRange(view.buckets, { start: 2, end: 2 })).toBe(view.buckets[2]!.label);
  });
  it('notes are sentences: capitalised, "; " read as ", ", a full stop', () => {
    expect(eraNote('src/node grew; tests moved')).toBe('Src/node grew, tests moved.');
    expect(eraNote('Done.')).toBe('Done.');
    expect(eraNote('')).toBe('');
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
      const busy = totals.indexOf(Math.max(...totals));
      const flag = c.estimated.includes(busy) ? ' (estimated)' : '';
      expect(text).toContain(`The busiest ${agg.time.unit} was ${view.buckets[busy]!.label}, with ${amount(Math.max(...totals), view.metric)}${flag}.`);
      const big = view.transfers.toSorted((a, b) => b.files - a.files)[0];
      const moved = big !== undefined && big.files >= 3;
      expect(text.includes('The largest move was')).toBe(moved);
      expect(text).toContain(moved ? `The largest move was ${big.files} files` : '');
      expect(text.includes('No significant moves between these modules.')).toBe(dimension === 'modules' && !moved);
      expect(text).toContain(`The last ${agg.time.unit} is partial, to 20 Oct 2026.`);
      expect(text.includes('estimated')).toBe(c.estimated.length > 0);
      expect(text.includes('(estimated')).toBe(flag !== '');
      expect(text).toContain(c.estimated.length ? `${c.estimated.length} of ${view.buckets.length} ${agg.time.unit}s are estimated from sampled commits.` : '');
    }
  });

  it('flags an estimated or clipped busiest bucket and ignores moves under 3 files', () => {
    const view = selectView(SVELTE, { dimension: 'modules' });
    const totals = columnTotals(view);
    const b = totals.indexOf(Math.max(...totals));
    const L = layoutRivers(view, { width: 1104, height: 440, truncatedBuckets: SVELTE.source.truncatedBuckets });
    const c = caveats(SVELTE, view, L.clipped);
    expect([c.estimated.includes(b), c.clipped.has(b)]).toEqual([true, true]);
    expect(describeView(SVELTE, view, c)).toContain(`with ${amount(totals[b]!, view.metric)} (estimated; drawn clipped).`);
    expect(describeView(SVELTE, view, { ...c, clipped: new Map() })).toContain(`with ${amount(totals[b]!, view.metric)} (estimated).`);
    const small = { ...view, transfers: view.transfers.map((t) => ({ ...t, files: Math.min(t.files, 2) })) };
    const text = describeView(SVELTE, small, c);
    expect([text.includes('The largest move was'), text.includes('No significant moves between these modules.')]).toEqual([false, true]);
  });

  it('describes an empty selection', () => {
    const view = { ...selectView(VITE, { dimension: 'contributors' }), rivers: [] };
    expect(describeView(VITE, view, caveats(VITE, view))).toMatch(/No commits to draw for this selection\.$/);
  });
});
