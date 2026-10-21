import { describe, expect, it, vi } from 'vitest';
import demo from '../../tests/fixtures/demo.json' with { type: 'json' };
import { LoadFailure, lineSplitter, loadRepo, readLines, type LoadOptions } from './loadRepo.ts';

const REF = { owner: 'octo', name: 'demo' };
const bytes = (s: string) => new TextEncoder().encode(s);
/** A body that delivers `chunks` (strings or raw bytes) one read at a time. */
const stream = (chunks: (string | Uint8Array)[]) =>
  new ReadableStream<Uint8Array>({
    pull(c) {
      const next = chunks.shift();
      if (next === undefined) c.close();
      else c.enqueue(typeof next === 'string' ? bytes(next) : next);
    },
  });
const ndjson = (chunks: (string | Uint8Array)[], status = 200) =>
  new Response(stream(chunks), { status, headers: { 'content-type': 'application/x-ndjson; charset=utf-8' } });
const line = (o: unknown) => `${JSON.stringify(o)}\n`;
const RESULT = line({ type: 'result', cache: 'miss', aggregate: demo });

/** Routes `/api/...` to `worker` and api.github.com to `github`. */
function fakeFetch(worker: () => Response | Promise<Response>, github: (url: string) => Response = () => new Response('{"message":"Not Found"}', { status: 404 })) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    return url.startsWith('/api/') ? worker() : github(url);
  });
}
const run = (fetch: typeof globalThis.fetch, o: Partial<LoadOptions> = {}) => loadRepo(REF, { fetch, online: () => true, ...o });
async function failure(p: Promise<unknown>): Promise<LoadFailure> {
  const e = await p.then(() => null, (err: unknown) => err);
  expect(e).toBeInstanceOf(LoadFailure);
  return e as LoadFailure;
}

describe('lineSplitter / readLines', () => {
  it('joins lines split across chunks and keeps a partial line until it completes', () => {
    const s = lineSplitter();
    expect(s.push('{"a":1}\n{"b"')).toEqual(['{"a":1}']);
    expect(s.push(':2')).toEqual([]);
    expect(s.push('}\n\n{"c":3}')).toEqual(['{"b":2}']);
    expect(s.flush()).toEqual(['{"c":3}']);
    expect(s.flush()).toEqual([]);
  });

  it('handles CRLF, blank lines and a multi-byte character split between chunks', async () => {
    const text = bytes('{"label":"Lesen · ✓"}\r\n\r\n{"x":2}');
    const cut = text.indexOf(0xe2) + 1; // inside the 3-byte "✓"
    const lines: string[] = [];
    for await (const l of readLines(stream([text.slice(0, 5), text.slice(5, cut), text.slice(cut)]))) lines.push(l);
    expect(lines).toEqual(['{"label":"Lesen · ✓"}', '{"x":2}']);
  });

  it('reads one byte at a time', async () => {
    const lines: string[] = [];
    for await (const l of readLines(stream([...bytes(RESULT + RESULT)].map((b) => Uint8Array.of(b))))) lines.push(l);
    expect(lines.map((l) => JSON.parse(l).type)).toEqual(['result', 'result']);
  });
});

