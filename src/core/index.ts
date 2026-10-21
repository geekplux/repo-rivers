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
export { MAX_PEOPLE, MAX_PREFIXES, OTHER_BOTS_ID, OTHERS_ID, buildAggregate, type AggregateMeta } from './aggregate.ts';
export * from './errors.ts';
export { parseRepoInput, type RepoRef } from './github/repoRef.ts';
export { createClient, parseLastPage, type ClientOptions, type GitHubClient, type GitHubResponse } from './github/client.ts';
export * from './github/plan.ts';
export { fetchRepoAggregate, type FetchOptions, type FetchProgress } from './github/fetchRepo.ts';
export { selectView, type River, type RiverView, type ViewOptions, type ViewTransfer } from './view.ts';
export {
  layoutRivers,
  type LayoutOptions,
  type RiverLayout,
  type RiverShape,
  type TransferShape,
} from './layout/layout.ts';
export { LABEL_HEIGHT, ellipsize, placeLabels, type Box, type LabelBand, type LabelInput, type PlacedLabel } from './layout/labels.ts';
export { laneOrder } from './layout/order.ts';
export { curve, edgeAt, extend, link, ribbonPath, type Point } from './layout/ribbons.ts';
export { band, clipDomain, linear, quantile, sqrt, type Scale } from './layout/scale.ts';
export * from './palette.ts';
export { eraCount, eraFeatures, partition, segmentEras, type Segment } from './eras/segment.ts';
export { SUMMARY_MAX_BYTES, ident, summarizeForEras, type EraFacts, type EraSummary } from './eras/summary.ts';
export { heuristicEras } from './eras/heuristic.ts';
export { IDENT, NOTE_MAX, TITLE_MAX, checkEras, clampText, parseEraSummary, parseNames } from './eras/validate.ts';
export { ERA_MODEL, eraRequest } from './eras/prompt.ts';
