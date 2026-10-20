# repo-rivers: plan

> Paste a GitHub repository URL, or pick a sample, and see its history as rivers. Modules and contributors flow across time, widen when they get busy, and merge or split when the code is reorganised. A few short era annotations name the key periods.

This is the binding plan for the main agent, the implementer and the verifier. It follows `CLAUDE.md`. If the two ever disagree, `CLAUDE.md` wins and the main agent records the conflict in `docs/DECISIONS.md`.

Reading order: section 1 (who it is for) and section 2 (what "done" means) first. Section 4 (architecture) is the reference the implementer works from. Section 6 lists the phases, and each phase is one PR.

---

## 1. User first

### Who the user is
- **Primary: a developer about to work with an unfamiliar open-source project.** They are going to contribute to it, adopt it, or review it, and they want a feel for how it evolved: which parts are alive, which parts went quiet, when it was reorganised, and who carried which era.
- **Secondary: maintainers and devrel/tech writers** writing an anniversary post, a "state of the project" talk, or a README section. They want one striking picture of the project's history that they can screenshot or link.
- **Tertiary: students and data-viz people** who like looking at how software grows.

### The moment they reach for it
"I have a repo URL in my clipboard and five minutes. I don't want to clone it, install anything, or read 9,000 commits." They open repo-rivers in a browser tab.

