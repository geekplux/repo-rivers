import { describe, expect, it } from 'vitest';
import demo from '../../../tests/fixtures/demo.json';
import express from '../../samples/express.json';
import svelte from '../../samples/svelte.json';
import vite from '../../samples/vite.json';
import { parseAggregate, type RepoAggregate } from '../schema.ts';
import { selectView, type River, type RiverView, type ViewOptions } from '../view.ts';
import { LABEL_HEIGHT, hits } from './labels.ts';
import { layoutRivers, type LayoutOptions, type RiverLayout } from './layout.ts';
import type { Box } from './riverNames.ts';
import { clipDomain } from './scale.ts';

// Acceptance criteria L1–L13 of docs/viz/rivers.md §10. Each check collects violations and asserts the list is empty.
const AGG: Record<string, RepoAggregate> = {
  vite: parseAggregate(vite), svelte: parseAggregate(svelte), express: parseAggregate(express), demo: parseAggregate(demo),
};
const SAMPLES = ['vite', 'svelte', 'express'] as const;
const DIMS = ['modules', 'contributors'] as const;
const W = 1104;
const H = 440;
function lay(name: string, view: ViewOptions, extra: Partial<LayoutOptions> = {}): RiverLayout {
  const agg = AGG[name]!;
  const opts = { width: W, height: H, asOf: agg.generatedAt, truncatedBuckets: agg.source.truncatedBuckets, ...extra };
  return layoutRivers(selectView(agg, view), opts);
}
const CASES = [...SAMPLES, 'demo'].flatMap((name) => DIMS.map((dimension) => ({ name, dimension, L: lay(name, { dimension }) })));
const get = (name: string, dimension: string): RiverLayout => CASES.find((c) => c.name === name && c.dimension === dimension)!.L;
const viewOf = (name: string, dimension: (typeof DIMS)[number]): Map<string, River> =>
  new Map(selectView(AGG[name]!, { dimension }).rivers.map((r) => [r.id, r]));
const ids = (L: RiverLayout): string[] => L.rivers.map((r) => r.id);
const touch = (a: Box, b: Box) => a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
const below = (L: RiverLayout, parent: string): string => ids(L)[ids(L).indexOf(parent) + 1]!;
const shown = (L: RiverLayout): string[] => L.transfers.filter((t) => t.alwaysVisible).map((t) => `${t.from}→${t.to} ${t.files}`);

/** Path → subpaths of `{cmd, n}`. */
function parse(path: string): { cmd: string; n: number[] }[][] {
  const subs: { cmd: string; n: number[] }[][] = [];
  for (const s of path.split(/(?=[MCLZ])/)) {
    const c = { cmd: s[0]!, n: (s.slice(1).match(/[^\s,]+/g) ?? []).map(Number) };
    if (c.cmd === 'M') subs.push([c]);
    else subs.at(-1)!.push(c);
  }
  return subs;
}

