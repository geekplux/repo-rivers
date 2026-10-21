import { RepoError, type RepoErrorCode } from '../../src/core/errors.ts';
import type { FetchProgress } from '../../src/core/github/fetchRepo.ts';
import type { RepoAggregate } from '../../src/core/schema.ts';

/** How a result was served: `hit` (<24 h), `revalidated` (head unchanged), `stale` (GitHub failed), `miss`. */
export type CacheStatus = 'hit' | 'revalidated' | 'stale' | 'miss';

/** One NDJSON line of `GET /api/repo/:owner/:name`. */
export type StreamLine =
  | ({ type: 'progress' } & FetchProgress)
  | { type: 'result'; cache: CacheStatus; aggregate: RepoAggregate }
  | ErrorBody;

/** An error line or body; `code` is one of the core error codes, or `invalid` for a bad request. */
export interface ErrorBody {
  type: 'error';
  code: RepoErrorCode | 'invalid';
  message: string;
  resetAt?: string;
}

const BASE_HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };

/** A JSON response that is never cached by browsers or proxies. */
export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  const all = { ...BASE_HEADERS, 'content-type': 'application/json; charset=utf-8', ...headers };
  return new Response(JSON.stringify(body), { status, headers: all });
}

/** Maps any thrown value to an error line; unknown errors become a generic `upstream` (no internals leak). */
export function errorLine(e: unknown): ErrorBody {
  if (!(e instanceof RepoError)) return { type: 'error', code: 'upstream', message: 'Unexpected error while reading GitHub' };
  const resetAt = 'resetAt' in e && typeof e.resetAt === 'string' ? { resetAt: e.resetAt } : {};
  return { type: 'error', code: e.code, message: e.message, ...resetAt };
}

/** Writes one line; resolves even when the client has gone (the job is aborted instead). */
export type Send = (line: StreamLine) => Promise<void>;

/**
 * Starts an NDJSON response and runs `job` in the background. A throw becomes a final error line. Every
 * occurrence of `secret` in the output is redacted, as a backstop. If the client disconnects, `signal`
 * aborts so the job stops spending GitHub requests. `done` settles when the stream is closed.
 */
export function ndjson(job: (send: Send, signal: AbortSignal) => Promise<void>, secret?: string): { response: Response; done: Promise<void> } {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const abort = new AbortController();
  const send: Send = async (line) => {
    let text = `${JSON.stringify(line)}\n`;
    if (secret) text = text.replaceAll(secret, '[redacted]');
    await writer.write(encoder.encode(text)).catch(() => abort.abort());
  };
  const done = job(send, abort.signal)
    .catch(async (e: unknown) => {
      if (abort.signal.aborted) return;
      const line = errorLine(e);
      console.error(`repo route failed: ${line.code}`);
      await send(line);
    })
    .finally(() => writer.close().catch(() => undefined));
  const headers = { ...BASE_HEADERS, 'content-type': 'application/x-ndjson; charset=utf-8' };
  return { response: new Response(readable, { headers }), done };
}
