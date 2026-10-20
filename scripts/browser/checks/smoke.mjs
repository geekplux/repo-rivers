// Runs before every phase check: the app loads offline and draws the default sample.
import { assert } from '../lib.mjs';

export default async function smoke({ page, baseURL }) {
  await page.goto(baseURL, { waitUntil: 'load' });
  await page.locator('[data-testid="river-chart"]').waitFor({ state: 'visible', timeout: 10_000 });
  assert((await page.title()) === 'repo-rivers', 'document title is "repo-rivers"');
  assert((await page.locator('h1').count()) === 1, 'exactly one h1');
  const marks = await page.evaluate(() => performance.getEntriesByName('rivers-rendered').length);
  assert(marks > 0, 'performance mark "rivers-rendered" was set');
}
