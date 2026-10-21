/**
 * RepoAggregate schema v1: the stored, time-bucketed summary of a repository's history.
 * Pure and isomorphic (browser, Worker, Node scripts). See docs/PLAN.md §4.2.
 */

/** Width of one time bucket. Weeks start on Monday; all dates are UTC. */
export type BucketUnit = 'week' | 'month' | 'quarter' | 'year';

/** A repository's history, aggregated into time buckets. */
export interface RepoAggregate {
  schemaVersion: 1;
  repo: { owner: string; name: string; defaultBranch: string; headSha: string; description?: string };
  /** ISO 8601 timestamp of when the aggregate was built. */
  generatedAt: string;
  source: SourceInfo;
  /** Bucket i covers `[starts[i], starts[i + 1] ?? end)`. */
  time: { unit: BucketUnit; starts: string[]; end: string };
  /** Non-merge commits per bucket (bots included). */
  totals: { commits: number[] };
  paths: {
    /** Path prefixes up to depth 3; `""` means root files. */
    prefixes: string[];
    /** `[prefix][bucket]` lines changed (capped, ignore-listed). */
    weights: number[][];
    /** Files moved between prefixes. */
    transfers: Transfer[];
  };
  /** `commits` is `[person][bucket]`. */
  contributors: { people: Person[]; commits: number[][] };
  eras?: Era[];
}

/** How the aggregate was obtained, and its caveats. */
export interface SourceInfo {
  mode: 'full' | 'sampled' | 'synthetic';
  authenticated: boolean;
  commitsTotal: number;
  commitsSeen: number;
  requests: number;
  /** Buckets whose compare response hit the 300-file cap. */
  truncatedBuckets: number[];
  /** Human-readable caveats shown in the "sampled" popover. */
  notes: string[];
}

/** A contributor. `id` is the GitHub login, else `"anon:<fnv1a(email)>"`. */
export interface Person {
  id: string;
  label: string;
  bot: boolean;
}

/** Files moved from prefix `from` to prefix `to` during bucket `bucket`. */
export interface Transfer {
  from: number;
  to: number;
  bucket: number;
  files: number;
}

/** A named era spanning buckets `start..end` (inclusive). */
export interface Era {
  start: number;
  end: number;
  title: string;
  note: string;
  source: 'ai' | 'heuristic';
}

/** Thrown by {@link parseAggregate}; `path` points at the offending value, e.g. `paths.weights[2][7]`. */
export class AggregateParseError extends Error {
  readonly path: string;
  constructor(path: string, problem: string) {
    super(`Invalid aggregate at ${path}: ${problem}`);
    this.name = 'AggregateParseError';
    this.path = path;
  }
}

type Obj = Record<string, unknown>;

const fail = (path: string, problem: string): never => {
  throw new AggregateParseError(path, problem);
};

function obj(v: unknown, path: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, 'expected an object');
  return v as Obj;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string') fail(path, 'expected a string');
  return v as string;
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') fail(path, 'expected a boolean');
  return v as boolean;
}

function arr(v: unknown, path: string, length?: number): unknown[] {
  if (!Array.isArray(v)) return fail(path, 'expected an array');
  if (length !== undefined && v.length !== length) fail(path, `expected length ${length}, got ${v.length}`);
  return v;
}

function count(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) fail(path, 'expected a finite non-negative number');
  return v as number;
}

function index(v: unknown, path: string, size: number): number {
  if (!Number.isInteger(v) || (v as number) < 0 || (v as number) >= size) {
    fail(path, `expected an integer index in [0, ${size})`);
  }
  return v as number;
}

function date(v: unknown, path: string): number {
  const t = Date.parse(str(v, path));
  if (Number.isNaN(t)) fail(path, 'expected an ISO 8601 date');
  return t;
}

function oneOf<T extends string>(v: unknown, path: string, options: readonly T[]): T {
  if (!options.includes(v as T)) fail(path, `expected one of ${options.join(', ')}`);
  return v as T;
}

