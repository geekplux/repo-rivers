# Deploying repo-rivers to Cloudflare

repo-rivers deploys as **one Cloudflare Worker**: it serves the built app from `dist/` (Workers static assets, with the headers in `public/_headers`) and answers `/api/*` (`/api/health`, `/api/repo/:owner/:name`, `/api/eras`). The deploy config is `wrangler.jsonc`. Local development uses `wrangler.dev.jsonc`, which is the same minus the `ai` binding, so `pnpm dev:worker` never contacts Cloudflare.

Nothing in this repository deploys by itself: there is no `deploy` script, and `pnpm run check:deploy` is a dry run that uploads nothing.

## Prerequisites

1. A Cloudflare account and the dependencies installed (`pnpm i`).
2. Sign in once: `pnpm exec wrangler login`.
3. Create the KV namespace for cached aggregates and era names:

   ```sh
   pnpm exec wrangler kv namespace create RIVERS_KV
   ```

   Copy the printed 32-hex `id` into `kv_namespaces[0].id` in **both** `wrangler.jsonc` and `wrangler.dev.jsonc` (a test keeps them identical apart from `ai`). The committed `00000000000000000000000000000000` is a placeholder, not a real namespace.
4. **Workers AI** enabled on the account (it is available on the Free plan). It names the eras of repos fetched through the Worker. Without it, eras fall back to the deterministic names and nothing breaks.
5. Optional, recommended: a GitHub token as a Worker secret, so the Worker gets 5,000 GitHub requests per hour instead of 60 per shared Cloudflare IP:

   ```sh
   pnpm exec wrangler secret put GITHUB_TOKEN
   ```

   Use a **fine-grained personal access token with public-repository read access only** ("Public Repositories (read-only)", no account or repository permissions, **no access to private repositories**). Any visitor can make the Worker fetch any public repo through this token, so it must not be able to see anything private. The secret never reaches a response, a log or the browser.

The rate-limit binding (`API_LIMIT`, 20 requests per minute per client IP on `/api/*`) needs no setup. Its `namespace_id` only has to be unique among rate-limit bindings on the account.

## Check before deploying

```sh
pnpm build && pnpm run check:deploy   # wrangler deploy --dry-run --outdir .wrangler/dry-run
pnpm build && pnpm check:fullstack    # wrangler dev + headless Chrome: samples under the CSP, /api/health
```

The dry run bundles the Worker into `.wrangler/dry-run/` (gitignored), lists the bindings (`RIVERS_KV`, `AI`, `API_LIMIT`) and prints the upload size (about 47 KiB, 15 KiB gzip).

## Deploy

The exact command:

```sh
pnpm build && pnpm exec wrangler deploy
```

Wrangler prints the URL, by default `https://repo-rivers.<your-subdomain>.workers.dev`.

## After the deploy

Smoke test:

```sh
curl https://<worker>/api/health   # {"ok":true,"ai":true,"token":true}  (token is false without the secret)
```

Then open `https://<worker>/` and click through the Vite, Svelte and Express samples, paste a small public repo (for example `expressjs/cors`), and check that the era names arrive.

Optional: name the built-in samples' eras with Workers AI (they ship with deterministic names). Create a separate API token with only Workers AI permissions (the dashboard's "Workers AI" token template), then:

```sh
CLOUDFLARE_ACCOUNT_ID=<account id> WORKERS_AI_TOKEN=<that token> pnpm eras:build --ai
pnpm build && pnpm exec wrangler deploy   # ship the renamed samples
```

The script makes one model call per sample and never reads `CLOUDFLARE_API_TOKEN`. Review the names before committing `src/samples/*.json`.

Finally, replace the "Live demo" placeholder in `README.md` and the localhost links in `examples/README.md` with the deployed URL.

## Rollback

```sh
pnpm exec wrangler deployments list   # recent versions
pnpm exec wrangler rollback           # back to the previous version (or: wrangler rollback <version-id>)
```

KV contents are versioned by key prefix (`agg:v1:`, `eras:v1:`), so a rollback does not need a cache flush.
