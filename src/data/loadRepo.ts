import { RateLimited, RepoError, type RepoErrorCode } from '../core/errors.ts';
import { fetchRepoAggregate, type FetchProgress } from '../core/github/fetchRepo.ts';
import type { RepoRef } from '../core/github/repoRef.ts';
import { parseAggregate, type RepoAggregate } from '../core/schema.ts';

/** Who read GitHub: the Worker (shared cache and quota) or this browser (the user's own 60/h quota). */
export type Via = 'worker' | 'browser';

/** Why loading failed, as the UI tells it (PLAN F10). `unavailable`: neither the Worker nor GitHub answered. */
export type FailureCode = Exclude<RepoErrorCode, 'network'> | 'offline' | 'unavailable';

/** A load that ended without an aggregate. `resetAt` (ISO) is set for `rate_limited`. */
export class LoadFailure extends Error {
  readonly code: FailureCode;
  readonly via: Via;
  readonly resetAt?: string;
  constructor(code: FailureCode, via: Via, message: string, resetAt?: string) {
    super(message);
    this.name = 'LoadFailure';
    this.code = code;
    this.via = via;
    if (resetAt) this.resetAt = resetAt;
  }
}

const keep = (lines: string[]): string[] => lines.map((l) => l.trim()).filter(Boolean);

/** Splits decoded text chunks into complete, non-blank lines; a partial last line waits for the next chunk. */
export function lineSplitter(): { push(chunk: string): string[]; flush(): string[] } {
  let rest = '';
  return {
    push(chunk) {
      const parts = (rest + chunk).split('\n');
      rest = parts.pop()!;
      return keep(parts);
    },
    flush() {
      const last = rest;
      rest = '';
      return keep([last]);
    },
  };
}

/** The lines of a UTF-8 NDJSON body, in order; multi-byte characters and lines may span chunks. */
export async function* readLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const split = lineSplitter();
  try {
    for (let r = await reader.read(); !r.done; r = await reader.read()) yield* split.push(decoder.decode(r.value, { stream: true }));
    yield* split.push(decoder.decode());
    yield* split.flush();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/** Progress of either path, tagged with who is reading. */
export type LoadProgress = FetchProgress & { via: Via };

/** Options for {@link loadRepo}; `fetch` and `online` are injection points for tests. */
export interface LoadOptions {
  signal?: AbortSignal;
  onProgress?: (p: LoadProgress) => void;
  /** Called when the Worker is unreachable and the browser takes over (show a notice). */
  onFallback?: () => void;
  /** Skip the Worker and read GitHub from the browser ("Try from your browser"). */
  browser?: boolean;
  fetch?: typeof fetch;
  online?: () => boolean;
}

/** What {@link loadRepo} returns; `fellBack` is true when the browser took over automatically. */
export interface LoadResult {
  aggregate: RepoAggregate;
  via: Via;
  fellBack: boolean;
}

const UNAVAILABLE = Symbol('unavailable');
type ErrorLine = { type: 'error'; code?: string; message?: string; resetAt?: string };
const WORKER_CODES: Record<string, FailureCode> = { not_found: 'not_found', invalid: 'not_found', empty: 'empty', too_little: 'too_little', rate_limited: 'rate_limited', upstream: 'upstream' };

/** A Worker error line as a failure, or `UNAVAILABLE` when the Worker itself could not reach GitHub. */
function workerError(line: ErrorLine): typeof UNAVAILABLE {
  const code = WORKER_CODES[line.code ?? ''];
  if (!code) return UNAVAILABLE;
  throw new LoadFailure(code, 'worker', line.message ?? code, typeof line.resetAt === 'string' ? line.resetAt : undefined);
}

/** Reads `/api/repo/:owner/:name`; returns `UNAVAILABLE` for no answer, a non-API answer, or a cut-off stream. */
async function fromWorker(ref: RepoRef, doFetch: typeof fetch, o: LoadOptions): Promise<RepoAggregate | typeof UNAVAILABLE> {
  let res: Response;
  try {
    res = await doFetch(`/api/repo/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.name)}`, { signal: o.signal });
  } catch (e) {
    if (o.signal?.aborted) throw e;
    return UNAVAILABLE;
  }
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    const line = (await res.json().catch(() => null)) as ErrorLine | null;
    return line?.type === 'error' ? workerError(line) : UNAVAILABLE;
  }
  if (!type.includes('ndjson') || !res.body) return UNAVAILABLE;
  for await (const text of readLines(res.body)) {
    o.signal?.throwIfAborted();
    let line: { type?: string; aggregate?: unknown; done?: number; total?: number; label?: string };
    try {
      line = JSON.parse(text);
    } catch {
      return UNAVAILABLE;
    }
    if (line.type === 'progress') o.onProgress?.({ done: Number(line.done), total: Number(line.total), label: String(line.label ?? ''), via: 'worker' });
    else if (line.type === 'error') return workerError(line as ErrorLine);
    else if (line.type === 'result') {
      try {
        return parseAggregate(line.aggregate);
      } catch {
        throw new LoadFailure('upstream', 'worker', 'The service sent data this page cannot read');
      }
    }
  }
  return UNAVAILABLE;
}

/**
 * Loads a repository's aggregate: streams it from the Worker, or, when the Worker is unreachable (or
 * `browser` is set), runs `fetchRepoAggregate` in the browser against api.github.com with the user's own
 * quota. Throws {@link LoadFailure}; an abort rethrows the abort reason.
 */
export async function loadRepo(ref: RepoRef, o: LoadOptions = {}): Promise<LoadResult> {
  const doFetch = o.fetch ?? globalThis.fetch.bind(globalThis);
  const online = o.online ?? (() => navigator.onLine);
  if (!online()) throw new LoadFailure('offline', o.browser ? 'browser' : 'worker', 'The browser is offline');
  if (!o.browser) {
    const aggregate = await fromWorker(ref, doFetch, o);
    if (aggregate !== UNAVAILABLE) return { aggregate, via: 'worker', fellBack: false };
    o.signal?.throwIfAborted();
    o.onFallback?.();
  }
  try {
    const onProgress = (p: FetchProgress) => o.onProgress?.({ ...p, via: 'browser' });
    const aggregate = await fetchRepoAggregate(ref, { fetch: doFetch, signal: o.signal, onProgress });
    return { aggregate, via: 'browser', fellBack: !o.browser };
  } catch (e) {
    if (o.signal?.aborted) throw e;
    if (!(e instanceof RepoError)) throw new LoadFailure('upstream', 'browser', e instanceof Error ? e.message : String(e));
    if (e.code !== 'network') throw new LoadFailure(e.code, 'browser', e.message, e instanceof RateLimited ? e.resetAt : undefined);
    throw new LoadFailure(o.browser || !online() ? 'offline' : 'unavailable', 'browser', e.message);
  }
}
