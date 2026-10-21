import type { EraSummary } from '../core/eras/summary.ts';
import { checkEras } from '../core/eras/validate.ts';
import type { Era } from '../core/schema.ts';

/** Options for {@link requestEras}; `fetch` is an injection point for tests. */
export interface ErasOptions {
  signal?: AbortSignal;
  fetch?: typeof fetch;
}

/**
 * Asks the Worker (`POST /api/eras`) to name the eras of `summary`. Returns AI-written eras for exactly the
 * summary's segments, or null on any failure, non-JSON answer (no Worker) or heuristic answer. Never throws:
 * the heuristic names already on screen simply stay.
 */
export async function requestEras(summary: EraSummary, { signal, fetch: doFetch = globalThis.fetch }: ErasOptions = {}): Promise<Era[] | null> {
  try {
    const res = await doFetch('/api/eras', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ summary }),
      signal,
    });
    if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) return null;
    const body = (await res.json()) as { eras?: unknown; source?: unknown } | null;
    const eras = body?.source === 'ai' ? checkEras(body.eras, summary.eras) : null;
    return eras?.[0]?.source === 'ai' ? eras : null;
  } catch {
    return null;
  }
}
