import { buildAggregate } from '../aggregate.ts';
import { bucketIndex } from '../buckets.ts';
import type { BucketObservation, CommitMeta, FileChange } from '../commits.ts';
import { EmptyRepo, assertEnoughHistory } from '../errors.ts';
import { isIgnored, prefixOf } from '../paths.ts';
import type { RepoAggregate } from '../schema.ts';
import { createClient, type GitHubClient } from './client.ts';
import { BUDGET, DETAILS_PER_BUCKET, MAX_BUCKETS, PROBE_REQUESTS, planFetch, type FetchPlan } from './plan.ts';
import type { RepoRef } from './repoRef.ts';

/** Fired after every planned step (a request, or a step skipped because it was not needed). */
export interface FetchProgress {
  done: number;
  total: number;
  label: string;
}

/** Options for {@link fetchRepoAggregate}. Budgets and bucket caps default by whether a token is given. */
export interface FetchOptions {
  token?: string;
  budget?: number;
  maxBuckets?: number;
  fetch?: typeof fetch;
  onProgress?: (p: FetchProgress) => void;
  signal?: AbortSignal;
  /** Plan on `budget` alone, ignoring `x-ratelimit-remaining` (the sample script resumes from its cache). */
  ignoreQuota?: boolean;
}

interface GhFile { filename: string; previous_filename?: string; status: FileChange['status']; changes: number }
interface GhCommit {
  sha: string;
  commit: { author: { name: string; email: string; date: string } };
  author: { login: string; type: string } | null;
  parents: unknown[];
  files?: GhFile[];
}
interface GhCompare { total_commits: number; commits: GhCommit[]; files?: GhFile[] }

/** GitHub lists at most this many files per compare, sorted by path. */
const COMPARE_FILE_CAP = 300;

const toMeta = (c: GhCommit): CommitMeta => ({
  sha: c.sha,
  date: c.commit.author.date,
  parents: c.parents.length,
  login: c.author?.login,
  name: c.commit.author.name,
  email: c.commit.author.email,
  userType: c.author?.type,
});
const toFile = (f: GhFile, changes = f.changes): FileChange => {
  return { path: f.filename, previousPath: f.previous_filename, status: f.status, changes };
};
const isoSeconds = (t: number): string => new Date(t).toISOString().replace('.000Z', 'Z');
/** `k` items spread evenly over `xs`. */
const spread = <T>(xs: readonly T[], k: number): T[] => {
  const n = Math.min(k, xs.length);
  return Array.from({ length: n }, (_, i) => xs[Math.floor(((i + 0.5) * xs.length) / n)]!);
};

interface Ctx {
  gh: GitHubClient;
  base: string;
  branch: string;
  plan: FetchPlan;
  step: (label: string) => void;
  /** Planned steps not yet taken; every request is one step, so this bounds further requests. */
  left: () => number;
}

/** Full mode: list every commit, then read each non-merge commit's files. Exact. */
async function fullMode({ gh, base, branch, plan, step }: Ctx): Promise<[BucketObservation[], number]> {
  const listed: GhCommit[] = [];
  for (let page = 1; page <= plan.listPages; page++) {
    listed.push(...(await gh.get<GhCommit[]>(`${base}/commits?sha=${branch}&per_page=100&page=${page}`)).data);
    step('Listing commits');
  }
  const observations: BucketObservation[] = [];
  const last = plan.starts.length - 1;
  let inWindow = 0;
  for (const c of listed.slice(0, plan.requests - PROBE_REQUESTS - plan.listPages)) {
    const index = bucketIndex(plan.starts, Date.parse(c.commit.author.date));
    if (index < 0 && plan.windowed) {
      step('Skipping history before the window');
      continue;
    }
    const bucket = Math.min(last, Math.max(0, index));
    inWindow++;
    const files = c.parents.length > 1 ? [] : (await gh.get<GhCommit>(`${base}/commits/${c.sha}`)).data.files ?? [];
    observations.push({ bucket, commits: [toMeta(c)], files: files.map((f) => toFile(f)), scale: 1 });
    step('Reading commits');
  }
  return [observations, inWindow];
}

/**
 * Sampled mode: one compare per bucket between the last commits before consecutive bucket starts. Compares
 * list at most 250 commits (counts are scaled up to `total_commits`) and the first 300 files by path; for
 * such truncated buckets, files after the 300th path are estimated from a few sampled commit details.
 */
