import type { BucketObservation, FileChange } from './commits.ts';
import { personOf } from './identity.ts';
import { FILE_CAP, isIgnored, prefixOf } from './paths.ts';
import type { Person, RepoAggregate, Transfer } from './schema.ts';

/** The parts of an aggregate that describe the source rather than come from observations. */
export type AggregateMeta = Pick<RepoAggregate, 'repo' | 'generatedAt' | 'source' | 'time'>;

type Rows = Map<string, number[]>;
const zeros = (n: number): number[] => Array.from({ length: n }, () => 0);
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
const bump = <K>(m: Map<K, number>, k: K, v: number): void => void m.set(k, (m.get(k) ?? 0) + v);
const add = (into: number[], i: number, v: number): void => void (into[i] = (into[i] ?? 0) + v);

function row(m: Rows, key: string, buckets: number): number[] {
  const r = m.get(key) ?? zeros(buckets);
  m.set(key, r);
  return r;
}

function addFile(f: FileChange, bucket: number, lines: Map<string, number>, moves: Map<string, number>): void {
  if (isIgnored(f.path)) return;
  bump(lines, `${bucket}\0${f.path}`, f.changes);
  if (f.status !== 'renamed' || !f.previousPath || isIgnored(f.previousPath)) return;
  const [from, to] = [prefixOf(f.previousPath), prefixOf(f.path)];
  if (from !== to) bump(moves, `${bucket}\0${from}\0${to}`, 1);
}

/** Turns `bucket\0from\0to` file-move counts into transfers between prefix indices, after roll-ups. */
function toTransfers(moves: Map<string, number>, prefixes: readonly string[], to: (p: string) => string): Transfer[] {
  const merged = new Map<string, number>();
  for (const [key, files] of moves) {
    const [bucket, a, b] = key.split('\0') as [string, string, string];
    const [from, into] = [prefixes.indexOf(to(a)), prefixes.indexOf(to(b))];
    if (from !== into) bump(merged, `${bucket}\0${from}\0${into}`, files);
  }
  const transfers = [...merged].map(([key, files]) => {
    const [bucket, from, into] = key.split('\0').map(Number) as [number, number, number];
    return { from, to: into, bucket, files };
  });
  return transfers.toSorted((a, b) => a.bucket - b.bucket || a.from - b.from || a.to - b.to);
}

/** Storage cap (PLAN §4.2): at most this many module prefixes per aggregate; the rest fold into "other". */
export const MAX_PREFIXES = 60;
/** Storage cap (PLAN §4.2): at most this many people per aggregate; the rest fold into {@link OTHERS_ID}. */
export const MAX_PEOPLE = 30;
/** Id of the person that absorbs the humans beyond {@link MAX_PEOPLE}; `selectView` folds it into "other". */
export const OTHERS_ID = '*others';
/** Like {@link OTHERS_ID} for bots beyond the cap; flagged `bot`, so it is hidden with the other bots. */
export const OTHER_BOTS_ID = '*others-bots';

const parentOf = (p: string): string => p.split('/').slice(0, -1).join('/');

/**
 * Rolls the lightest leaf prefix (depth >= 2, no stored descendants) into its parent until at most `max`
 * remain; top-level directories and root files never roll up. Returns where each rolled prefix went.
 */
function capPrefixes(weights: Rows, max: number, buckets: number): (p: string) => string {
  const moved = new Map<string, string>();
  while (weights.size > max) {
    const inner = new Set<string>();
    for (const p of weights.keys()) for (let q = parentOf(p); q; q = parentOf(q)) inner.add(q);
    let [pick, least] = ['', Infinity];
    for (const [p, w] of weights) {
      const s = sum(w);
      if (p.includes('/') && !inner.has(p) && (s < least || (s === least && p < pick))) [pick, least] = [p, s];
    }
    if (!pick) break;
    const into = row(weights, parentOf(pick), buckets);
    weights.get(pick)!.forEach((v, i) => add(into, i, v));
    weights.delete(pick);
    moved.set(pick, parentOf(pick));
  }
  const to = (p: string): string => (moved.has(p) ? to(moved.get(p)!) : p);
  return to;
}

