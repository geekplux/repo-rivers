// A source adapter: turn commits from any source into BucketObservation[] and let buildAggregate do the rest.
import {
  assertEnoughHistory,
  bucketIndex,
  bucketStarts,
  buildAggregate,
  chooseUnit,
  nextStart,
  type AggregateMeta,
  type BucketObservation,
  type CommitMeta,
  type FileChange,
  type RepoAggregate,
} from '../../src/core/index.ts';

/** One commit as your source reports it, e.g. a parsed `git log --numstat` entry. */
export interface SourceCommit {
  meta: CommitMeta;
  files: FileChange[];
}

/** Every commit was read, so each becomes its own observation with `scale: 1`. */
export function aggregateCommits(commits: readonly SourceCommit[], repo: AggregateMeta['repo']): RepoAggregate {
  const times = commits.map((c) => Date.parse(c.meta.date));
  const [first, last] = [Math.min(...times), Math.max(...times)];
  const unit = chooseUnit(first, last, 24);
  const starts = bucketStarts(first, last, unit);
  const observations: BucketObservation[] = commits.map((c, i) => ({
    bucket: bucketIndex(starts, times[i]!),
    commits: [c.meta],
    files: c.files,
    scale: 1,
  }));
  const aggregate = buildAggregate(observations, {
    repo,
    generatedAt: new Date().toISOString(),
    source: {
      mode: 'full',
      authenticated: false,
      commitsTotal: commits.length,
      commitsSeen: commits.length,
      requests: 0,
      truncatedBuckets: [],
      notes: ['Read from a local clone.'],
    },
    time: {
      unit,
      starts: starts.map((s) => new Date(s).toISOString()),
      end: new Date(nextStart(starts.at(-1)!, unit)).toISOString(),
    },
  });
  assertEnoughHistory(aggregate.totals.commits.reduce((a, b) => a + b, 0), starts.length);
  return aggregate;
}
