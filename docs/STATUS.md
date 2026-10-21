STATE: IN-PROGRESS

# Status

- Current phase: 10 (phase-10-oss-docs), implementing
- Plan: docs/PLAN.md (12 phases), committed on main
- Blockers: none

| Phase | Branch | PR | State | Verify rounds |
|---|---|---|---|---|
| 1 | phase-1-toolchain | [#1](https://github.com/geekplux/repo-rivers/pull/1) | PR open (PASS) | 2 |
| 2 | phase-2-aggregate-core | [#2](https://github.com/geekplux/repo-rivers/pull/2) | PR open (PASS) | 1 |
| 3 | phase-3-github-samples | [#4](https://github.com/geekplux/repo-rivers/pull/4) | PR open (PASS) | 2 |
| 4 | phase-4-river-layout | [#5](https://github.com/geekplux/repo-rivers/pull/5) | PR open (PASS) | 1 |
| 5 | phase-5-river-chart | [#6](https://github.com/geekplux/repo-rivers/pull/6) | PR open (PASS) | 1 |
| 6 | phase-6-interaction-a11y | [#7](https://github.com/geekplux/repo-rivers/pull/7) | PR open (PASS) | 1 |
| 7 | phase-7-worker-api | [#8](https://github.com/geekplux/repo-rivers/pull/8) | PR open (PASS) | 1 |
| 8 | phase-8-paste-url | [#9](https://github.com/geekplux/repo-rivers/pull/9) | PR open (PASS) | 1 |
| 9 | phase-9-era-annotations | [#10](https://github.com/geekplux/repo-rivers/pull/10) | PR open (PASS) | 2 |
| 10 | phase-10-oss-docs | - | in progress | 0 |
| 11 | phase-11-gallery-launch | - | pending | 0 |
| 12 | phase-12-deploy-prep | - | pending | 0 |

## Carry-overs (scheduled into later phases)
- P12: fix wrangler.dev.jsonc header comment (points to worker/test/wranglerConfig.test.ts; actual scripts/wrangler-config.test.ts); DEPLOY.md/README: recommend a public-repo-only (fine-grained, no private access) GITHUB_TOKEN for the Worker secret.

- (done in P10: docs/GOOD_FIRST_ISSUES.md) good-first-issues: start-edge labels, adaptive gaps for <2 px rivers, 180 ms cross-fade on control change; browser-fallback network failure while online shown as 'offline' (should be 'GitHub not answering'); cancel during back/forward leaves stale ?repo=; real Worker 429 logs a console resource error.

## Follow-ups
- Sean: enable GitHub private vulnerability reporting in the repo settings (SECURITY.md and CODE_OF_CONDUCT.md link to it).
- After deploy (needs Sean): run `scripts/build-eras.ts` with Cloudflare account credentials to replace heuristic sample era names with AI-written ones (non-blocking).
- Move ci/github-workflow.yml to .github/workflows/ (needs workflow scope)

Last updated: 2026-10-21 01:38 UTC
