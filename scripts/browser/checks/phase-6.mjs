// Phase 6: interaction and accessibility (docs/PLAN.md phase 6, docs/viz/rivers.md §6 and S8).
import { DESKTOP, MOBILE, assert, runAxe, shoot, shootCvd, tabTo } from '../lib.mjs';

const CHART = '[data-testid="river-chart"]';
const PLOT = '[aria-roledescription="river chart"]';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Scrolls so the chart card starts at the top: chart, key and readout are all in the screenshot. */
const frameCard = (page) => page.evaluate(() => scrollTo(0, document.querySelector('.rr-card').getBoundingClientRect().top + scrollY - 8));

async function open(page, url, repo) {
  await page.goto(url, { waitUntil: 'load' });
  await page.locator(`${CHART}[aria-label*="${repo}"]`).waitFor({ state: 'visible', timeout: 10_000 });
}
const state = (page) => page.locator(PLOT).evaluate((g) => ({ river: g.dataset.active, bucket: g.dataset.bucket, pinned: g.dataset.pinned === 'true' }));
const readout = (page) => page.locator('[data-testid="readout"] p[aria-hidden]').first().innerText();
const announced = async (page) => (await sleep(250), page.locator('[data-testid="readout"] [aria-live="polite"]').innerText());
/** The river named by a focus readout (`*name*, Q2 2023: …`; a bot without a [bot] suffix reads `name bot`). */
const nameOf = (text) => text.split(', ')[0];