### Fastest path to the first "wow"
Zero install, no account, no API key. The landing page already shows a real, pre-aggregated sample (Vite's history), drawn from committed JSON. It needs no network, renders in under a second, and has its eras labelled.

### The first 30 seconds
| Time | What happens |
|---|---|
| 0-1 s | The page loads. The wordmark and the one-line pitch appear. The **Vite** sample's rivers draw themselves from left to right (about 700 ms; drawn instantly when reduced motion is on). Era brackets above the chart read something like "Birth of a dev server", "Plugin ecosystem grows", "Monorepo and Rolldown". |
| 1-8 s | The user hovers or tabs onto the widest river. It highlights while the others dim, and a readout says `packages/vite · 2023 Q2 · 41,210 lines changed · 58% of the quarter`. A dashed arrow shows files moving from one module into another. |
| 8-12 s | The user clicks the **Svelte** sample chip. The `src` river visibly flows into `packages/svelte` during the monorepo move. Switching the toggle to **Contributors** shows who carried each era. |
| 12-30 s | The user pastes `https://github.com/owner/name` and presses Enter. A progress line reports "Reading history · 18 of 51 requests · sampled because this repo has 9,412 commits". The river appears 5-20 s later, followed shortly by AI-named eras. The URL becomes shareable (`?repo=owner/name`). |

Nothing in the first 12 seconds touches the network.

---

## 2. Product goal and acceptance criteria

### Product goal
repo-rivers turns a GitHub repository's commit history into one readable picture: a timeline-sankey where each river is a top-level module (or a contributor). A river's thickness is how much work happened there in each time bucket, and dashed tributaries show files moving between modules as the code is reorganised. A deterministic pipeline does all the counting. A language model is used once per repository, only to give short names to eras that the code has already detected. The web app is pure React + Vite with a tiny runtime footprint. Built-in samples work offline with no key. Pasting a URL uses a Cloudflare Worker that respects GitHub's unauthenticated rate limits by sampling, shows progress, and caches aggregates. It is MIT-licensed and packaged as a project people want to star.

### Product acceptance criteria (whole product)
Each criterion is testable. The phase that first satisfies it is in brackets.

**Functional**
- **F1** The landing page renders a built-in sample (default: Vite) as a timeline-sankey of modules without any network request beyond the static assets of the page. [P1 synthetic, P3 real]
- **F2** At least three built-in samples (Vite, Svelte, Express) are selectable with one click or by keyboard, and are deep-linkable with `?sample=<id>`. [P5]
- **F3** The input accepts `owner/name`, `https://github.com/owner/name`, URLs with trailing `/tree/...` and `.git`, and `git@github.com:owner/name.git`. Anything else shows an inline error without making a request. [P3 parser, P8 UI]
- **F4** Submitting a valid repo shows determinate progress ("n of m requests") and then renders the repo. The URL updates to `?repo=owner/name`, and reloading that URL reproduces the view (from cache when available). [P8]
- **F5** The pipeline maps commits to touched paths, then to modules at a configurable depth (auto, 1, 2 or 3) and to contributors, then to time buckets (unit auto-chosen: week, month, quarter or year), then to flows. Module depth can be changed in the UI without refetching. [P2, P6]
- **F6** Bot accounts are flagged and excluded from contributor rivers by default, with a toggle to include them. Merge commits are excluded from commit counts. Both rules are unit-tested. [P2, P6]
- **F7** Large repositories are sampled so that an unauthenticated fetch uses no more than 55 GitHub API requests. The UI shows a "sampled" badge that explains what was sampled. [P3, P8]
- **F8** Reorganisations (renamed or moved files) appear as transfers: dashed, arrow-headed tributaries from the source river to the target river, with a readout like "212 files moved from src to packages/svelte". [P2, P4, P6]
- **F9** 3-6 era annotations are anchored to bucket ranges. Era boundaries are computed deterministically. Era names come from one cached Workers AI call, or from deterministic templates when AI is unavailable. The UI is fully usable with no eras at all. [P9]
- **F10** The error states covered are: repo not found or private, empty repo, too little history, GitHub rate limit (with the reset time and a "try in your browser" fallback), network offline, and Worker unavailable. Each has specific copy and a next action. [P8]
- **F11** A Modules | Contributors toggle switches the dimension, and keyboard focus and the selected bucket are kept where possible. [P6]

**Accessibility**
- **A1** Meaning never relies on color alone. Rivers have direct labels, and lane order is stable. Hover and focus highlight the active river and dim the others. Transfers are dashed and arrow-headed. "Other" uses a hatch pattern, and bots use a dotted outline.
- **A2** The river palette passes an automated CVD test. Under protanopia, deuteranopia and tritanopia simulation (Machado 2009, severity 1.0), every pair of palette colors that can be adjacent has CIEDE2000 ΔE ≥ 8. Every river fill has ≥ 3:1 contrast against the chart background, and all text has ≥ 4.5:1, in both light and dark themes. [P4]
- **A3** Everything is keyboard-operable. Tab reaches the input, sample chips, controls, the chart and the eras. Inside the chart, arrow keys move between rivers (Up/Down) and buckets (Left/Right), Home/End jump to the ends, Enter pins and Escape clears. Focus is always visible (≥ 3:1 focus indicator). [P6]
- **A4** Screen readers get a deterministic prose summary of the chart (linked via `aria-describedby`), an `aria-live="polite"` readout of the focused river and bucket, and a "View as table" data table with caption and row and column headers. [P6]
- **A5** `prefers-reduced-motion: reduce` disables the reveal animation, the progress animation and the hover transitions. Nothing flashes. [P5, P8]
- **A6** axe-core reports zero serious or critical violations on the sample view, the loading state and every error state. [P6, P8, P9]

**Performance and fast load**
- **P1** Initial JavaScript is ≤ 100 KB gzip (React included), checked by `pnpm size`. The display font is ≤ 40 KB woff2. Each sample JSON is ≤ 50 KB raw and is loaded lazily, except the default sample. [P5]
- **P2** On the local preview server, the time from navigation to the `rivers-rendered` performance mark is < 1500 ms in headless Chrome. [P5]
- **P3** `layoutRivers` handles 48 buckets × 13 rivers in < 50 ms in the Vitest benchmark test (budget assertion, generous to avoid flakiness). [P4]

**Offline sample and no-key operation**
- **O1** With every non-localhost request blocked in the browser, the default sample and all built-in samples render, and the console shows no errors. [P1, P3, P5]
- **O2** No API key or account is needed for anything a first-time user does. Built-in samples need nothing at all. Pasting a URL works unauthenticated, through the Worker or, if the Worker is rate-limited or unavailable, directly from the browser against the user's own GitHub quota. An optional `GITHUB_TOKEN` exists only as a Worker secret. [P7, P8]
- **O3** When Workers AI is unavailable (local dev, no binding, error), eras fall back to deterministic labels, and nothing errors. [P9]

**Dependencies and quality**
- **D1** The only runtime dependencies are `react` and `react-dom`. No d3, no lodash, no state or CSS frameworks. Every dev dependency is justified in DECISIONS.md. [all]
- **D2** `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass on every phase. The public core API (`src/core/index.ts`) is typed and has TSDoc on every export. [all, P10]
- **D3** The CI definition lives in `ci/github-workflow.yml` and nothing is under `.github/workflows/`. [P2]

**Open-source packaging**
- **S1** The repo contains an MIT `LICENSE`, a README that sells the project in 10 seconds, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, issue and PR templates, `CHANGELOG.md`, `docs/GOOD_FIRST_ISSUES.md`, `docs/EXTENDING.md`, an `examples/` gallery, a social preview image, and `docs/LAUNCH.md`. [P1, P10, P11]
- **S2** No secrets are in git. There is no mention of Sean's employer, nothing finance-related, and no decorative 3D. The deploy has not been executed, and `pnpm run check:deploy` succeeds. [all, P12]

---

## 3. Design direction: "survey map"

repo-rivers should look like a **hydrographic survey chart**: a calm, paper-like map on which the rivers are the only saturated things. It should not look like a dashboard template, and it is not a dark neon dev-tool.

### Typography
- **Display and wordmark: Fraunces** (SIL OFL, variable). Self-host a woff2 subset (Latin, weights 500-650, `opsz` axis kept) at ≤ 40 KB, using `font-display: swap`. Use it only for the wordmark, the headline and era titles. Era titles are set in italic, like names written on a map.
- **Body: the system UI stack** (`system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`). It costs zero bytes.
- **Data labels, module paths and numbers: the system mono stack** (`ui-monospace, "SF Mono", "Cascadia Code", Menlo, monospace`) with `font-variant-numeric: tabular-nums`. Module paths read as coordinates.
- Scale: 14 / 16 / 20 / 28 / 40 px, with a line height of 1.5 for body text and 1.15 for display text.

### Color
- **Light theme, "paper":** background `#F5F1E8`, ink text `#1B2330`, secondary text `#4F5868` (≥ 4.5:1 on paper), graticule lines `#DDD5C4`, focus ring `#1B2330` with a 2 px offset.
- **Dark theme, "night chart"** (`prefers-color-scheme: dark`): background `#10161F`, text `#E9E4D8`, secondary text `#A7AFBC`, graticule `#253041`.
- **River palette:** 8 categorical hues derived from Okabe-Ito (orange, sky blue, bluish green, yellow, blue, vermillion, reddish purple, plus a deep teal), with lightness tuned per theme until the P4 palette test passes A2. The yellow in particular is darkened toward ochre on paper. "Other" is ink at 30% with a 45° hatch pattern. Bots use their hue with a dotted outline.
- **Assignment:** colors go to rivers in lane order with a fixed rotation, so adjacent lanes never share a hue, and the same river keeps its color when the depth changes, wherever possible. Color is always the *secondary* channel. Identity is carried by the label, the lane position and highlighting.

### Layout
- A single centred column, max 1200 px wide. From top to bottom:
  1. Header: logo mark + wordmark on the left and a GitHub link on the right.
  2. Hero line (Fraunces 28-40 px): "See any GitHub repo's history as rivers."
  3. Input row: URL field ("github.com/owner/name"), a **Draw rivers** button, and the sample chips (Vite · Svelte · Express).
  4. Era track: brackets with italic titles over their time ranges.
  5. Chart card on paper. Light vertical graticule lines at year boundaries (like meridians), small-caps year labels along the bottom axis, and direct river labels set in mono with a paper-colored halo.
  6. Readout bar (aria-live), then the controls row: Modules | Contributors · Depth auto/1/2/3 · Include bots.
  7. Prose summary, then "View as table".
  8. Footer: how it works, source note ("data from the GitHub API; sampled"; "era names written by AI"), and a link to the repo.
- On mobile (≤ 640 px), the chart card scrolls horizontally inside a keyboard-focusable region with `min-width: 720px`. Labels stay at each river's peak, and the controls wrap. A vertical orientation is a roadmap item.

### Motion
- Reveal: a clip-path from left to right over the rivers, 700 ms, `cubic-bezier(.22,1,.36,1)`, once per dataset.
- Hover and focus dimming: opacity over 120 ms.
- Progress: a thin line with a slow dash flow (stroke-dashoffset).
- Under `prefers-reduced-motion: reduce`, everything is instant and the progress line is static. There is no parallax, nothing loops after load, and there is no decorative 3D.

### Logo and wordmark
- **Mark:** three tapered strokes converging into one widening ribbon. It reads as a river confluence and as a git merge. It is a single-color SVG on a 24×24 grid, used for the favicon (`public/favicon.svg`) and the header.
- **Wordmark:** `repo rivers` in lowercase Fraunces at 600 weight, with tight tracking. The space between the two words is optically narrowed.

### States
- **Default:** never empty. The default sample is always shown.
- **Loading:** a faint graticule skeleton plus the progress line, "Reading history · 18 of 51 requests", and a one-line note about why sampling happens. A Cancel button aborts the fetch.
- **Errors:** each one has an icon-free, plain-language title, one sentence of explanation and 1-2 actions:
  - "Couldn't find owner/name": it may be private. Actions: check spelling, try a sample.
  - "GitHub's hourly limit reached": resets at 14:05. Actions: try from your browser (uses your own quota), try a sample.
  - "This repo has too little history to draw": fewer than 10 commits or fewer than 3 buckets.
  - "Empty repository".
  - "You're offline": samples still work.
- **Partial data:** a "sampled" badge with a popover that explains the sampling, the requests used, and any buckets truncated by GitHub's 300-file compare limit.

---

## 4. Architecture

### 4.1 Repository layout (target)
```
index.html
public/                 favicon.svg, fonts/fraunces-subset.woff2, _headers (P12)
src/
  main.tsx, App.tsx
  core/                 pure, isomorphic TypeScript (browser, Worker, Node scripts); no React, no DOM
    index.ts            public API (typed, TSDoc)
    schema.ts           RepoAggregate v1 types + parseAggregate()
    commits.ts          CommitMeta / FileChange / BucketObservation types
    identity.ts         contributor ids, bot detection
    paths.ts            ignore rules, prefixes, auto depth
    buckets.ts          unit choice, bucket starts (UTC), indexing
    aggregate.ts        buildAggregate(observations, meta)
    view.ts             selectView(aggregate, options) -> RiverView
    github/             repoRef.ts, client.ts, plan.ts, fetchRepo.ts
    layout/             scale.ts, order.ts, layout.ts, ribbons.ts, labels.ts
    palette.ts          palette + CVD/contrast math (Machado matrices, CIEDE2000)
    summary.ts          deterministic prose summary
    eras/               segment.ts, summary.ts (AI input), heuristic.ts, validate.ts
  data/                 loadRepo.ts (Worker stream + browser fallback), cache.ts (localStorage LRU)
  ui/                   React components (thin): RiverChart, Axis, EraTrack, Readout, Controls,
                        DataTable, RepoInput, Progress, states/, Wordmark, theme/tokens.css
  samples/              index.ts registry + vite.json, svelte.json, express.json
worker/
  src/index.ts          router: /api/health, /api/repo/:owner/:name, /api/eras
  src/repoRoute.ts, erasRoute.ts, kv.ts, http.ts
  test/                 Vitest with fake KV/AI/fetch
scripts/
  browser/run.mjs, lib.mjs, checks/smoke.mjs, checks/phase-<n>.mjs
  build-samples.ts, build-eras.ts, size-check.mjs
ci/github-workflow.yml
wrangler.jsonc, .dev.vars.example, .npmrc, tsconfig*.json, .oxlintrc.json, vite.config.ts
docs/ PLAN.md STATUS.md DECISIONS.md viz/rivers.md EXTENDING.md GOOD_FIRST_ISSUES.md LAUNCH.md DEPLOY.md screenshots/
examples/ README.md + gallery images
```

### 4.2 Data model (schema v1, defined in P1 and stable afterwards)
```ts
export type BucketUnit = 'week' | 'month' | 'quarter' | 'year';

export interface RepoAggregate {
  schemaVersion: 1;
  repo: { owner: string; name: string; defaultBranch: string; headSha: string; description?: string };
  generatedAt: string;                       // ISO 8601
  source: SourceInfo;
  time: { unit: BucketUnit; starts: string[]; end: string }; // bucket i = [starts[i], starts[i+1] ?? end)
  totals: { commits: number[] };             // non-merge commits per bucket (bots included)
  paths: {
    prefixes: string[];                      // path prefixes up to depth 3; "" = root files
    weights: number[][];                     // [prefix][bucket] lines changed (capped, ignore-listed)
    transfers: Transfer[];                   // files moved between prefixes
  };
  contributors: { people: Person[]; commits: number[][] }; // [person][bucket]
  eras?: Era[];
}
export interface SourceInfo {
  mode: 'full' | 'sampled' | 'synthetic';
  authenticated: boolean;
  commitsTotal: number; commitsSeen: number; requests: number;
  truncatedBuckets: number[];                // compare responses capped at 300 files
  notes: string[];                           // human-readable caveats shown in the "sampled" popover
}
export interface Person { id: string; label: string; bot: boolean } // id = GitHub login, else "anon:<fnv1a(email)>"
export interface Transfer { from: number; to: number; bucket: number; files: number } // prefix idx; moved during bucket
export interface Era { start: number; end: number; title: string; note: string; source: 'ai' | 'heuristic' }
```
`parseAggregate(unknown)` is a hand-written validator (no zod). It checks the version, the array lengths against `starts.length`, finite non-negative numbers, and in-range indices, and returns a typed value or throws an `AggregateError` with the path of the problem.

The view model is derived and never stored:
```ts
selectView(agg, { dimension: 'modules' | 'contributors', depth: 'auto' | 1 | 2 | 3, topN = 10, includeBots = false }): RiverView
// RiverView = { buckets: {start, end, label}[]; rivers: River[]; transfers: ViewTransfer[]; metric: 'lines changed' | 'commits' }
// River = { id, label, kind: 'module' | 'contributor' | 'other', bot: boolean, values: number[], total, peak }
```
Prefixes are collapsed to the chosen depth, and transfers inside the same collapsed module disappear. The top N by total are kept and the rest are summed into "other". Storage caps: at most 60 prefixes (the smallest roll up into their parent) and at most 30 people (the rest go into an "others" person). This keeps samples ≤ 50 KB.

### 4.3 Pipeline (deterministic, `src/core`)
1. **Observations.** Each source produces `BucketObservation { bucket, commits: CommitMeta[], files: FileChange[], scale }`.
   - `CommitMeta` = sha, date, parent count, author login, name, email and user type.
   - `FileChange` = path, previousPath, status, changes.
   - `scale` extrapolates when only part of a bucket's commits were seen.
2. **Paths to modules.**
   - Ignore list: lockfiles (`pnpm-lock.yaml`, `package-lock.json`, `yarn.lock`, `Cargo.lock`, `go.sum`, `composer.lock`, `Gemfile.lock`, `poetry.lock`), `dist/`, `build/`, `vendor/`, `node_modules/`, `*.min.*`, `*.map`, `__snapshots__/`, `*.snap`.
   - Per-file weight is capped at 2,000 changed lines per bucket.
   - Prefixes are stored to depth 3.
   - **Auto depth** is 1, unless one depth-1 container directory (`packages`, `apps`, `crates`, `libs`, `modules`, `plugins`, `src`) holds > 50% of the weight. Then it is 2.
   - Root files map to `""`, which is labelled "(root files)".
3. **Contributors.**
   - The id is the GitHub login, else a hash of the email address. Raw emails are never stored.
   - Bot rules: `type === 'Bot'`, a login ending in `[bot]`, a login matching `/(^|[-_])bot$/i`, or a known list (dependabot, renovate, github-actions, greenkeeper, allcontributors, pre-commit-ci, codecov).
   - Merge commits (`parents > 1`) are excluded from commit counts.
   - Co-authored-by trailers are ignored in v1 (roadmap).
4. **Buckets.** Use the smallest unit in week → month → quarter → year that gives ≤ `maxBuckets` buckets (24 unauthenticated, 48 with a token). Weeks start on Monday, all in UTC. A history shorter than 3 buckets or with fewer than 10 commits is reported as "too little history".
5. **Flows.** Module values come from `paths.weights` and contributor values from `contributors.commits`. Self-continuation between buckets is implicit. Transfers (renames or moves) are explicit cross-river flows, counted in files.

**GitHub fetch strategy** (`src/core/github`, isomorphic, `fetch` injected):
- `client.ts` sends `Accept: application/vnd.github+json` and `X-GitHub-Api-Version: 2022-11-28`. The token is optional. It parses `x-ratelimit-remaining` and `x-ratelimit-reset`, and maps errors to typed classes: `NotFound` (404), `RateLimited { resetAt }` (403 or 429 with remaining 0, or a secondary limit), `EmptyRepo` (409), `Network`, `Upstream`.
- Probe, 3 requests:
  1. `GET /repos/{o}/{r}` for the default branch, description and visibility.
  2. `GET /repos/{o}/{r}/commits?sha={branch}&per_page=1`. This gives the head commit, and its `Link: rel="last"` page number equals the total commit count.
  3. `GET .../commits?sha={branch}&per_page=1&page={last}` for the first commit's date.
- `plan.ts` (pure) chooses:
  - **Full mode** if `total ≤ budget − 3 − ceil(total/100)`. It lists all commits (100 per page) and fetches the detail of each non-merge commit. This is exact.
  - **Sampled mode** otherwise. Make B−1 boundary lookups (`commits?until=<boundary>&per_page=1`), then B `GET /compare/{base}...{head}` calls. Compare returns `total_commits` (exact), up to 250 commits (authors, parents and bots, scaled up when there are more), and up to 300 files with `status`, `previous_filename` and `changes`. Requests = 2B + 2, so B ≤ 24 for a budget of 55. The base of the first bucket is the first commit. Its own initial-import diff is deliberately excluded and noted. Buckets that hit the 300-file cap are listed in `truncatedBuckets`. With a token, up to 10 commit details per truncated bucket are added to correct module shares.
- Budgets: unauthenticated 55 (5 kept as headroom), token 600. If the remaining quota at probe time is lower than the plan needs, B shrinks. If even the minimum plan (B=3) doesn't fit, `RateLimited` is raised before any further requests.
- `onProgress({ done, total, label })` fires after each request, and an `AbortSignal` is honoured.

### 4.4 Layout and rendering (`src/core/layout`, `src/ui/RiverChart.tsx`)
- **Abstract coordinates.** Time runs along x, with bucket centres evenly spaced. Rivers stack along y. The renderer maps these to SVG.
- **Thickness.** Use a linear scale `k = (height − gaps) / max_t Σ values`. An option for `sqrt` is unit-tested but off by default. River gaps are 3 px, and a river with value 0 in a column tapers to a point (its spring or mouth).
- **Lane order** is stable across time. Rivers are sorted by onset bucket and then by total. A river born from a transfer is inserted next to its source river, so splits sit beside their parent. "Other" is always last. Columns are centred vertically, which gives a gentle river-like meander.
- **Ribbons.** Each river is one closed path. Between adjacent columns, the top and bottom edges are cubic Béziers with horizontal tangents (control points at mid-x). This is the "solution 2" ribbon from timeline-sankey, rotated to horizontal and given different widths at each end.
- **Transfers.** A dashed curve leaves the source river's edge at column t and enters the target at t+1, with an arrowhead marker (the timeline-sankey cross-link idea). Stroke width is 1-6 px on its own files scale. Transfers carrying ≥ 5% of the column's moved files are always visible. The rest appear on hover or focus.
- **Labels.** Each river's label sits at its peak column if the thickness there is ≥ 14 px (inside, mono, with a paper halo). Otherwise it goes outside at the river's last non-zero column, connected by a leader line. Greedy collision avoidance drops labels that would overlap, and dropped labels are still available on focus, in the readout and in the table.
- **Interaction state** is pointer- and keyboard-driven: `{ river, bucket, pinned }`. Pointer x maps to a bucket. The focused or hovered river is drawn at full opacity, the others at 0.18, and its transfers become visible.

### 4.5 Cloudflare pieces
- **One Worker with static assets** (`wrangler.jsonc`):
  - `assets.directory: "./dist"`, `not_found_handling: "single-page-application"` and `run_worker_first: ["/api/*"]`.
  - Bindings: `RIVERS_KV` (KV namespace) and `AI` (Workers AI).
  - Optional secret: `GITHUB_TOKEN`.
  - Recommended (P7): a rate-limiting binding `API_LIMIT`, about 20 requests per minute per IP on `/api/*`.
- **`GET /api/repo/:owner/:name`** returns an NDJSON stream of `{"type":"progress",...}` lines, followed by `{"type":"result","aggregate":...}` or `{"type":"error","code":"not_found"|"rate_limited"|"empty"|"too_little"|"upstream","resetAt"?:...}`.
  - On a KV hit that is less than 24 h old, it returns the cached result immediately.
  - On a hit older than 24 h, it revalidates the head with one conditional request (`If-None-Match`). A 304 is free.
  - Owner and name are validated against `^[A-Za-z0-9-]{1,39}$` and `^[A-Za-z0-9._-]{1,100}$`.
- **`POST /api/eras`** has body `{ summary: EraSummary }`. Strict validation means no free text is accepted, so the endpoint cannot be used as a general LLM proxy. The response is `{ eras: Era[] }`.
- **`GET /api/health`** returns `{ ok, ai: boolean, token: boolean }`. This lets the UI and verifier see capabilities without exposing secrets.
- **The browser fallback** (P8): when the Worker answers `rate_limited` while unauthenticated, or the Worker is unreachable (for example when the static preview runs without wrangler), the browser runs the same `fetchRepoAggregate` directly against `api.github.com`, which allows CORS, using the user's own 60/h quota. The UI says so. The result is stored in the browser cache only and is never uploaded to the shared KV (no cache poisoning).

### 4.6 Where AI is used (and only there)
- **Exactly one place: naming eras.** Deterministic code (`eras/segment.ts`) picks the 3-6 era boundaries. It uses an optimal partition by dynamic programming over buckets that minimises within-segment variance of each module's share of activity, plus activity level. k = clamp(round(B/8), 3, 6). The model only writes a title (≤ 32 characters) and a note (≤ 120 characters) for each given segment.
- **Model input:** an `EraSummary` of ≤ 2 KB. For each segment it contains the date range, the top 4 modules with their shares, the trend (rising or falling), counts of contributors and newcomers, the largest transfers and the activity level. It has **no person names and no commit messages.**
- **Call:** `env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', { messages, response_format: { type: 'json_schema', json_schema }, max_tokens: 400, temperature: 0.2 })`. The output is validated: segment count matches, lengths are clamped, markup is stripped, and anything invalid falls back to the heuristic.
- **Heuristic fallback** (`eras/heuristic.ts`), for example "The packages/vite era" with "58% of changes; 31 contributors; src moved to packages/". The UI marks AI-written titles with a small text label, "named by AI".
- **Samples:** `scripts/build-eras.ts` calls the Workers AI REST API once per sample, only when `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` are in the environment. Otherwise it writes heuristic eras. Either way the result is committed, so samples remain offline.

### 4.7 Caching
| What | Where | Key | Freshness |
|---|---|---|---|
| Aggregates (Worker path) | KV `RIVERS_KV` | `agg:v1:{owner}/{name}` (lowercased) → `{aggregate, headSha, etag, fetchedAt}` | 24 h fresh, then a conditional revalidation of the head; `expirationTtl` 30 days |
| Era names | KV | `eras:v1:{sha256(canonical EraSummary)}` | Immutable; TTL 90 days |
| Aggregates (browser) | `localStorage` LRU, 8 entries | `rr:agg:v1:{owner}/{name}` | 24 h |
| Static assets | Workers assets | hashed filenames | `public/_headers`: `immutable` for `/assets/*` |
| Samples | bundled JSON (lazy chunks) | | Rebuilt by script |

R2 and D1 are not needed (aggregates are ≤ 100 KB). Raw GitHub responses are not cached in production. The sample script caches raw responses on disk in `.cache/github/` (gitignored) so that reruns don't spend quota.

### 4.8 Public typed API (`src/core/index.ts`)
`parseRepoInput`, `fetchRepoAggregate`, `planFetch`, `buildAggregate`, `parseAggregate`, `selectView`, `layoutRivers`, `segmentEras`, `heuristicEras`, `summarizeForEras`, `describeView` (prose summary), plus all of the types above. Everything is pure, documented with TSDoc, and usable from Node 22 scripts (native type stripping, `.ts` import extensions, `erasableSyntaxOnly`).

### 4.9 geekplux/timeline-sankey: reuse finding
I cloned it read-only into /tmp, read all of `src/` (about 1,700 lines), and deleted the clone afterwards.
- **License:** BSD-3-Clause, © 2022 GeekPlux. It is compatible with MIT, provided we keep the notice for any code we copy.
- **What it is:** a Next.js 12 demo app, not a library (the README says so). It uses d3 (only `scaleLinear`), lodash, zustand, leva, Tailwind and react-responsive.
- **Its model:** *entities with year spans* (`year_start` / `year_finish`) placed in category columns. Time runs vertically. Node width is constant. Links are "influenced" relations, drawn as filled Bézier ribbons ("direct links") or as dashed quadratic curves with a triangle arrowhead ("cross links").
- **Its layout:** greedy interval packing places non-overlapping spans side by side within each column. Hover highlights a node and its neighbours by fading everything else to 0.05 opacity.
- **It does not have** value-weighted thickness, per-bucket flows, label collision handling, or proper keyboard and screen-reader support. Keyboard support is `tabIndex` on a `foreignObject` with a `router.push`, and there are no tests.
- **Decision: rewrite, reusing ideas but not code.**
  - Reuse as ideas:
    1. The ribbon geometry: a cubic Bézier with both control points at the mid-coordinate (its "solution 2"), which we generalise to different widths at each end.
    2. The dashed cross-link with an arrowhead, used for our transfers.
    3. Hover-highlight-neighbours by dimming the rest.
    4. A time axis with grid lines, per-category columns, and a responsive/mobile view.
    5. The data-driven link-path computation, separated from rendering (`compute.ts` vs the component).
  - Rewrite from scratch:
    1. The data model (weighted time-bucketed flows).
    2. The layout (stacked weighted rivers, stable lane order, transfers).
    3. Labels.
    4. Interaction and accessibility.
    5. The framework: pure Vite + React, no Next.js.
    6. Dependencies: no d3 or lodash. We write about 30 lines of scale code ourselves.
  - Because no code is copied, no BSD notice is required. The README credits timeline-sankey as inspiration. If the implementer ever copies a snippet verbatim, they must add `THIRD_PARTY_NOTICES.md` with the BSD-3 text.

### 4.10 Open technical decisions (recommendations for DECISIONS.md)
| # | Decision | Recommendation | Alternatives |
|---|---|---|---|
| T1 | Node version | The box has Node 20.19, but Vitest 5 and wrangler 4.151 need Node ≥ 22. Add `.npmrc` with `use-node-version=22.23.3`; pnpm already has it installed, so this works offline. Set `engines.node >=22.12`, and `packageManager: pnpm@9.15.9`. | Pin Vitest 4 and an older wrangler (worse) |
| T2 | TypeScript | `typescript@^7` (native `tsc`, fast `--noEmit`). If the typecheck shows incompatibilities, pin `~5.9` and record it. | Stay on 5.9 |
| T3 | Hosting shape | A single Worker with static assets plus `/api/*` | Pages + Functions (legacy path) |
| T4 | Vite ↔ Worker integration | Keep them separate: `vite build` to `dist/`, and `wrangler dev` serves `dist/` and the API. Vite's dev proxy sends `/api` to `:8787`. This keeps `vite preview` light (RAM) and avoids remote-only AI bindings at preview time. | `@cloudflare/vite-plugin` (revisit after v1) |
| T5 | GitHub strategy | A 3-request probe, then full mode for small repos and compare-based sampled mode for large ones (2B+2 requests). | Per-commit sampling only (noisy module shares); GraphQL (needs a token) |
| T6 | Unauthenticated Worker egress | Cloudflare egress IPs are shared, so unauthenticated Worker calls may hit GitHub's per-IP limit. Mitigate with a KV cache plus the browser fallback against the user's own quota. Recommend Sean sets `GITHUB_TOKEN` as a Worker secret at deploy time (optional). | Require a token (violates no-key) |
| T7 | Bucket units | Add quarter and year to week and month for long histories; `maxBuckets` 24 unauthenticated, 48 with a token. This keeps the chart readable (≤ 48 columns). | Week and month only (too many requests or columns for 10-year repos) |
| T8 | Module depth | Store prefixes to depth 3 and collapse client-side; auto depth for monorepos | Refetch per depth |
| T9 | Metrics | Modules: lines changed, capped at 2,000 per file per bucket, with the ignore list. Contributors: non-merge commits. Transfers: files moved. | Commit counts per module (not available cheaply in sampled mode) |
| T10 | Lean AI | Deterministic segmentation; the LLM only names eras; one call per repo, cached by summary hash; no names or commit messages sent | LLM picks eras (costlier, non-deterministic, harder to test) |
| T11 | Storage | KV only | R2 (unneeded at ≤ 100 KB), D1 |
| T12 | Runtime dependencies | `react` and `react-dom` only | d3-shape/d3-scale (saves about 60 lines, costs KB) |
| T13 | Fonts | A self-hosted Fraunces subset; system stacks for body and mono | Google Fonts CDN (breaks offline, privacy) |
| T14 | Running TS scripts | Node 22 native type stripping (`node scripts/build-samples.ts`) | `tsx` (an extra dependency) |
| T15 | Worker tests | Plain Vitest with fake KV, AI and fetch | `@cloudflare/vitest-pool-workers` (heavy on RAM) |
| T16 | Samples | `vitejs/vite`, `sveltejs/svelte` (its monorepo move gives visible transfers), `expressjs/express` (a long, steady history). Generation may use `GITHUB_TOKEN=$(gh auth token)` passed only as an environment variable for fidelity; it must also work unauthenticated. | d3/d3, preactjs/preact |
| T17 | Agent skill or CLI | **Out of scope for v1.** It adds no first-run value, and the anatomy bar (SKILL.md + kit + references + audit scripts + evals) would cost about 2 phases. Listed on the roadmap. | Add a `repo-rivers` skill |
| T18 | Abuse protection | A rate-limiting binding on `/api/*` and a strict `EraSummary` schema | None |

---

## 5. Shared conventions for every phase

**Commands** (the verifier runs all of them, in order):
```
pnpm install --frozen-lockfile
pnpm lint          # oxlint --deny-warnings (config .oxlintrc.json)
pnpm typecheck     # tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.node.json [&& -p tsconfig.worker.json from P7]
pnpm test          # vitest run (single worker: maxWorkers 1; no watch)
pnpm build         # vite build -> dist/
pnpm check:browser --phase <n>
```

**Headless-browser harness** (built in P1, extended by later phases):
- `scripts/browser/run.mjs` runs as follows:
  1. Spawns `vite preview --host 127.0.0.1 --port 4173 --strictPort` in its own process group, prints the PID, and polls until it gets HTTP 200 (30 s timeout).
  2. Launches **one** Chrome via `playwright-core` with `executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome'`, `headless: true` and `--disable-dev-shm-usage`.
  3. Runs `checks/smoke.mjs`, then `checks/phase-<n>.mjs`.
  4. Writes PNGs to `docs/screenshots/phase-<n>/`.
  5. Fails on any console error, page error, or request to a non-127.0.0.1 host. **Offline is the default.** A check must opt in with `allowNetwork` and nothing in v1 does; Worker and GitHub responses are mocked with `page.route`.
  6. Always closes the browser and kills the server process group, in `finally` and on SIGINT/SIGTERM. It then confirms that port 4173 is free and prints "cleanup ok".
- `scripts/browser/lib.mjs` provides:
  - `shoot(page, name, viewport)` for desktop 1280×800 and mobile 390×844.
  - `shootCvd(page, name)`, which injects SVG `feColorMatrix` filters (Machado 2009, severity 1.0) on `<html>` and writes `-protanopia`, `-deuteranopia` and `-tritanopia` PNGs.
  - `tabTo(page, selector)`.
  - `runAxe(page)` (from P6), which injects `axe-core` from `node_modules` and fails on serious or critical violations.
- Screenshot names: `NN-<state>-<variant>.png`, for example `01-sample-desktop.png` or `05-keyboard-focus-desktop.png`.
- The verifier also checks `ps` for leftover `vite`, `chrome` and `workerd` processes.

**Specialists:** UI phases (P5, P6, P8, P9, P11) get an `a11y-reviewer` pass before the verifier signs off. Visualization phases (P4, P5, P6, P9) get a `dataviz-designer` spec beforehand (P4) or a screenshot review afterwards. Data phases (P2, P3, P7) use `git-history-analyst` as the implementer or as a reviewer.

**Budget:** ≤ about 400 changed lines per PR, excluding `pnpm-lock.yaml`, `src/samples/*.json`, `tests/fixtures/**`, screenshots, font binaries and the Code of Conduct boilerplate. If a phase overruns, the implementer moves the overflow into a "Known gaps" item for the next phase rather than growing the PR.

---

## 6. Phases

### Phase 1: toolchain and built-in sample path
- **Branch:** `phase-1-toolchain`
- **Goal:** a working pnpm + Vite + React + TS project with lint, typecheck, test, build and a headless-browser smoke check. A committed synthetic sample is validated and drawn by a minimal SVG renderer, offline.
- **Scope:**
  - `package.json`:
    - `type: module`, `engines`, `packageManager`.
    - Runtime dependencies: react and react-dom only.
    - Dev dependencies: vite, @vitejs/plugin-react, typescript, vitest, oxlint, playwright-core, @types/react and @types/react-dom.
    - Scripts: `dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `check:browser`.
  - `.npmrc` (T1), `pnpm-lock.yaml`.
  - `vite.config.ts`, including the Vitest config (node environment, `maxWorkers: 1`).
  - `tsconfig.json`, `tsconfig.app.json` (DOM, strict, `allowImportingTsExtensions`, `erasableSyntaxOnly`, `noEmit`) and `tsconfig.node.json` (scripts and config).
  - `.oxlintrc.json`, `index.html`, `src/main.tsx`, `src/App.tsx`.
  - `src/core/schema.ts` (the full v1 types from §4.2 and `parseAggregate`) and `src/core/schema.test.ts`.
  - `src/samples/index.ts`: a registry `{ id, title, load(): Promise<RepoAggregate> }`.
  - `src/samples/demo.json`: synthetic, 24 monthly buckets, 5 modules, 1 transfer, 4 people, `source.mode: 'synthetic'`. It is labelled "Demo (synthetic)" in the UI.
  - `src/ui/MinimalRivers.tsx`: a throwaway stacked-band SVG, ≤ 80 lines. It has `data-testid="river-chart"`, one `path[data-river]` per module, `role="img"` and an `aria-label`. It calls `performance.mark('rivers-rendered')`.
  - `scripts/browser/{run.mjs,lib.mjs,checks/smoke.mjs,checks/phase-1.mjs}`.
  - `LICENSE` (MIT, "Copyright (c) 2026 GeekPlux and repo-rivers contributors").
  - `.gitignore` adds `.cache/`.
- **Acceptance criteria:**
  1. Each of the five commands in §5 exits with 0 on a clean checkout.
  2. `parseAggregate` accepts `demo.json`. It rejects a wrong `schemaVersion`, a mismatched array length, a negative or NaN weight, and an out-of-range transfer index. These are 5+ unit tests.
  3. `pnpm check:browser --phase 1` renders ≥ 5 `path[data-river]` with every non-localhost request blocked. There are zero console errors. It writes `01-sample-desktop.png`, `02-sample-mobile.png` and `03-sample-{protanopia,deuteranopia,tritanopia}.png`, exits with 0 and prints "cleanup ok".
  4. After the run, `ps aux | grep -E 'vite|chrome'` shows nothing started by the run.
  5. `pnpm ls --prod --depth 0` lists only react and react-dom.
- **Verifier:** the §5 commands. Look at the 5 screenshots. Kill-test: send SIGINT to `check:browser` mid-run and confirm cleanup still happens.
- **Risks:**
  - Node 20 vs 22: mitigated by `.npmrc` (T1).
  - TS 7 quirks: T2 fallback.
  - Chrome sandbox flags in the container: add `--no-sandbox` only if launch fails, and record it.
- **Size:** about 380 lines.

### Phase 2: aggregation core (pure pipeline)
- **Branch:** `phase-2-aggregate-core`
- **Goal:** deterministic, unit-tested conversion of commit observations into a `RepoAggregate`, and of a `RepoAggregate` into a `RiverView`. No UI change.
- **Scope:**
  - `src/core/commits.ts`.
  - `identity.ts`: ids and bot detection.
  - `paths.ts`: the ignore list, prefixes to depth 3, `autoDepth`, the per-file cap.
  - `buckets.ts`: `chooseUnit(span, maxBuckets)`, `bucketStarts`, `bucketIndex`, UTC weeks starting Monday.
  - `aggregate.ts`: `buildAggregate(observations, meta)`, including the 60-prefix and 30-person caps and the scale factor.
  - `view.ts`: `selectView` with collapse, top-N plus "other", and bots.
  - `src/core/index.ts`, the first public exports.
  - Tests with small inline fixtures.
  - `ci/github-workflow.yml`: Node 22, pnpm, install, lint, typecheck, test and build, plus `check:browser --phase 1` using the runner's `google-chrome`.
  - A STATUS follow-up line is added by the main agent.
- **Acceptance criteria:**
  1. Unit tests cover:
     - Bucket unit choice at the boundaries (weeks up to `maxBuckets`, then months, quarters, years).
     - Monday-based weeks across a year boundary.
     - Ignore list and per-file cap.
     - Depth collapse 1/2/3 and auto depth on a monorepo fixture.
     - Bot detection (all rules) and email hashing (no raw email in the output).
     - Merge exclusion.
     - Renames turning into transfers, and transfers within one module disappearing after collapse.
     - Top-N plus "other" preserving column totals.
     - Scale extrapolation.
  2. `buildAggregate` output passes `parseAggregate`.
  3. `selectView` is pure: the same input gives deeply equal output, and the input is not mutated (frozen fixture).
  4. There is no file under `.github/workflows/`, and `ci/github-workflow.yml` is valid YAML (parsed in a test or with `node -e`).
- **Verifier:** the §5 commands. Read the tests against the criteria. `check:browser --phase 1` is still green (regression), and the previous screenshots are unchanged in meaning.
- **Risks:** over-engineering. Keep the functions small, and leave anything GitHub-specific to P3.
- **Size:** about 400 lines (roughly 230 code and 170 tests).

### Phase 3: GitHub client, sampling planner and real samples
- **Branch:** `phase-3-github-samples`
- **Goal:** fetch any public repo within the unauthenticated budget, and generate and commit three real samples. The default sample becomes Vite.
- **Scope:**
  - `src/core/github/repoRef.ts` (`parseRepoInput`, F3).
  - `client.ts` (headers, rate-limit parsing, typed errors, Link parsing, optional token, ETag support).
  - `plan.ts` (pure, §4.3).
  - `fetchRepo.ts` (`fetchRepoAggregate(ref, { token?, budget, maxBuckets, fetch, onProgress, signal })`), which builds observations and calls `buildAggregate`.
  - Tests use recorded, trimmed JSON responses in `tests/fixtures/github/` and a fake `fetch`.
  - `scripts/build-samples.ts` (Node 22 type stripping):
    - Usage: `pnpm samples:build [--only vite] [--budget 55]`.
    - It reads `GITHUB_TOKEN` from the environment only, caches raw responses in `.cache/github/`, and prints requests used and remaining.
    - Unauthenticated, if the quota runs out it exits non-zero with the reset time and resumes from the cache on the next run.
  - `src/samples/{vite,svelte,express}.json`. The registry is updated and `demo.json` moves to `tests/fixtures/`.
- **Acceptance criteria:**
  1. `parseRepoInput` passes the table of valid and invalid inputs from F3.
  2. Planner tests:
     - The unauthenticated plan never exceeds 55 requests for totals of 10, 500, 10k and 200k commits over spans of 2 months, 3 years and 15 years.
     - The token plan stays ≤ 600.
     - Full mode is chosen for 40 commits.
     - The plan shrinks when the remaining quota is low.
     - `RateLimited` is raised before fetching when even B=3 doesn't fit.
  3. Client tests map 404, 409, 403 with remaining 0, 429 and a secondary-limit 403 to the right typed errors, and parse `resetAt` and the Link last-page count.
  4. `fetchRepoAggregate` with the recorded fixtures gives a valid aggregate. Progress events are monotonic and `total` matches the plan. An abort stops further requests.
  5. Each committed sample passes `parseAggregate` and is ≤ 50 KB. `source` honestly states the mode, `requests`, `truncatedBuckets` and notes. The Svelte sample contains at least one transfer into `packages/svelte`. The script output (request counts) is pasted into the PR description.
  6. Browser: the default view renders the Vite sample offline (`01-vite-desktop.png`, `02-vite-mobile.png`).
- **Verifier:** the §5 commands. Run `node scripts/build-samples.ts --only express --budget 55` once with `.cache/github` pre-seeded, or as a real unauthenticated run if the quota allows. Confirm the script prints requests ≤ 55 and the regenerated JSON is equivalent apart from `generatedAt`. Then the screenshots.
- **Risks:**
  - Compare API details (the 300-file cap, how commits and files paginate) must be confirmed with 1-2 live requests and recorded in DECISIONS.md.
  - Quota exhaustion on the shared box IP. Use the cache and resume, with an optional token from `gh auth token` passed as an environment variable only, never written.
  - A sample that turns out visually dull: swap the repo (T16 alternatives) and record the change.
- **Size:** about 400 lines plus fixtures.

### Phase 4: river layout engine and palette
- **Branch:** `phase-4-river-layout`
- **Goal:** pure, tested geometry for the timeline-sankey, plus a CVD-validated palette, following a written visual spec.
- **Pre-step (main agent):** `dataviz-designer` writes `docs/viz/rivers.md` (encoding table, scales, layout, labels, interaction, motion, states, acceptance criteria) consistent with §3 and §4.4. It is committed on this branch first.
- **Scope:**
  - `src/core/layout/scale.ts` (linear, sqrt and band; about 30 lines, no d3).
  - `order.ts` (stable lanes, born-next-to-parent).
  - `layout.ts`: `layoutRivers(view, { width, height, gap, scale, labelMinThickness })` returns `{ columns, rivers: { id, path, edges, color }[], transfers: { path, width, from, to }[], labels }`.
  - `ribbons.ts` (the Bézier path builder) and `labels.ts` (peak or end placement, greedy collisions).
  - `src/core/palette.ts`: the light and dark river palettes, `assignColors`, the Machado matrices, sRGB↔Lab, CIEDE2000 and WCAG contrast.
  - Tests.
- **Acceptance criteria:**
  1. Thickness is proportional to value (within 0.5 px). No column exceeds the height. Zero values taper to a point. Paths contain no NaN.
  2. Lane order is deterministic and stable across columns. A river born from a transfer sits next to its source. "Other" is last.
  3. Transfer endpoints lie on their source and target river edges.
  4. Labels never overlap (bounding boxes are pairwise disjoint), and every unplaced label is reported in `labels.dropped`.
  5. The palette test passes A2 for both themes, including the "other" hatch base color.
  6. Benchmark: 48×13 in < 50 ms (P3).
  7. A snapshot test of the path strings for `demo.json` guards against regressions.
- **Verifier:** the §5 commands. Read `docs/viz/rivers.md` and confirm the code matches it. A browser regression run of phase 1 checks.
- **Risks:** label placement complexity. Keep it greedy, and the rest is in the table and readout.
- **Size:** about 400 lines.

### Phase 5: the river chart and visual identity
- **Branch:** `phase-5-river-chart`
- **Goal:** the real timeline-sankey in the "survey map" identity, with sample switching. This is the first "wow".
- **Scope:**
  - `src/ui/RiverChart.tsx` (SVG from `layoutRivers`, hatch and dotted patterns, transfers with an arrow marker, labels with a halo, the reveal animation), `Axis.tsx` (graticule and year labels) and `useSize.ts` (ResizeObserver).
  - `src/ui/theme/tokens.css` (§3 tokens, light and dark, reduced motion), `Wordmark.tsx`, `public/favicon.svg` and `public/fonts/fraunces-subset.woff2`, with its OFL license file alongside.
  - `SampleSwitcher.tsx` (chips, `?sample=` deep link, lazy JSON chunks).
  - The App layout (header, hero line, chart card, footer). `MinimalRivers` is removed.
  - `scripts/size-check.mjs` (`pnpm size`: gzip of initial JS ≤ 100 KB, font ≤ 40 KB, samples ≤ 50 KB).
- **Acceptance criteria:**
  1. All three samples render. `?sample=svelte` deep-links. Switching samples doesn't reload the page.
  2. Direct labels are visible for the largest rivers. Svelte's transfer is visible as a dashed arrow.
  3. `pnpm size` passes.
  4. `rivers-rendered` is under 1500 ms after navigation (measured in the check).
  5. With reduced motion emulated (`page.emulateMedia({ reducedMotion: 'reduce' })`), the chart is fully drawn on first paint (screenshot at t=50 ms).
  6. The dark theme renders (`colorScheme: 'dark'` screenshot).
  7. The page makes no external requests (the font is self-hosted).
  8. `dataviz-designer` reviews the screenshots against `docs/viz/rivers.md`, and its findings are fixed or listed as known gaps.
- **Verifier:** the §5 commands and `pnpm size`. Screenshots:
  - `01-vite-desktop`, `02-vite-mobile`, `03-svelte-desktop`, `04-express-desktop`
  - `05-dark-desktop`, `06-reduced-motion-desktop`
  - `07-vite-{protanopia,deuteranopia,tritanopia}`
- **Risks:**
  - Font subsetting needs a tool. Use `pyftsubset` if available, otherwise the upstream pre-subset Latin woff2, and record which.
  - Mobile label crowding: horizontal scroll per §3.
- **Size:** about 400 lines plus the font binary.

### Phase 6: interaction and accessibility
- **Branch:** `phase-6-interaction-a11y`
- **Goal:** explorable by mouse, keyboard and screen reader, with dimension, depth and bot controls.
- **Scope:**
  - `src/ui/useRiverFocus.ts` (state `{river, bucket, pinned}`, keyboard map per A3, pointer-to-bucket hit testing).
  - Highlight and dim styles, with transfers revealed on focus.
  - `Readout.tsx` (aria-live polite; numbers come only from the view model).
  - `Controls.tsx`: Modules | Contributors as a radio group, Depth auto/1/2/3 as a radio group (modules only), and an Include bots checkbox.
  - `src/core/summary.ts` (`describeView`: prose summary, unit-tested), `DataTable.tsx` (inside `<details>`, caption, `th scope`) and the chart's `role="group"`, `aria-roledescription` and `aria-describedby`.
  - `axe-core` as a dev dependency and `runAxe` in the harness, plus `checks/phase-6.mjs`.
- **Acceptance criteria:**
  1. A keyboard-only walk works: Tab into the chart, Up/Down/Left/Right/Home/End/Enter/Escape behave per A3, and the readout text updates and is announced. A visible focus ring is present and has ≥ 3:1 contrast.
  2. Hovering a river dims the others to 0.18 and shows its transfers. A click pins; Escape or a background click unpins.
  3. Changing the dimension or depth re-lays out the chart without a refetch, and keeps the focused bucket.
  4. Include bots toggles the bot rivers (the dotted outline is visible).
  5. The table values equal the view model (unit test). The summary mentions the period, the top river and its share, the busiest bucket, and the largest transfer.
  6. axe shows zero serious or critical violations.
  7. `a11y-reviewer` passes, or its open items are listed as known gaps.
- **Verifier:** the §5 commands. Screenshots:
  - `01-hover-desktop`, `02-keyboard-focus-desktop`, `03-pinned-desktop`
  - `04-contributors-desktop`, `05-depth2-desktop`, `06-bots-on-desktop`
  - `07-table-open-desktop`, `08-mobile-focus`
  - `09-focus-{protanopia,deuteranopia,tritanopia}`
  - The axe JSON summary goes in the report.
- **Risks:** SVG focus semantics differ between browsers. Use a single focusable `<g tabindex=0>` with roving state and `aria-activedescendant`-style announcements through the live region, rather than many tab stops.
- **Size:** about 400 lines.

### Phase 7: Cloudflare Worker API and KV cache
- **Branch:** `phase-7-worker-api`
- **Goal:** `/api/health` and the streaming `/api/repo/:owner/:name` with a KV cache, an optional token, and validation. Static assets are served from the same Worker.
- **Scope:**
  - `worker/src/{index.ts,repoRoute.ts,kv.ts,http.ts}`.
  - `wrangler.jsonc`: name `repo-rivers`, `compatibility_date` `2026-10-01`, assets per §4.5, a `RIVERS_KV` binding with a placeholder id plus `preview_id` (local only), and a rate-limit binding if supported locally.
  - `tsconfig.worker.json`, `worker-configuration.d.ts` (from `wrangler types`), and `.dev.vars.example` (`GITHUB_TOKEN=`).
  - Scripts: `dev:worker` (`wrangler dev --port 8787`) and `typecheck` extended. Vite dev proxy for `/api`.
  - `worker/test/*.test.ts` using fake KV and recorded GitHub fetches.
  - `wrangler` is added as a dev dependency.
- **Acceptance criteria:**
  1. Unit tests:
     - Invalid owner or name returns 400.
     - A KV hit under 24 h makes no GitHub requests.
     - A stale hit sends `If-None-Match`, and a 304 extends freshness.
     - A miss streams progress lines then a result, and writes KV.
     - GitHub rate limiting returns an NDJSON error with code `rate_limited` and `resetAt`.
     - `GITHUB_TOKEN` is sent only when set, and never echoed in responses or logs.
     - `/api/health` reports `token: boolean` only.
  2. `wrangler dev` starts locally (background, PID recorded). `curl /api/health` gives 200. `curl /` serves the SPA. One live `curl -N /api/repo/geekplux/timeline-sankey` streams a valid result (a small repo, ≤ 10 requests). A second call is a KV hit. Then the process is killed and `ps` is checked.
  3. There are no secrets in git, and `.dev.vars` is gitignored.
- **Verifier:** the §5 commands (including the worker typecheck), then the `wrangler dev` curl checks above. Watch RAM: no browser while wrangler runs. `check:browser --phase 1` is still green.
- **Risks:**
  - workerd memory. Run wrangler alone and kill it promptly.
  - The live GitHub call could be rate-limited on the box IP. Accept `rate_limited` as the expected-path evidence if the quota is exhausted, and note it.
  - Rate-limit binding support in local dev may be partial; if so, fall back to no-op locally and record it.
- **Size:** about 400 lines.

### Phase 8: paste-a-URL flow, progress and states
- **Branch:** `phase-8-paste-url`
- **Goal:** the second half of the first 30 seconds: paste, progress, river, shareable URL, and graceful errors.
- **Scope:**
  - `src/ui/RepoInput.tsx` (labelled field, inline validation via `parseRepoInput`, Enter submits).
  - `src/data/loadRepo.ts`:
    - Reads the NDJSON stream from the Worker.
    - Falls back to the in-browser `fetchRepoAggregate` on `rate_limited` while unauthenticated, or when the Worker is unreachable. The UI states this fallback clearly.
    - Supports `AbortController` cancellation.
  - `src/data/cache.ts` (localStorage LRU of 8 entries with 24 h freshness).
  - `Progress.tsx`, `SourceNote.tsx` (sampled badge and popover) and `src/ui/states/ErrorState.tsx` (all F10 variants), plus URL state (`?repo=`, history push and popstate).
  - `checks/phase-8.mjs` mocks `/api/repo` and `api.github.com` via `page.route` from fixtures.
- **Acceptance criteria:**
  1. Pasting `https://github.com/sveltejs/svelte/tree/main` (mocked) gives progress "n of m", then the chart, and the URL becomes `?repo=sveltejs/svelte`. Reloading renders from the localStorage cache with no `/api` call.
  2. Invalid input shows an inline error tied to the field via `aria-describedby`, and makes no request.
  3. Each F10 state renders with its copy and actions (mocked). The rate-limit state shows the local reset time, and its "Try from your browser" action runs the fallback (mocked GitHub).
  4. The Worker being unreachable triggers the automatic browser fallback, with a notice.
  5. Cancel aborts the stream and restores the previous chart.
  6. The progress animation is static under reduced motion. axe is clean on the loading and error states. `a11y-reviewer` passes.
- **Verifier:** the §5 commands. Screenshots:
  - `01-input-invalid`, `02-progress-desktop`, `03-progress-mobile`, `04-result-svelte`, `05-sampled-popover`
  - `06-error-not-found`, `07-error-rate-limited`, `08-error-too-little`, `09-error-offline`, `10-fallback-notice`
  - All with offline mocks. No live network.
- **Risks:**
  - NDJSON parsing across chunk boundaries: unit-test the line splitter.
  - localStorage quota: catch errors and degrade to no cache.
- **Size:** about 400 lines.

### Phase 9: era annotations (lean AI)
- **Branch:** `phase-9-era-annotations`
- **Goal:** 3-6 era brackets above the rivers. Boundaries are deterministic, names come from one cached Workers AI call, and the heuristic fallback means the UI never waits on AI.
- **Scope:**
  - `src/core/eras/{segment.ts,summary.ts,heuristic.ts,validate.ts}`.
  - `worker/src/erasRoute.ts` (§4.6, KV by hash) and the `ai` binding in `wrangler.jsonc`.
  - `src/ui/EraTrack.tsx`: brackets with italic titles, notes on focus or hover, faint background bands, a "named by AI" label, keyboard-focusable eras, and descriptions in the summary and table.
  - The client flow: heuristic eras render immediately, then AI eras swap in with no layout shift (same segments).
  - `scripts/build-eras.ts` (Workers AI REST if credentials are in the environment, otherwise heuristic). The three sample JSONs are updated.
- **Acceptance criteria:**
  1. `segmentEras` is deterministic, returns 3-6 contiguous segments covering all buckets, and finds known change-points in synthetic fixtures (unit tests).
  2. `summarizeForEras` output is ≤ 2 KB and contains no person ids, labels or emails (test). The validator rejects free text and overlong identifiers.
  3. Worker tests (fake AI):
     - A cache hit makes no AI call.
     - Invalid AI JSON falls back to `{ eras: heuristic, source: 'heuristic' }`.
     - Titles and notes are clamped.
     - Exactly one AI call per new summary hash.
     - A missing `AI` binding falls back to the heuristic (O3).
  4. Samples ship eras offline: `source: 'ai'` if credentials were present, otherwise `heuristic`, and the PR states which. A missing Cloudflare credential is logged as a non-blocking STATUS follow-up.
  5. The era track is keyboard-reachable, and axe is clean. The bracket text has ≥ 4.5:1 contrast. The "named by AI" label is present only for AI titles.
- **Verifier:** the §5 commands. Screenshots:
  - `01-eras-vite-desktop`, `02-eras-mobile`, `03-era-focus-desktop`
  - `04-eras-ai-swap` (mocked `/api/eras`), `05-eras-heuristic-fallback` (`/api/eras` returns 503)
  - `06-eras-{protanopia,deuteranopia,tritanopia}`
  - Plus a `dataviz-designer` review of the era layout and an `a11y-reviewer` pass.
- **Risks:**
  - Workers AI is not available locally without a Cloudflare login. All tests use a fake binding, and the live call is first exercised after deploy.
  - Model JSON-mode quirks: strict validation plus the fallback.
  - Name drift: the model ID is in one constant.
- **Size:** about 400 lines.

### Phase 10: open-source docs and contribution kit
- **Branch:** `phase-10-oss-docs`
- **Goal:** a repo that sells itself in 10 seconds and is easy to contribute to.
- **Scope:**
  - **`README.md`:**
    - The one-line pitch.
    - A hero screenshot (from P9 screenshots), replaced with a GIF in P11.
    - A live-demo placeholder: "Live demo: coming soon (link after deploy)".
    - Quick start (`pnpm i`, `pnpm dev`, `pnpm dev:worker`), where Node 22 is handled automatically by pnpm.
    - "How it works": a 5-step pipeline, the sampling and rate-limit explanation, and "where AI is used (one place)".
    - An accessibility statement, privacy notes (no tracking, no emails stored), the roadmap, credits (timeline-sankey, BSD-3, as inspiration; Okabe-Ito; Fraunces OFL) and the license.
  - **`CONTRIBUTING.md`:** setup, scripts, how to verify (including `check:browser`), resource etiquette (kill servers), how to add a sample, and the commit and PR style.
  - **`CODE_OF_CONDUCT.md`:** Contributor Covenant 2.1, with the contact pointing to GitHub's private reporting or a maintainer contact on the GitHub profile.
  - **`SECURITY.md`.**
  - **`.github/ISSUE_TEMPLATE/{bug_report.yml,feature_request.yml,config.yml}`** and **`.github/pull_request_template.md`.** Nothing goes under `.github/workflows/`.
  - **`CHANGELOG.md`:** Keep a Changelog format, with `[Unreleased]` summarising P1-P9.
  - **`docs/GOOD_FIRST_ISSUES.md`:** 8-12 scoped candidates, each with files and acceptance criteria. Examples: vertical mobile orientation, co-authored-by attribution, export SVG/PNG, a custom ignore list in the URL, an i18n date format, a GitLab adapter.
  - **`docs/EXTENDING.md`:** the public API with examples (Node script usage of `fetchRepoAggregate` and `selectView`), adding a sample, adding a source adapter (the `BucketObservation` contract), and theming via tokens.
  - TSDoc completion on `src/core/index.ts` exports.
- **Acceptance criteria:**
  1. All S1 files exist except `examples/`, the social preview and LAUNCH (those come in P11).
  2. The README's first screen (rendered on GitHub) has the pitch, the image, the demo placeholder and quick start.
  3. Every code snippet in EXTENDING.md type-checks: it is extracted into `docs/snippets/*.ts`, which is included in `tsconfig.node.json`.
  4. Every export in `src/core/index.ts` has TSDoc. Enforce this with a small test that parses the file and checks for `/**` before each `export`.
  5. Links resolve: a link-check test over the Markdown files for relative paths.
  6. No employer mention and nothing finance-related (grep).
- **Verifier:** the §5 commands. Read the README as Markdown, and check that its relative links and images exist (the link-check test, plus a manual read of the first screen). A regression `check:browser --phase 9` run.
- **Risks:** docs drifting from the code. The snippet typecheck mitigates this.
- **Size:** about 400 lines of docs, plus the CoC boilerplate (excluded).

### Phase 11: gallery, social preview, hero GIF and launch kit
- **Branch:** `phase-11-gallery-launch`
- **Goal:** shareable assets and a ready-to-post (but unposted) launch kit.
- **Scope:**
  - `?embed=social` view: a minimal chrome view (wordmark, pitch, chart) at 1280×640.
  - `scripts/browser/checks/gallery.mjs` (`pnpm gallery`): renders the three samples (desktop light, dark and contributors views) into `examples/*.png`, renders `docs/social-preview.png` (1280×640), and captures frames of the reveal and a hover pass. ffmpeg (`/usr/bin/ffmpeg`, optional) turns the frames into `docs/hero.gif` (≤ 2 MB). Without ffmpeg it falls back to a PNG.
  - `examples/README.md`: a gallery with captions telling each sample's story, and deep links (`?sample=`).
  - README hero updated to the GIF.
  - `docs/LAUNCH.md`:
    - A Show HN title and body.
    - An X post plus a 3-post thread draft.
    - 3 demo scenarios: "onboarding to Svelte", "Express's long steady river", "a maintainer's anniversary post".
    - A comparison table against Gource, GitHub Insights (contributors and code frequency), git-of-theseus, Hercules/labours, githubnext/repo-visualizer and githistory.xyz: what each shows, setup cost, and offline/no-key support.
    - A clear note: "do not post until Sean approves".
- **Acceptance criteria:**
  1. `pnpm gallery` runs one browser, writes all assets, and cleans up (prints "cleanup ok").
  2. `docs/social-preview.png` is exactly 1280×640 and ≤ 1 MB. It is legible, with a CVD screenshot of it for the a11y-reviewer.
  3. The GIF is ≤ 2 MB and ≤ 8 s.
  4. `LAUNCH.md` has all the listed parts, no posting happens, and there are no superlatives about competitors (factual comparison).
  5. The `embed=social` view passes axe.
- **Verifier:** the §5 commands, `pnpm gallery`, a file-size and dimension check (`node -e` reading PNG headers), screenshots `01-embed-social`, `02-gallery-readme-assets` (montage optional), and a `ps` check.
- **Risks:** GIF size. Lower the fps, reduce the palette (`palettegen`), and crop.
- **Size:** about 300 lines plus assets.

### Phase 12: Cloudflare deployment prep (STOP for Sean's approval)
- **Branch:** `phase-12-deploy-prep`
- **Goal:** everything ready to deploy with one command, verified by a dry run. **No deploy.**
- **Scope:**
  - `wrangler.jsonc` finalised: KV and AI bindings, the rate-limit binding, `observability.enabled`, `compatibility_date`, and comments marking the `RIVERS_KV` id placeholder.
  - `public/_headers`:
    - CSP: `default-src 'self'; connect-src 'self' https://api.github.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'`.
    - `immutable` caching for `/assets/*`.
    - `Referrer-Policy` and `X-Content-Type-Options`.
  - The `package.json` script **`"check:deploy": "wrangler deploy --dry-run --outdir .wrangler/dry-run"`**, run after `pnpm build`.
  - `docs/DEPLOY.md`:
    - Prerequisites: `wrangler login`, `wrangler kv namespace create RIVERS_KV` and pasting the id, an optional `wrangler secret put GITHUB_TOKEN`, and Workers AI enabled on the account.
    - **The exact deploy command:** `pnpm build && pnpm exec wrangler deploy`.
    - Post-deploy smoke: `curl https://<worker>/api/health`, plus opening the samples.
    - Rollback: `wrangler rollback`.
    - Optional: generating AI sample eras with `scripts/build-eras.ts` after the deploy.
  - README demo link stays a placeholder until deploy.
  - **There is no `deploy` script in package.json**, so nothing can be run accidentally.
- **Acceptance criteria:**
  1. `pnpm build && pnpm run check:deploy` succeeds, writes `.wrangler/dry-run/` (gitignored), and reports a Worker bundle under 1 MiB.
  2. A full-stack local run: `wrangler dev` serves `dist/` plus the API. A single headless Chrome loads `/` offline-mocked for external hosts, the sample renders, `/api/health` gives 200, and the CSP causes no console violations. Then everything is killed (`ps` check).
  3. The PR description contains the exact deploy command and the prerequisites, and states "awaiting Sean's approval to deploy". The main agent sets `STATE: DONE` with that note.
  4. Hard-rule audit: no secrets (grep for tokens and keys), no `.github/workflows/`, no Next/Remix, no employer mention, nothing finance-related, no decorative 3D, and no deploy executed (shell history or wrangler output shows only `--dry-run`).
- **Verifier:** the §5 commands, `pnpm run check:deploy`, the `wrangler dev` browser check (screenshot `01-fullstack-sample-desktop.png`, `02-fullstack-health.png` of the JSON), and the hard-rule greps.
- **Risks:**
  - The dry run needs a KV id format. Use a clearly fake 32-hex placeholder, documented in DEPLOY.md.
  - The settings deny list blocks `wrangler deploy` without `--dry-run`. That is intended, and the dry-run form must not be confused with it.
- **Size:** about 200 lines.

---

## 7. Out of scope (v1)
- Private repositories, OAuth sign-in, and user-entered tokens in the browser.
- GitLab, Bitbucket and local `git log` adapters. The adapter contract is documented in EXTENDING.md and listed as good first issues.
- Branch selection: only the default branch is analysed.
- Co-authored-by attribution and mailmap-style identity merging beyond login and email hash.
- File-level drill-down, code-ownership or blame analytics, and per-commit browsing.
- Vertical (mobile) orientation and SVG/PNG export (roadmap and good first issues).
- An agent skill or CLI (T17). An npm package release of `src/core` is on the roadmap.
- Any analytics or tracking, any finance-related feature or data, and decorative 3D.
- Posting launch content anywhere, and the actual deploy (both need Sean).

## 8. Risks
| Risk | Impact | Mitigation |
|---|---|---|
| GitHub's unauthenticated 60/h limit, and shared Cloudflare egress IPs | URL fetches fail for many users | Sampling (≤ 55 requests), KV cache, a browser fallback using the user's own quota, an optional Worker token (T6), a clear rate-limit state with the reset time |
| The compare API's 300-file and 250-commit caps bias module shares (alphabetical file order) | A misleading river width in busy buckets | `truncatedBuckets` disclosed in the UI; token mode adds commit-detail sampling; finer buckets when budget allows |
| Node 20 on the box vs Node 22 needed by tooling | The toolchain fails | `.npmrc use-node-version=22.23.3` (T1) |
| RAM (~2 GB free) with Chrome, Vite and workerd | Out-of-memory, flaky checks | One browser, never browser plus wrangler together unless required (P12), single Vitest worker, harness cleanup with `ps` checks |
| Workers AI unavailable locally and for samples without credentials | No AI eras before deploy | The heuristic fallback is first-class; a fake binding in tests; samples marked `heuristic`; a STATUS follow-up |
| LLM output quality or format | Odd or overlong era names | JSON schema, validation and clamping, no names sent, the heuristic fallback, a cache by hash |
| Prompt injection via repo-controlled module names | Odd titles | Strict identifier charset and lengths in `EraSummary`; output is text-only (React escapes); no tools |
| Label crowding on small screens | Unreadable chart | Greedy placement plus focus, readout and table; horizontal scroll; vertical orientation on the roadmap |
| TS 7 or Vite 8 ecosystem churn | Build breakage | Pinned versions and the T2 fallback; plugin choices recorded |
| Phase size creep | PRs over 20 minutes to review | The budget rule in §5: overflow goes to the next phase's known gaps |
| Sample repos change or become dull | A weaker first impression | Samples are snapshots with `generatedAt`; swap per T16 alternatives |
| Privacy of contributor data | Concerns | Logins only (public), emails hashed and never stored raw, no person data sent to AI |
