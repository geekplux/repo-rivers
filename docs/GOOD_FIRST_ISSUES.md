# Good first issues

Scoped tasks for new contributors. Each one lists the files to start from and what "done" means. Comment on (or open) an issue before you start, so that two people don't pick the same task. Setup and checks are in [CONTRIBUTING.md](../CONTRIBUTING.md); the visual rules are in [docs/viz/rivers.md](viz/rivers.md).

## Chart

### 1. Start-edge labels for big unlabelled rivers
A large river whose shape cannot hold an inside label at its peak (for example Vite's `src/node` early on) gets no label on screen.
- **Files:** `src/core/layout/riverNames.ts`, `src/core/layout/layout.ts`, `docs/viz/rivers.md` (label rules).
- **Done when:** a river among the top 5 by total that would otherwise be dropped gets a label at its first non-zero column, outside the stack with a leader line; no label overlaps another; a layout test covers it.

### 2. Adaptive gaps for very thin rivers
Rivers under 2 px thick are hard to see between 3 px gaps.
- **Files:** `src/core/layout/layout.ts` (`gap`), `src/core/layout/layout.test.ts`.
- **Done when:** in a column where a river is thinner than 2 px, its gaps shrink (to no less than 1 px) so it stays visible; the 50 ms layout budget test still passes.

### 3. Cross-fade when the dimension or depth changes
Switching Modules/Contributors or the depth swaps the chart instantly.
- **Files:** `src/ui/RiverChart.tsx`, `src/index.css`.
- **Done when:** the old and new rivers cross-fade over 180 ms; nothing animates under `prefers-reduced-motion: reduce`; keyboard focus stays on the chart.

### 4. Phone river names that follow the river's curve
On phones (time runs down the page) river names are straight text rotated 90°, so a name sits only where the river stays straight for its length.
- **Files:** `src/core/layout/riverNames.ts` (the `phone` pass), `src/core/layout/transpose.ts`, `src/ui/PhoneChart.tsx`.
- **Done when:** a name may follow the 5-bucket smoothed centreline on an SVG `textPath`, a containment test keeps every glyph inside its river, and names still never overlap.

### 5. Export as SVG or PNG
- **Files:** a new `src/ui/exportChart.ts`, `src/ui/Controls.tsx`.
- **Done when:** a labelled button downloads the current chart as a standalone SVG (with the theme colours inlined and a title) and as a PNG at 2× scale; no new runtime dependency.

### 6. Localised date formats
Bucket labels and dates are always English (`Jan 2025`, `20 Oct 2026`).
- **Files:** `src/core/buckets.ts` (`bucketLabel`), `src/core/layout/layout.ts`, `src/App.tsx`, `src/ui/states/copy.ts`.
- **Done when:** labels use `Intl.DateTimeFormat` with the browser's locale (UTC kept), English output is unchanged, and a test covers one other locale.

## Data

### 7. Co-authored-by attribution
Commits with `Co-authored-by:` trailers count only for the author.
- **Files:** `src/core/commits.ts` (`CommitMeta`), `src/core/github/fetchRepo.ts`, `src/core/aggregate.ts`, `src/core/identity.ts`.
- **Done when:** each co-author (matched by email hash, never storing the email) also gets the commit in contributor counts; the totals row is unchanged; aggregate tests cover it.

### 8. A GitLab adapter
- **Files:** a new `src/core/gitlab/` following the adapter contract in [EXTENDING.md](EXTENDING.md#adding-a-source-adapter).
- **Done when:** `fetchGitLabAggregate({ owner, name })` produces `BucketObservation[]` from the GitLab REST API and a valid aggregate; tests run against recorded fixtures under `tests/fixtures/`, with no network.

## Loading and errors

### 9. "Offline" shown for a GitHub outage
When the browser fallback hits a network failure while the browser is online, the error says "You're offline".
- **Files:** `src/data/loadRepo.ts` (the last `catch` in the browser path), `src/ui/states/copy.ts`.
- **Done when:** that case shows "GitHub isn't answering" with a retry action; the real offline case is unchanged; both are unit-tested.

### 10. Cancel during back/forward leaves a stale `?repo=`
If you press Back to a `?repo=` URL and cancel while it loads, the address bar keeps `?repo=` for a view that is not shown.
- **Files:** `src/ui/useRepo.ts`, `src/data/urlState.ts`.
- **Done when:** cancelling restores the previous view and replaces the URL to match it (no new history entry); a test covers it.

### 11. Worker rate limit logs a console error
A real `429` from the Worker makes the browser log a "Failed to load resource" error, although the app handles it.
- **Files:** `worker/src/index.ts`, `src/data/loadRepo.ts`, `worker/test/worker.test.ts`.
- **Done when:** the rate-limited answer for `/api/repo` is delivered without a console error (for example as an NDJSON error line with status 200 and `retry-after`), and the UI still shows the rate-limit state.

## Worker

### 12. Stream the body-size limit in `/api/eras`
Without a `content-length` header, the route reads the whole body before checking its size.
- **Files:** `worker/src/erasRoute.ts`, `worker/test/`.
- **Done when:** the body is read from the stream and rejected as soon as it passes 4,096 bytes; a test sends a chunked oversized body.

### 13. Accept `/api/health/`
`/api/repo/...` accepts a trailing slash, `/api/health` does not.
- **Files:** `worker/src/index.ts`, `worker/test/worker.test.ts`.
- **Done when:** `/api/health/` answers like `/api/health`, with a test.