/** Rounds each column so the integer parts sum to the rounded column total (largest remainder). */
function roundColumns(rows: number[][], buckets: number): { rows: number[][]; totals: number[] } {
  const out = rows.map((r) => r.map(Math.floor));
  const totals = zeros(buckets).map((_, b) => Math.round(sum(rows.map((r) => r[b] ?? 0))));
  totals.forEach((total, b) => {
    const order = rows.map((_, i) => i).toSorted((i, j) => (rows[j]![b]! % 1) - (rows[i]![b]! % 1) || i - j);
    const missing = total - sum(out.map((r) => r[b]!));
    for (let k = 0; k < missing; k++) add(out[order[k]!]!, b, 1);
  });
  return { rows: out, totals };
}

/**
 * Builds a schema-v1 {@link RepoAggregate} from per-bucket observations. Merge commits are not
 * counted; commit counts are multiplied by each observation's `scale` (finite, >= 1) and rounded per
 * bucket by largest remainder so people sum to `totals.commits`; ignore-listed files are dropped and each
 * file counts at most {@link FILE_CAP} lines per bucket; cross-prefix renames become transfers. Storage
 * caps: {@link MAX_PREFIXES} (lightest deep prefixes roll into their parents) and {@link MAX_PEOPLE}
 * (the rest fold into {@link OTHERS_ID}). Deterministic: prefixes sorted, people by commits then id.
 */
export function buildAggregate(observations: readonly BucketObservation[], meta: AggregateMeta): RepoAggregate {
  const B = meta.time.starts.length;
  const [found, commits, weights] = [new Map<string, Person>(), new Map() as Rows, new Map() as Rows];
  const [lines, moves] = [new Map<string, number>(), new Map<string, number>()];
  for (const o of observations) {
    if (!Number.isInteger(o.bucket) || o.bucket < 0 || o.bucket >= B) throw new RangeError(`bad bucket ${o.bucket}`);
    if (!Number.isFinite(o.scale) || o.scale < 1) throw new RangeError(`bad scale ${o.scale}`);
    for (const c of o.commits.filter((m) => m.parents <= 1)) {
      const p = personOf(c);
      if (!found.has(p.id)) found.set(p.id, p);
      add(row(commits, p.id, B), o.bucket, o.scale);
    }
    for (const f of o.files) addFile(f, o.bucket, lines, moves);
  }
  for (const [key, n] of lines) {
    const [bucket, path] = key.split('\0') as [string, string];
    add(row(weights, prefixOf(path), B), Number(bucket), Math.min(n, FILE_CAP));
  }
  for (const key of moves.keys()) key.split('\0').slice(1).forEach((p) => row(weights, p, B));
  const to = capPrefixes(weights, MAX_PREFIXES, B);
  const prefixes = [...weights.keys()].toSorted();
  const transfers = toTransfers(moves, prefixes, to);
  const byCommits = (a: Person, b: Person): number => sum(commits.get(b.id)!) - sum(commits.get(a.id)!);
  let people = [...found.values()].toSorted((a, b) => byCommits(a, b) || (a.id < b.id ? -1 : 1));
  const rounded = roundColumns(people.map((p) => commits.get(p.id)!), B);
  let counts = rounded.rows;
  if (people.length > MAX_PEOPLE) {
    // One fold per kind present in the rest, so bots stay hideable; recheck once if two folds are needed.
    const kinds = (keep: number): Set<boolean> => new Set(people.slice(keep).map((p) => p.bot));
    const keep = kinds(MAX_PEOPLE - 1).size > 1 ? MAX_PEOPLE - 2 : MAX_PEOPLE - 1;
    const folds = [false, true].filter((bot) => kinds(keep).has(bot)).map((bot) => {
      const rows = counts.slice(keep).filter((_, i) => people[keep + i]!.bot === bot);
      const person = bot ? { id: OTHER_BOTS_ID, label: 'other bots', bot } : { id: OTHERS_ID, label: 'others', bot };
      return { person, row: zeros(B).map((_, b) => sum(rows.map((r) => r[b]!))) };
    });
    people = [...people.slice(0, keep), ...folds.map((f) => f.person)];
    counts = [...counts.slice(0, keep), ...folds.map((f) => f.row)];
  }
  return {
    schemaVersion: 1,
    ...meta,
    totals: { commits: rounded.totals },
    paths: { prefixes, weights: prefixes.map((p) => weights.get(p)!), transfers },
    contributors: { people, commits: counts },
  };
}