async function sampledMode(ctx: Ctx, first: string, head: string, truncated: number[]) {
  const { gh, base, branch, plan, step } = ctx;
  // A windowed plan also looks up the base of bucket 0, so it does not absorb all earlier history.
  const bounds = plan.windowed ? [] : [first];
  for (const start of plan.windowed ? plan.starts : plan.starts.slice(1)) {
    const res = await gh.get<GhCommit[]>(`${base}/commits?sha=${branch}&until=${isoSeconds(start)}&per_page=1`);
    bounds.push(res.data[0]?.sha ?? first);
    step('Finding bucket boundaries');
  }
  bounds.push(head);
  const observations: BucketObservation[] = [];
  const compares: (GhCompare | undefined)[] = [];
  let seen = 0;
  for (const [bucket, from] of bounds.slice(0, -1).entries()) {
    const to = bounds[bucket + 1]!;
    const cmp = from === to ? undefined : (await gh.get<GhCompare>(`${base}/compare/${from}...${to}`)).data;
    compares.push(cmp);
    const commits = (cmp?.commits ?? []).map(toMeta);
    const files = (cmp?.files ?? []).map((f) => toFile(f));
    seen += commits.length;
    if (files.length >= COMPARE_FILE_CAP) truncated.push(bucket);
    observations.push({ bucket, commits, files, scale: commits.length ? cmp!.total_commits / commits.length : 1 });
    step('Comparing buckets');
  }
  const perBucket = truncated.length ? Math.min(DETAILS_PER_BUCKET, Math.floor(plan.details / truncated.length)) : 0;
  for (const bucket of perBucket > 0 ? truncated : []) {
    const cmp = compares[bucket]!;
    const lastSeen = cmp.files!.at(-1)!.filename;
    const nonMerge = cmp.commits.filter((c) => c.parents.length <= 1);
    const sampled = spread(nonMerge, perBucket);
    const factor = (cmp.total_commits * (nonMerge.length / cmp.commits.length)) / Math.max(1, sampled.length);
    for (const c of sampled) {
      const files = (await gh.get<GhCommit>(`${base}/commits/${c.sha}`)).data.files ?? [];
      const tail = files.filter((f) => f.filename > lastSeen);
      observations[bucket]!.files.push(...tail.map((f) => toFile(f, Math.round(f.changes * factor))));
      step('Sampling commits in busy buckets');
    }
  }
  return { observations, seen, perBucket };
}

/** Commit-detail pages read per traced module (300 files each). */
const MOVE_PAGES = 4;

/**
 * Move-finder: compares truncated at 300 files can hide a reorganisation (e.g. `src` → `packages/svelte`).
 * For directories that first appear in a truncated bucket (heaviest first), finds the oldest commit touching
 * them in that bucket and adds its cross-directory renames (0 lines, so only transfers change). Spends only
 * `ctx.left()`; about 3–6 requests per directory. Returns how many directories were traced.
 */
