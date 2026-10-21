/** Source-neutral inputs to `buildAggregate`; every fetcher (GitHub, fixtures) produces these. */

/** One commit. `parents > 1` marks a merge; `login` is set when GitHub links the author; `email` is never stored. */
export interface CommitMeta {
  sha: string;
  /** ISO 8601 author date. */
  date: string;
  parents: number;
  login?: string;
  name: string;
  email: string;
  /** GitHub user type, e.g. `"User"` or `"Bot"`. */
  userType?: string;
}

/** A changed file: `changes` = additions + deletions; `previousPath` is set for renames. */
export interface FileChange {
  path: string;
  previousPath?: string;
  status: 'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  changes: number;
}

/** What a source saw in one bucket. `scale` (>= 1) multiplies commit counts when only part of the bucket's
 * commits were seen; `files` must already cover the whole bucket (e.g. one compare diff). */
export interface BucketObservation {
  bucket: number;
  commits: CommitMeta[];
  files: FileChange[];
  scale: number;
}
