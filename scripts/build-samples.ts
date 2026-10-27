// Pre-aggregates the built-in samples into src/samples/<id>.json.
// Usage: pnpm samples:build [--only vite] [--budget 55]. GITHUB_TOKEN is read from the environment only.
// Raw GitHub responses are cached (trimmed) in .cache/github/, so a run that hits the rate limit resumes
// from the cache next time and a fully cached run makes no requests at all.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RateLimited } from '../src/core/errors.ts';
import { fetchRepoAggregate } from '../src/core/github/fetchRepo.ts';
import { parseAggregate } from '../src/core/schema.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.cache/github');
const MAX_BYTES = 50 * 1024;
const SAMPLES = { vite: 'vitejs/vite', svelte: 'sveltejs/svelte', express: 'expressjs/express' } as const;
/** The only response fields the pipeline reads; everything else (patches, URLs, messages) is dropped. */
const KEEP = new Set(
  ('default_branch description sha commit author name email date login type parents files filename ' +
    'previous_filename status changes total_commits commits').split(' '),
);

/** Recursively keeps only the {@link KEEP} keys. */
function trim(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(trim);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([k]) => KEEP.has(k)).map(([k, v]) => [k, trim(v)]));
}

const stats = { network: 0, cached: 0, remaining: undefined as string | undefined, reset: undefined as string | undefined };

/** `fetch` with a disk cache keyed by URL. Only 200 responses are cached; errors pass through. */
async function cachedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = String(input);
  const file = join(CACHE, `${createHash('sha256').update(url).digest('hex').slice(0, 24)}.json`);
  if (existsSync(file)) {
    stats.cached++;
    const hit = JSON.parse(readFileSync(file, 'utf8')) as { headers: Record<string, string>; body: unknown };
    return new Response(JSON.stringify(hit.body), { status: 200, headers: hit.headers });
  }
  stats.network++;
  const res = await fetch(url, init).catch(() => fetch(url, init)); // one retry on a dropped connection
  stats.remaining = res.headers.get('x-ratelimit-remaining') ?? stats.remaining;
  stats.reset = res.headers.get('x-ratelimit-reset') ?? stats.reset;
  if (res.status !== 200) return res;
  const headers = Object.fromEntries(['link', 'etag'].flatMap((h) => (res.headers.has(h) ? [[h, res.headers.get(h)!]] : [])));
  const body = trim(await res.json());
  writeFileSync(file, JSON.stringify({ url, headers, body }));
  return new Response(JSON.stringify(body), { status: 200, headers: { ...headers, ...rateHeaders(res) } });
}

const rateHeaders = (res: Response): Record<string, string> =>
  Object.fromEntries(['x-ratelimit-remaining', 'x-ratelimit-reset'].map((h) => [h, res.headers.get(h) ?? '']).filter(([, v]) => v));

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<number> {
  const only = arg('only');
  const budget = arg('budget') === undefined ? undefined : Number(arg('budget'));
  if (only !== undefined && !(only in SAMPLES)) throw new Error(`unknown sample ${only}; one of ${Object.keys(SAMPLES).join(', ')}`);
  if (budget !== undefined && !(budget >= 8)) throw new Error('--budget must be a number >= 8');
  const token = process.env.GITHUB_TOKEN || undefined;
  console.log(`GitHub access: ${token ? 'token from GITHUB_TOKEN' : 'unauthenticated'}`);
  mkdirSync(CACHE, { recursive: true });
  for (const [id, repo] of Object.entries(SAMPLES).filter(([key]) => !only || key === only)) {
    const [owner, name] = repo.split('/') as [string, string];
    const before = { ...stats };
    const agg = await fetchRepoAggregate({ owner, name }, { token, budget, fetch: cachedFetch, ignoreQuota: true });
    parseAggregate(agg);
    const json = `${JSON.stringify(agg)}\n`;
    const out = join(ROOT, 'src/samples', `${id}.json`);
    writeFileSync(out, json);
    const { mode, requests, truncatedBuckets } = agg.source;
    console.log(
      `${id}: ${mode}, ${agg.time.starts.length} ${agg.time.unit} buckets, ${requests} requests ` +
        `(${stats.network - before.network} network, ${stats.cached - before.cached} cached), ` +
        `${truncatedBuckets.length} truncated, ${(json.length / 1024).toFixed(1)} KB -> ${out.slice(ROOT.length + 1)}`,
    );
    if (json.length > MAX_BYTES) throw new Error(`${id}.json is larger than 50 KB`);
  }
  return 0;
}

function quota(): string {
  if (stats.remaining === undefined) return 'GitHub quota: not queried (all responses cached)';
  const reset = stats.reset ? new Date(Number(stats.reset) * 1000).toISOString() : 'unknown';
  return `GitHub quota: ${stats.remaining} requests remaining, resets at ${reset}`;
}

let code = 1;
try {
  code = await main();
} catch (e) {
  if (e instanceof RateLimited) {
    console.error(`Rate limited: try again after ${e.resetAt}. Responses so far are cached in .cache/github; rerun to resume.`);
  } else console.error(e instanceof Error ? e.message : e);
} finally {
  console.log(`Requests this run: ${stats.network} network, ${stats.cached} from cache. ${quota()}`);
}
process.exit(code);