async function findMoves(ctx: Ctx, observations: BucketObservation[], truncated: readonly number[]): Promise<number> {
  const { gh, base, branch, plan, step, left } = ctx;
  const seen = new Set<string>();
  const fresh: { bucket: number; dir: string; weight: number }[] = [];
  for (const o of observations) {
    const here = new Map<string, number>();
    const dirs = o.files.flatMap((f) => (isIgnored(f.path) || !prefixOf(f.path) ? [] : [[f, prefixOf(f.path).split('/')] as const]));
    for (const [f, parts] of dirs) {
      const dir = parts.map((_, i) => parts.slice(0, i + 1).join('/')).find((d) => !seen.has(d));
      if (dir) here.set(dir, (here.get(dir) ?? 0) + f.changes);
    }
    if (o.bucket > 0 && truncated.includes(o.bucket)) fresh.push(...[...here].map(([dir, weight]) => ({ bucket: o.bucket, dir, weight })));
    for (const [, parts] of dirs) parts.forEach((_, i) => seen.add(parts.slice(0, i + 1).join('/')));
  }
  let traced = 0;
  for (const { bucket, dir } of fresh.toSorted((a, b) => b.weight - a.weight || (a.dir < b.dir ? -1 : 1))) {
    if (left() < 3) break;
    const until = isoSeconds(plan.starts[bucket + 1] ?? plan.end);
    const query = `${base}/commits?sha=${branch}&path=${encodeURIComponent(dir)}&since=${isoSeconds(plan.starts[bucket]!)}&until=${until}&per_page=1`;
    const newest = await gh.get<GhCommit[]>(query);
    step('Tracing moved modules');
    const count = newest.lastPage ?? 1;
    const oldest = count > 1 ? (await gh.get<GhCommit[]>(`${query}&page=${count}`)).data[0] : newest.data[0];
    if (count > 1) step('Tracing moved modules');
    if (!oldest) continue;
    traced++;
    const files = observations[bucket]!.files;
    const known = new Set(files.filter((f) => f.status === 'renamed').map((f) => f.path));
    for (let page = 1, pages = 1; page <= pages && left() > 0; page++) {
      const res = await gh.get<GhCommit>(`${base}/commits/${oldest.sha}${page > 1 ? `?page=${page}` : ''}`);
      step('Tracing moved modules');
      pages = Math.min(res.lastPage ?? 1, MOVE_PAGES);
      const renames = (res.data.files ?? []).filter((f) => f.status === 'renamed' && f.previous_filename && !known.has(f.filename));
      files.push(...renames.map((f) => toFile(f, 0)));
    }
  }
  return traced;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Fetches a public repository's history from the GitHub REST API within a request budget and aggregates
 * it: a 3-request probe, then {@link planFetch} picks full or sampled mode. Honours `signal` before every
 * request and reports progress after every planned step. Throws the typed errors from `errors.ts`.
 */
export async function fetchRepoAggregate(ref: RepoRef, options: FetchOptions = {}): Promise<RepoAggregate> {
  const { token, onProgress, signal } = options;
  const tier = token ? 'token' : 'unauthenticated';
  const gh = createClient({ token, fetch: options.fetch, signal });
  const base = `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.name)}`;
  let [done, total] = [0, PROBE_REQUESTS];
  const step = (label: string): void => {
    done++; // counted even without a listener: `left()` bounds the move-finder
    onProgress?.({ done, total, label });
  };
  const left = (): number => total - done;

  const repo = (await gh.get<{ default_branch: string; description: string | null }>(base)).data;
  step('Reading the repository');
  const branch = encodeURIComponent(repo.default_branch);
  const headRes = await gh.get<GhCommit[]>(`${base}/commits?sha=${branch}&per_page=1`);
  const head = headRes.data[0];
  if (!head) throw new EmptyRepo();
  const count = headRes.lastPage ?? 1;
  step('Counting commits');
  const oldest = count > 1 ? (await gh.get<GhCommit[]>(`${base}/commits?sha=${branch}&per_page=1&page=${count}`)).data[0] : head;
  step('Finding the first commit');
  const [first, last] = [oldest ?? head, head].map((c) => Date.parse(c.commit.author.date)) as [number, number];
  const plan = planFetch({
    commits: count,
    first: Math.min(first, last),
    last: Math.max(first, last),
    budget: options.budget ?? BUDGET[tier],
    maxBuckets: options.maxBuckets ?? MAX_BUCKETS[tier],
    remaining: options.ignoreQuota ? undefined : gh.rate.remaining,
    resetAt: gh.rate.resetAt,
  });
  total = plan.requests;
  const ctx: Ctx = { gh, base, branch, plan, step, left };
  const truncated: number[] = [];
  const notes = ['Merge commits are not counted; bots are flagged and hidden by default.'];
  let observations: BucketObservation[];
  let seen: number;
  if (plan.mode === 'full') {
    [observations, seen] = await fullMode(ctx);
    notes.unshift(`Every commit was read (${plural(seen, 'commit')}).`);
    if (plan.windowed) notes.push(`History before ${new Date(plan.starts[0]!).getUTCFullYear()} is not shown.`);
  } else {
    const r = await sampledMode(ctx, (oldest ?? head).sha, head.sha, truncated);
    [observations, seen] = [r.observations, r.seen];
    notes.unshift(
      `Sampled: one comparison per ${plan.unit}; commit counts above the 250 commits GitHub lists per comparison are extrapolated.`,
      plan.windowed
        ? `History before ${new Date(plan.starts[0]!).getUTCFullYear()} is not shown: only the latest ${plural(plan.starts.length, 'year')} fit the request budget.`
        : "The first commit's own files (the initial import) are not counted.",
    );
    if (truncated.length > 0) {
      const how = r.perBucket > 0 ? `estimated from ${plural(r.perBucket, 'sampled commit')} each` : 'not counted';
      notes.push(`${plural(truncated.length, 'bucket')} changed over 300 files; files after the first 300 by path were ${how}.`);
      const traced = await findMoves(ctx, observations, truncated);
      if (traced > 0) notes.push(`Renames into ${plural(traced, 'new folder')} were traced to their first commit.`);
    }
  }
  while (left() > 0) step('Done');
  const agg = buildAggregate(observations, {
    repo: {
      owner: ref.owner,
      name: ref.name,
      defaultBranch: repo.default_branch,
      headSha: head.sha,
      ...(repo.description ? { description: repo.description } : {}),
    },
    generatedAt: new Date().toISOString(),
    source: {
      mode: plan.mode,
      authenticated: Boolean(token),
      commitsTotal: count,
      commitsSeen: seen,
      requests: gh.requests,
      truncatedBuckets: truncated,
      notes,
    },
    time: { unit: plan.unit, starts: plan.starts.map((s) => new Date(s).toISOString()), end: new Date(plan.end).toISOString() },
  });
  assertEnoughHistory(agg.totals.commits.reduce((a, b) => a + b, 0), plan.starts.length);
  return agg;
}
