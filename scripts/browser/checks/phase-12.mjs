// Phase 12: the full stack as deployed, run locally (`pnpm build && pnpm check:fullstack`): wrangler dev serves
// dist/ (with public/_headers) and /api from one origin. The samples render under the production CSP with no
// violations, hashed assets are immutable, and /api/health answers 200 with `ai: false` (no AI binding locally).
import { readFileSync } from 'node:fs';
import { assert, shoot } from '../lib.mjs';

const CSP = /^ {2}Content-Security-Policy: (.+)$/m.exec(readFileSync('public/_headers', 'utf8'))[1];

export default async function phase12({ page, baseURL, worker }) {
  assert(worker, 'phase 12 runs against wrangler dev: use `pnpm check:fullstack`');

  // Record CSP violations from the very first request (the smoke check already loaded the page once).
  await page.addInitScript(() => {
    window.rrCsp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.rrCsp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  const res = await page.goto(baseURL, { waitUntil: 'load' });
  const h = res.headers();
  console.log(`  GET / -> ${res.status()} csp="${h['content-security-policy']}"`);
  assert(h['content-security-policy'] === CSP, 'wrangler dev applies the CSP from public/_headers');
  assert(h['x-content-type-options'] === 'nosniff' && h['referrer-policy'] === 'strict-origin-when-cross-origin', 'nosniff and Referrer-Policy headers are applied');
  await page.locator('[data-testid="river-chart"]').waitFor({ state: 'visible', timeout: 10_000 });

  const script = await page.locator('script[src^="/assets/"]').first().getAttribute('src');
  const asset = await page.request.get(new URL(script, baseURL).href);
  console.log(`  GET ${script} -> cache-control="${asset.headers()['cache-control']}"`);
  assert(/immutable/.test(asset.headers()['cache-control'] ?? ''), '/assets/* is served with immutable caching');

  // Every built-in sample (lazy chunks, the self-hosted font) loads under the CSP.
  for (const [chip, repo] of [['Svelte', 'sveltejs/svelte'], ['Express', 'expressjs/express'], ['Vite', 'vitejs/vite']]) {
    await page.getByRole('button', { name: chip, exact: true }).click();
    await page.locator(`[data-testid="river-chart"][aria-label*="${repo}"]`).waitFor({ timeout: 10_000 });
  }
  await page.evaluate(() => document.fonts.ready);
  const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family));
  assert(fonts.some((f) => /Fraunces/.test(f)), `the self-hosted display font loads (got ${JSON.stringify(fonts)})`);
  const violations = await page.evaluate(() => window.rrCsp);
  assert(violations.length === 0, `no CSP violations (got ${JSON.stringify(violations)})`);
  await shoot(page, '01-fullstack-sample-desktop');

  const health = await page.goto(new URL('api/health', baseURL).href, { waitUntil: 'load' });
  const body = JSON.parse(await page.locator('body').innerText());
  console.log(`  GET /api/health -> ${health.status()} ${JSON.stringify(body)}`);
  assert(health.status() === 200 && body.ok === true && body.ai === false, '/api/health is 200 with ai: false');
  await shoot(page, '02-fullstack-health');
}
