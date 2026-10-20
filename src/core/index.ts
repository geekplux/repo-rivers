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
export { buildAggregate, type AggregateMeta } from './aggregate.ts';
export { selectView, type River, type RiverView, type ViewOptions, type ViewTransfer } from './view.ts';
