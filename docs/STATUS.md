STATE: DONE

repo-rivers is **shipped and live** at https://reporivers.geekplux.com. All 12 phases are merged to `main`. Cloudflare Workers Builds (Git integration) deploys `main` on every merge; nobody runs `wrangler deploy` by hand.

# Status

- Live: https://reporivers.geekplux.com (`/api/health` → `{"ok":true,"ai":true,"token":false}`)
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

## Redesign "Cyanotype" (R1 to R7)

A stack of seven PRs that redesigns the whole page (spec: docs/redesign/DESIGN.md, plan: docs/redesign/PLAN.md, before and after: docs/screenshots/redesign/before and after). R1 to R6 have had their two review rounds and R7 is in review; all are open and wait for Sean's review. Nothing is merged or deployed.

| Phase | Branch | PR | State |
|---|---|---|---|
| R1 Foundation | claude/project-thread-6b8r1b | [#19](https://github.com/geekplux/repo-rivers/pull/19) | Open, ready for review |
| R2 Hero and chart head | claude/project-thread-6b8r1b-2-hero | [#20](https://github.com/geekplux/repo-rivers/pull/20) | Open, ready for review |
| R3 Chart drawing | claude/project-thread-6b8r1b-3-chart | [#22](https://github.com/geekplux/repo-rivers/pull/22) | Open, ready for review |
| R4 River names | claude/project-thread-6b8r1b-4-labels | [#23](https://github.com/geekplux/repo-rivers/pull/23) | Open, ready for review |
| R5 Rivers and Eras | claude/project-thread-6b8r1b-5-index | [#24](https://github.com/geekplux/repo-rivers/pull/24) | Open, ready for review |
| R6 Phone | claude/project-thread-6b8r1b-6-phone | [#25](https://github.com/geekplux/repo-rivers/pull/25) | Open, ready for review |
| R7 Motion and polish | claude/project-thread-6b8r1b-7-polish | [#26](https://github.com/geekplux/repo-rivers/pull/26) | Open, ready for review |

## Open items
- Enable GitHub private vulnerability reporting in the repo settings (SECURITY.md and CODE_OF_CONDUCT.md link to it).
- Review docs/LAUNCH.md drafts; nothing has been posted.
- Optional: run `pnpm eras:build --ai` (CLOUDFLARE_ACCOUNT_ID + a Workers-AI-only WORKERS_AI_TOKEN) to replace heuristic sample era names with AI-written ones.
- Move ci/github-workflow.yml to .github/workflows/ (needs a token with `workflow` scope).
- Smaller improvements are listed in docs/GOOD_FIRST_ISSUES.md.

Last updated: 2026-10-25
