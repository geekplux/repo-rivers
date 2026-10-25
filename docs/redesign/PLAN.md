# Redesign plan (Cyanotype)

Spec: [DESIGN.md](DESIGN.md). Target boards: `target/`. Approved by Sean on 2026-10-25 (v2 on the design canvas).

## Process

- One phase = one PR, stacked: R1 is based on `claude/project-thread-ydyqut` (PR #18, the site-wide Workers AI daily
  cap), each later phase on the previous phase's branch. Branches: R1 `claude/project-thread-6b8r1b`, later
  `claude/project-thread-6b8r1b-<n>-<slug>`. PRs are opened ready for review and joined into one native GitHub stack.
- Each phase: implementer builds and commits; verifier reviews (lint, typecheck, tests, build, browser check of the
  touched flows, acceptance list below, the design boards); implementer fixes; second review; final fixes. Exactly two
  review rounds.
- Every phase passes `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm size` and
  `pnpm run check:deploy`. Browser checks run once per phase at the end (`CHROME_PATH` set to the local Chromium).
- Never merge, never deploy, never touch `worker/` AI-cap code from PR #18, never name the owner's employer.
- Each PR description: what / why / how, before and after screenshots (committed under `docs/screenshots/redesign/`),
  how verified, known gaps.

## Phases

| # | Branch suffix | Goal |
|---|---|---|
| R1 | (base) | Foundation: Radix blue/slate tokens light + dark, Alegreya Sans self-hosted (Fraunces removed), theme button (system default, remembered, pre-paint, print light), logo + favicon + wordmark, header and footer per DESIGN §3 (keeps the PR #18 line), no middle dots in titles/meta. |
| R2 | `-2-hero` | Hero (h1, field, Draw, samples sentence) and the chart head (title, meta + estimated popover button, folder depth select, include-bots checkbox, segmented control); remove "More options" disclosure; loading and error panels restyled. |
| R3 | `-3-chart` | Chart drawing: plot on the column (120..1180), 2px gaps, two-tone fills by greedy colouring, hatch for other, era band with rules + wrapped names (replaces the bracket track, keeps keyboard), axis with year ticks/estimated/partial, transfer style, focus fade + rule + dot, readout + legend row. |
| R4 | `-4-labels` | River names: slanted in-course labels, horizontal fallback, mouth labels with leaders, peak labels, collision boxes; pure tested module replacing the old placement. |
| R5 | `-5-index` | Rivers table (sparklines, totals, share, active span, row focus linked to the chart) replacing "View as table"; Eras list; prose summary kept for screen readers. |
| R6 | `-6-phone` | Phone: transposed vertical chart, downward river names, era rules with haloed names, docked readout on focus, phone layout of every section. |
| R7 | `-7-polish` | Motion (arrive reveal, focus fades, transfer dash run, crossfade, loading axis), reduced motion, social card/og image, README hero and screenshots, docs (DESIGN links, DECISIONS rows, STATUS), browser acceptance checks updated, full before/after set (1440/390, light/dark). |

## Acceptance (whole redesign)

- Pixel intent of V2Home, V2HomeDark, V2Focus, V2People, V2Phone, V2PhoneDark at 1440 and 390, light and dark.
- Built-in samples still render offline with no key; paste-a-repo, errors, eras (AI or rule-based) still work.
- axe: 0 serious/critical. Keyboard: input, samples, controls, eras, chart (arrows/Home/End/Enter/Escape), table rows.
- Contrast: text >= 4.5:1, river fills >= 3:1 against ground in both themes; nothing relies on hue.
- Initial JS stays within the existing `pnpm size` budget; fonts within their budget.
