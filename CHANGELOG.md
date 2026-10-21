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
