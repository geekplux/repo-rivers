// Phase 9: era annotations (docs/PLAN.md phase 9, docs/viz/rivers.md §8 and S9). Offline: /api/repo and
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

/** Geometry of the track and chart: bracket edges vs. bucket boundaries (from the axis line), titles, chart top. */
const measure = (page, buckets) => page.evaluate(([chart, track, B]) => {
  const svg = document.querySelector(chart);
  const box = svg.getBoundingClientRect();
  const axis = [...svg.querySelectorAll('.rr-axis line.rr-grid')].find((l) => l.getAttribute('y1') === l.getAttribute('y2'));
  const [left, right] = [Number(axis.getAttribute('x1')), Number(axis.getAttribute('x2'))];
  const w = (right - left) / B;
  const eras = [...document.querySelectorAll(`${track} .rr-era`)].map((b) => {
    const r = b.querySelector('.rr-era-bracket').getBoundingClientRect();
    const t = b.querySelector('.rr-era-title');
    return { x0: r.left - box.x, x1: r.right - box.x, title: t.textContent, source: b.dataset.source, font: getComputedStyle(t).fontFamily, style: getComputedStyle(t).fontStyle, color: getComputedStyle(t).color };
  });
  const trackBox = document.querySelector(track).getBoundingClientRect();
  return { left, w, eras, chartTop: box.top + scrollY, trackTop: trackBox.top + scrollY, trackHeight: trackBox.height, ai: document.querySelector(`${track} .rr-era-ai`)?.textContent ?? null };
}, [CHART, TRACK, buckets]);

/** S9: every bracket starts/ends within 1 px of its bucket boundary ± 3 px. */
function expectAligned(m, eras, what) {
  eras.forEach((e, i) => {
    const want = [m.left + e.start * m.w + 3, m.left + (e.end + 1) * m.w - 3];
    const got = [m.eras[i].x0, m.eras[i].x1];
    assert(Math.abs(got[0] - want[0]) <= 1 && Math.abs(got[1] - want[1]) <= 1, `${what}: era ${i} bracket ${got} vs bucket edges ${want}`);
  });
}

