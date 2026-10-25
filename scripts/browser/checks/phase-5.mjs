// Phase 5: the river chart (docs/PLAN.md phase 5, docs/viz/rivers.md S1–S7), in the Cyanotype design and its motion
// (docs/redesign/DESIGN.md §4–§6).
import { DESKTOP, MOBILE, assert, shoot, shootCvd, tabTo } from '../lib.mjs';

const CHART = '[data-testid="river-chart"]';
const REVEAL_MS = 1000; // the arrive reveal is 900 ms (DESIGN §6)

/** Records every Web Animations call (id, duration, easing) in `window.rrAnimated`, from the first script on. */
const recordAnimations = () => {
  window.rrAnimated = [];
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (frames, options) {
    window.rrAnimated.push({ id: options?.id ?? '', ms: options?.duration, easing: options?.easing ?? 'linear', ghost: this.closest('.rr-ghost') !== null });
    return animate.call(this, frames, options);
  };
};
const animated = (page) => page.evaluate(() => window.rrAnimated.splice(0));
const count = (log, id) => log.filter((a) => a.id === id).length;

/**
 * R7 / DESIGN §6: the arrive reveal (900 ms ease-out, with the era fade) runs once per load and again after a
 * sample is chosen, never on a view switch (that crossfades in 250 ms), a theme switch, a resize or focus; focus
 * runs the river's moved-files dashes forward once (600 ms), not again while moving between its quarters.
 */
async function expectMotion(page, baseURL) {
  await open(page, `${baseURL}?sample=svelte`, 'sveltejs/svelte');
  let log = await animated(page);
  assert(count(log, 'rr-arrive') === 1 && count(log, 'rr-arrive-eras') === 1, `the arrive reveal runs once on load (${JSON.stringify(log)})`);
  const reveal = log.find((a) => a.id === 'rr-arrive');
  assert(reveal.ms === 900 && reveal.easing === 'ease-out', `the reveal is 900 ms ease-out (${JSON.stringify(reveal)})`);
  await page.waitForTimeout(REVEAL_MS);

  await page.locator('.rr-seg label', { hasText: 'Contributors' }).click();
  await page.locator(`${CHART} path[data-river^="p:"]`).first().waitFor();
  log = await animated(page);
  assert(count(log, 'rr-arrive') === 0 && count(log, 'rr-crossfade-in') === 1 && log.filter((a) => a.id.startsWith('rr-crossfade')).every((a) => a.ms === 250),
    `switching to Contributors crossfades in 250 ms, without the reveal (${JSON.stringify(log)})`);
  await page.waitForTimeout(400);
  assert((await page.locator('.rr-ghost').count()) === 0, 'the crossfade removes its fading copy');
  await page.locator('.rr-seg label', { hasText: 'Modules' }).click();
  await page.waitForTimeout(400);
  const theme = page.locator('header .rr-icon');
  await theme.click();
  await theme.click();
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.setViewportSize(MOBILE);
  await page.locator(`${CHART}[data-phone]`).waitFor();
  await page.setViewportSize(DESKTOP);
  await page.locator(`${CHART}:not([data-phone])`).waitFor();
  await page.waitForTimeout(400);
  log = await animated(page);
  assert(count(log, 'rr-arrive') === 0 && log.every((a) => a.id.startsWith('rr-crossfade')), `theme switches and resizes never replay the reveal (${JSON.stringify(log)})`);

  await page.locator('.rr-plot').focus(); // focus-in: the largest river, which moved files in (Svelte: packages)
  await page.waitForTimeout(50);
  log = await animated(page);
  const dash = log.filter((a) => a.id === 'rr-dash');
  assert(dash.length > 0 && dash.every((a) => a.ms === 600) && count(log, 'rr-arrive') === 0, `focus runs the river's dashes once, 600 ms (${JSON.stringify(log)})`);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(50);
  assert((await animated(page)).length === 0, 'moving between quarters of the same river runs nothing');
  // R7 review: with a river pinned, a view switch animates only the live drawing; the fading copy is not the drawing.
  await page.keyboard.press('Enter');
  await page.locator('.rr-seg label', { hasText: 'Contributors' }).click();
  const during = await page.evaluate(() => ({
    reveal: [...document.querySelectorAll('.rr-reveal')].map((g) => g.classList.contains('rr-ghost')),
    ghost: [...document.querySelectorAll('.rr-ghost')].map((g) => g.getAttribute('class')),
  }));
  assert(during.reveal.length === 1 && !during.reveal[0] && during.ghost.every((c) => !/rr-reveal|rr-focusing/.test(c)), `only the live drawing is .rr-reveal during a crossfade (${JSON.stringify(during)})`);
  await page.waitForTimeout(400);
  log = await animated(page);
  assert(log.filter((a) => a.id === 'rr-dash').every((a) => !a.ghost), `dash runs never land on the fading copy (${JSON.stringify(log)})`);
  await page.locator('.rr-seg label', { hasText: 'Modules' }).click();
  await page.waitForTimeout(400);
  await animated(page);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Vite' }).click();
  await page.locator(`${CHART}[aria-label*="vitejs/vite"]`).waitFor({ state: 'visible' });
  await page.waitForTimeout(50);
  log = await animated(page);
  assert(count(log, 'rr-arrive') === 1, `choosing a sample replays the reveal once (${JSON.stringify(log)})`);
  await page.waitForTimeout(REVEAL_MS);
}

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

