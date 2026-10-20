/**
 * repo-rivers core: pure, isomorphic TypeScript (browser, Worker, Node 22 scripts).
 * Each export is documented with TSDoc at its declaration. See docs/PLAN.md §4.8.
 */
export * from './schema.ts';
export type { BucketObservation, CommitMeta, FileChange } from './commits.ts';
export { fnv1a, isBot, personOf } from './identity.ts';
export { FILE_CAP, MAX_DEPTH, autoDepth, collapsePrefix, isIgnored, prefixOf } from './paths.ts';
export {
  bucketIndex,
  bucketLabel,
  bucketStarts,
  chooseUnit,
  nextStart,
  startOf,
} from './buckets.ts';
export { MAX_PEOPLE, MAX_PREFIXES, OTHERS_ID, buildAggregate, type AggregateMeta } from './aggregate.ts';
export * from './errors.ts';
export { parseRepoInput, type RepoRef } from './github/repoRef.ts';
export { createClient, parseLastPage, type ClientOptions, type GitHubClient, type GitHubResponse } from './github/client.ts';
export * from './github/plan.ts';
export { fetchRepoAggregate, type FetchOptions, type FetchProgress } from './github/fetchRepo.ts';
export { selectView, type River, type RiverView, type ViewOptions, type ViewTransfer } from './view.ts';
