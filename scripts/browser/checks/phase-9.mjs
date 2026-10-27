// Phase 9: era annotations (docs/viz/rivers.md §8 and S9). Offline: /api/repo and
// /api/eras are mocked with page.route; the AI swap answers after a delay, the fallback answers 503.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DESKTOP, MOBILE, allowConsoleError, assert, runAxe, shoot, shootCvd, tabTo } from '../lib.mjs';

const ROOT = join(import.meta.dirname, '../../..');
const sample = (id) => JSON.parse(readFileSync(join(ROOT, `src/samples/${id}.json`), 'utf8'));
const CHART = '[data-testid="river-chart"]';
const TRACK = '[data-testid="era-track"]';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readout = (page) => page.locator('[data-testid="readout"] p[aria-hidden]').first().innerText();
const ndjson = (lines) => ({ status: 200, contentType: 'application/x-ndjson; charset=utf-8', body: lines.map((l) => `${JSON.stringify(l)}\n`).join('') });
const withoutEras = (agg) => Object.fromEntries(Object.entries(agg).filter(([k]) => k !== 'eras'));

const lum = (rgb) => rgb.map((c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].toSorted((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const rgb = (css) => css.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);

/**
 * Geometry of the era band (DESIGN §4): each era's rule (x, from the SVG) vs. bucket boundaries (from the axis
 * line), its name lines and range, the buttons over them, and where the plot starts.
 */
const measure = (page, buckets) => page.evaluate(([chart, track, B]) => {
  const svg = document.querySelector(chart);
  const box = svg.getBoundingClientRect();
  const axis = svg.querySelector('.rr-axis-line');
  const [left, right] = [Number(axis.getAttribute('x1')), Number(axis.getAttribute('x2'))];
  const w = (right - left) / B;
  const buttons = [...document.querySelectorAll(`${track} .rr-era`)];
  const eras = [...svg.querySelectorAll('[data-era-mark]')].map((g, i) => {
    const names = [...g.querySelectorAll('text.rr-era-name')];
    const t = names[0];
    return {
      x0: Number(g.querySelector('line').getAttribute('x1')), textX: Math.min(...names.map((n) => Number(n.getAttribute('x')))),
      title: names.map((n) => n.textContent).join(' '), range: g.querySelector('.rr-era-range').textContent,
      bottom: Math.max(...[...g.querySelectorAll('text')].map((n) => n.getBoundingClientRect().bottom)) - box.y,
      source: buttons[i]?.dataset.source, font: getComputedStyle(t).fontFamily, size: getComputedStyle(t).fontSize, color: getComputedStyle(t).fill,
    };
  });
  const plotTop = Math.min(...[...svg.querySelectorAll('path[data-river]')].map((p) => p.getBoundingClientRect().top)) - box.y;
  return { left, w, eras, buttons: buttons.length, plotTop, chartTop: box.top + scrollY, legend: document.querySelector('.rr-legend')?.textContent ?? '' };
}, [CHART, TRACK, buckets]);

/** S9 / DESIGN §4: every era's rule and name sit within 1 px of its first bucket's left edge. */
function expectAligned(m, eras, what) {
  assert(m.eras.length === eras.length, `${what}: ${eras.length} eras drawn (got ${m.eras.length})`);
  eras.forEach((e, i) => {
    const want = m.left + e.start * m.w;
    const got = [m.eras[i].x0, m.eras[i].textX];
    assert(got.every((x) => Math.abs(x - want) <= 1), `${what}: era ${i} rule and name at ${got} vs bucket edge ${want}`);
  });
}
/** An era note as the UI writes it (summary.ts `eraNote`). */
const asSentence = (note) => {
  const t = note.trim().replace(/; /g, ', ');
  return t ? `${t.charAt(0).toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? '' : '.'}` : '';
};

export default async function phase9({ page, baseURL }) {
  const bg = rgb(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
  // AC4 + AC5: the default sample (Vite) ships heuristic eras; rules aligned, 16 px Alegreya Sans, ≥ 4.5:1, no AI label.
  await page.goto(baseURL, { waitUntil: 'load' });
  await page.locator(TRACK).waitFor({ state: 'visible', timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);
  const vite = sample('vite');
  const m = await measure(page, vite.time.starts.length);
  assert(m.eras.length === vite.eras.length && m.eras.length >= 3 && m.eras.length <= 6, `3-6 eras drawn (got ${m.eras.length})`);
  expectAligned(m, vite.eras, 'vite desktop');
  assert(m.eras.every((e, i) => e.title === vite.eras[i].title && e.source === 'heuristic'), `the sample shows its shipped heuristic titles (${m.eras.map((e) => e.title)})`);
  assert(m.eras.every((e) => /^Q\d \d{4}( to Q\d \d{4})?$/.test(e.range)), `ranges read "Q2 2020 to Q1 2021" (${m.eras.map((e) => e.range)})`);
  assert(m.buttons === vite.eras.length, 'one button per era');
  assert(!m.legend.includes('AI'), '"era names by AI" is absent for heuristic names');
  assert(m.eras.every((e) => /Alegreya Sans/.test(e.font) && e.size === '16px'), `names in 16 px Alegreya Sans (got ${m.eras[0].font} ${m.eras[0].size})`);
  const ratio = Math.min(...m.eras.map((e) => contrast(rgb(e.color), bg)));
  assert(ratio >= 4.5, `era name contrast ≥ 4.5:1 (got ${ratio.toFixed(2)})`);
  assert(m.eras.every((e) => e.bottom <= m.plotTop), `era names sit in the band above the plot (${m.eras.map((e) => e.bottom)} vs ${m.plotTop})`);
  const bands = await page.locator(`${CHART} [data-era-band]`).count();
  assert(bands === 0, `no era band until an era is selected (got ${bands})`);
  const prose = await page.locator('.rr-summary').textContent();
  assert(prose.includes(`${vite.eras.length} eras: ${vite.eras[0].title}`), 'the prose summary lists the eras');
  const list = await page.locator('.rr-era-list li').evaluateAll((lis) => lis.map((li) => li.textContent));
  assert(list.length === vite.eras.length && vite.eras.every((e, i) => list[i].includes(e.title) && list[i].endsWith(asSentence(e.note))), `the Eras section lists every era with its note (${list})`);
  await runAxe(page, 'eras');
  await page.evaluate(() => scrollTo(0, document.querySelector('.rr-card').getBoundingClientRect().top + scrollY - 8));
  await shoot(page, '01-eras-vite-desktop');

  // AC5: keyboard — the eras come right after the chart in tab order; focus shows the note in the readout.
  await tabTo(page, '[aria-roledescription="river chart"]');
  await page.keyboard.press('Tab');
  assert(await page.evaluate(() => document.activeElement?.dataset.era === '0'), 'Tab from the chart reaches the first era');
  const line = await readout(page);
  assert(line === `${vite.eras[0].title}, ${m.eras[0].range}. ${asSentence(vite.eras[0].note)}`, `readout shows the era (got "${line}")`);
  const sr = await page.evaluate(() => {
    const b = document.activeElement;
    return { label: b.getAttribute('aria-label'), note: document.getElementById(b.getAttribute('aria-describedby') ?? '')?.textContent };
  });
  assert(sr.label === `${vite.eras[0].title}, ${m.eras[0].range}`, `the era button’s name is its title and dates (got "${sr.label}")`);
  assert(sr.note === asSentence(vite.eras[0].note), `the era button’s description is its note (got "${sr.note}")`);
  for (let i = 1; i < vite.eras.length; i++) {
    await page.keyboard.press('Tab');
    assert(await page.evaluate((n) => document.activeElement?.dataset.era === String(n), i), `Tab reaches era ${i}`);
  }
  await page.keyboard.press('Shift+Tab');
  const active = await page.locator(`${CHART} [data-era-band]`).count();
  assert(active === 1, 'the focused era’s band is highlighted');
  // The focus indicator is the 2 px focus ring around the era's own name, never over a neighbour's button.
  const ring = await page.evaluate(() => {
    const b = document.activeElement;
    const r = b.getBoundingClientRect();
    const hit = [...document.querySelectorAll('.rr-era')].filter((o) => o !== b).some((o) => {
      const q = o.getBoundingClientRect();
      return q.left < r.right && r.left < q.right;
    });
    return { outline: getComputedStyle(b).outlineStyle, width: getComputedStyle(b).outlineWidth, hit };
  });
  assert(ring.outline === 'solid' && ring.width === '2px' && !ring.hit, `era focus: a 2 px ring over the era's own name (got ${JSON.stringify(ring)})`);
  await page.evaluate(() => scrollTo(0, document.querySelector('.rr-card').getBoundingClientRect().top + scrollY - 8));
  await shoot(page, '03-era-focus-desktop');
  await page.evaluate(() => document.activeElement.blur());

  // R6 phone: a full-width rule at each era start (time runs down, 56 px per bucket from y 24) with the era name
  // right-aligned under it; the era buttons sit over the names (>= 44 px); focusing one docks its note in the readout.
  await page.setViewportSize(MOBILE);
  await page.reload({ waitUntil: 'load' }); // a fresh chart, without the keyboard run's focus state
  await page.locator(`${CHART}[data-phone]`).waitFor({ state: 'visible' });
  const pm = await page.evaluate(([chart, track]) => {
    const svg = document.querySelector(chart);
    const W = svg.getBoundingClientRect().width;
    return {
      W,
      rules: [...svg.querySelectorAll('line[data-era-mark]')].map((l) => [Number(l.getAttribute('y1')), Number(l.getAttribute('x1')), Number(l.getAttribute('x2'))]),
      names: [...svg.querySelectorAll('text.rr-phone-era')].map((t) => ({ text: t.textContent, x: Number(t.getAttribute('x')), anchor: t.getAttribute('text-anchor'), size: getComputedStyle(t).fontSize, weight: getComputedStyle(t).fontWeight, halo: getComputedStyle(t).strokeWidth })),
      buttons: [...document.querySelectorAll(`${track} .rr-era`)].map((b) => b.getBoundingClientRect().height),
    };
  }, [CHART, TRACK]);
  assert(pm.rules.length === vite.eras.length && vite.eras.every((e, i) => Math.abs(pm.rules[i][0] - (24 + 56 * e.start)) <= 0.5 && pm.rules[i][1] === 0 && pm.rules[i][2] === pm.W),
    `phone: a full-width rule at each era start (${JSON.stringify(pm.rules)})`);
  assert(pm.names.every((n, i) => n.text === vite.eras[i].title && n.x === pm.W && n.anchor === 'end' && n.size === '13px' && n.weight === '500' && n.halo === '6px'),
    `phone: era names right-aligned, 13/500 with a 6 px halo (${JSON.stringify(pm.names)})`);
  assert(pm.buttons.length === vite.eras.length && pm.buttons.every((h) => h >= 44), `phone: era buttons are >= 44 px tall (${pm.buttons})`);
  await page.evaluate(() => scrollTo(0, document.querySelector('.rr-card').getBoundingClientRect().top + scrollY - 8));
  await shoot(page, '02-eras-mobile', MOBILE);
  await page.locator(`${TRACK} .rr-era`).first().focus();
  await page.waitForFunction(() => document.querySelector('[data-testid="readout"]').dataset.docked === 'true', null, { timeout: 3000 });
  const docked = await page.locator('[data-testid="readout"]').evaluate((r) => r.getBoundingClientRect().bottom <= innerHeight + 1 && r.getBoundingClientRect().top >= 0);
  assert(docked && (await readout(page)).startsWith(vite.eras[0].title) && (await page.locator(`${CHART} [data-era-band]`).count()) === 1,
    'phone: focusing an era bands it and docks its note on screen');
  await page.evaluate(() => document.activeElement.blur());
  await page.setViewportSize(DESKTOP);

  // CVD screenshots (Svelte: 5 eras, two bands).
  await page.goto(`${baseURL}?sample=svelte`, { waitUntil: 'load' });
  await page.locator(TRACK).waitFor({ state: 'visible', timeout: 10_000 });
  await page.evaluate(() => scrollTo(0, document.querySelector('.rr-card').getBoundingClientRect().top + scrollY - 8));
  await shootCvd(page, '06-eras');

  // AC5 + S9: a repo served by the Worker shows heuristic names at once, then AI names swap in with no shift.
  await page.evaluate(() => localStorage.clear());
  const express = withoutEras(sample('express'));
  let asked = 0;
  let release;
  const held = new Promise((r) => (release = r));
  await page.route('**/api/repo/expressjs/express', (r) => r.fulfill(ndjson([{ type: 'result', cache: 'miss', aggregate: express }])));
  await page.route('**/api/eras', async (route) => {
    asked++;
    const { summary } = route.request().postDataJSON();
    await held;
    const eras = summary.eras.map(({ start, end }, i) => ({ start, end, title: ['Callbacks and routers', 'The long test era', 'Steady maintenance'][i] ?? `Era ${i}`, note: `Model-written note ${i}.`, source: 'ai' }));
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ eras, source: 'ai' }) });
  });
  await page.locator('#rr-repo').fill('expressjs/express');
  await page.locator('#rr-repo').press('Enter');
  await page.locator(`${CHART}[aria-label^="River chart of expressjs/express:"]`).waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator(TRACK).waitFor({ state: 'visible' });
  const B = express.time.starts.length;
  const before = await measure(page, B);
  assert(before.eras.every((e) => e.source === 'heuristic') && !before.legend.includes('AI'), 'heuristic names render immediately');
  release();
  await page.locator(`${TRACK} .rr-era[data-source="ai"]`).first().waitFor({ state: 'attached', timeout: 10_000 });
  const after = await measure(page, B);
  assert(asked === 1, `exactly one /api/eras request (got ${asked})`);
  assert(after.eras.every((e) => e.source === 'ai') && after.eras[0].title === 'Callbacks and routers', 'AI names swapped in');
  assert(after.legend.includes('era names by AI'), '"era names by AI" appears in the legend with AI names');
  assert(after.chartTop === before.chartTop && after.plotTop === before.plotTop, `no layout shift: chart top ${before.chartTop} → ${after.chartTop}`);
  assert(JSON.stringify(after.eras.map((e) => e.x0)) === JSON.stringify(before.eras.map((e) => e.x0)), 'era rules unchanged by the swap');
  expectAligned(after, express.eras ?? sample('express').eras, 'express after the swap');
  const cached = await page.evaluate(() => JSON.parse(localStorage.getItem('rr:agg:v1:expressjs/express'))?.aggregate?.eras);
  assert(cached?.length === after.eras.length && cached.every((e) => e.source === 'ai'), 'AI eras are cached with the aggregate');
  assert((await page.locator('.rr-summary').textContent()).includes('Era names were written by AI.'), 'the prose summary says AI named the eras');
  assert((await page.locator('.rr-era-title').first().textContent()) === 'Callbacks and routers, named by AI', 'the Eras section shows the AI names, said to be by AI');
  await runAxe(page, 'ai eras');
  await page.evaluate(() => scrollTo(0, document.querySelector('.rr-card').getBoundingClientRect().top + scrollY - 8));
  await shoot(page, '04-eras-ai-swap');
  // Reload: from the browser cache, AI names at once and no request.
  await page.reload({ waitUntil: 'load' });
  await page.locator(`${TRACK} .rr-era[data-source="ai"]`).first().waitFor({ state: 'attached', timeout: 10_000 });
  assert(asked === 1, 'a reload uses the cached AI names (no /api/eras request)');

  // O3: /api/eras answers 503 → the heuristic names stay, silently.
  allowConsoleError(/status of 503.*\/api\/eras/);
  await page.unroute('**/api/eras');
  let failed = 0;
  await page.route('**/api/eras', (r) => (failed++, r.fulfill({ status: 503, contentType: 'text/plain', body: 'unavailable' })));
  await page.route('**/api/repo/sveltejs/svelte', (r) => r.fulfill(ndjson([{ type: 'result', cache: 'miss', aggregate: withoutEras(sample('svelte')) }])));
  const answered = page.waitForResponse('**/api/eras', { timeout: 10_000 });
  await page.locator('#rr-repo').fill('sveltejs/svelte');
  await page.locator('#rr-repo').press('Enter');
  await page.locator(`${CHART}[aria-label^="River chart of sveltejs/svelte:"]`).waitFor({ state: 'visible', timeout: 10_000 });
  await page.waitForFunction(() => document.querySelector('[data-testid="era-track"]'));
  await answered;
  await sleep(200);
  const fb = await measure(page, sample('svelte').time.starts.length);
  assert(failed === 1, `one /api/eras attempt (got ${failed})`);
  assert(fb.eras.length === sample('svelte').eras.length && fb.eras.every((e, i) => e.source === 'heuristic' && e.title === sample('svelte').eras[i].title), 'heuristic names stay after a 503');
  assert(!fb.legend.includes('AI'), 'no "era names by AI" after the fallback');
  assert(!(await page.locator('[role="alert"]').count()), 'no error is shown');
  await runAxe(page, 'heuristic fallback');
  await page.evaluate(() => scrollTo(0, document.querySelector('.rr-card').getBoundingClientRect().top + scrollY - 8));
  await shoot(page, '05-eras-heuristic-fallback');
}
