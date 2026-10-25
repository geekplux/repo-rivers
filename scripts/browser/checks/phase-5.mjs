// Phase 5: the river chart in the "survey map" identity (docs/PLAN.md phase 5, docs/viz/rivers.md S1–S7).
import { DESKTOP, MOBILE, assert, shoot, shootCvd, tabTo } from '../lib.mjs';

const CHART = '[data-testid="river-chart"]';
const REVEAL_MS = 800;

async function open(page, url, repo) {
  await page.goto(url, { waitUntil: 'load' });
  await page.locator(`${CHART}[aria-label*="${repo}"]`).waitFor({ state: 'visible', timeout: 10_000 });
}

/** Label boxes (CSS px) of every chart text, plus rivers with their totals. */
const readChart = (page) => page.evaluate((sel) => {
  const svg = document.querySelector(sel);
  const rivers = [...svg.querySelectorAll('path[data-river]')].map((p) => ({ id: p.dataset.river, total: Number(p.dataset.total) }));
  const labels = [...svg.querySelectorAll('text.rr-label')].map((t) => {
    const r = t.getBoundingClientRect();
    const b = t.getBBox();
    return { id: t.dataset.labelFor, x: r.x, y: r.y, w: r.width, h: r.height, sx: b.x, sw: b.width, size: parseFloat(getComputedStyle(t).fontSize) };
  });
  return { rivers, labels, width: svg.getBoundingClientRect().width, viewBox: svg.getAttribute('viewBox') };
}, CHART);

