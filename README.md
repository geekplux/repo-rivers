# repo-rivers

Paste a GitHub repository URL (or pick a sample) and see its history as rivers: modules and contributors flow across time in a timeline-sankey, widening when they get busy and merging or splitting as the code is reorganised, with a few short AI-written annotations that name the key eras. It builds on ideas from geekplux/timeline-sankey.

**Status:** planning

**Stack:** React + Vite + TypeScript, Vitest, oxlint; timeline-sankey rendering in SVG (learn from / reuse https://github.com/geekplux/timeline-sankey, check its license and API before reuse); a Cloudflare Worker that reads the GitHub REST/GraphQL API (unauthenticated by default, optional token as a Worker secret) and caches aggregates in KV/R2; Workers AI for era annotations; sample repos pre-aggregated and committed as JSON.

## How this repo is built

This repository is developed by a Claude Code main agent acting as product manager, delegating to the specialist sub-agents in `.claude/agents/`. See `CLAUDE.md` for the operating manual, `docs/KICKOFF.md` for the start prompt, `docs/PLAN.md` for the plan (once written), and `docs/STATUS.md` for live progress. Work lands as a stack of pull requests, one per phase; nothing is merged without review.
