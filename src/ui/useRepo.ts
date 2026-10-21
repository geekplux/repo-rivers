import { useEffect, useRef, useState } from 'react';
import type { RepoRef } from '../core/github/repoRef.ts';
import type { RepoAggregate } from '../core/schema.ts';
import { createCache } from '../data/cache.ts';
import { LoadFailure, loadRepo, type LoadProgress, type Via } from '../data/loadRepo.ts';
import { repoFromSearch, withRepo } from '../data/urlState.ts';

/** The pasted repository's state; `idle` shows the selected sample. */
export type RepoState =
  | { status: 'idle' }
  | { status: 'loading'; ref: RepoRef; progress: LoadProgress | null; fellBack: boolean }
  | { status: 'done'; ref: RepoRef; aggregate: RepoAggregate; via: Via | 'cache'; fellBack: boolean }
  | { status: 'error'; ref: RepoRef; failure: LoadFailure };

const cache = createCache();
const IDLE: RepoState = { status: 'idle' };
const same = (a: RepoRef | null, b: RepoRef) => `${a?.owner}/${a?.name}`.toLowerCase() === `${b.owner}/${b.name}`.toLowerCase();

/** A fresh cached aggregate is drawn at once, with no request. */
function cached(ref: RepoRef | null): RepoState {
  const aggregate = ref && cache.get(ref);
  return ref && aggregate ? { status: 'done', ref, aggregate, via: 'cache', fellBack: false } : IDLE;
}

/**
 * Loads pasted repositories: cache first, then the Worker stream (or the browser fallback). `?repo=` is
 * pushed on success and followed on back/forward; `cancel` aborts and restores the previous state.
 */
export function useRepo() {
  const [state, setState] = useState<RepoState>(() => cached(repoFromSearch(location.search)));
  const job = useRef<AbortController | null>(null);
  const before = useRef<RepoState>(state);
  const current = useRef(state);
  useEffect(() => void (current.current = state), [state]);

  const set = (next: RepoState) => {
    const was = current.current;
    if (next.status === 'loading' && (was.status === 'idle' || was.status === 'done')) before.current = was;
    setState(next);
  };
  const stop = () => job.current?.abort();

  function load(ref: RepoRef, { browser = false, push = true } = {}) {
    stop();
    const show = (aggregate: RepoAggregate, via: Via | 'cache', fellBack: boolean) => {
      if (push && !same(repoFromSearch(location.search), ref)) history.pushState(null, '', withRepo(location.href, ref));
      set({ status: 'done', ref, aggregate, via, fellBack });
    };
    const hit = browser ? null : cache.get(ref);
    if (hit) return show(hit, 'cache', false);
    const ctl = new AbortController();
    job.current = ctl;
    const live = () => job.current === ctl && !ctl.signal.aborted;
    set({ status: 'loading', ref, progress: null, fellBack: false });
    loadRepo(ref, {
      browser,
      signal: ctl.signal,
      onProgress: (progress) => live() && setState((s) => (s.status === 'loading' ? { ...s, progress } : s)),
      onFallback: () => live() && setState((s) => (s.status === 'loading' ? { ...s, progress: null, fellBack: true } : s)),
    }).then(
      (r) => {
        if (!live()) return;
        cache.put(ref, r.aggregate);
        show(r.aggregate, r.via, r.fellBack);
      },
      (e: unknown) => live() && set({ status: 'error', ref, failure: e instanceof LoadFailure ? e : new LoadFailure('upstream', 'worker', String(e)) }),
    );
  }

  const latest = useRef(load);
  useEffect(() => void (latest.current = load));
  useEffect(() => {
    const sync = () => {
      const ref = repoFromSearch(location.search);
      if (ref) latest.current(ref, { push: false });
      else {
        job.current?.abort();
        setState(IDLE);
      }
    };
    if (current.current.status === 'idle' && repoFromSearch(location.search)) sync();
    addEventListener('popstate', sync);
    return () => {
      removeEventListener('popstate', sync);
      job.current?.abort();
    };
  }, []);

  return {
    state,
    load,
    /** Aborts the stream and restores what was shown before. */
    cancel: () => (stop(), setState(before.current)),
    /** Back to the selected sample. */
    clear: () => (stop(), setState(IDLE)),
    /** Stores an updated aggregate (e.g. with AI era names) in the browser cache. */
    remember: (ref: RepoRef, aggregate: RepoAggregate) => void cache.put(ref, aggregate),
  };
}
