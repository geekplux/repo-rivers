import type { River, ViewTransfer } from '../view.ts';

const onset = (r: River): number => r.values.findIndex((v) => v > 0);
const byId = (a: River, b: River): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Stable, deterministic lane order (docs/viz/rivers.md §5.2): by onset bucket, then total descending, then
 * id. A river born from a transfer (incoming transfer in its onset bucket) moves directly below its parent:
 * the source with the most files (ties: the earlier lane), unless that is "other". Siblings are ordered by
 * total descending. "other" is always last. Returns a new array; the input is not mutated.
 */
export function laneOrder(rivers: readonly River[], transfers: readonly ViewTransfer[]): River[] {
  const others = rivers.filter((r) => r.kind === 'other');
  const base = rivers.filter((r) => r.kind !== 'other').toSorted((a, b) => onset(a) - onset(b) || b.total - a.total || byId(a, b));
  const rank = new Map([...base, ...others].map((r, i) => [r.id, i]));
  const parent = new Map<string, string>();
  for (const r of base) {
    let best: ViewTransfer | undefined;
    for (const t of transfers) {
      if (t.to !== r.id || t.bucket !== onset(r) || !rank.has(t.from)) continue;
      if (!best || t.files > best.files || (t.files === best.files && rank.get(t.from)! < rank.get(best.from)!)) best = t;
    }
    if (best && best.from !== 'other' && best.from !== r.id) parent.set(r.id, best.from);
  }
  for (const id of parent.keys()) {
    // Break parent cycles (A born from B and B born from A) so every river is emitted exactly once.
    const seen = new Set([id]);
    let p = parent.get(id);
    while (p !== undefined && !seen.has(p)) {
      seen.add(p);
      p = parent.get(p);
    }
    if (p === id) parent.delete(id);
  }
  const out: River[] = [];
  const emit = (r: River): void => {
    out.push(r);
    base.filter((c) => parent.get(c.id) === r.id).toSorted((a, b) => b.total - a.total || byId(a, b)).forEach(emit);
  };
  base.filter((r) => !parent.has(r.id)).forEach(emit);
  return [...out, ...others];
}
