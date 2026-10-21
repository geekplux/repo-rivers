// Phase 11: the ?embed=social card (docs/PLAN.md phase 11): 1280×640, nothing cut off, legible, passes axe,
// keyboard-operable chart; screenshots 01-embed-social and its CVD simulations.
import { assert, runAxe, shoot, shootCvd, tabTo } from '../lib.mjs';

const SOCIAL = { width: 1280, height: 640 };

export default async function phase11({ page, baseURL }) {
  await page.setViewportSize(SOCIAL);
  await page.goto(new URL('?embed=social', baseURL).href, { waitUntil: 'load' });
  await page.locator('[data-testid="river-chart"]').waitFor({ state: 'visible', timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);
  const card = await page.evaluate(() => {
    const pitch = document.querySelector('h1');
    return {
      scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      stack: document.querySelector('.rr-stack').getBoundingClientRect().toJSON(),
      wordmark: document.querySelector('.rr-wordmark')?.textContent,
      pitch: pitch?.textContent,
      pitchSize: parseFloat(getComputedStyle(pitch).fontSize),
      eras: document.querySelectorAll('[data-testid="era-track"] .rr-era').length,
      labels: document.querySelectorAll('[data-label-for]').length,
      title: document.title,
      app: document.querySelectorAll('#rr-repo, .rr-controls').length,
    };
  });
  assert(card.scroll[0] <= 1280 && card.scroll[1] <= 640, `the card fits 1280×640 without scrolling (got ${card.scroll})`);
  assert(card.stack.right <= 1280 && card.stack.bottom <= 640, 'the chart and its labels are inside the card');
  assert(card.wordmark === 'repo rivers' && card.pitch === 'See any GitHub repo’s history as rivers.', 'wordmark and pitch are shown');
  assert(card.pitchSize >= 40, `the pitch is legible at thumbnail size (≥ 40 px, got ${card.pitchSize})`);
  assert(card.eras >= 3 && card.labels >= 3, `eras and direct labels are drawn (${card.eras}, ${card.labels})`);
  assert(card.title === 'Vite · repo rivers' && card.app === 0, 'a minimal view: the Vite sample, no input or controls');
  await runAxe(page, 'embed=social');
  await shoot(page, '01-embed-social', SOCIAL);
  await shootCvd(page, '02-embed-social', SOCIAL);

  // The chart stays keyboard-operable in the card: Tab reaches it and an arrow key lights a river.
  await tabTo(page, '[aria-roledescription="river chart"]');
  await page.keyboard.press('ArrowRight');
  assert(await page.locator('[data-testid="river-chart"] .rr-river.rr-on').count() === 1, 'an arrow key highlights one river');

  // ?sample= picks the sample.
  await page.goto(new URL('?embed=social&sample=express', baseURL).href, { waitUntil: 'load' });
  await page.locator('[data-testid="river-chart"][aria-label="River chart of expressjs/express"]').waitFor({ timeout: 10_000 });
}
