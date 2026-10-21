STATE: DONE

repo-rivers is **shipped and live** at https://reporivers.geekplux.org. All 12 phases are merged to `main`. Cloudflare Workers Builds (Git integration) deploys `main` on every merge; nobody runs `wrangler deploy` by hand.

# Status

- Live: https://reporivers.geekplux.org (`/api/health` → `{"ok":true,"ai":true,"token":false}`)
- Production runs **without** a `GITHUB_TOKEN` (decided by Sean): the Worker uses GitHub's unauthenticated limit, and the UI explains when GitHub's hourly limit is reached (with the reset time when GitHub sends one).
- Plan: docs/PLAN.md (12 phases, all done)
- Blockers: none

| Phase | Branch | PR | State |
|---|---|---|---|
| 1 | phase-1-toolchain | [#1](https://github.com/geekplux/repo-rivers/pull/1) | Merged |
| 2 | phase-2-aggregate-core | [#2](https://github.com/geekplux/repo-rivers/pull/2) | Merged |
| 3 | phase-3-github-samples | [#4](https://github.com/geekplux/repo-rivers/pull/4) | Merged |
| 4 | phase-4-river-layout | [#5](https://github.com/geekplux/repo-rivers/pull/5) | Merged |
| 5 | phase-5-river-chart | [#6](https://github.com/geekplux/repo-rivers/pull/6) | Merged |
| 6 | phase-6-interaction-a11y | [#7](https://github.com/geekplux/repo-rivers/pull/7) | Merged |
| 7 | phase-7-worker-api | [#8](https://github.com/geekplux/repo-rivers/pull/8) | Merged |
| 8 | phase-8-paste-url | [#9](https://github.com/geekplux/repo-rivers/pull/9) | Merged |
| 9 | phase-9-era-annotations | [#10](https://github.com/geekplux/repo-rivers/pull/10) | Merged |
| 10 | phase-10-oss-docs | [#11](https://github.com/geekplux/repo-rivers/pull/11) | Merged |
| 11 | phase-11-gallery-launch | [#12](https://github.com/geekplux/repo-rivers/pull/12) | Merged |
| 12 | phase-12-deploy-prep | [#13](https://github.com/geekplux/repo-rivers/pull/13) | Merged, deployed |

## Open items
- Enable GitHub private vulnerability reporting in the repo settings (SECURITY.md and CODE_OF_CONDUCT.md link to it).
- Review docs/LAUNCH.md drafts; nothing has been posted.
- Optional: run `pnpm eras:build --ai` (CLOUDFLARE_ACCOUNT_ID + a Workers-AI-only WORKERS_AI_TOKEN) to replace heuristic sample era names with AI-written ones.
- Move ci/github-workflow.yml to .github/workflows/ (needs a token with `workflow` scope).
- Smaller improvements are listed in docs/GOOD_FIRST_ISSUES.md.

Last updated: 2026-10-21
