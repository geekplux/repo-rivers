# Contributing to repo-rivers

Thanks for helping. Bug reports, accessibility findings, new sources and small fixes are all welcome. If you are looking for a first task, see [docs/GOOD_FIRST_ISSUES.md](docs/GOOD_FIRST_ISSUES.md). By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

```sh
git clone https://github.com/geekplux/repo-rivers && cd repo-rivers
pnpm i
pnpm dev            # http://localhost:5173
pnpm dev:worker     # optional: the /api Worker on :8787 (wrangler, fully local)
```

You need pnpm 9. Node 22 is pinned in `.npmrc` (`use-node-version`), so pnpm downloads and uses it for every script. Run TypeScript files with `pnpm exec node file.ts` to get the same Node.

`pnpm dev:worker` uses `wrangler.dev.jsonc`, which has no AI binding, so local development never contacts Cloudflare. Local secrets go in `.dev.vars` (copy `.dev.vars.example`); it is gitignored. Never commit a token.

## Scripts

| Script | What it does |
|---|---|
| `pnpm lint` | oxlint, warnings fail |
| `pnpm typecheck` | `tsc --noEmit` for the app, Node scripts (including `docs/snippets`) and the Worker |
| `pnpm test` | Vitest, single worker, no watch |
| `pnpm build` | Vite production build into `dist/` |
| `pnpm size` | Checks the gzip budgets of the built bundle and sample chunks (run after `build`) |
| `pnpm check:browser --phase <n>` | Serves `dist/` (run `build` first) with `vite preview`, drives one headless Chrome offline, runs the smoke and phase checks (axe included) and writes screenshots to `docs/screenshots/phase-<n>/` |
| `pnpm check:worker` | Starts the Worker locally with Cloudflare credentials removed from the environment and smoke-tests `/api` |
| `pnpm samples:build` | Re-fetches the built-in samples into `src/samples/*.json` (cached in `.cache/github/`) |
| `pnpm eras:build` | Writes heuristic era names into the samples; `--ai` needs explicit Workers AI credentials |

## How to verify a change

Run these before opening a pull request:

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm size
pnpm check:browser --phase 9   # if you touched the UI
```

`check:browser` uses the system Chrome at `/usr/bin/google-chrome` (override with `CHROME_PATH`) and port 4173 (override with `CHECK_PORT`). It fails on console errors, axe violations and any request that leaves `127.0.0.1`. If it rewrites screenshots you did not mean to change, restore them with `git checkout docs/screenshots`.

For UI changes, also try the keyboard path (Tab into the chart, arrow keys, Enter, Escape) and the page with `prefers-reduced-motion: reduce`.

## Resource etiquette

Many contributors work on laptops or shared machines.

- Stop every dev server, preview server, `wrangler dev` and browser you started when you are done. `check:browser` cleans up after itself and prints `cleanup ok`.
- Run one headless browser at a time.
- Do not leave watch modes running; `pnpm test` runs once.

## Adding a built-in sample

Samples are public, well-known open-source projects with a few years of history.

1. Add the id and `owner/name` to `SAMPLES` in `scripts/build-samples.ts` and to `SAMPLES` in `scripts/build-eras.ts`.
2. Run `pnpm samples:build --only <id>`, then `pnpm eras:build`. Without a token the script stays within GitHub's unauthenticated limit and resumes from its cache if it runs out; `GITHUB_TOKEN=... pnpm samples:build` (environment only) gives a finer sample.
3. Add an entry to `samples` in `src/samples/index.ts` and to the list in `scripts/size-check.mjs`. Each JSON file must stay under 50 KB.
4. Check that it renders offline: `pnpm build && pnpm check:browser --phase 5`.

## Commits and pull requests

- Small, focused commits with a short imperative subject, prefixed by area: `core:`, `ui:`, `worker:`, `docs:`, `test:`, `build:`.
- One topic per pull request. Fill in the template: what and why, how you verified it, screenshots for UI changes.
- New code comes with tests. Keep logic in pure modules under `src/core` and components thin.
- Runtime dependencies are `react` and `react-dom` only. Discuss any new dev dependency in the issue first.
- CI is defined in `.github/workflows/ci.yml` and runs the same checks on every pull request.
- Add a line under `[Unreleased]` in [CHANGELOG.md](CHANGELOG.md) for user-visible changes.
