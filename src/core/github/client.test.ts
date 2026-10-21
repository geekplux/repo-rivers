import { describe, expect, it, vi } from 'vitest';
import { EmptyRepo, NetworkError, NotFound, RateLimited, UpstreamError } from '../errors.ts';
import { createClient, parseLastPage } from './client.ts';

const RESET = 1_792_465_000; // 2026-10-20T02:56:40Z
type Fetch = typeof fetch;
const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  vi.fn<Fetch>(async () => new Response(JSON.stringify(body), { status, headers }));
const failure = async (status: number, body: unknown, headers: Record<string, string> = {}): Promise<unknown> => {
  return createClient({ fetch: reply(status, body, headers) }).get('/repos/o/r').catch((e: unknown) => e);
};

describe('GitHub client', () => {
  it('sends the API headers, the optional token and If-None-Match', async () => {
    const fetch = reply(200, { ok: true }, { etag: 'W/"1"', 'x-ratelimit-remaining': '41', 'x-ratelimit-reset': String(RESET) });
    const gh = createClient({ fetch, token: 'secret-token' });
    const res = await gh.get<{ ok: boolean }>('/repos/o/r', 'W/"0"');
    const headers = fetch.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers).toMatchObject({ Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
    expect(headers).toMatchObject({ Authorization: 'Bearer secret-token', 'If-None-Match': 'W/"0"' });
    expect(res).toMatchObject({ status: 200, data: { ok: true }, etag: 'W/"1"' });
    expect(gh.rate).toEqual({ remaining: 41, resetAt: '2026-10-20T02:56:40.000Z' });
    expect(gh.requests).toBe(1);
  });

  it('answers 304 Not Modified without a body', async () => {
    const fetch = vi.fn<Fetch>(async () => new Response(null, { status: 304 }));
    await expect(createClient({ fetch }).get('/repos/o/r', 'W/"1"')).resolves.toMatchObject({ status: 304, etag: 'W/"1"' });
  });

  it('maps 404 and 409 to NotFound and EmptyRepo', async () => {
    expect(await failure(404, { message: 'Not Found' })).toBeInstanceOf(NotFound);
    expect(await failure(409, { message: 'Git Repository is empty.' })).toBeInstanceOf(EmptyRepo);
  });

  it('maps a 403 with no quota left to RateLimited with the reset time', async () => {
    const e = await failure(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(RESET) });
    expect(e).toBeInstanceOf(RateLimited);
    expect((e as RateLimited).resetAt).toBe('2026-10-20T02:56:40.000Z');
    expect((e as RateLimited).code).toBe('rate_limited');
  });

  it('maps 429 and secondary-limit 403s (retry-after or message) to RateLimited', async () => {
    const before = Date.now();
    const e = await failure(429, { message: 'Too many requests' }, { 'retry-after': '60' });
    expect(e).toBeInstanceOf(RateLimited);
    expect(Date.parse((e as RateLimited).resetAt)).toBeGreaterThanOrEqual(before + 59_000);
    const message = 'You have exceeded a secondary rate limit. Please wait a few minutes before you try again.';
    expect(await failure(403, { message }, { 'x-ratelimit-remaining': '4999' })).toBeInstanceOf(RateLimited);
  });

  it('maps other failures to UpstreamError and NetworkError', async () => {
    const forbidden = await failure(403, { message: 'Resource not accessible' }, { 'x-ratelimit-remaining': '10' });
    expect(forbidden).toBeInstanceOf(UpstreamError);
    expect(await failure(502, 'Bad gateway')).toMatchObject({ code: 'upstream', status: 502 });
    const offline = vi.fn<Fetch>(async () => Promise.reject(new TypeError('fetch failed')));
    await expect(createClient({ fetch: offline }).get('/x')).rejects.toBeInstanceOf(NetworkError);
  });

  it('stops before sending once the quota is known to be exhausted', async () => {
    const fetch = reply(200, [], { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(RESET) });
    const gh = createClient({ fetch });
    await gh.get('/a');
    await expect(gh.get('/b')).rejects.toBeInstanceOf(RateLimited);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rethrows aborts as-is and sends nothing after one', async () => {
    const controller = new AbortController();
    const fetch = reply(200, {});
    controller.abort();
    await expect(createClient({ fetch, signal: controller.signal }).get('/a')).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('parses the Link rel="last" page (the item count with per_page=1)', () => {
    const base = 'https://api.github.com/repositories/1/commits?sha=main&per_page=1';
    const link = `<${base}&page=2>; rel="next", <${base}&page=6182>; rel="last"`;
    expect(parseLastPage(link)).toBe(6182);
    expect(parseLastPage(`<${base}&page=1>; rel="prev", <${base}&page=1>; rel="first"`)).toBeUndefined();
    expect(parseLastPage(null)).toBeUndefined();
  });
});
