import { EmptyRepo, NetworkError, NotFound, RateLimited, UpstreamError } from '../errors.ts';

/** A successful (or 304 Not Modified) GitHub response with the headers the pipeline needs. */
export interface GitHubResponse<T> {
  status: number;
  /** Parsed JSON body; `undefined` on 304. */
  data: T;
  etag?: string;
  /** Page number of `Link: rel="last"`; with `per_page=1` this is the item count. */
  lastPage?: number;
}

/** Options for {@link createClient}. The token is optional; never log or store it. */
export interface ClientOptions {
  token?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
  baseUrl?: string;
}

/** A minimal GitHub REST client that counts requests and tracks the rate limit. */
export interface GitHubClient {
  /** GETs `path` (e.g. `/repos/o/r`); with `etag`, sends `If-None-Match` and may answer 304. */
  get<T>(path: string, etag?: string): Promise<GitHubResponse<T>>;
  /** Requests sent so far. */
  readonly requests: number;
  /** From the latest `x-ratelimit-*` headers. */
  readonly rate: { remaining?: number; resetAt?: string };
}

/** The page number of the `rel="last"` link in a `Link` header, if any. */
export function parseLastPage(link: string | null): number | undefined {
  const last = link?.split(',').find((part) => /rel="last"/.test(part));
  const page = last && /[?&]page=(\d+)/.exec(last);
  return page ? Number(page[1]) : undefined;
}

const iso = (epochSeconds: number): string => new Date(epochSeconds * 1000).toISOString();

/** Maps a non-OK response to a typed error (404, 409, primary/secondary rate limits, anything else). */
async function toError(res: Response, path: string, reset: number | undefined): Promise<Error> {
  const body = await res.text().catch(() => '');
  const message = (/"message"\s*:\s*"([^"]*)"/.exec(body)?.[1] ?? body).slice(0, 200);
  if (res.status === 404) return new NotFound(path);
  if (res.status === 409) return new EmptyRepo();
  const retryAfter = Number(res.headers.get('retry-after') ?? NaN);
  const limited = res.headers.get('x-ratelimit-remaining') === '0' || /rate limit/i.test(message);
  if (res.status === 429 || (res.status === 403 && (limited || retryAfter >= 0))) {
    const at = retryAfter >= 0 ? iso(Date.now() / 1000 + retryAfter) : iso(reset ?? Date.now() / 1000 + 60);
    return new RateLimited(at);
  }
  return new UpstreamError(res.status, message || res.statusText);
}

/** Creates a client sending `Accept: application/vnd.github+json` and `X-GitHub-Api-Version: 2022-11-28`. */
export function createClient(options: ClientOptions = {}): GitHubClient {
  const { token, signal, baseUrl = 'https://api.github.com' } = options;
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const rate: { remaining?: number; resetAt?: string } = {};
  let requests = 0;
  let reset: number | undefined;
  async function get<T>(path: string, etag?: string): Promise<GitHubResponse<T>> {
    signal?.throwIfAborted();
    if (rate.remaining === 0 && rate.resetAt) throw new RateLimited(rate.resetAt);
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (etag) headers['If-None-Match'] = etag;
    let res: Response;
    try {
      requests++;
      res = await doFetch(baseUrl + path, { headers, signal });
    } catch (e) {
      if (signal?.aborted) throw signal.reason;
      throw new NetworkError(e);
    }
    const [left, resetHeader] = ['x-ratelimit-remaining', 'x-ratelimit-reset'].map((h) => res.headers.get(h));
    if (left !== null) rate.remaining = Number(left);
    if (resetHeader !== null) [reset, rate.resetAt] = [Number(resetHeader), iso(Number(resetHeader))];
    if (res.status === 304) return { status: 304, data: undefined as T, etag };
    if (!res.ok) throw await toError(res, path, reset);
    let data: T;
    try {
      data = (await res.json()) as T;
    } catch {
      if (signal?.aborted) throw signal.reason;
      throw new UpstreamError(res.status, 'malformed JSON');
    }
    const lastPage = parseLastPage(res.headers.get('link'));
    return { status: res.status, data, etag: res.headers.get('etag') ?? undefined, lastPage };
  }
  return {
    get,
    get requests() {
      return requests;
    },
    rate,
  };
}
