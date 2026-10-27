# Architecture

repo-rivers turns a GitHub repository's history into a timeline-sankey: modules or contributors as rivers that widen, merge and split over time. It is a React + Vite single-page app, a pure TypeScript core, and one Cloudflare Worker that serves the built app and two small APIs.

## Modules

| Path | What it holds |
|---|---|
| `src/core/` | Pure, isomorphic TypeScript: no DOM, no Worker globals. Runs unchanged in the browser, the Worker and Node scripts. The public API is `src/core/index.ts`. |
| `src/core/github/` | Input parsing (`repoRef.ts`), request planning (`plan.ts`), the REST client and `fetchRepoAggregate` (`fetchRepo.ts`). |
| `src/core/*.ts` | Paths to modules (`paths.ts`), people (`identity.ts`), time buckets (`buckets.ts`), the stored format (`schema.ts`), aggregation (`aggregate.ts`), view selection (`view.ts`), screen-reader text (`summary.ts`), river tones (`tones.ts`) and colour science (`palette.ts`). |
| `src/core/layout/` | `layoutRivers`: scales, lane order, stacking, ribbons, transfers, river names, guides, and the phone transpose. |
| `src/core/eras/` | Era boundaries (`segment.ts`), the person-free model input (`summary.ts`), the prompt, strict validation and template names (`heuristic.ts`). |
| `src/data/` | `loadRepo` (Worker stream, then browser fallback), the localStorage cache, era fetching and URL state. |
| `src/ui/` | React components, hooks, motion, error and loading states, theme tokens (`theme/tokens.css`). |
| `src/samples/` | Built-in aggregates committed as JSON, so the first view needs no network or key. |
| `worker/src/` | The Worker: routing (`index.ts`), `/api/repo` (`repoRoute.ts`), `/api/eras` (`erasRoute.ts`), KV helpers, the daily AI budget, HTTP helpers. |
| `scripts/` | Sample and era builders, the bundle size check, and the headless-browser harness (`scripts/browser/`). |

## Data flow

```
 pasted URL or owner/name
          |
   parseRepoInput ──> RepoRef
          |
   loadRepo (src/data) ──── GET /api/repo/:owner/:name (NDJSON progress, KV cache)
          |          \_____ fallback: fetchRepoAggregate in the browser, user's own quota
          v
   RepoAggregate (schema v1)  <── also: committed samples in src/samples/
          |
   selectView ──> RiverView (modules or contributors, depth, top N, bots)
          |
   layoutRivers ──> RiverLayout (SVG paths, names, transfers, markers)
          |
   RiverChart / PhoneChart (React, SVG at real pixel width)

   RepoAggregate ──> segmentEras ──> summarizeForEras ──> POST /api/eras ──> era titles
                                           \___ heuristicEras when AI is off or fails
```

Inside `fetchRepoAggregate`: a 3-request probe sizes the history; small repositories are read commit by commit, larger ones with one GitHub compare per bucket. Touched paths become modules (kept to depth 3, so the depth control needs no refetch) and commits become contributors (a login, or a hash of the email). Both are counted into week, month, quarter or year buckets, with transfers recorded when files move between modules.

## Design decisions

- **A request budget, not best effort.** Unauthenticated GitHub access allows 60 requests per hour, so a fetch is planned up front to spend at most 55 and caps the timeline at 24 buckets (48 with a token). The plan is a pure function, which makes it easy to test.
- **Honest sampling.** A compare lists at most 300 files. Buckets past that cap are marked in `source.truncatedBuckets`, estimated from a few commit details, and drawn as estimated. A move-finder spends a few extra requests to recover large reorganisations the cap would hide.
- **Cache at two levels.** The Worker keeps aggregates in KV (`agg:v1:owner/name`): fresh for 24 h, then revalidated with one conditional request, kept for 30 days. The browser keeps a small localStorage LRU. A popular repository costs GitHub almost nothing after the first visit.
- **Graceful fallback.** If the Worker is down or busy, the browser fetches directly with the visitor's own quota. The samples always work offline.
- **Lean AI.** Era boundaries come from deterministic dynamic programming. The model only writes a title and note per era, from a summary of at most 2 KB with no person names or commit messages. Both ends of the call are strictly validated, results are cached in KV for 90 days by a hash of the summary, and a site-wide cap (`DAILY_AI_CAP`, 200 calls per UTC day, `worker/src/budget.ts`) bounds cost. Template names cover every failure.
- **Per-IP rate limit.** `/api/*` is limited to 20 requests per minute per IP (`API_LIMIT` in `wrangler.jsonc`).
- **No hue in the data marks.** Rivers are one of two blues of different lightness, assigned by greedy two-colouring so neighbours differ. "Other" is hatched, bots have a dotted outline, transfers are dashed arrows. Identity is carried by direct labels and stable lane order, so the chart reads the same under any colour-vision deficiency; contrast and CVD separation are unit-tested.
- **Real pixels.** The SVG is laid out at the container's CSS width and never scaled, so labels keep their size on a phone. On a phone the same layout is transposed so time runs down the page.
- **Small footprint.** Runtime dependencies are `react` and `react-dom`; layout, colour science and the timeline-sankey are hand-written. `pnpm size` enforces bundle budgets.
- **One stored format.** `RepoAggregate` is the only thing cached or committed. Views and layouts are derived on demand, so changing the drawing never invalidates a cache.

## Extending

[docs/EXTENDING.md](EXTENDING.md) covers the public API, using the core from Node, adapters for other data sources, and theming. The visual encoding and its layout rules are in [docs/viz/rivers.md](viz/rivers.md); the visual design in [docs/DESIGN.md](DESIGN.md); deployment in [docs/DEPLOY.md](DEPLOY.md).

Typical changes:

- A new data source: produce `BucketObservation[]` and call `buildAggregate`, or emit a `RepoAggregate` that passes `parseAggregate`.
- A new view option: extend `selectView` in `src/core/view.ts`; the layout and UI take a `RiverView` and need no change.
- A new sample: add it to `SAMPLES` in `scripts/build-samples.ts`, run `pnpm samples:build` and `pnpm eras:build`, then list it in `src/samples/index.ts`.

## Tests

- **Unit tests (Vitest)** sit next to the code as `*.test.ts` in `src/`, `scripts/` and `worker/test/`. They run in Node, one worker at a time (`pnpm test`).
- **Fixtures:** `tests/fixtures/demo.json` (a small aggregate for layout snapshots) and `tests/fixtures/github/` (a recorded and a fake GitHub API). Worker tests use in-memory fakes for KV, AI and rate limits.
- **Guards:** `scripts/docs.test.ts` checks TSDoc on the public API, Markdown links and that EXTENDING.md snippets match `docs/snippets/`; `scripts/ci-workflow.test.ts` and `scripts/wrangler-config.test.ts` keep CI and the Worker config honest.
- **Browser checks:** `pnpm check:browser --phase <n>` serves `dist/` and drives one headless Chrome offline with axe; the checks live in `scripts/browser/checks/`.
- **Deploy dry run:** `pnpm run check:deploy` bundles the Worker without deploying.