export default async function phase9({ page, baseURL }) {
  const bg = rgb(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
  // AC4 + AC5: the default sample (Vite) ships heuristic eras; brackets aligned, italic Fraunces, ≥ 4.5:1, no AI label.
  await page.goto(baseURL, { waitUntil: 'load' });
  await page.locator(TRACK).waitFor({ state: 'visible', timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);
  const vite = sample('vite');
  const m = await measure(page, vite.time.starts.length);
  assert(m.eras.length === vite.eras.length && m.eras.length >= 3 && m.eras.length <= 6, `3-6 eras drawn (got ${m.eras.length})`);
  expectAligned(m, vite.eras, 'vite desktop');
  assert(m.eras.every((e, i) => e.title === vite.eras[i].title && e.source === 'heuristic'), 'the sample shows its shipped heuristic titles');
  assert(m.ai === null, '"named by AI" is absent for heuristic names');
  assert(m.eras.every((e) => /Fraunces/.test(e.font) && e.style === 'italic'), `titles in italic Fraunces (got ${m.eras[0].font} ${m.eras[0].style})`);
  const ratio = Math.min(...m.eras.map((e) => contrast(rgb(e.color), bg)));
  assert(ratio >= 4.5, `bracket title contrast ≥ 4.5:1 (got ${ratio.toFixed(2)})`);
  assert(m.trackHeight === 48 || m.trackHeight === 72, `track height reserved at 48 or 72 px (got ${m.trackHeight})`);
  assert(m.trackTop < m.chartTop, 'the track sits above the chart');
  const bands = await page.locator(`${CHART} [data-era-band]`).count();
  assert(bands === Math.floor(vite.eras.length / 2), `odd eras have background bands (got ${bands})`);
  const prose = await page.locator('.rr-summary').innerText();
  assert(prose.includes(`${vite.eras.length} eras: ${vite.eras[0].title}`), 'the prose summary lists the eras');
  const footer = await page.locator('.rr-table tfoot').textContent();
  assert(vite.eras.every((e) => footer.includes(e.title)), 'the table has an era row');
  await runAxe(page, 'eras');
  await page.evaluate(() => scrollTo(0, document.querySelector('.rr-card').getBoundingClientRect().top + scrollY - 8));
  await shoot(page, '01-eras-vite-desktop');

  // AC5: keyboard — the eras come right after the chart in tab order; focus shows the note in the readout.
  await tabTo(page, '[aria-roledescription="river chart"]');
  await page.keyboard.press('Tab');
  assert(await page.evaluate(() => document.activeElement?.dataset.era === '0'), 'Tab from the chart reaches the first era');
  const line = await readout(page);
  assert(line.startsWith(`${vite.eras[0].title} · Q2 2020–`) && line.endsWith(vite.eras[0].note), `readout shows the era (got "${line}")`);
  const sr = await page.evaluate(() => {
    const b = document.activeElement;
    return { label: b.getAttribute('aria-label'), note: document.getElementById(b.getAttribute('aria-describedby') ?? '')?.textContent };
  });
  assert(sr.label.startsWith(`${vite.eras[0].title}, Q2 2020–`) && !sr.label.includes(vite.eras[0].note), `the era button’s name is its title and dates (got "${sr.label}")`);
  assert(sr.note === vite.eras[0].note, `the era button’s description is its note (got "${sr.note}")`);
  for (let i = 1; i < vite.eras.length; i++) {
    await page.keyboard.press('Tab');
    assert(await page.evaluate((n) => document.activeElement?.dataset.era === String(n), i), `Tab reaches era ${i}`);
  }
  await page.keyboard.press('Shift+Tab');
  const active = await page.locator(`${CHART} [data-era-band].rr-on`).count();
  assert(active === 1, 'the focused era’s band is highlighted');
  await page.evaluate(() => scrollTo(0, document.querySelector('.rr-card').getBoundingClientRect().top + scrollY - 8));
  await shoot(page, '03-era-focus-desktop');
  await page.evaluate(() => document.activeElement.blur());

  // Mobile: the track scrolls with the chart and keeps its alignment.
  await page.setViewportSize(MOBILE);
  await page.reload({ waitUntil: 'load' }); // a fresh chart, without the keyboard run's focus state
  await page.waitForFunction(() => document.querySelector('.rr-frame')?.getAttribute('role') === 'region');
  const mm = await measure(page, vite.time.starts.length);
  expectAligned(mm, vite.eras, 'vite mobile');
  const size = await page.locator(`${TRACK} .rr-era-title`).first().evaluate((t) => getComputedStyle(t).fontSize);
  assert(size === '14px', `mobile titles at 14 px (got ${size})`);
  await page.evaluate(() => scrollTo(0, document.querySelector('.rr-card').getBoundingClientRect().top + scrollY - 8));
  await shoot(page, '02-eras-mobile', MOBILE);
  // Mobile: an era focused with the readout off-screen scrolls the readout into view.
  await page.evaluate((t) => scrollTo(0, document.querySelector(t).getBoundingClientRect().top + scrollY - innerHeight + 80), TRACK);
  const offscreen = await page.locator('[data-testid="readout"]').evaluate((r) => r.getBoundingClientRect().top >= innerHeight);
  await page.locator(`${TRACK} .rr-era`).first().evaluate((b) => b.focus({ preventScroll: true }));
  await page.waitForFunction(() => { const r = document.querySelector('[data-testid="readout"]').getBoundingClientRect(); return r.top >= -1 && r.bottom <= innerHeight + 1; }, null, { timeout: 3000 });
  assert(offscreen && (await readout(page)).startsWith(vite.eras[0].title), 'mobile: focusing an era brings the readout on screen');
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
  await page.locator(`${CHART}[aria-label="River chart of expressjs/express"]`).waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator(TRACK).waitFor({ state: 'visible' });
  const B = express.time.starts.length;
  const before = await measure(page, B);
  assert(before.eras.every((e) => e.source === 'heuristic') && before.ai === null, 'heuristic names render immediately');
  release();
  await page.locator(`${TRACK} .rr-era-ai`).waitFor({ state: 'visible', timeout: 10_000 });
  const after = await measure(page, B);
  assert(asked === 1, `exactly one /api/eras request (got ${asked})`);
  assert(after.eras.every((e) => e.source === 'ai') && after.eras[0].title === 'Callbacks and routers', 'AI names swapped in');
  assert(after.ai === 'named by AI', '"named by AI" appears with AI names');
  assert(after.chartTop === before.chartTop && after.trackHeight === before.trackHeight, `no layout shift: chart top ${before.chartTop} → ${after.chartTop}`);
  assert(JSON.stringify(after.eras.map((e) => [e.x0, e.x1])) === JSON.stringify(before.eras.map((e) => [e.x0, e.x1])), 'brackets unchanged by the swap');
  expectAligned(after, express.eras ?? sample('express').eras, 'express after the swap');
  const cached = await page.evaluate(() => JSON.parse(localStorage.getItem('rr:agg:v1:expressjs/express'))?.aggregate?.eras);
  assert(cached?.length === after.eras.length && cached.every((e) => e.source === 'ai'), 'AI eras are cached with the aggregate');
  assert((await page.locator('.rr-summary').innerText()).includes('Era names were written by AI.'), 'the prose summary says AI named the eras');
  await runAxe(page, 'ai eras');
  await page.evaluate(() => scrollTo(0, document.querySelector('.rr-card').getBoundingClientRect().top + scrollY - 8));
  await shoot(page, '04-eras-ai-swap');
  // Reload: from the browser cache, AI names at once and no request.
  await page.reload({ waitUntil: 'load' });
  await page.locator(`${TRACK} .rr-era-ai`).waitFor({ state: 'visible', timeout: 10_000 });
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
  await page.locator(`${CHART}[aria-label="River chart of sveltejs/svelte"]`).waitFor({ state: 'visible', timeout: 10_000 });
  await page.waitForFunction(() => document.querySelector('[data-testid="era-track"]'));
  await answered;
  await sleep(200);
  const fb = await measure(page, sample('svelte').time.starts.length);
  assert(failed === 1, `one /api/eras attempt (got ${failed})`);
  assert(fb.eras.length === sample('svelte').eras.length && fb.eras.every((e, i) => e.source === 'heuristic' && e.title === sample('svelte').eras[i].title), 'heuristic names stay after a 503');
  assert(fb.ai === null, 'no "named by AI" label after the fallback');
  assert(!(await page.locator('[role="alert"]').count()), 'no error is shown');
  await runAxe(page, 'heuristic fallback');
  await page.evaluate(() => scrollTo(0, document.querySelector('.rr-card').getBoundingClientRect().top + scrollY - 8));
  await shoot(page, '05-eras-heuristic-fallback');
}