/** A viewport point inside river `id` (centre of its inside label, checked with isPointInFill), or of any river. */
const pointIn = (page, id) => page.evaluate(([sel, rid]) => {
  const svg = document.querySelector(sel);
  const box = svg.getBoundingClientRect();
  const paths = [...svg.querySelectorAll('path[data-river]')].filter((p) => !rid || p.dataset.river === rid);
  for (const p of paths) {
    const t = svg.querySelector(`text[data-label-for="${CSS.escape(p.dataset.river)}"]`);
    if (!t) continue;
    const r = t.getBoundingClientRect();
    const pt = new DOMPoint(r.x + r.width / 2 - box.x, r.y + r.height / 2 - box.y);
    if (p.isPointInFill(pt)) return { id: p.dataset.river, x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }
  return null;
}, [CHART, id]);

/** A viewport point in the plot (4 px under its top, below the era band) but on no river (for background clicks). */
const emptyPoint = (page) => page.evaluate(([sel, plot]) => {
  const svg = document.querySelector(sel);
  const box = svg.getBoundingClientRect();
  const y = document.querySelector(plot).getBoundingClientRect().top - box.y + 12;
  const paths = [...svg.querySelectorAll('path[data-river]')];
  for (let x = 20; x < box.width - 20; x += 10) {
    const pt = new DOMPoint(x, y);
    if (!paths.some((p) => p.isPointInFill(pt) || p.isPointInStroke(pt))) return { x: box.x + x, y: box.y + y };
  }
  return null;
}, [CHART, PLOT]);

/** The view-model value for `river` (row header) and bucket column `bucket`, read from the data table. */
const tableValue = (page, label, bucket) => page.evaluate(([l, b]) => {
  const row = [...document.querySelectorAll('.rr-table tbody tr')].find((tr) => tr.querySelector('th').textContent === l);
  return row ? row.querySelectorAll('td')[b].textContent : null;
}, [label, bucket]);
const bucketLabel = (page, b) => page.evaluate((i) => document.querySelectorAll('.rr-table thead th')[i + 1].textContent, b);

const lum = (rgb) => rgb.map((c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].toSorted((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const rgb = (css) => css.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);

/** S8 / DESIGN §4: others at 0.18, the active river at full strength in water A, its transfers in ink at full opacity. */
async function expectHighlight(page, id) {
  const s = await page.evaluate(([sel, rid]) => {
    const svg = document.querySelector(sel);
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- runs inside the page (serialized)
    const op = (el) => Number(getComputedStyle(el).opacity);
    const paths = [...svg.querySelectorAll('path[data-river]')];
    const on = paths.find((p) => p.dataset.river === rid);
    const mine = [...svg.querySelectorAll('[data-transfer]')].filter((t) => t.dataset.transfer.split('→').includes(rid));
    const waterA = svg.querySelector('path.rr-tone-0:not(.rr-on)') ?? on;
    return {
      others: [...new Set(paths.filter((p) => p !== on).map(op))],
      on: op(on), other: on.classList.contains('rr-other'), fill: getComputedStyle(on).fill, waterA: getComputedStyle(waterA).fill,
      transfers: mine.map(op), ink: mine.map((t) => getComputedStyle(t.querySelector('.rr-transfer')).stroke === getComputedStyle(svg.querySelector('.rr-cursor')).stroke),
      label: [...svg.querySelectorAll(`text[data-label-for="${CSS.escape(rid)}"], text[data-float]`)].map((t) => op(t.parentElement)),
    };
  }, [CHART, id]);
  assert(s.others.length === 1 && Math.abs(s.others[0] - 0.18) < 1e-6, `${id}: other rivers at 0.18 (got ${s.others})`);
  assert(s.on === 1 && (s.other || s.fill === s.waterA), `${id}: active river at full strength in water A (${JSON.stringify(s)})`);
  assert(s.transfers.every((o) => o === 1) && s.ink.every(Boolean), `${id}: its transfers in ink at full opacity (${s.transfers}, ${s.ink})`);
  assert(s.label.length > 0 && s.label.every((o) => o === 1), `${id}: its label at full opacity (${s.label})`);
  return s;
}

/** S8 / DESIGN §4: `name, Q2 2023: 7,732 lines changed, 21% of the quarter.`, numbers equal to the view model (the table). */
async function expectReadout(page, label, bucket, unit) {
  const text = await readout(page);
  const [, name, b, value, share] = text.match(/^(.+?), (.+?): (no [^.]+|[\d,]+ [^,]+)(?:, (<1|\d+)% of the \w+)?\./) ?? [];
  const expected = await tableValue(page, label, bucket);
  assert(name === label && b === (await bucketLabel(page, bucket)), `readout names ${label} at ${b} (${text})`);
  assert(expected === '0' ? value.startsWith('no ') : value.startsWith(`${expected} `), `readout value equals the view model (${value} vs ${expected})`);
  assert(expected === '0' || (share !== undefined && text.includes(`% of the ${unit}.`)), `readout share (${share})`);
  return text;
}

export default async function phase6({ page, baseURL }) {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'light' });
  await open(page, baseURL, 'vitejs/vite');
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await runAxe(page, 'vite sample view');
  assert((await announced(page)) === '', 'nothing is announced on page load');
  assert((await page.locator(PLOT).getAttribute('role')) === 'application', 'the chart is role="application"');
  // The chart head shows the one control that applies: Folder depth for Modules, Include bots for Contributors.
  assert(await page.getByLabel('Folder depth').isVisible(), 'Modules shows Folder depth');
  assert((await page.getByRole('checkbox', { name: 'Include bots' }).count()) === 0, 'Modules shows no Include bots');
  const key = await page.locator('.rr-legend').innerText();
  assert(key.includes('estimated') && key.includes('quarter in progress') && key.includes('files moved'), `legend under the chart (${key})`);
  const idle = await readout(page);
  assert(/^packages\/vite carries \d+% of all lines changed, and [\d,]+ files moved between modules\.$/.test(idle), `idle readout (${idle})`);

  // AC2: hover dims the others to 0.18 and reveals the river's transfers.
  await frameCard(page);
  const target = await pointIn(page, 'm:packages/vite');
  assert(target, 'found a point inside packages/vite');
  const before = await page.locator('[data-transfer]').count();
  await page.mouse.move(target.x, target.y);
  assert((await state(page)).river === 'm:packages/vite', 'hover activates the river under the pointer');
  const hovered = await expectHighlight(page, 'm:packages/vite');
  assert(hovered.transfers.length > 0 && (await page.locator('[data-transfer]').count()) >= before, 'hover shows the river\'s transfers');
  const hb = Number((await state(page)).bucket);
  await expectReadout(page, 'packages/vite', hb, 'quarter');
  await shoot(page, '01-hover-desktop', DESKTOP);

  // AC2: click pins (hover is ignored), Escape unpins; a background click unpins too.
  await page.mouse.click(target.x, target.y);
  assert((await state(page)).pinned, 'click pins');
  assert(await page.getByText('Pinned: press Escape').isVisible(), 'the pinned state is shown in words');
  const other = await pointIn(page, 'm:docs') ?? await pointIn(page, null);
  await page.mouse.move(other.x, other.y + 1);
  assert((await state(page)).river === 'm:packages/vite', 'hover is ignored while pinned');
  await shoot(page, '03-pinned-desktop', DESKTOP);
  await page.keyboard.press('Escape');
  assert(!(await state(page)).pinned, 'Escape unpins');
  await page.mouse.click(target.x, target.y);
  const bg = await emptyPoint(page);
  await page.mouse.click(bg.x, bg.y);
  assert(!(await state(page)).pinned, 'a background click unpins');
  await page.mouse.move(1, 1);
  await page.evaluate(() => document.activeElement?.blur());

  // AC1: keyboard-only walk.
  await tabTo(page, PLOT);
  const ring = await page.evaluate(() => {
    const r = getComputedStyle(document.activeElement);
    return { style: r.outlineStyle, width: r.outlineWidth, color: r.outlineColor, bg: getComputedStyle(document.body).backgroundColor };
  });
  assert(ring.style === 'solid' && ring.width === '2px' && contrast(rgb(ring.color), rgb(ring.bg)) >= 3, `focus ring visible and >= 3:1 (${JSON.stringify(ring)})`);
  await frameCard(page);
  const rules = await page.evaluate(() => [...document.querySelectorAll('[data-estimated]')].map((el) => {
    const r = el.getBoundingClientRect();
    // Along the rule only its dots (or bare background between them) may be topmost: nothing, the ring included, covers it.
    const top = Array.from({ length: Math.floor(r.width / 2) }, (_, k) => document.elementFromPoint(r.x + 1 + 2 * k, r.y + r.height / 2));
    const covered = top.filter((e) => !e?.matches('[data-estimated], svg.rr-chart, .rr-axis-line')).map((e) => e?.getAttribute('class'));
    return { dots: top.filter((e) => e?.matches('[data-estimated]')).length, covered: [...new Set(covered)] };
  }));
  assert(rules.length > 0 && rules.every((r) => r.dots > 0 && r.covered.length === 0), `the estimated rule stays visible while the chart has focus (${JSON.stringify(rules)})`);
  let s = await state(page);
  const big = await page.evaluate(() => [...document.querySelectorAll('path[data-river]:not([data-river="other"])')].toSorted((a, b) => b.dataset.total - a.dataset.total)[0].dataset.river);
  assert(s.river === big && s.bucket !== '', `focus lands on the largest river (${s.river} vs ${big})`);
  await page.keyboard.press('ArrowRight');
  assert(Number((await state(page)).bucket) === Number(s.bucket) + 1 || Number(s.bucket) === 26, 'Right moves one bucket');
  await page.keyboard.press('Home');
  assert((await state(page)).bucket === '0', 'Home jumps to the first bucket');
  await page.keyboard.press('End');
  assert((await state(page)).bucket === '26', 'End jumps to the last bucket');
  const [shown, spoken] = [await readout(page), await announced(page)];
  assert(!/in progress|estimated|% scale/.test(shown) && spoken.startsWith(shown) && / in progress, to /.test(spoken), `bucket caveats are spoken, not shown (${shown} | ${spoken})`);
  await page.keyboard.press('ArrowLeft');
  assert((await state(page)).bucket === '25', 'Left moves back one bucket');
  const lanes = await page.evaluate(() => [...document.querySelectorAll('path[data-river]')].map((p) => p.dataset.river));
  const rows = await page.evaluate(() => [...document.querySelectorAll('.rr-table tbody th')].map((th) => th.textContent));
  for (let i = 0; i < lanes.length; i++) await page.keyboard.press('ArrowUp');
  const named = [];
  for (let i = 0; i < lanes.length; i++) {
    s = await state(page);
    assert(s.river === lanes[i], `Down walks lane ${i} (${s.river} vs ${lanes[i]})`);
    named.push(nameOf(await readout(page)));
    await page.keyboard.press('ArrowDown');
  }
  assert(rows.every((r) => named.includes(r)), `AC7: the readout names every river (${rows.filter((r) => !named.includes(r))} missing)`);
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp');
  s = await state(page);
  const label = nameOf(await readout(page));
  await expectReadout(page, label, Number(s.bucket), 'quarter');
  assert((await announced(page)).startsWith(await readout(page)), 'the readout is announced through the polite live region');
  await page.keyboard.press('Enter');
  assert((await state(page)).pinned, 'Enter pins');
  assert((await announced(page)).endsWith('. Pinned'), 'pinning is announced');
  await page.keyboard.press('ArrowLeft');
  assert(!(await announced(page)).includes('Pinned'), 'moving while pinned does not repeat "Pinned"');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Escape');
  assert((await announced(page)).endsWith('. Released'), 'unpinning is announced');
  await expectHighlight(page, s.river);
  await frameCard(page);
  await shoot(page, '02-keyboard-focus-desktop', DESKTOP);
  await shootCvd(page, '09-focus', DESKTOP);
  await page.keyboard.press('Escape');
  assert((await state(page)).river === '', 'Escape clears when not pinned');
  await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
  const kept = (await state(page)).bucket;

  // AC3: dimension change re-lays out without a refetch and keeps the bucket.
  requests.length = 0;
  await page.getByRole('radio', { name: 'Contributors' }).check();
  await page.locator('path[data-river^="p:"]').first().waitFor();
  assert(await page.getByRole('checkbox', { name: 'Include bots' }).isVisible(), 'Contributors shows Include bots');
  assert((await page.getByLabel('Folder depth').count()) === 0, 'Contributors shows no Folder depth');
  assert((await state(page)).bucket === kept, `contributors keep the focused bucket (${kept})`);
  assert(requests.length === 0, `no refetch on dimension change (${requests})`);
  assert((await readout(page)).includes(' commit'), 'readout switches to commits');
  await frameCard(page);
  await shoot(page, '04-contributors-desktop', DESKTOP);

  // AC4: Include bots toggles the bot rivers, their dotted outline and "bot" after a name that does not already end in [bot].
  assert((await page.locator('path.rr-bot').count()) === 0, 'bots hidden by default');
  await page.getByRole('checkbox', { name: 'Include bots' }).check();
  const bot = page.locator('path.rr-bot').first();
  await bot.waitFor();
  const dots = await bot.evaluate((p) => [getComputedStyle(p).strokeDasharray, getComputedStyle(p).stroke]);
  assert(dots[0] !== 'none' && dots[1] !== 'none', `bot river has a dotted outline (${dots})`);
  const botRows = await page.evaluate(() => [...document.querySelectorAll('.rr-table tbody th')].map((th) => th.textContent.trim()));
  assert(botRows.some((t) => /\[bot\]$/i.test(t)) && !botRows.some((t) => /\[bot\]\s+bot$/i.test(t)), `bot rows say bot once (${botRows.filter((t) => /bot/i.test(t))})`);
  assert((await page.locator('.rr-legend').innerText()).includes('bot'), 'the legend explains the dotted outline');
  await runAxe(page, 'contributors with bots');
  const botId = await bot.getAttribute('data-river');
  await page.locator(PLOT).focus();
  for (let i = 0; i < 12 && (await state(page)).river !== botId; i++) await page.keyboard.press('ArrowDown');
  assert((await state(page)).river === botId && /^\S+\[bot\], /.test(await readout(page)), `the bot river reads its [bot] name once (${await readout(page)})`);
  await frameCard(page);
  await shoot(page, '06-bots-on-desktop', DESKTOP);
  await shootCvd(page, '10-bots', DESKTOP, ['deuteranopia']);
  await page.getByRole('checkbox', { name: 'Include bots' }).uncheck();
  assert((await page.locator('path.rr-bot').count()) === 0, 'unchecking hides the bots');

  // AC3: depth change (Express: auto is depth 1) keeps the bucket, no refetch.
  await page.getByRole('radio', { name: 'Modules' }).check();
  await page.getByRole('button', { name: 'Express' }).click();
  await page.locator(`${CHART}[aria-label*="expressjs/express"]`).waitFor();
  assert((await announced(page)).startsWith('Showing Express: expressjs/express'), 'sample switch is announced politely');
  await tabTo(page, PLOT);
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  const rivers1 = await page.evaluate(() => [...document.querySelectorAll('path[data-river]')].map((p) => p.dataset.river).join());
  requests.length = 0;
  await page.getByLabel('Folder depth').selectOption('2');
  const rivers2 = await page.evaluate(() => [...document.querySelectorAll('path[data-river]')].map((p) => p.dataset.river).join());
  assert(rivers1 !== rivers2 && requests.length === 0, `depth 2 re-lays out without a refetch (${requests})`);
  assert((await state(page)).bucket === '1', 'depth change keeps the focused bucket');
  await frameCard(page);
  await shoot(page, '05-depth2-desktop', DESKTOP);

  // AC5/A4: the table, opened, with caption and scoped headers.
  await page.locator('.rr-table summary').click();
  assert(await page.locator('.rr-table caption').isVisible(), 'table caption visible');
  assert((await page.locator('.rr-table tbody th[scope="row"]').count()) === (await page.locator('path[data-river]').count()), 'one table row per river');
  await runAxe(page, 'express depth 2, table open');
  await page.evaluate(() => scrollTo(0, document.querySelector('.rr-legend').getBoundingClientRect().top + scrollY - 8));
  await shoot(page, '07-table-open-desktop', DESKTOP);
  const describedBy = await page.locator(PLOT).getAttribute('aria-describedby');
  const summary = await page.locator(`[id="${describedBy}"]`).textContent(); // folded under "Read as text"
  assert(/The largest river is .+, with \d+% of all lines changed\. The busiest year was \d{4}/.test(summary), `summary linked via aria-describedby (${summary})`);

  // Mobile: Home/End on the scroll region, keyboard focus scrolls the bucket into view.
  await open(page, baseURL, 'vitejs/vite');
  await page.setViewportSize(MOBILE);
  const region = page.locator('.rr-frame[role="region"]');
  await tabTo(page, '.rr-frame[role="region"]');
  await page.keyboard.press('End');
  const end = await region.evaluate((el) => [el.scrollLeft, el.scrollWidth - el.clientWidth]);
  assert(end[0] > 0 && Math.abs(end[0] - end[1]) <= 1, `End scrolls the chart region to the end (${end})`);
  await page.keyboard.press('Home');
  assert((await region.evaluate((el) => el.scrollLeft)) === 0, 'Home scrolls back');
  await page.keyboard.press('Tab');
  assert(await page.evaluate((sel) => document.activeElement.matches(sel), PLOT), 'Tab moves into the chart');
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowRight');
  const seen = await page.evaluate(() => {
    const r = document.querySelector('.rr-frame').getBoundingClientRect();
    const c = document.querySelector('.rr-cursor').getBoundingClientRect();
    return c.x >= r.x && c.x <= r.x + r.width;
  });
  assert(seen, 'the keyboard bucket stays inside the mobile scroll region');
  await runAxe(page, 'mobile');
  await shoot(page, '08-mobile-focus', MOBILE);
  await page.setViewportSize(DESKTOP);

  // A5 / DESIGN §6: with motion allowed the fade is 250 ms ease-out; reduced motion makes it instant.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const t = await page.locator('path[data-river]').first().evaluate((p) => [getComputedStyle(p).transitionDuration, getComputedStyle(p).transitionTimingFunction]);
  assert(t[0] === '0.25s' && t[1] === 'ease-out', `fade 250 ms ease-out (${t})`);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const still = await page.locator('path[data-river]').first().evaluate((p) => getComputedStyle(p).transitionDuration);
  assert(still === '0s', `no fade under reduced motion (${still})`);
}
