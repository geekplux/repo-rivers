import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { RiverLayout } from '../core/layout/layout.ts';
import { edgeAt, extend } from '../core/layout/ribbons.ts';
import type { River } from '../core/view.ts';

/** The chart's roving focus: the active river (by id), the active bucket, and whether it is pinned. */
export interface FocusState { river: string | null; bucket: number | null; pinned: boolean }
type Spot = Pick<FocusState, 'river' | 'bucket'>;
export const EMPTY: FocusState = { river: null, bucket: null, pinned: false };

/** Where keyboard focus lands in an empty state: the largest river ("other" only if it is alone) at its peak. */
export function startSpot(rivers: readonly Pick<River, 'id' | 'kind' | 'total' | 'peak' | 'values'>[]): Spot {
  const r = rivers.toSorted((a, b) => Number(a.kind === 'other') - Number(b.kind === 'other') || b.total - a.total)[0];
  return r ? { river: r.id, bucket: r.values.indexOf(r.peak) } : { river: null, bucket: null };
}

/** Keeps the bucket across re-layouts; a river that no longer exists becomes the largest one. */
export function reconcile(s: FocusState, lanes: readonly string[], buckets: number, start: Spot): FocusState {
  if (s.bucket === null) return s.river === null ? s : EMPTY;
  const bucket = Math.min(s.bucket, buckets - 1);
  const river = s.river === null || lanes.includes(s.river) ? s.river : start.river;
  return { river, bucket, pinned: s.pinned && river === s.river };
}

/** Keyboard map (A3). Returns the next state, or null when the key is not the chart's. */
export function stepFocus(s: FocusState, key: string, lanes: readonly string[], buckets: number, start: Spot): FocusState | null {
  const empty = s.river === null && s.bucket === null;
  const arrows = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'];
  if (empty && arrows.includes(key)) return { ...start, pinned: false };
  const lane = s.river === null ? -1 : lanes.indexOf(s.river);
  const bucket = s.bucket ?? 0;
  const at = (j: number): string | null => lanes[Math.min(Math.max(j, 0), lanes.length - 1)] ?? null;
  switch (key) {
    case 'ArrowUp': return { ...s, river: at(lane < 0 ? 0 : lane - 1) };
    case 'ArrowDown': return { ...s, river: at(lane + 1) };
    case 'ArrowLeft': return { ...s, bucket: Math.max(0, bucket - 1) };
    case 'ArrowRight': return { ...s, bucket: Math.min(buckets - 1, bucket + 1) };
    case 'Home': return { ...s, bucket: 0 };
    case 'End': return { ...s, bucket: buckets - 1 };
    case 'Enter':
    case ' ': return empty ? null : { ...s, pinned: !s.pinned };
    case 'Escape': return s.pinned ? { ...s, pinned: false } : empty ? null : EMPTY;
    default: return null;
  }
}

/**
 * Pointer → `{river, bucket}` in chart CSS px: the bucket under x, and the band under y using the interpolated
 * edges at x (bands thinner than 8 px get an 8 px zone; nearest centre wins). Null outside the plot's x-range.
 */
export function hitTest(L: RiverLayout, x: number, y: number): Spot | null {
  const { left, right } = L.plot;
  const B = L.columns.length;
  if (B === 0 || x < left || x > right) return null;
  const bucket = Math.min(B - 1, Math.max(0, Math.floor((x - left) / L.bucketWidth)));
  const xs = [left, ...L.columns.map((c) => c.x), right];
  let best: { id: string; d: number } | null = null;
  for (const r of L.rivers) {
    let [t, b] = [edgeAt(xs, extend(r.edges.top), x), edgeAt(xs, extend(r.edges.bottom), x)];
    if (b - t <= 0.01) continue;
    const mid = (t + b) / 2;
    if (b - t < 8) [t, b] = [mid - 4, mid + 4];
    const d = Math.abs(y - mid);
    if (y >= t && y <= b && (!best || d < best.d)) best = { id: r.id, d };
  }
  return { river: best?.id ?? null, bucket };
}

const local = (e: MouseEvent<SVGSVGElement>): [number, number] => {
  const r = e.currentTarget.getBoundingClientRect();
  return [e.clientX - r.left, e.clientY - r.top];
};

/**
 * Roving focus for the river chart: keyboard state, hover (ignored while pinned) and click-to-pin. Resets when
 * `resetKey` (the dataset) changes; keeps the bucket when the layout changes (dimension, depth, bots).
 */
export function useRiverFocus(L: RiverLayout | null, rivers: readonly River[], resetKey: string) {
  const [state, setState] = useState<FocusState>(EMPTY);
  const [hover, setHover] = useState<Spot | null>(null);
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) {
    setKey(resetKey);
    setState(EMPTY);
    setHover(null);
  }
  const lanes = L?.rivers.map((r) => r.id) ?? [];
  const B = L?.columns.length ?? 0;
  const start = startSpot(rivers);
  const kept = reconcile(state, lanes, B, start);
  const active: FocusState = kept.pinned || !hover ? kept : { ...hover, pinned: false };

  const chart = {
    onFocus: () => active.river === null && active.bucket === null && setState({ ...start, pinned: false }),
    onKeyDown: (e: KeyboardEvent<SVGGElement>) => {
      const next = stepFocus(active, e.key, lanes, B, start);
      if (!next) return;
      e.preventDefault();
      setHover(null);
      setState(next);
    },
  };
  const svg = {
    onPointerMove: (e: MouseEvent<SVGSVGElement>) => L && !kept.pinned && setHover(hitTest(L, ...local(e))),
    onPointerLeave: () => setHover(null),
    onClick: (e: MouseEvent<SVGSVGElement>) => {
      const hit = L && hitTest(L, ...local(e));
      setHover(null);
      if (!hit?.river || (kept.pinned && kept.river === hit.river)) setState(EMPTY);
      else setState({ ...hit, pinned: true });
    },
  };
  return { active, chart, svg };
}
