import type { FetchProgress } from '../../core/github/fetchRepo.ts';
import type { FailureCode, Via } from '../../data/loadRepo.ts';

/** What an error-state button does. */
export type ErrorAction = 'edit' | 'sample' | 'browser' | 'retry';

/** Plain-language copy for one error state (PLAN §3 States): a title, one sentence, 1–2 actions. */
export interface ErrorCopy {
  title: string;
  body: string;
  actions: { id: ErrorAction; label: string }[];
}

/** `resetAt` as a local clock time, e.g. "14:05" (the time zone is injectable for tests). */
export function resetTime(resetAt: string | undefined, timeZone?: string): string | null {
  const t = Date.parse(resetAt ?? '');
  return Number.isFinite(t) ? new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone }).format(t) : null;
}

const SAMPLE = { id: 'sample', label: 'Show a sample instead' } as const;

/** Copy and actions for a failed load of `repo` ("owner/name"). */
export function errorCopy(f: { code: FailureCode; via: Via; resetAt?: string }, repo: string, timeZone?: string): ErrorCopy {
  const at = resetTime(f.resetAt, timeZone);
  switch (f.code) {
    case 'not_found':
      return { title: `Couldn’t find ${repo}`, body: 'It may be private, or the name may be misspelled; Repo Rivers can only read public repositories.', actions: [{ id: 'edit', label: 'Check the spelling' }, SAMPLE] };
    case 'rate_limited': {
      const when = at ? `after ${at}` : 'in up to an hour';
      return f.via === 'worker'
        ? { title: 'GitHub’s hourly limit was reached', body: `This site reads GitHub without an account, so it shares GitHub’s API limit of 60 requests an hour; please try again ${when}, or read it from your browser now with your own quota.`, actions: [{ id: 'browser', label: 'Try from your browser' }, SAMPLE] }
        : { title: 'GitHub’s hourly limit was reached', body: `Your browser’s own quota of 60 GitHub API requests an hour is used up for now; please try again ${when}.`, actions: [SAMPLE] };
    }
    case 'busy':
      return { title: 'A short pause, please', body: 'This site answers about 20 requests a minute from one address; please try again in a minute.', actions: [{ id: 'retry', label: 'Try again' }, SAMPLE] };
    case 'too_little':
      return { title: 'This repo has too little history to draw', body: `${repo} has fewer than 10 commits or spans fewer than 3 time periods.`, actions: [{ id: 'edit', label: 'Try another repo' }, SAMPLE] };
    case 'empty':
      return { title: 'Empty repository', body: `${repo} has no commits yet.`, actions: [{ id: 'edit', label: 'Try another repo' }, SAMPLE] };
    case 'offline':
      return { title: 'You’re offline', body: 'Reading a repository needs the network; the built-in samples still work.', actions: [{ id: 'retry', label: 'Try again' }, SAMPLE] };
    case 'unavailable':
      return { title: 'The Repo Rivers service isn’t answering', body: 'GitHub couldn’t be reached from your browser either. The built-in samples still work.', actions: [{ id: 'retry', label: 'Try again' }, SAMPLE] };
    default:
      return { title: 'GitHub sent an unexpected answer', body: 'This is usually temporary; try again in a minute.', actions: [{ id: 'retry', label: 'Try again' }, SAMPLE] };
  }
}

/**
 * The readout while loading; it changes only at 25% steps (0% is not said), so the polite live region speaks a
 * few times at most.
 */
export function loadingLine(repo: string, p: FetchProgress | null): string {
  const quarter = p && p.total > 0 ? Math.min(100, Math.floor((p.done / p.total) * 4) * 25) : 0;
  return `Reading the history of ${repo}${quarter === 0 ? '' : `: ${quarter}% of requests done`}`;
}

/** The loading panel's line, e.g. "Reading owner/name: 18 of 51 requests" (just "Reading owner/name" before the first count). */
export function progressLine(repo: string, p: FetchProgress | null): string {
  return p ? `Reading ${repo}: ${p.done} of ${Math.max(p.total, p.done)} requests` : `Reading ${repo}`;
}