describe.each(CASES)('$name $dimension at 1104×440', ({ name, dimension, L }) => {
  const view = viewOf(name, dimension);
  const v = (id: string, i: number): number => view.get(id)!.values[i] ?? 0;
  const live = (i: number) => L.rivers.filter((r) => v(r.id, i) > 0);
  const { top, bottom, left, right } = L.plot;

  it('L1 thickness = v·k·c_i within 0.5 px, k = (H − 3(R−1)) / D, c_i = min(1, D / T_i)', () => {
    expect(L.unit).toBeCloseTo((H - 3 * (L.rivers.length - 1)) / L.domain, 9);
    const bad = L.rivers.flatMap((r) => L.columns.flatMap((c, i) => {
      const want = v(r.id, i) * L.unit * Math.min(1, L.domain / c.total);
      return Math.abs(r.edges.bottom[i]! - r.edges.top[i]! - want) > 0.5 ? [`${r.id}@${i}`] : [];
    }));
    expect(bad).toEqual([]);
  });

  it('L2 no column exceeds H; every stack is centred', () => {
    expect(L.columns.filter((c) => c.height > H + 0.5 || Math.abs(c.top + c.height / 2 - (top + H / 2)) > 0.5)).toEqual([]);
  });

  it('L3 3 px gaps between consecutive non-zero rivers; zero rivers are points', () => {
    const gaps = L.columns.flatMap((_, i) => live(i).slice(1).map((r, j) => r.edges.top[i]! - live(i)[j]!.edges.bottom[i]!));
    expect(gaps.filter((g) => Math.abs(g - 3) > 0.1)).toEqual([]);
    const fat = L.rivers.flatMap((r) => L.columns.filter((_, i) => v(r.id, i) === 0 && r.edges.bottom[i]! - r.edges.top[i]! > 0.01));
    expect(fat).toEqual([]);
  });

  it('L4 + L5 finite, closed, in-bounds paths made of mid-x cubics', () => {
    const bad: string[] = [];
    for (const r of L.rivers) {
      if (/NaN|Infinity/.test(r.path)) bad.push(`${r.id}: non-finite`);
      for (const sub of parse(r.path)) {
        if (sub.at(-1)!.cmd !== 'Z') bad.push(`${r.id}: open subpath`);
        let prev = sub[0]!.n;
        for (const { cmd, n } of sub) {
          for (let k = 0; k < n.length; k += 2) {
            if (!(n[k]! >= left && n[k]! <= right && n[k + 1]! >= top && n[k + 1]! <= bottom)) bad.push(`${r.id}: out ${n[k]},${n[k + 1]}`);
          }
          const [c1x, c1y, c2x, c2y, x, y] = n as [number, number, number, number, number, number];
          if (cmd === 'C' && (Math.abs(c1x - (prev[0]! + x) / 2) > 0.1 || c2x !== c1x || c1y !== prev[1] || c2y !== y)) bad.push(`${r.id}: control ${n}`);
          if (n.length) prev = n.slice(-2);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('L7 deterministic lanes with "other" last', () => {
    expect(ids(layoutRivers(selectView(AGG[name]!, { dimension }), { width: W, height: H }))).toEqual(ids(L));
    expect(L.rivers.slice(0, -1).filter((r) => r.kind === 'other')).toEqual([]);
  });

  it('L8 transfers: x_{b−1} → x_b on the facing edges, 1–6 px, widest = most files', () => {
    const lane = new Map(ids(L).map((id, j) => [id, j]));
    const bad = L.transfers.filter((t) => {
      const [s, d] = [lane.get(t.from)!, lane.get(t.to)!];
      const [a, b] = t.bucket === 0 ? [0, 1] : [t.bucket - 1, t.bucket];
      const [src, dst] = [L.rivers[s]!.edges, L.rivers[d]!.edges];
      return Math.abs(t.start[0] - L.columns[a]!.x) > 0.1 || Math.abs(t.end[0] - L.columns[b]!.x) > 0.1
        || Math.abs(t.start[1] - (d > s ? src.bottom[a]! : src.top[a]!)) > 0.5
        || Math.abs(t.end[1] - (d > s ? dst.top[b]! : dst.bottom[b]!)) > 0.5
        || t.width < 1 || t.width > 6;
    });
    expect(bad).toEqual([]);
    const most = L.transfers.reduce((m, t) => (t.files > m.files ? t : m), { files: 0, width: 0 });
    expect(most.width).toBe(Math.max(0, ...L.transfers.map((t) => t.width)));
    expect(L.transfers.every((t) => t.width === 1 + 5 * Math.sqrt(Math.min(t.files, 100) / 100))).toBe(true);
  });

  it('L9 names: no two boxes overlap, nor a name and a transfer or the break mark; names ∪ dropped = rivers', () => {
    const { names, dropped } = L.labels;
    const xfer = L.transfers.filter((t) => t.alwaysVisible).map(({ start: a, end: b }) =>
      ({ x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.abs(b[0] - a[0]), height: Math.abs(b[1] - a[1]) }));
    const others = [...L.clipped.flatMap((c) => [c.box, c.mark]), ...xfer];
    expect(names.flatMap((a, i) => [...names.slice(i + 1).map((n) => n.box), ...others].filter((b) => touch(a.box, b)).map(() => a.id))).toEqual([]);
    // Names inside a river: the band holds the text's centre line ±8 px at every bucket centre under it.
    const cramped = names.filter((n) => n.kind === 'course' || n.kind === 'level').filter((n) => {
      const r = L.rivers.find((river) => river.id === n.id)!;
      const slope = Math.tan((n.angle * Math.PI) / 180);
      return L.columns.some((c, i) => c.x >= n.box.x && c.x <= n.box.x + n.box.width
        && (r.edges.top[i]! > n.y + slope * (n.box.x - n.x + c.x - n.box.x) - 8 + 1e-6 || r.edges.bottom[i]! < n.y + slope * (c.x - n.x) + 8 - 1e-6));
    });
    expect(cramped.map((n) => n.id)).toEqual([]);
    const named = new Set(names.map((n) => n.id));
    expect(dropped.filter((id) => named.has(id))).toEqual([]);
    expect([...named, ...dropped].toSorted()).toEqual(ids(L).toSorted());
    expect(names.filter((n) => n.box.x < 0 || n.box.x + n.box.width > L.width || Math.abs(n.angle) > 19.3 + 1e-9)).toEqual([]);
  });

  it('L10 two tones: at most half of the touching columns share a tone; "other" is tone 1 (hatched)', () => {
    const pairs = L.columns.flatMap((_, i) => {
      const on = live(i).filter((r) => r.kind !== 'other');
      return on.slice(1).map((r, k) => [on[k]!, r] as const);
    });
    expect(pairs.filter(([a, b]) => a.tone === b.tone).length).toBeLessThanOrEqual(pairs.length / 2);
    expect(L.rivers.filter((r) => r.kind === 'other' && r.tone !== 1)).toEqual([]);
  });
});

describe('layout against the spec numbers', () => {
  it('L6 clips only Svelte modules: column 9, D = 50,628, c = 0.226, "↑ 224K"', () => {
    const s = get('svelte', 'modules');
    expect([s.clipped.map((c) => c.index), s.domain, s.clipped[0]!.text]).toEqual([[9], 50628, '↑ 224K']);
    expect(s.columns[9]!.factor).toBeCloseTo(0.226, 3);
    expect(CASES.filter((c) => c.L.clipped.length > 0).map((c) => `${c.name} ${c.dimension}`)).toEqual(['svelte modules']);
    expect(CASES.filter((c) => c.L.clipped.length === 0 && c.L.domain !== Math.max(...c.L.columns.map((col) => col.total)))).toEqual([]);
  });

  it('L6 synthetic outliers, and sqrt keeps shares exact', () => {
    expect(clipDomain([10, 10, 10, 10, 100])).toEqual({ domain: 10, clipped: [4] });
    expect(clipDomain([10, 12, 11, 25])).toEqual({ domain: 25, clipped: [] });
    const L = lay('svelte', { dimension: 'modules' }, { scale: 'sqrt' });
    const view = viewOf('svelte', 'modules');
    const off = L.columns.flatMap((c, i) => {
      const sum = L.rivers.reduce((s, r) => s + r.thickness[i]!, 0);
      return L.rivers.filter((r) => Math.abs(r.thickness[i]! / sum - view.get(r.id)!.values[i]! / c.total) > 1e-9);
    });
    expect([L.clipped, off]).toEqual([[], []]);
    expect(Math.max(...L.columns.map((c) => c.height))).toBeLessThanOrEqual(H + 0.5);
  });

  it('L7 rivers born from a transfer sit directly below their parent', () => {
    expect(below(get('vite', 'modules'), 'm:src/node')).toBe('m:packages/vite');
    expect(below(get('vite', 'modules'), 'm:playground')).toBe('m:packages/playground');
    expect(below(get('svelte', 'modules'), 'm:site')).toBe('m:documentation');
    expect(below(get('svelte', 'modules'), 'm:packages')).toBe('m:playgrounds');
  });

  it('L8 always-visible transfers are exactly the spec sets', () => {
    expect(shown(get('vite', 'modules'))).toEqual([
      'm:playground→m:packages/playground 16', 'other→m:packages/playground 3', 'other→m:packages/create-vite 122',
      'm:playground→m:packages/vite 11', 'other→m:docs/.vitepress 7',
    ]);
    // Phase 7 move-finder: the Q2-2023 monorepo move (src, test → packages) is now in the Svelte data.
    expect(shown(get('svelte', 'modules'))).toEqual([
      'm:site→m:documentation 736', 'm:src→m:packages 231', 'm:test→m:packages 952', 'm:packages→m:playgrounds 10',
    ]);
  });

  it('L9 desktop names the top 3 rivers by total, and ≥ 5 rivers per sample in modules', () => {
    const missing = CASES.filter((c) => c.name !== 'demo').flatMap(({ name, dimension, L }) => {
      const named = new Set(L.labels.names.map((n) => n.id));
      const top3 = [...viewOf(name, dimension).values()].toSorted((a, b) => b.total - a.total).slice(0, 3);
      const few = dimension === 'modules' && named.size < 5 ? [`${name}: only ${named.size}`] : [];
      return [...few, ...top3.filter((r) => !named.has(r.id)).map((r) => `${name} ${dimension} ${r.id}`)];
    });
    expect(missing).toEqual([]);
  });

  it('L9 (amended) mobile: every full 360 px window holds ≥ 2 whole labels; callout leaders miss other labels', () => {
    const thin = CASES.filter((c) => c.name !== 'demo').flatMap(({ name, dimension }) => {
      const agg = AGG[name]!;
      const L = lay(name, { dimension }, { width: 358, height: undefined, mobile: true });
      const placed = L.labels.names;
      const leader = (p: (typeof placed)[number]) => p.leader!.slice(1).split('L').flatMap((pt) => pt.split(',').map(Number));
      const crossed = placed.filter((p) => p.leader).flatMap((p) => placed.filter((q) => q !== p && [0, 0.25, 0.5, 0.75, 1].some((t) => {
        const [x1, y1, x2, y2] = leader(p) as [number, number, number, number];
        return hits({ x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1), width: 0, height: 0 }, q.box);
      })));
      const windows = Array.from({ length: Math.floor(L.plot.right / 360) }, (_, k) => k * 360);
      const few = windows.filter((lo) => placed.filter((p) => p.box.x >= lo && p.box.x + p.box.width <= lo + 360).length < 2);
      return [...few.map((lo) => `${agg.repo.name} ${dimension} window ${lo}`), ...crossed.map((q) => `${name} leader crosses ${q.id}`)];
    });
    expect(thin).toEqual([]);
  });

  it('S2 the Svelte break mark has reserved space above the plot and a full-height column beside it', () => {
    const s = get('svelte', 'modules');
    expect(s.plot.top).toBe(30);
    expect(s.clipped[0]!.box.y).toBeGreaterThanOrEqual(0);
    expect(s.clipped[0]!.box.y + LABEL_HEIGHT).toBeLessThanOrEqual(s.columns[9]!.top - 4 + 1e-9);
    expect(Math.max(...s.columns.filter((c) => c.factor === 1).map((c) => c.height))).toBeGreaterThan(s.domain * s.unit - 0.5);
  });

  it('reserves a 4 px inset for the focus ring: plot, names and axis stay inside it', () => {
    const bad = [...CASES, ...CASES.map(({ name, dimension }) => ({ name: `${name} mobile`, dimension, L: lay(name, { dimension }, { width: 358, height: undefined, mobile: true }) }))]
      .flatMap(({ name, dimension, L }) => {
        const out = L.labels.names.filter((p) => p.box.x < 4 || p.box.x + p.box.width > L.width - 4).map((p) => p.id);
        const ok = L.plot.left === 4 && L.plot.right <= L.width - 4 && L.height === L.plot.bottom + 30;
        return ok && out.length === 0 ? [] : [`${name} ${dimension}: ${JSON.stringify(L.plot)} ${out}`];
      });
    expect(bad).toEqual([]);
  });

  it('the desktop options: era band on top, plot flush left, a fixed mouth-label room and 2 px gaps', () => {
    const agg = AGG.vite!;
    const view = selectView(agg, { dimension: 'modules' });
    const L = layoutRivers(view, { width: 1200, gap: 2, top: 84, inset: 0, labelRoom: 140, asOf: agg.generatedAt });
    expect(L.plot).toMatchObject({ left: 0, right: 1060, top: 84, bottom: 84 + 480 });
    expect(L.width).toBe(1200);
    const gaps = L.columns.flatMap((_, i) => {
      const on = L.rivers.filter((r) => r.thickness[i]! > 0);
      return on.slice(1).map((r, k) => r.edges.top[i]! - on[k]!.edges.bottom[i]!);
    });
    expect(gaps.every((g) => Math.abs(g - 2) < 1e-6)).toBe(true);
    const mouth = L.labels.names.filter((p) => p.kind === 'mouth');
    expect(mouth.length).toBeGreaterThan(0);
    expect(mouth.every((p) => p.x === 1076 && p.box.x + p.box.width <= 1200 && p.leader?.startsWith('M1061,'))).toBe(true);
    expect(mouth.slice(1).every((p, i) => p.y - mouth[i]!.y >= 17 - 1e-9)).toBe(true);
  });

  it('labels a bot river "bot" unless its name already ends in [bot]', () => {
    const view = selectView(AGG.svelte!, { dimension: 'contributors', includeBots: true });
    const bot = view.rivers.find((r) => r.bot)!;
    expect(bot.label).toMatch(/\[bot\]$/);
    const text = (v: RiverView) => layoutRivers(v, { width: 1600, height: 600 }).labels.names.find((p) => p.id === bot.id)?.text;
    expect(text(view)).toBe(bot.label);
    const renamed = { ...view, rivers: view.rivers.map((r) => (r.id === bot.id ? { ...r, label: 'release-helper' } : r)) };
    expect(text(renamed)).toBe('release-helper bot');
  });

  it('L11 the partial-bucket marker sits inside the last bucket; estimated runs follow truncatedBuckets', () => {
    for (const name of SAMPLES) {
      const L = get(name, 'modules');
      const last = L.columns.at(-1)!;
      expect(L.partial?.text).toBe('to 20 Oct 2026');
      expect(Math.abs(L.partial!.x - last.x)).toBeLessThanOrEqual(L.bucketWidth / 2);
    }
    expect(get('demo', 'modules').partial).toBeNull(); // generatedAt is after the last bucket
    expect(get('svelte', 'modules').estimated.map((e) => [e.from, e.to])).toEqual([[0, 16], [18, 20], [25, 39]]);
  });

  it('L12 lays out 48 buckets × 13 rivers, labels included, in < 50 ms', () => {
    const view: RiverView = {
      buckets: Array.from({ length: 48 }, (_, i) => ({ start: `${2000 + i}-01-01`, end: `${2001 + i}-01-01`, label: `${2000 + i}` })),
      rivers: Array.from({ length: 13 }, (_, j): River => {
        const values = Array.from({ length: 48 }, (__, i) => ((i * 7 + j * 13) % 11 < 2 ? 0 : 50 + ((i * j * 31) % 400)));
        const other = j === 12;
        const total = values.reduce((a, b) => a + b);
        return { id: other ? 'other' : `m:r${j}`, label: `module-${j}`, kind: other ? 'other' : 'module', bot: false, values, total, peak: Math.max(...values) };
      }),
      transfers: [{ from: 'm:r1', to: 'm:r2', bucket: 10, files: 9 }, { from: 'm:r3', to: 'm:r0', bucket: 30, files: 2 }],
      metric: 'lines changed',
    };
    layoutRivers(view, { width: W, height: H }); // warm-up
    const runs = Array.from({ length: 5 }, () => {
      const t0 = performance.now();
      layoutRivers(view, { width: W, height: H });
      return performance.now() - t0;
    });
    expect(Math.min(...runs)).toBeLessThan(50);
  });

  it('L13 demo path strings are stable', () => {
    for (const dimension of DIMS) {
      const L = get('demo', dimension);
      expect({ rivers: L.rivers.map((r) => [r.id, r.tone, r.path]), transfers: L.transfers.map((t) => t.path) }).toMatchSnapshot(dimension);
    }
  });
});
