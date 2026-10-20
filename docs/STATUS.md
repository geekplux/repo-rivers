STATE: IN-PROGRESS

# Status

- Current phase: 5 (phase-5-river-chart), implementing
- Plan: docs/PLAN.md (12 phases), committed on main
- Blockers: none

| Phase | Branch | PR | State | Verify rounds |
|---|---|---|---|---|
| 1 | phase-1-toolchain | [#1](https://github.com/geekplux/repo-rivers/pull/1) | PR open (PASS) | 2 |
| 2 | phase-2-aggregate-core | [#2](https://github.com/geekplux/repo-rivers/pull/2) | PR open (PASS) | 1 |
| 3 | phase-3-github-samples | [#4](https://github.com/geekplux/repo-rivers/pull/4) | PR open (PASS) | 2 |
| 4 | phase-4-river-layout | [#5](https://github.com/geekplux/repo-rivers/pull/5) | PR open (PASS) | 1 |
| 5 | phase-5-river-chart | - | in progress | 0 |
| 6 | phase-6-interaction-a11y | - | pending | 0 |
| 7 | phase-7-worker-api | - | pending | 0 |
| 8 | phase-8-paste-url | - | pending | 0 |
| 9 | phase-9-era-annotations | - | pending | 0 |
| 10 | phase-10-oss-docs | - | pending | 0 |
| 11 | phase-11-gallery-launch | - | pending | 0 |
| 12 | phase-12-deploy-prep | - | pending | 0 |

## Carry-overs (scheduled into later phases)
- P5: peak-callout label fallback (top-3 always labelled, e.g. Vite docs/.vitepress); mobile 'every full 360 px window ≥2 labels'; break mark must avoid labels; reserve top space for `↑ 224K`; year axis + 'estimated' text label; recheck Svelte packages/site under deuteranopia.
- P6: text key under chart for the dotted "estimated" rule; start-edge label/callout for big unlabelled rivers (Vite src/node); adaptive gaps for <2 px rivers; bot-outline CVD check with Include bots on. From a11y review: readout/table must name every label-dropped river; chart tab stop + key map (A3); describeView summary via aria-describedby incl. partial/estimated caveats; live announcement on sample switch; focused label stays full-opacity when others dim to 0.18; halo the dotted survey line if relied on; CVD screenshots with a river focused; aria-label caveats, aria-hidden arrow in scroll hint, per-sample document.title.
- P7: move-finder for modules first seen in truncated buckets, then regenerate svelte.json (restores src→packages/svelte); cap/window full-mode buckets at maxBuckets; `*others` person should carry bot status; add a truncated-compare test fixture.

## Follow-ups
- Move ci/github-workflow.yml to .github/workflows/ (needs workflow scope)

Last updated: 2026-10-20 05:57 UTC