/** Cumulative layout shift of a fresh load of `url` at `viewport` (no input), after the chart and 1.5 s. */
async function cls(page, url, viewport) {
  await page.setViewportSize(viewport);
  await page.goto(url, { waitUntil: 'load' });
  await page.locator(CHART).waitFor({ state: 'visible', timeout: 10_000 });
  await page.waitForTimeout(1500);
  return page.evaluate(() => window.rrShift);
}

export default async function phase5({ page, baseURL }) {
  // R7 review: loading the page moves nothing (the fonts above the fold are preloaded; the chart head and the chart
  // keep their heights while the sample arrives): CLS < 0.05 on / at 1440 and 390.
  await page.addInitScript(() => {
    window.rrShift = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (!e.hadRecentInput) window.rrShift += e.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  for (const viewport of [{ width: 1440, height: 900 }, MOBILE]) {
    const shift = await cls(page, baseURL, viewport);
    assert(shift < 0.05, `CLS on / at ${viewport.width} is < 0.05 (got ${shift.toFixed(4)})`);
    console.log(`  CLS on / at ${viewport.width}: ${shift.toFixed(4)}`);
  }
  await page.setViewportSize(DESKTOP);

  // AC4 + reveal: with motion allowed, the mark fires < 1500 ms after navigation and the clip-path reveal runs.
  await page.emulateMedia({ reducedMotion: 'no-preference', colorScheme: 'light' });
  await open(page, baseURL, 'vitejs/vite');
  await page.waitForFunction(() => performance.getEntriesByName('rivers-rendered').length > 0, null, { timeout: 5000 });
  const rendered = await page.evaluate(() => performance.getEntriesByName('rivers-rendered')[0]?.startTime);
  assert(rendered !== undefined && rendered < 1500, `rivers-rendered at ${rendered?.toFixed(0)} ms (< 1500)`);
  console.log(`  rivers-rendered at ${rendered.toFixed(0)} ms after navigation`);
  const fonts = await page.evaluate(async () => (await document.fonts.ready, [...document.fonts].filter((f) => f.family.includes('Alegreya Sans')).map((f) => f.status)));
  assert(fonts.includes('loaded'), `self-hosted Alegreya Sans loaded (${fonts})`);
  await page.addInitScript(recordAnimations);
  await expectMotion(page, baseURL);
  await open(page, baseURL, 'vitejs/vite');
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

  // AC5 / S6 / DESIGN §6: reduced motion draws everything on first paint, and nothing animates: no reveal, no
  // crossfade, no dash run, no fade.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${baseURL}?sample=svelte`, { waitUntil: 'commit' });
  await page.locator('path[data-river]').first().waitFor({ state: 'attached', timeout: 5000 });
  await page.waitForTimeout(50);
  const still = await page.locator('.rr-reveal').evaluate((g) => [getComputedStyle(g).animationName, getComputedStyle(g).clipPath]);
  assert(still[0] === 'none' && still[1] === 'none', `no reveal under reduced motion (${still})`);
  await page.locator('.rr-seg label', { hasText: 'Contributors' }).click();
  await page.locator('.rr-seg label', { hasText: 'Modules' }).click();
  await page.locator('.rr-plot').focus();
  await page.keyboard.press('ArrowDown');
  const quiet = await page.evaluate(() => ({ called: window.rrAnimated.splice(0), running: document.getAnimations().map((a) => a.id || a.animationName || a.transitionProperty) }));
  assert(quiet.called.length === 0 && quiet.running.length === 0, `nothing animates under reduced motion (${JSON.stringify(quiet)})`);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await open(page, baseURL, 'vitejs/vite');
  await shoot(page, '06-reduced-motion-desktop', DESKTOP);

  // R6 / DESIGN §5: the phone chart runs down the page (time top to bottom), no horizontal scroll anywhere; names
  // only inside a run, reading downward; a tap focuses a river and docks the readout, Escape releases it.
  await page.setViewportSize(MOBILE);
  await page.locator(`${CHART}[data-phone]`).waitFor({ state: 'visible' });
  const phone = await page.evaluate((sel) => {
    const svg = document.querySelector(sel);
    const r = svg.getBoundingClientRect();
    return {
      scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      region: document.querySelectorAll('[role="region"]').length + document.querySelectorAll('.rr-caption').length,
      w: r.width, h: r.height, left: r.left,
      names: [...svg.querySelectorAll('text[data-label-for]')].map((t) => t.getAttribute('transform') ?? ''),
    };
  }, CHART);
  assert(phone.scroll <= 0 && phone.region === 0, `phone: no horizontal scroll and no scroll region (overflow ${phone.scroll}, regions ${phone.region})`);
  assert(phone.h > phone.w && phone.left === 16 && phone.w === MOBILE.width - 32, `phone: the chart is the column's width and taller than wide (${phone.w}x${phone.h} at ${phone.left})`);
  assert(phone.names.length >= 1 && phone.names.every((t) => t.startsWith('rotate(90.0')), `phone: names read downward (${phone.names})`);
  const phoneLabels = (await readChart(page)).labels.filter((l) => l.id);
  const crossed = phoneLabels.flatMap((a, k) => phoneLabels.slice(k + 1).filter((b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));
  assert(crossed.length === 0 && phoneLabels.every((l) => l.size >= 12), 'phone: names do not overlap and are >= 12 px');
  const docked = () => page.locator('[data-testid="readout"]').evaluate((r) => ({ on: r.dataset.docked === 'true', pos: getComputedStyle(r).position, bottom: Math.round(r.getBoundingClientRect().bottom), h: r.getBoundingClientRect().height, pad: parseFloat(getComputedStyle(document.body).paddingBottom) }));
  const big = (await readChart(page)).rivers.toSorted((a, b) => b.total - a.total)[0].id;
  await page.evaluate((sel) => scrollTo(0, document.querySelector(sel).getBoundingClientRect().top + scrollY - 100), CHART);
  // A point on the largest river inside the viewport (the overlays let pointers through to the drawing).
  const box = await page.evaluate(({ sel, id }) => {
    const L = document.querySelector(sel).getBoundingClientRect();
    for (let y = Math.max(L.top, 0) + 40; y < innerHeight - 120; y += 6) {
      for (let x = L.left + 40; x < L.right - 30; x += 3) if (document.elementFromPoint(x, y)?.dataset?.river === id) return { x, y };
    }
    return null;
  }, { sel: CHART, id: big });
  assert(box, `phone: found a point on ${big}`);
  // A plain hover never docks; docking keeps the readout's slot, so nothing below it moves.
  await page.mouse.move(box.x, box.y);
  await page.mouse.move(box.x + 1, box.y + 1);
  assert(!(await docked()).on, 'phone: a hover alone does not dock the readout');
  const legendY = () => page.locator('.rr-legend').evaluate((l) => l.getBoundingClientRect().top + scrollY);
  const before = await legendY();
  await page.mouse.click(box.x, box.y);
  await page.waitForFunction(() => document.querySelector('[data-testid="readout"]').dataset.docked === 'true', null, { timeout: 2000 });
  const on = await docked();
  assert(on.pos === 'fixed' && on.bottom === MOBILE.height && on.h >= 72 && on.pad >= on.h, `phone: a tap docks the readout to the viewport bottom and pads the page (${JSON.stringify(on)})`);
  assert(Math.abs((await legendY()) - before) < 0.5, 'phone: docking does not move the content below the readout');
  const glyphs = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.rr-legend li[data-legend] svg')].map((g) => [g.closest('li').dataset.legend, Number(g.getAttribute('width')) < Number(g.getAttribute('height')) ? 'vertical' : 'horizontal'])));
  assert(glyphs.estimated === 'vertical' && glyphs.partial === 'horizontal', `phone: legend glyphs turn with the chart (${JSON.stringify(glyphs)})`);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('[data-testid="readout"]').dataset.docked, null, { timeout: 2000 });
  const off = await docked();
  assert(off.pos !== 'fixed' && off.pad === 0, `phone: Escape releases the river and the readout returns to the page (${JSON.stringify(off)})`);
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
  await open(page, `${baseURL}?sample=svelte`, 'sveltejs/svelte');
  const clip = await page.locator(`${CHART} text.rr-clip-label`).allTextContents();
  assert(clip.length === 1 && clip[0] === '← 224K', `phone: the clipped Svelte column's label points left, where it is cut (${clip})`);
  await page.setViewportSize(DESKTOP);
}
