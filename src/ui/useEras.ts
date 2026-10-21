import { useEffect, useMemo, useRef, useState } from 'react';
import { heuristicEras } from '../core/eras/heuristic.ts';
import { summarizeForEras } from '../core/eras/summary.ts';
import { checkEras } from '../core/eras/validate.ts';
import type { Era, RepoAggregate } from '../core/schema.ts';
import { requestEras } from '../data/eras.ts';

/**
 * The eras to draw for `agg`: its stored eras (samples, cached AI names) when they match the deterministic
 * segments, else heuristic names at once. When `ask` (the Worker is reachable) and the names are not yet AI,
 * one `/api/eras` request may swap in AI names for the same segments (no layout shift); `onNamed` stores them.
 */
export function useEras(agg: RepoAggregate | null, ask: boolean, onNamed: (eras: Era[], agg: RepoAggregate) => void): Era[] {
  const local = useMemo(() => {
    if (!agg) return { summary: null, eras: [] };
    const summary = summarizeForEras(agg);
    return { summary, eras: checkEras(agg.eras, summary.eras) ?? heuristicEras(summary) };
  }, [agg]);
  const [named, setNamed] = useState<{ agg: RepoAggregate; eras: Era[] } | null>(null);
  const store = useRef(onNamed);
  useEffect(() => void (store.current = onNamed));
  const { summary, eras } = local;
  const wanted = ask && summary !== null && !eras.some((e) => e.source === 'ai');
  useEffect(() => {
    if (!wanted || !agg || !summary) return;
    const ctl = new AbortController();
    void requestEras(summary, { signal: ctl.signal }).then((ai) => {
      if (!ai || ctl.signal.aborted) return;
      setNamed({ agg, eras: ai });
      store.current(ai, agg);
    });
    return () => ctl.abort();
  }, [wanted, agg, summary]);
  return named?.agg === agg ? named.eras : eras;
}
