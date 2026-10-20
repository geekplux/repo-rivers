# Decisions

Record every non-trivial decision here: date, decision, alternatives considered, why.

| Date | Decision | Alternatives | Why |
|---|---|---|---|
| 2026-10-19 | Accept planner's docs/PLAN.md (12 phases) without a revision round | Ask planner for changes | Reviewed against CLAUDE.md incl. the new North-star section: user-first section, design direction ("survey map"), OSS packaging (P10), gallery + launch kit (P11), deploy prep last with no `deploy` script (P12), CI in `ci/`. No gaps found. |
| 2026-10-19 | geekplux/timeline-sankey: **rewrite, reuse ideas only, no code copied** | Vendor/fork the repo | It is BSD-3-Clause, a Next.js 12 demo app (not a library) with d3/lodash/zustand/Tailwind; no value-weighted thickness, no time-bucketed flows, no label collision, weak a11y, no tests. Reused ideas: mid-x cubic Bézier ribbon ("solution 2"), dashed arrow cross-links (→ our file-move transfers), hover-dim-others, layout computation separate from rendering. README credits it as inspiration; if any snippet is ever copied, add THIRD_PARTY_NOTICES.md with BSD-3 text. |
| 2026-10-19 | Node 22.23.3 via `.npmrc use-node-version` (T1) | Pin older Vitest/wrangler for Node 20 | Box Node is 20.19; pnpm already has 22.23.3 installed; works offline. Verified present. |
| 2026-10-19 | TypeScript ^7 with fallback to ~5.9 (T2) | 5.9 only | Faster `--noEmit`; fallback recorded if incompatible. |
| 2026-10-19 | One Worker serving static assets + `/api/*`; Vite kept separate from wrangler (T3/T4) | Pages+Functions; `@cloudflare/vite-plugin` | Modern Workers-assets path; keeps `vite preview` light on RAM. |
| 2026-10-19 | GitHub fetch: 3-request probe, full mode for small repos, compare-based sampling (2B+2 req, ≤55 unauthenticated) for large ones (T5) | Per-commit sampling; GraphQL | GraphQL needs a token; per-commit sampling gives noisy module shares. Compare caps (300 files/250 commits) disclosed as `truncatedBuckets`. |
| 2026-10-19 | Browser fallback against user's own GitHub quota when Worker is rate-limited/unreachable; optional `GITHUB_TOKEN` Worker secret only (T6) | Require a token | Shared Cloudflare egress IPs make unauthenticated Worker calls fragile; no-key rule forbids requiring one. |
| 2026-10-19 | Bucket units week/month/quarter/year, ≤24 buckets unauthenticated, ≤48 with token (T7) | Week/month only (as CLAUDE.md names) | Long histories (10+ years) would need too many requests/columns with only week/month; auto-choice still prefers week then month. |
| 2026-10-19 | Store prefixes to depth 3, collapse client-side; auto depth for monorepos (T8) | Refetch per depth | Depth change without refetch. |
| 2026-10-19 | Metrics: modules = lines changed (capped, ignore-listed), contributors = non-merge commits, transfers = files moved (T9) | Commit counts per module | Per-module commit counts unavailable cheaply in sampled mode. |
| 2026-10-19 | Lean AI: deterministic era segmentation; LLM only names eras, one call per summary hash, cached in KV; no person names or commit messages sent (T10) | LLM chooses eras | Cheaper, testable, deterministic, privacy-preserving. |
| 2026-10-19 | KV only, no R2/D1 (T11) | R2 for aggregates | Aggregates ≤100 KB fit KV. |
| 2026-10-19 | Runtime deps react + react-dom only; no d3/lodash (T12) | d3-scale/d3-shape | Small footprint (North star quality signal). |
| 2026-10-19 | Self-hosted Fraunces subset; system body/mono stacks (T13) | Google Fonts CDN | Offline + privacy. |
| 2026-10-19 | Node 22 native type stripping for scripts (T14); plain Vitest with fakes for Worker tests (T15) | tsx; vitest-pool-workers | Fewer deps; lower RAM. |
| 2026-10-19 | Samples: vitejs/vite, sveltejs/svelte, expressjs/express (T16). Sample script may use `GITHUB_TOKEN=$(gh auth token)` as env var only, never written; must also work unauthenticated | d3/d3, preactjs/preact | Well-known, non-finance; Svelte's monorepo move shows transfers; Express shows a long steady history. Box quota unauthenticated is shared (39/60 left at planning time). |
| 2026-10-19 | No agent skill or CLI in v1 (T17) | Ship a skill | Anatomy bar (SKILL.md + kit + references + audits + evals) costs ~2 phases with no first-run value; on the roadmap. |
| 2026-10-19 | Rate-limiting binding on `/api/*` and strict `EraSummary` schema (T18) | None | Prevent abuse / LLM-proxy use. |
| 2026-10-19 | Commit Sean's North-star edit to CLAUDE.md on main together with the plan | Leave uncommitted | It is a planning/instruction doc and must be on main before phases branch from it. |
| 2026-10-19 | Accept phase 1 at ~920 changed lines (budget ~400) and list it under Known gaps | Split into phase 1a/1b | Size is infrastructure (schema validator 210, browser harness 160, configs); splitting would add a stack layer with no review benefit. Later phases must hold the budget and move overflow to the next phase. |
| 2026-10-19 | Browser harness supports `CHECK_PORT` (default 4173) | Fixed 4173 | Another project on the shared box (`wayback-diff`) runs its own `vite preview` on 4173; verifiers use `CHECK_PORT=4183`. |
| 2026-10-19 | Error class named `AggregateParseError` (plan said `AggregateError`) | Plan name | Avoid clashing with JS built-in `AggregateError`. |
