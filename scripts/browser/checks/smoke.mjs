// Runs before every phase check: the app loads offline and draws the default sample.
import { assert } from '../lib.mjs';

export default async function smoke({ page, baseURL }) {
  await page.goto(baseURL, { waitUntil: 'load' });
  await page.locator('[data-testid="river-chart"]').waitFor({ state: 'visible', timeout: 10_000 });
  const title = await page.title();
  assert(title === 'vitejs/vite, Repo Rivers', `document title is "vitejs/vite, Repo Rivers" for the default sample (got "${title}")`);
  assert((await page.locator('h1').count()) === 1, 'exactly one h1');
  // The harness's request routing stops Chrome from fetching icons itself, so check the icon explicitly.
  const icon = await page.locator('link[rel~="icon"]').first().getAttribute('href', { timeout: 1000 }).catch(() => null);
  assert(icon, 'a <link rel="icon"> exists');
  if (!icon.startsWith('data:')) {
    // The SPA fallback answers unknown paths with index.html (200), so also require an image type.
    const res = await page.request.get(new URL(icon, baseURL).href);
    const type = res.headers()['content-type'] ?? '';
    assert(res.status() === 200 && type.startsWith('image/'), `favicon ${icon}: HTTP ${res.status()} ${type}`);
  }
  const marks = await page.evaluate(() => performance.getEntriesByName('rivers-rendered').length);
  assert(marks > 0, 'performance mark "rivers-rendered" was set');
}
