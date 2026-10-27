# CLAUDE.md: maintainer guide for repo-rivers

repo-rivers draws a GitHub repository's history as rivers: modules or contributors flow across time in a timeline-sankey, widening when busy and merging or splitting as the code is reorganised, with a few short AI-written names for the key eras. Paste a repository URL or open a built-in sample. Live at https://reporivers.geekplux.com; Cloudflare Workers Builds deploys `main` on every merge.

How it fits together: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Public API and extension points: [docs/EXTENDING.md](docs/EXTENDING.md). Visual encoding: [docs/viz/rivers.md](docs/viz/rivers.md); visual design: [docs/DESIGN.md](docs/DESIGN.md). Deployment: [docs/DEPLOY.md](docs/DEPLOY.md).

## Stack and commands

React 19 + Vite + TypeScript, Vitest, oxlint, pnpm, one Cloudflare Worker (static assets plus `/api/*`, KV, Workers AI, a rate-limit binding). Runtime dependencies: `react` and `react-dom` only.

```sh
pnpm dev                 # Vite dev server (built-in samples work offline)
pnpm dev:worker          # the Worker locally (wrangler.dev.jsonc, no AI binding)
pnpm lint                # oxlint, warnings fail
pnpm typecheck           # tsc --noEmit for app, Node scripts and Worker
pnpm test                # Vitest once, single worker
pnpm build && pnpm size  # production build, then bundle budgets
pnpm check:browser --phase <n>  # headless Chrome checks against dist/ (CI runs --phase 1)
pnpm check:worker        # Worker smoke test without Cloudflare credentials
pnpm run check:deploy    # wrangler deploy --dry-run; must pass before every PR
pnpm samples:build / pnpm eras:build   # regenerate the built-in samples and their era names
```

Before a PR: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm size && pnpm run check:deploy`.

## Rules

- **Stack:** pure React + Vite with the VoidZero toolchain (Vite, Vitest, Oxc/oxlint, Rolldown where sensible). No Next.js, no Remix, no other meta-framework. pnpm only. Anything deployed runs on Cloudflare.
- **Deployment happens only through Workers Builds on merge to `main`.** Never run `wrangler deploy`; the dry run `pnpm run check:deploy` is fine. `.claude/settings.json` denies `wrangler deploy`, `wrangler pages deploy`, `pnpm run deploy`, `gh pr merge` and `gh stack merge`; do not work around it or edit it.
- **Never merge PRs.** Open them for review; the maintainer merges, and a merge is a deploy.
- **Secrets:** never commit them. Local secrets go in `.dev.vars` (gitignored); deployed ones via `wrangler secret put`. Production runs without `GITHUB_TOKEN`.
- **Built-in samples** (`src/samples/`) render instantly, offline and without any key. Keep it that way.
- **Lean AI:** deterministic code first. The only model call names eras, from a person-free summary of at most 2 KB, cached in KV by hash, with template names as the fallback. A global cap bounds it: `DAILY_AI_CAP`, 200 calls per UTC day (`worker/src/budget.ts`). Respect GitHub's rate limits: plan requests within the budget and cache aggregates.
- **Accessibility:** never rely on colour alone (labels, shape, order, line style carry meaning); palettes must pass protanopia, deuteranopia and tritanopia simulation (tested in `tokens.test.ts`); everything keyboard-operable; reduced motion respected.
- **No decorative 3D.** Nothing finance-related (no prices, trading, crypto or payments features or sample data).
- No company names in project content, samples, docs, commits or PRs, apart from tools, services and cited sources.
- **CI** (`.github/workflows/ci.yml`) runs on every push to `main` and every PR. Keep it in step with the checks contributors run locally; `scripts/ci-workflow.test.ts` guards it.
- Record a non-obvious design choice where the next reader will look: a code comment, or the relevant doc above.