async function expectLabels(page, repo) {
  const { rivers, labels, width, viewBox } = await readChart(page);
  assert(viewBox === `0 0 ${width} ${viewBox.split(' ')[3]}`, `${repo}: chart drawn at real CSS width (viewBox ${viewBox}, ${width} px)`);
  const top3 = rivers.toSorted((a, b) => b.total - a.total).slice(0, 3).map((r) => r.id);
  const missing = top3.filter((id) => !labels.some((l) => l.id === id));
  assert(missing.length === 0, `${repo}: top-3 rivers labelled (missing ${missing.join(', ')})`);
  const overlaps = labels.flatMap((a, i) => labels.slice(i + 1).filter((b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).map((b) => `${a.id ?? 'marker'}/${b.id ?? 'marker'}`));
  assert(overlaps.length === 0, `${repo}: no label overlap (${overlaps.join(', ')})`);
  assert(labels.every((l) => l.size >= 12), `${repo}: labels are >= 12 px`);
  return labels;
}

async function expectTransfer(page, key) {
  const t = page.locator(`[data-transfer="${key}"] path.rr-transfer`);
  assert((await t.count()) === 1, `transfer ${key} is drawn`);
  const style = await t.evaluate((el) => ({
    dash: getComputedStyle(el).strokeDasharray,
    width: Number.parseFloat(getComputedStyle(el).strokeWidth),
    head: Number(el.parentElement.querySelector('path.rr-arrow')?.dataset.arrow ?? 0),
    casing: el.parentElement.querySelector('path.rr-halo') !== null,
  }));
  // DESIGN §4: a ground casing, a `6 3` dash at most 3.5 px wide and a 7 px arrowhead (twice the widest dash).
  assert(style.dash === '6px, 3px' && style.width <= 3.5 && style.head === 7 && style.casing, `transfer ${key} is dashed with an arrowhead (${JSON.stringify(style)})`);
}

const lum = (rgb) => rgb.map((c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)].toSorted((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const rgb = (css) => css.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);

export default async function phase5({ page, baseURL }) {
  // AC4 + reveal: with motion allowed, the mark fires < 1500 ms after navigation and the clip-path reveal runs.
  await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'light' });
  await open(page, baseURL, 'vitejs/vite');
  await page.waitForFunction(() => performance.getEntriesByName('rivers-rendered').length > 0, null, { timeout: 5000 });
  const rendered = await page.evaluate(() => performance.getEntriesByName('rivers-rendered')[0]?.startTime);
  assert(rendered !== undefined && rendered < 1500, `rivers-rendered at ${rendered?.toFixed(0)} ms (< 1500)`);
  console.log(`  rivers-rendered at ${rendered.toFixed(0)} ms after navigation`);
  const anim = await page.locator('.rr-reveal').evaluate((g) => getComputedStyle(g).animationName);
  assert(anim === 'rr-reveal', `reveal animation runs with motion allowed (got ${anim})`);
  const fonts = await page.evaluate(async () => (await document.fonts.ready, [...document.fonts].filter((f) => f.family.includes('Alegreya Sans')).map((f) => f.status)));
  assert(fonts.includes('loaded'), `self-hosted Alegreya Sans loaded (${fonts})`);
  await page.waitForTimeout(REVEAL_MS);

  // AC2 / S1 / S3: Vite labels and transfers; focus ring contrast on a chip (>= 3:1).
  await expectLabels(page, 'vite');
  await expectTransfer(page, 'm:playground→m:packages/playground');
  await tabTo(page, 'nav[aria-label="Built-in samples"] button');
  const ring = await page.evaluate(() => ({ outline: getComputedStyle(document.activeElement).outlineColor, style: getComputedStyle(document.activeElement).outlineStyle, bg: getComputedStyle(document.body).backgroundColor }));
  assert(ring.style !== 'none' && contrast(rgb(ring.outline), rgb(ring.bg)) >= 3, `focus ring >= 3:1 (${ring.outline} on ${ring.bg})`);
  await page.evaluate(() => document.activeElement.blur());
  await shoot(page, '01-vite-desktop', DESKTOP);
  await shootCvd(page, '07-vite', DESKTOP);

  // AC1: switching samples keeps the page (no reload) and updates ?sample=; back/forward work.
  await page.evaluate(() => (window.rrNoReload = true));
  await page.getByRole('button', { name: 'Svelte' }).click();
  await page.locator(`${CHART}[aria-label*="sveltejs/svelte"]`).waitFor({ state: 'visible' });
  await page.waitForTimeout(REVEAL_MS);
  assert(new URL(page.url()).searchParams.get('sample') === 'svelte', 'URL is ?sample=svelte after switching');
  await expectLabels(page, 'svelte');
  await expectTransfer(page, 'm:site→m:documentation');
  assert((await page.locator('[data-clip="↑ 224K"]').count()) === 1, 'Svelte shows the break mark and "↑ 224K"');
  await shoot(page, '03-svelte-desktop', DESKTOP);
  await page.getByRole('button', { name: 'Express' }).click();
  await page.locator(`${CHART}[aria-label*="expressjs/express"]`).waitFor({ state: 'visible' });
  await page.waitForTimeout(REVEAL_MS);
  await expectLabels(page, 'express');
  await shoot(page, '04-express-desktop', DESKTOP);
  await page.goBack();
  await page.locator(`${CHART}[aria-label*="sveltejs/svelte"]`).waitFor({ state: 'visible' });
  assert(await page.evaluate(() => window.rrNoReload === true), 'switching samples and going back never reloaded the page');

  // AC1: deep link.
  await open(page, `${baseURL}?sample=svelte`, 'sveltejs/svelte');
  assert((await page.getByRole('button', { name: 'Svelte' }).getAttribute('aria-pressed')) === 'true', '?sample=svelte selects the Svelte chip');

  // AC6 / S7: dark theme with the dark waters (no hue: Radix blue 12 and 11), estimated rule and partial marker.
  await page.emulateMedia({ colorScheme: 'dark' });
  await open(page, baseURL, 'vitejs/vite');
  await page.waitForTimeout(REVEAL_MS);
  const dark = await page.evaluate(() => ({
    bg: getComputedStyle(document.body).backgroundColor,
    fills: [...new Set([...document.querySelectorAll('path[data-river]:not(.rr-other)')].map((p) => getComputedStyle(p).fill))],
    estimated: document.querySelectorAll('[data-estimated]').length,
    partial: document.querySelectorAll('[data-partial]').length,
  }));
  assert(dark.bg === 'rgb(17, 25, 39)', `dark background is Radix blue 2 (${dark.bg})`);
  assert(dark.fills.toSorted().join() === 'rgb(112, 184, 255),rgb(194, 230, 255)', `dark river fills are water A and B (${dark.fills})`);
  assert(dark.estimated > 0 && dark.partial === 1, 'estimated rule and partial marker present');
  await shoot(page, '05-dark-desktop', DESKTOP);
  await page.emulateMedia({ colorScheme: 'light' });

  // AC5 / S6: reduced motion draws everything on first paint.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(baseURL, { waitUntil: 'commit' });
  await page.locator('path[data-river]').first().waitFor({ state: 'attached', timeout: 5000 });
  await page.waitForTimeout(50);
  const still = await page.locator('.rr-reveal').evaluate((g) => [getComputedStyle(g).animationName, getComputedStyle(g).clipPath]);
  assert(still[0] === 'none' && still[1] === 'none', `no reveal under reduced motion (${still})`);
  await shoot(page, '06-reduced-motion-desktop', DESKTOP);

  // S4 / mobile: labelled, focusable scroll region; >= 12 px labels; >= 2 labels in the first view and per full 360 px window.
  await page.setViewportSize(MOBILE);
  const region = page.locator('[role="region"][aria-label][tabindex="0"]');
  await region.waitFor({ state: 'visible' });
  assert(await region.evaluate((el) => el.scrollWidth > el.clientWidth), 'the chart region scrolls sideways');
  assert(await page.getByText('Scroll for later years').isVisible(), 'scroll caption visible');
  const labels = await expectLabels(page, 'vite mobile');
  const view = await region.evaluate((el) => el.getBoundingClientRect().width);
  assert(labels.filter((l) => l.id && l.sx + l.sw <= view).length >= 2, '>= 2 labels in the first mobile viewport');
  const { width } = await readChart(page);
  for (let lo = 0; lo + 360 <= width; lo += 360) {
    const n = labels.filter((l) => l.id && l.sx >= lo && l.sx + l.sw <= lo + 360).length;
    assert(n >= 2, `>= 2 labels in mobile window ${lo}-${lo + 360} (got ${n})`);
  }
  await tabTo(page, '[role="region"]');
  await shoot(page, '02-vite-mobile', MOBILE);
  // R4 review: switching dimension on the phone leaves no name behind (every name belongs to a drawn river).
  await open(page, `${baseURL}?sample=express`, 'expressjs/express');
  await page.locator('.rr-seg label', { hasText: 'Contributors' }).click();
  await page.locator(`${CHART} path[data-river^="p:"]`).first().waitFor();
  const stale = await page.evaluate((sel) => {
    const svg = document.querySelector(sel);
    const rivers = new Set([...svg.querySelectorAll('path[data-river]')].map((p) => p.dataset.river));
    return [...svg.querySelectorAll('[data-label-for]')].map((t) => t.dataset.labelFor).filter((id) => !rivers.has(id));
  }, CHART);
  assert(stale.length === 0, `mobile Express contributors: every name has its river (stale ${stale.join(', ')})`);
  await page.setViewportSize(DESKTOP);
}
