// Phase 1: the synthetic demo sample renders offline as >= 5 labelled rivers.
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
  assert(await page.getByRole('heading', { name: 'Demo (synthetic)' }).isVisible(), 'sample labelled "Demo (synthetic)"');
  assert(
    (await page.getByRole('button', { name: 'Demo (synthetic)' }).getAttribute('aria-pressed')) === 'true',
    'selected sample button is aria-pressed',
  );

  await shoot(page, '01-sample-desktop', DESKTOP);
  await shoot(page, '02-sample-mobile', MOBILE);
  await shootCvd(page, '03-sample', DESKTOP);
}
