// Phase 1: the default sample renders offline as >= 5 labelled rivers (the demo became the Vite sample in phase 3).
import { DESKTOP, MOBILE, assert, shoot, shootCvd } from '../lib.mjs';

export default async function phase1({ page }) {
  const chart = page.locator('[data-testid="river-chart"]');
  assert((await chart.getAttribute('role')) === 'img', 'chart has role="img"');
  assert(((await chart.getAttribute('aria-label')) ?? '').length > 20, 'chart has a descriptive aria-label');

  const rivers = page.locator('path[data-river]');
  const count = await rivers.count();
  assert(count >= 5, `>= 5 path[data-river], got ${count}`);
  for (const d of await rivers.evaluateAll((els) => els.map((el) => el.getAttribute('d') ?? ''))) {
    assert(d.startsWith('M') && !d.includes('NaN'), 'every river path has valid geometry');
  }
  const title = (await page.locator('nav button[aria-pressed="true"]').textContent()) ?? '';
  assert(title.length > 0, 'the selected sample button is aria-pressed');
  assert(await page.getByRole('heading', { name: title, exact: true }).isVisible(), `sample labelled "${title}"`);

  await shoot(page, '01-sample-desktop', DESKTOP);
  await shoot(page, '02-sample-mobile', MOBILE);
  await shootCvd(page, '03-sample', DESKTOP);
}