describe('loadRepo via the Worker', () => {
  it('reports progress lines then returns the parsed aggregate', async () => {
    const progress = line({ type: 'progress', done: 18, total: 51, label: 'Comparing buckets' });
    const fetch = fakeFetch(() => ndjson([progress.slice(0, 20), progress.slice(20) + RESULT.slice(0, 50), RESULT.slice(50)]));
    const onProgress = vi.fn<(p: unknown) => void>();
    const r = await run(fetch, { onProgress });
    expect(r).toMatchObject({ via: 'worker', fellBack: false, aggregate: { repo: { name: 'demo' } } });
    expect(onProgress).toHaveBeenCalledWith({ done: 18, total: 51, label: 'Comparing buckets', via: 'worker' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]![0])).toBe('/api/repo/octo/demo');
  });

  it.each([
    ['not_found', 'not_found'],
    ['empty', 'empty'],
    ['too_little', 'too_little'],
    ['upstream', 'upstream'],
  ] as const)('maps an error line %s to %s without touching GitHub', async (code, expected) => {
    const fetch = fakeFetch(() => ndjson([line({ type: 'error', code, message: 'x' })]));
    expect(await failure(run(fetch))).toMatchObject({ code: expected, via: 'worker' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps rate_limited (stream line or 429 JSON) as an error with resetAt; no automatic fallback', async () => {
    const resetAt = '2026-10-20T14:05:00Z';
    for (const res of [
      () => ndjson([line({ type: 'error', code: 'rate_limited', message: 'x', resetAt })]),
      () => new Response(JSON.stringify({ type: 'error', code: 'rate_limited', message: 'x', resetAt }), { status: 429, headers: { 'content-type': 'application/json' } }),
    ]) {
      const fetch = fakeFetch(res);
      expect(await failure(run(fetch))).toMatchObject({ code: 'rate_limited', via: 'worker', resetAt });
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  });
});

const limited = () => new Response('{"message":"API rate limit exceeded"}', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1792466700' } });
const down = () => Promise.reject(new TypeError('Failed to fetch'));

describe('loadRepo browser fallback', () => {
  const unreachable: [string, () => Response | Promise<Response>][] = [
    ['a refused connection', () => Promise.reject(new TypeError('Failed to fetch'))],
    ['the SPA page instead of the API', () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })],
    ['a 502 without a body', () => new Response(null, { status: 502 })],
    ['a stream cut off before the result', () => ndjson([line({ type: 'progress', done: 1, total: 9, label: 'x' })])],
    ['a malformed line', () => ndjson(['{oops\n'])],
  ];
  it.each(unreachable)('falls back to api.github.com on %s and says so', async (_, worker) => {
    const github = vi.fn<(url: string) => Response>(() => new Response('{"message":"Not Found"}', { status: 404 }));
    const onFallback = vi.fn<() => void>();
    const f = await failure(run(fakeFetch(worker, github), { onFallback }));
    expect(onFallback).toHaveBeenCalledTimes(1);
    expect(github.mock.calls[0]![0]).toBe('https://api.github.com/repos/octo/demo');
    expect(f).toMatchObject({ code: 'not_found', via: 'browser' });
  });

  it('"Try from your browser" skips the Worker and reports its own rate limit', async () => {
    const worker = vi.fn<() => Response>(() => ndjson([RESULT]));
    const f = await failure(run(fakeFetch(worker, limited), { browser: true }));
    expect(worker).not.toHaveBeenCalled();
    expect(f).toMatchObject({ code: 'rate_limited', via: 'browser', resetAt: new Date(1792466700 * 1000).toISOString() });
  });

  it('is "unavailable" when neither the Worker nor GitHub answers, "offline" when the browser is offline', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(down);
    expect(await failure(run(fetch))).toMatchObject({ code: 'unavailable' });
    expect(await failure(run(fetch, { browser: true }))).toMatchObject({ code: 'offline' });
    fetch.mockClear();
    expect(await failure(run(fetch, { online: () => false }))).toMatchObject({ code: 'offline' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rethrows an abort instead of mapping it, and stops reading the stream', async () => {
    const ctl = new AbortController();
    const github = vi.fn<(url: string) => Response>(() => new Response('{}'));
    const fetch = fakeFetch(() => ndjson([line({ type: 'progress', done: 1, total: 9, label: 'x' }), RESULT]), github);
    const onProgress = () => ctl.abort();
    const e = await run(fetch, { signal: ctl.signal, onProgress }).then(() => null, (err: unknown) => err);
    expect(e).toMatchObject({ name: 'AbortError' });
    expect(github).not.toHaveBeenCalled();
  });
});
