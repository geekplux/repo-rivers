import { bucketLabel } from './buckets.ts';
import { autoDepth, collapsePrefix } from './paths.ts';
import type { RepoAggregate } from './schema.ts';

/** What to draw. Defaults: `depth: 'auto'` (2 for monorepos, see `autoDepth`), `topN: 10`, `includeBots: false`. */
export interface ViewOptions {
  dimension: 'modules' | 'contributors';
  depth?: 'auto' | 1 | 2 | 3;
  topN?: number;
  includeBots?: boolean;
}

/** One river; `id` is `m:<prefix>`, `p:<person id>` or `other`. */
export interface River {
  id: string;
  label: string;
  kind: 'module' | 'contributor' | 'other';
  bot: boolean;
  values: number[];
  total: number;
  peak: number;
}

/** Files moved from river `from` to river `to` during bucket `bucket`. */
export interface ViewTransfer { from: string; to: string; bucket: number; files: number }

/** The derived, never-stored model the chart renders; "other", if present, is the last river. */
export interface RiverView {
  buckets: { start: string; end: string; label: string }[];
  rivers: River[];
  transfers: ViewTransfer[];
  metric: 'lines changed' | 'commits';
}

type Draft = Omit<River, 'total' | 'peak'>;
const OTHER = 'other';
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const finish = (d: Draft): River => ({ ...d, total: sum(d.values), peak: Math.max(0, ...d.values) });

function mergeInto(m: Map<string, Draft>, d: Draft): void {
  const cur = m.get(d.id);
  if (cur) d.values.forEach((v, i) => (cur.values[i] = (cur.values[i] ?? 0) + v));
  else m.set(d.id, { ...d, values: [...d.values] });
}

function drafts(agg: RepoAggregate, o: Required<ViewOptions>): [Draft[], ViewTransfer[]] {
  if (o.dimension === 'contributors') {
    const { people, commits } = agg.contributors;
    const list = people.flatMap((p, i): Draft[] => {
      const values = commits[i] ?? [];
      if (p.bot && !o.includeBots) return [];
      return [{ id: `p:${p.id}`, label: p.label, kind: 'contributor', bot: p.bot, values }];
    });
    return [list, []];
  }
  const { prefixes, weights, transfers } = agg.paths;
  const depth = o.depth === 'auto' ? autoDepth(prefixes, weights.map(sum)) : o.depth;
  const keys = prefixes.map((p) => collapsePrefix(p, depth));
  const list = keys.map((k, i): Draft => {
    return { id: `m:${k}`, label: k || '(root files)', kind: 'module', bot: false, values: weights[i] ?? [] };
  });
  return [list, transfers.map((t) => ({ ...t, from: `m:${keys[t.from]}`, to: `m:${keys[t.to]}` }))];
}

/** Re-points transfers at the rivers that absorbed their ends; merges duplicates, drops moves within one river. */
function remap(links: readonly ViewTransfer[], target: ReadonlyMap<string, string>): ViewTransfer[] {
  const moved = new Map<string, ViewTransfer>();
  for (const { bucket, files, ...t } of links) {
    const [from, to] = [target.get(t.from), target.get(t.to)];
    if (!from || !to || from === to) continue;
    const key = `${bucket}\0${from}\0${to}`;
    moved.set(key, { from, to, bucket, files: (moved.get(key)?.files ?? 0) + files });
  }
  return [...moved.values()];
}

/**
 * Derives the {@link RiverView} for one dimension: collapses module prefixes to the chosen depth (transfers
 * inside one module disappear), drops bots unless asked, keeps the top N rivers by total and sums the rest
 * into "other" so every column total is preserved. Pure: same input, deeply equal output; never mutates `agg`.
 */
export function selectView(agg: RepoAggregate, options: ViewOptions): RiverView {
  const { dimension, depth = 'auto', topN = 10, includeBots = false } = options;
  const [list, links] = drafts(agg, { dimension, depth, topN, includeBots });
  const byId = new Map<string, Draft>();
  list.forEach((d) => mergeInto(byId, d));
  const ranked = [...byId.values()]
    .filter((d) => sum(d.values) > 0)
    .toSorted((a, b) => sum(b.values) - sum(a.values) || (a.id < b.id ? -1 : 1));
  const rest = ranked.slice(topN);
  const target = new Map(ranked.slice(0, topN).map((d) => [d.id, d.id]));
  const rivers = ranked.slice(0, topN).map(finish);
  if (rest.length > 0) {
    const values = agg.time.starts.map((_, i) => sum(rest.map((d) => d.values[i] ?? 0)));
    rivers.push(finish({ id: OTHER, label: OTHER, kind: 'other', bot: false, values }));
    rest.forEach((d) => target.set(d.id, OTHER));
  }
  const { starts, end, unit } = agg.time;
  const label = (start: string): string => bucketLabel(Date.parse(start), unit);
  return {
    buckets: starts.map((start, i) => ({ start, end: starts[i + 1] ?? end, label: label(start) })),
    rivers,
    transfers: remap(links, target),
    metric: dimension === 'modules' ? 'lines changed' : 'commits',
  };
}
