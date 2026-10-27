// Phase 3: the default view renders the real Vite sample offline; Svelte and Express render too.
import { DESKTOP, MOBILE, assert, shoot } from '../lib.mjs';

async function expectRivers(page, title, repo) {
  // The chart head names the repository as owner/name.
  assert(await page.getByRole('heading', { name: repo, exact: true }).isVisible(), `sample heading "${repo}"`);
  const pressed = await page.getByRole('button', { name: title, exact: true }).getAttribute('aria-pressed');
  assert(pressed === 'true', `"${title}" button is aria-pressed`);
  const chart = page.locator('[data-testid="river-chart"]');
  await chart.waitFor({ state: 'visible' });
  assert(((await chart.getAttribute('aria-label')) ?? '').includes(repo), `chart aria-label names ${repo}`);
  const paths = await page.locator('path[data-river]').evaluateAll((els) => els.map((el) => el.getAttribute('d') ?? ''));
  assert(paths.length >= 5, `>= 5 rivers for ${repo}, got ${paths.length}`);
  assert(paths.every((d) => d.startsWith('M') && !d.includes('NaN')), `valid river geometry for ${repo}`);
}

export default async function phase3({ page }) {
  await expectRivers(page, 'Vite', 'vitejs/vite');
  await shoot(page, '01-vite-desktop', DESKTOP);
  await shoot(page, '02-vite-mobile', MOBILE);
  await page.setViewportSize(DESKTOP);
  for (const [title, repo] of [['Svelte', 'sveltejs/svelte'], ['Express', 'expressjs/express']]) {
    await page.getByRole('button', { name: title, exact: true }).click();
    await page.locator(`[data-testid="river-chart"][aria-label*="${repo}"]`).waitFor({ state: 'visible', timeout: 10_000 });
    await expectRivers(page, title, repo);
  }
}
