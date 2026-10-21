/** Why a repository could not be turned into an aggregate; `code` matches the Worker's NDJSON error codes. */
export type RepoErrorCode = 'not_found' | 'rate_limited' | 'empty' | 'too_little' | 'network' | 'upstream';

/** Base class of every typed fetch/aggregation failure. */
export class RepoError extends Error {
  readonly code: RepoErrorCode;
  constructor(code: RepoErrorCode, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

/** HTTP 404: the repository does not exist or is private. */
export class NotFound extends RepoError {
  constructor(what: string) {
    super('not_found', `${what} was not found (or is private)`);
  }
}

/** GitHub's primary or secondary rate limit, or too little quota left for even the smallest plan. */
export class RateLimited extends RepoError {
  /** ISO 8601 time at which the quota resets (best estimate). */
  readonly resetAt: string;
  constructor(resetAt: string, message = `GitHub rate limit reached; it resets at ${resetAt}`) {
    super('rate_limited', message);
    this.resetAt = resetAt;
  }
}

/** HTTP 409: the repository has no commits. */
export class EmptyRepo extends RepoError {
  constructor() {
    super('empty', 'The repository is empty');
  }
}

/** Fewer than {@link MIN_COMMITS} commits or {@link MIN_BUCKETS} time buckets: nothing to draw as rivers. */
export class TooLittleHistory extends RepoError {
  constructor(commits: number, buckets: number) {
    super('too_little', `Too little history to draw: ${commits} commits over ${buckets} time buckets`);
  }
}

/** The request never got an HTTP response (offline, DNS, CORS). */
export class NetworkError extends RepoError {
  constructor(cause: unknown) {
    super('network', `Network error: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

/** Any other unexpected GitHub response (5xx, 403 without a rate limit, malformed body). */
export class UpstreamError extends RepoError {
  readonly status: number;
  constructor(status: number, message: string) {
    super('upstream', `GitHub answered ${status}: ${message}`);
    this.status = status;
  }
}

/** A history needs at least this many non-merge commits… */
export const MIN_COMMITS = 10;
/** …spread over at least this many buckets. */
export const MIN_BUCKETS = 3;

/** Throws {@link TooLittleHistory} unless there are enough commits and buckets. */
export function assertEnoughHistory(commits: number, buckets: number): void {
  if (commits < MIN_COMMITS || buckets < MIN_BUCKETS) throw new TooLittleHistory(commits, buckets);
}
