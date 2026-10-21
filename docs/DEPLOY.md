# Deploying repo-rivers to Cloudflare

repo-rivers deploys as **one Cloudflare Worker**: it serves the built app from `dist/` (Workers static assets, with the headers in `public/_headers`) and answers `/api/*` (`/api/health`, `/api/repo/:owner/:name`, `/api/eras`). The deploy config is `wrangler.jsonc`. Local development uses `wrangler.dev.jsonc`, which is the same minus the `ai` binding, so `pnpm dev:worker` never contacts Cloudflare.

Production (https://reporivers.geekplux.org) is deployed by **Cloudflare Workers Builds** (Git integration): every merge to `main` builds and deploys. There is no `deploy` script, and `pnpm run check:deploy` is a dry run that uploads nothing. The manual steps below are for forks and first-time setup.

## Prerequisites

1. A Cloudflare account and the dependencies installed (`pnpm i`).
2. Sign in once: `pnpm exec wrangler login`. If `CLOUDFLARE_API_TOKEN` is set in your shell, wrangler uses it instead of the login session; unset it, or make sure it has Workers Scripts and KV edit rights on the right account.
3. Create the KV namespace for cached aggregates and era names:

   ```sh
   pnpm exec wrangler kv namespace create RIVERS_KV
   ```

   The committed id, `e15b4e2e25d64a9fa1ae087ef86d8a0b`, is the production namespace. A fork replaces it with the printed 32-hex `id` in **both** `wrangler.jsonc` and `wrangler.dev.jsonc` (a test keeps them identical apart from `ai`). Local dev simulates KV and ignores the id.
4. **Workers AI** enabled on the account (it is available on the Free plan). It names the eras of repos fetched through the Worker. Without it, eras fall back to the deterministic names and nothing breaks.
5. Optional: a GitHub token as a Worker secret, so the Worker gets 5,000 GitHub requests per hour instead of 60 per shared Cloudflare IP. **Production runs without one** (by choice); when GitHub's hourly limit is hit, the UI says so, shows the reset time when GitHub sends `x-ratelimit-reset`, and offers to read the repo from the visitor's browser instead:

   ```sh
   pnpm exec wrangler secret put GITHUB_TOKEN
   ```

   Use a **fine-grained personal access token with public-repository read access only** ("Public Repositories (read-only)", no account or repository permissions, **no access to private repositories**). Any visitor can make the Worker fetch any public repo through this token, so it must not be able to see anything private. The secret never reaches a response, a log or the browser.

The rate-limit binding (`API_LIMIT`, 20 requests per minute per client IP on `/api/*`) needs no setup. Its `namespace_id` (`1002`) only has to be unique among rate-limit bindings on the account (explorable, on the same account, uses `1001`).

## Check before deploying

```sh
pnpm build && pnpm run check:deploy   # wrangler deploy --dry-run --outdir .wrangler/dry-run
pnpm build && pnpm check:fullstack    # wrangler dev + headless Chrome: samples under the CSP, /api/health
```

The dry run bundles the Worker into `.wrangler/dry-run/` (gitignored), lists the bindings (`RIVERS_KV`, `AI`, `API_LIMIT`) and prints the upload size (about 47 KiB, 15 KiB gzip).

## Deploy

Production deploys itself from `main` (Workers Builds). For a fork without Git integration, the exact command is:

```sh
pnpm build && pnpm exec wrangler deploy
```

Wrangler prints the URL, by default `https://repo-rivers.<your-subdomain>.workers.dev`. On an account without a workers.dev subdomain yet, the first deploy asks you to register one.

## After the deploy

Smoke test:

```sh
curl https://reporivers.geekplux.org/api/health   # {"ok":true,"ai":true,"token":false}  (token is true with the secret)
```

Then open the site and click through the Vite, Svelte and Express samples, paste a small public repo (for example `expressjs/cors`), and check that the era names arrive.

Optional: name the built-in samples' eras with Workers AI (they ship with deterministic names). Create a separate API token with only Workers AI permissions (the dashboard's "Workers AI" token template), then:

```sh
CLOUDFLARE_ACCOUNT_ID=<account id> WORKERS_AI_TOKEN=<that token> pnpm eras:build --ai
pnpm build && pnpm exec wrangler deploy   # ship the renamed samples
```

The script makes one model call per sample and never reads `CLOUDFLARE_API_TOKEN`. Review the names before committing `src/samples/*.json`.

## Rollback

```sh
pnpm exec wrangler deployments list   # recent versions
pnpm exec wrangler rollback           # back to the previous version (or: wrangler rollback <version-id>)
```

KV contents are versioned by key prefix (`agg:v1:`, `eras:v1:`), so a rollback does not need a cache flush.
