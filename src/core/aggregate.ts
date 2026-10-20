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

/** Turns `bucket\0from\0to` file-move counts into transfers between prefix indices. */
function toTransfers(moves: Map<string, number>, prefixes: readonly string[]): Transfer[] {
  const transfers = [...moves].map(([key, files]) => {
    const [bucket, from, to] = key.split('\0') as [string, string, string];
    return { from: prefixes.indexOf(from), to: prefixes.indexOf(to), bucket: Number(bucket), files };
  });
  return transfers.toSorted((a, b) => a.bucket - b.bucket || a.from - b.from || a.to - b.to);
}

/**
 * Builds a schema-v1 {@link RepoAggregate} from per-bucket observations. Merge commits are not
 * counted; commit counts are multiplied by each observation's `scale` and rounded; ignore-listed
 * files are dropped and each file counts at most {@link FILE_CAP} lines per bucket; cross-prefix
 * renames become transfers. Deterministic: prefixes sorted, people by commits then id.
 * Storage caps (60 prefixes, 30 people) are not applied yet.
 */
export function buildAggregate(observations: readonly BucketObservation[], meta: AggregateMeta): RepoAggregate {
  const B = meta.time.starts.length;
  const totals = zeros(B);
  const [found, commits, weights] = [new Map<string, Person>(), new Map() as Rows, new Map() as Rows];
  const [lines, moves] = [new Map<string, number>(), new Map<string, number>()];
  for (const o of observations) {
    if (!Number.isInteger(o.bucket) || o.bucket < 0 || o.bucket >= B) throw new RangeError(`bad bucket ${o.bucket}`);
    for (const c of o.commits.filter((m) => m.parents <= 1)) {
      const p = personOf(c);
      if (!found.has(p.id)) found.set(p.id, p);
      add(totals, o.bucket, o.scale);
      add(row(commits, p.id, B), o.bucket, o.scale);
    }
    for (const f of o.files) addFile(f, o.bucket, lines, moves);
  }
  for (const [key, n] of lines) {
    const [bucket, path] = key.split('\0') as [string, string];
    add(row(weights, prefixOf(path), B), Number(bucket), Math.min(n, FILE_CAP));
  }
  for (const key of moves.keys()) key.split('\0').slice(1).forEach((p) => row(weights, p, B));
  const prefixes = [...weights.keys()].toSorted();
  const transfers = toTransfers(moves, prefixes);
  const byCommits = (a: Person, b: Person): number => sum(commits.get(b.id)!) - sum(commits.get(a.id)!);
  const people = [...found.values()].toSorted((a, b) => byCommits(a, b) || (a.id < b.id ? -1 : 1));
  return {
    schemaVersion: 1,
    ...meta,
    totals: { commits: totals.map(Math.round) },
    paths: { prefixes, weights: prefixes.map((p) => weights.get(p)!), transfers },
    contributors: { people, commits: people.map((p) => commits.get(p.id)!.map(Math.round)) },
  };
}
