# Changelog

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project will follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) from its first release.

## [Unreleased]

### Added
- Toolchain: pnpm, Vite, React and TypeScript, Vitest, oxlint, typecheck, and a headless-browser check harness that runs offline and cleans up after itself.
- Aggregation core: commits to touched paths, modules (depth 1 to 3, auto for monorepos) and contributors, then week, month, quarter or year buckets and file-move transfers. Bots are flagged; merge commits are not counted.
- GitHub client and fetch planner: a 3-request probe, then full or sampled mode within 55 unauthenticated requests, with progress and cancellation.
- Built-in samples for Vite, Svelte and Express, committed as JSON and rendered offline.
- Layout engine: stable lanes, mid-x Bézier ribbons, outlier clipping with a break mark, transfers with arrowheads, and direct labels with peak callouts.
- A colour palette derived from Okabe-Ito, tested for colour-vision deficiencies and contrast in light and dark themes.
- The "survey map" visual identity, a self-hosted Fraunces subset, and a reveal animation that respects reduced motion.
- Interaction and accessibility: hover and keyboard focus, pinning, a live readout, a prose summary, "View as table", and Modules/Contributors, depth and bot controls.
- A Cloudflare Worker with `/api/health` and a streaming `/api/repo/:owner/:name`, a KV cache, an optional `GITHUB_TOKEN` secret and rate limiting.
- Paste-a-URL flow: determinate progress, shareable `?repo=` URLs, a browser cache, a fallback to the user's own GitHub quota, and specific error states.
- The move-finder, which recovers large reorganisations hidden by GitHub's 300-file comparison limit.
- Era annotations: deterministic boundaries, names from one cached Workers AI call through `/api/eras`, and template names when AI is unavailable.
- Open-source documentation: README, contributing guide, Code of Conduct, security policy, issue and pull request templates, extension guide and good first issues.

### Changed
- Redesign "Cyanotype", foundation: Radix blue and slate colours in light and dark, a header button that switches the theme and remembers the choice, Alegreya Sans (self-hosted) in place of Fraunces, the confluence logo and favicon, and a new header and footer.
- Redesign "Cyanotype", hero and chart head: the headline "A repository’s history, drawn as rivers" with one row of field, Draw and the samples sentence; the chart head names the repository as owner/name with a meta line (measure, unit and span) and an "Estimated from n of m commits" button that opens the source notes; Folder depth or Include bots and the Modules | Contributors control sit at the head's right, replacing "More options"; loading and error panels are restyled, the loading copy drops the middle dot, and error copy writes the name as Repo Rivers.
- Redesign "Cyanotype", the chart: the plot sits on the content column with a 2 px gap between rivers; rivers carry no hue, only two blues of different lightness chosen so neighbours differ, with "other" hatched and bots outlined in dots; an era band above the plot gives each era a rule, its name and its range ("Q2 2020 to Q1 2021"), still one button per era; the axis has year ticks, a dotted line under estimated quarters and a dashed line in the quarter in progress; moved files are dashed arrows; focusing a river keeps it at full strength while the others fade, with a rule at the quarter and a dot on the river; the readout under the chart reads as a sentence ("packages, Q2 2023: 7,732 lines changed, 21% of the quarter. 952 files moved in from test.") beside a legend of only the marks shown; the chart is one image with a sentence for its name, and middle dots are gone from the readout and the table.
- Redesign "Cyanotype", river names: each river is named straight along its course when a smooth stretch of it holds the name, else level at its widest, else at its mouth right of the plot with a thin leader, else above its peak; names never overlap each other or the moved-files arrows, are measured with the real font so long names like *packages/create-vite* are not cut, and fade with their river when another one is focused.
- Redesign "Cyanotype", Rivers and Eras: under the chart, the Rivers table lists every river, largest first, with a sparkline of each quarter scaled to its own peak, its total, its share and the years it was active; a click, Enter or Space on a row focuses that river in the chart, and the river focused in the chart is banded in the table. It replaces "View as table" and "Read as text" (the prose summary is still read to screen readers with the chart). The Eras section lists each era's range, name and note. On a phone the table keeps name, sparkline and share.
- Redesign "Cyanotype", the phone chart: on a phone time runs down the page, about 56 px a quarter, so the page scrolls through history and nothing scrolls sideways (the "Scroll for later years" caption goes); years sit in a column on the left, each era starts with a rule across the chart and its name on the right, and rivers are named only where a stretch of them holds the name, reading downward. Tapping a river focuses it, as on the desktop, and the readout docks to the bottom of the screen until the river is released; on a phone the arrow keys follow the picture, Up and Down through time, Left and Right between rivers.
- GitHub's hourly API limit now reaches the browser as its own error code (`github_rate_limited`), separate from this site's per-IP limit (`too_many_requests`), and the UI explains each one plainly, with GitHub's reset time when it is known.
- The rate-limit binding uses its own namespace id (`1002`), so it no longer shares a counter with other Workers on the account.
