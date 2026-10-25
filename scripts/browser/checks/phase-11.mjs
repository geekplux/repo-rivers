// Phase 11: the ?embed=social card (docs/PLAN.md phase 11): 1280×640, nothing cut off, legible, passes axe,
// a static picture (no tab stops: the chart is role="img" with a summary); screenshots 01-embed-social and its CVD
// simulations.
import { assert, runAxe, shoot, shootCvd } from '../lib.mjs';

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
  assert(card.wordmark === 'Repo Rivers' && card.pitch === 'See any GitHub repo’s history as rivers.', 'wordmark and pitch are shown');
  assert(card.pitchSize >= 40, `the pitch is legible at thumbnail size (≥ 40 px, got ${card.pitchSize})`);
  assert(card.eras >= 3 && card.labels >= 3, `eras and direct labels are drawn (${card.eras}, ${card.labels})`);
  assert(card.title === 'Vite, Repo Rivers' && card.app === 0, 'a minimal view: the Vite sample, no input or controls');
  await runAxe(page, 'embed=social');
  await shoot(page, '01-embed-social', SOCIAL);
  await shootCvd(page, '02-embed-social', SOCIAL);

  // The card is screenshot-only: no tab stops, and the chart is an image named by a summary and described by
  // the prose summary. Tab and an arrow key change nothing.
  const a11y = await page.evaluate(() => {
    const svg = document.querySelector('[data-testid="river-chart"]');
    const tabbable = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')].filter((el) => el.tabIndex >= 0 && !el.disabled);
    return {
      tabbable: tabbable.map((el) => el.outerHTML.slice(0, 80)),
      role: svg.getAttribute('role'),
      label: svg.getAttribute('aria-label') ?? '',
      described: document.getElementById(svg.getAttribute('aria-describedby') ?? '')?.textContent ?? '',
      application: document.querySelectorAll('[role="application"], [aria-roledescription]').length,
    };
  });
  assert(a11y.tabbable.length === 0, `no tab stops in the social card (got ${JSON.stringify(a11y.tabbable)})`);
  assert(a11y.role === 'img' && a11y.application === 0, 'the chart is role="img", not an application');
  assert(/^River chart of vitejs\/vite: .+ per \w+ in \d+ rivers, .+ to .+$/.test(a11y.label), `the chart is named by a summary (got "${a11y.label}")`);
  assert(a11y.described.length > 80 && a11y.described.includes('vite'), 'aria-describedby points to the prose summary');
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowRight');
  const after = await page.evaluate(() => ({ focus: document.activeElement === document.body, lit: document.querySelectorAll('.rr-on').length }));
  assert(after.focus && after.lit === 0, 'Tab and arrow keys leave the static card unchanged');

  // ?sample= picks the sample.
  await page.goto(new URL('?embed=social&sample=express', baseURL).href, { waitUntil: 'load' });
  await page.locator('[data-testid="river-chart"][aria-label^="River chart of expressjs/express:"]').waitFor({ timeout: 10_000 });
}
