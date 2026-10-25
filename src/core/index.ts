/**
 * repo-rivers core: pure, isomorphic TypeScript (browser, Worker, Node 22 scripts).
 * Each export is documented with TSDoc at its declaration (checked by scripts/docs.test.ts).
 * Usage examples: docs/EXTENDING.md.
 */

/** Schema v1 of the stored aggregate (`RepoAggregate`) and its validator `parseAggregate`. */
export * from './schema.ts';
/** The source-adapter contract: what any history source hands to `buildAggregate`. */
export type { BucketObservation, CommitMeta, FileChange } from './commits.ts';
/** Contributor identity: login or hashed email, and bot detection. */
export { fnv1a, isBot, personOf } from './identity.ts';
/** Paths to modules: the ignore list, prefixes and auto depth. */
export { FILE_CAP, MAX_DEPTH, autoDepth, collapsePrefix, isIgnored, prefixOf } from './paths.ts';
/** Time buckets (week, month, quarter, year; UTC, weeks start on Monday). */
export {
  bucketIndex,
  bucketLabel,
  bucketStarts,
  chooseUnit,
  nextStart,
  startOf,
} from './buckets.ts';
/** Observations to a schema-v1 aggregate, with storage caps. */
export { MAX_PEOPLE, MAX_PREFIXES, OTHER_BOTS_ID, OTHERS_ID, buildAggregate, type AggregateMeta } from './aggregate.ts';
/** Typed errors shared by the browser, the Worker and scripts. */
export * from './errors.ts';
/** Parses what a user pastes into an `owner/name` reference. */
export { parseRepoInput, type RepoRef } from './github/repoRef.ts';
/** A minimal GitHub REST client that tracks the rate limit. */
export { createClient, parseLastPage, type ClientOptions, type GitHubClient, type GitHubResponse } from './github/client.ts';
/** The request-budget planner: full or sampled mode. */
export * from './github/plan.ts';
/** Fetches and aggregates a public repository within the request budget. */
export { fetchRepoAggregate, type FetchOptions, type FetchProgress } from './github/fetchRepo.ts';
/** Aggregate to drawable rivers: dimension, depth, top N and bots. */
export { selectView, type River, type RiverView, type ViewOptions, type ViewTransfer } from './view.ts';
/** Rivers to SVG geometry: lanes, ribbons, transfers, labels and markers. */
export {
  layoutRivers,
  type LayoutOptions,
  type RiverLayout,
  type RiverShape,
  type TransferShape,
} from './layout/layout.ts';
/** The phone chart's label placement (until R6). */
export { LABEL_HEIGHT, placeLabels, type LabelBand, type LabelInput, type PlacedLabel } from './layout/labels.ts';
/** River names on the desktop chart: slanted in course, level, at the mouth, above the peak. */
export { placeRiverNames, type Box, type NameInput, type NameKind, type NameRiver, type RiverName } from './layout/riverNames.ts';
/** Stable lane order. */
export { laneOrder } from './layout/order.ts';
/** Ribbon path helpers (mid-x cubic Béziers). */
export { curve, edgeAt, extend, link, ribbonPath, type Point } from './layout/ribbons.ts';
/** Small scale functions (no d3). */
export { band, clipDomain, linear, quantile, sqrt, type Scale } from './layout/scale.ts';
/** River palettes and the colour-vision checks behind them. */
export * from './palette.ts';
/** Deterministic era boundaries. */
export { eraCount, eraFeatures, partition, segmentEras, type Segment } from './eras/segment.ts';
/** The compact, person-free summary sent to the model. */
export { SUMMARY_MAX_BYTES, ident, summarizeForEras, type EraFacts, type EraSummary } from './eras/summary.ts';
/** Template era names used when AI is unavailable. */
export { heuristicEras } from './eras/heuristic.ts';
/** Strict validation of era summaries and model output. */
export { IDENT, NOTE_MAX, TITLE_MAX, checkEras, clampText, parseEraSummary, parseNames } from './eras/validate.ts';
/** The single model request: model id and messages. */
export { ERA_MODEL, eraRequest } from './eras/prompt.ts';