function series(v: unknown, path: string, buckets: number): void {
  arr(v, path, buckets).forEach((n, i) => count(n, `${path}[${i}]`));
}

/**
 * Validates an unknown value (e.g. parsed JSON) as a {@link RepoAggregate} v1.
 * Checks the version, array lengths against `time.starts.length`, finite non-negative numbers
 * and in-range indices. Returns the value typed, or throws {@link AggregateParseError}.
 */
export function parseAggregate(input: unknown): RepoAggregate {
  const a = obj(input, '$');
  if (a.schemaVersion !== 1) fail('schemaVersion', `unsupported version ${String(a.schemaVersion)}`);

  const repo = obj(a.repo, 'repo');
  for (const k of ['owner', 'name', 'defaultBranch', 'headSha']) str(repo[k], `repo.${k}`);
  if (repo.description !== undefined) str(repo.description, 'repo.description');
  date(a.generatedAt, 'generatedAt');

  const time = obj(a.time, 'time');
  oneOf(time.unit, 'time.unit', ['week', 'month', 'quarter', 'year'] as const);
  const starts = arr(time.starts, 'time.starts');
  if (starts.length === 0) fail('time.starts', 'expected at least one bucket');
  const B = starts.length;
  let prev = -Infinity;
  starts.forEach((s, i) => {
    const t = date(s, `time.starts[${i}]`);
    if (t <= prev) fail(`time.starts[${i}]`, 'starts must be strictly increasing');
    prev = t;
  });
  if (date(time.end, 'time.end') <= prev) fail('time.end', 'end must be after the last start');

  const source = obj(a.source, 'source');
  oneOf(source.mode, 'source.mode', ['full', 'sampled', 'synthetic'] as const);
  bool(source.authenticated, 'source.authenticated');
  for (const k of ['commitsTotal', 'commitsSeen', 'requests']) count(source[k], `source.${k}`);
  arr(source.truncatedBuckets, 'source.truncatedBuckets').forEach((b, i) =>
    index(b, `source.truncatedBuckets[${i}]`, B),
  );
  arr(source.notes, 'source.notes').forEach((n, i) => str(n, `source.notes[${i}]`));

  series(obj(a.totals, 'totals').commits, 'totals.commits', B);

  const paths = obj(a.paths, 'paths');
  const prefixes = arr(paths.prefixes, 'paths.prefixes');
  prefixes.forEach((p, i) => str(p, `paths.prefixes[${i}]`));
  const P = prefixes.length;
  arr(paths.weights, 'paths.weights', P).forEach((row, i) => series(row, `paths.weights[${i}]`, B));
  arr(paths.transfers, 'paths.transfers').forEach((t, i) => {
    const at = `paths.transfers[${i}]`;
    const tr = obj(t, at);
    index(tr.from, `${at}.from`, P);
    index(tr.to, `${at}.to`, P);
    index(tr.bucket, `${at}.bucket`, B);
    count(tr.files, `${at}.files`);
  });

  const contributors = obj(a.contributors, 'contributors');
  const people = arr(contributors.people, 'contributors.people');
  people.forEach((p, i) => {
    const person = obj(p, `contributors.people[${i}]`);
    str(person.id, `contributors.people[${i}].id`);
    str(person.label, `contributors.people[${i}].label`);
    bool(person.bot, `contributors.people[${i}].bot`);
  });
  arr(contributors.commits, 'contributors.commits', people.length).forEach((row, i) =>
    series(row, `contributors.commits[${i}]`, B),
  );

  if (a.eras !== undefined) {
    arr(a.eras, 'eras').forEach((e, i) => {
      const era = obj(e, `eras[${i}]`);
      const start = index(era.start, `eras[${i}].start`, B);
      if (index(era.end, `eras[${i}].end`, B) < start) fail(`eras[${i}].end`, 'end before start');
      str(era.title, `eras[${i}].title`);
      str(era.note, `eras[${i}].note`);
      oneOf(era.source, `eras[${i}].source`, ['ai', 'heuristic'] as const);
    });
  }

  return input as RepoAggregate;
}
