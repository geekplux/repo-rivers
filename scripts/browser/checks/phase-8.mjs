// Phase 8: paste-a-URL flow, progress and states (docs/PLAN.md phase 8). Offline: /api/repo and api.github.com
// are mocked with page.route; streamed answers come from a local NDJSON server that this check starts and stops.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { FAKE_REPO, CORS, fakeGithub, resetFakeGithub } from '../../../tests/fixtures/github/fake-repo.mjs';
import { DESKTOP, MOBILE, allowConsoleError, assert, runAxe, shoot } from '../lib.mjs';

const ROOT = join(import.meta.dirname, '../../..');
const SVELTE = JSON.parse(readFileSync(join(ROOT, 'src/samples/svelte.json'), 'utf8'));
const CHART = '[data-testid="river-chart"]';
const INPUT = '#rr-repo';
const line = (o) => `${JSON.stringify(o)}\n`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Streams 18 of 51 progress lines, then holds the response open until `release()`; records aborts. */
function streamServer() {
  const held = [];
  const log = { requests: 0, aborted: 0 };
  const server = createServer((req, res) => {
    log.requests++;
    res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'access-control-allow-origin': '*' });
    res.on('close', () => !res.writableEnded && log.aborted++);
    for (let done = 1; done <= 18; done++) res.write(line({ type: 'progress', done, total: 51, label: 'Comparing buckets' }));
    held.push(res);
  });
  const release = () => {
    for (const res of held.splice(0)) if (!res.destroyed) res.end(line({ type: 'progress', done: 51, total: 51, label: 'Done' }) + line({ type: 'result', cache: 'miss', aggregate: SVELTE }));
  };
  const listening = new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));
  const close = () => new Promise((r) => (server.closeAllConnections(), server.close(() => r())));
  return { log, release, listening, close };
}

const ndjson = (lines) => ({ status: 200, contentType: 'application/x-ndjson; charset=utf-8', body: lines.map(line).join('') });

async function submit(page, text) {
  await page.locator(INPUT).fill(text);
  await page.locator(INPUT).press('Enter');
}
const readout = (page) => page.locator('[data-testid="readout"] p[aria-hidden]').first().innerText();
const announced = async (page) => (await sleep(300), page.locator('[data-testid="readout"] [aria-live="polite"]').innerText());
const chartOf = (page, repo) => page.locator(`${CHART}[aria-label="River chart of ${repo}"]`).waitFor({ state: 'visible', timeout: 10_000 });

/** Shows an error state for `repo` (Worker answer `answer`), checks its copy and actions, runs axe. */
async function expectError(page, repo, title, actions, shot) {
  await submit(page, repo);
  const state = page.locator('[data-testid="error-state"]');
  await state.waitFor({ state: 'visible', timeout: 10_000 });
  const got = await state.evaluate((el) => ({ title: el.querySelector('h3').textContent, body: el.querySelector('p').textContent, actions: [...el.querySelectorAll('button')].map((b) => b.textContent) }));
  assert(got.title === title, `error title "${title}" (got "${got.title}")`);
  assert(JSON.stringify(got.actions) === JSON.stringify(actions), `${title}: actions ${actions} (got ${got.actions})`);
  assert(got.body.length > 20 && got.body.endsWith('.'), `${title}: one explaining sentence (got "${got.body}")`);
  assert((await readout(page)).startsWith(title), `${title}: the readout (polite live region) carries the error`);
  await runAxe(page, `error ${title}`);
  if (shot) await shoot(page, shot);
  return got;
}

export default async function phase8({ page, baseURL }) {
  const api = [];
  const github = [];
  page.on('request', (r) => {
    const url = new URL(r.url());
    if (url.pathname.startsWith('/api/')) api.push(url.pathname);
    if (url.hostname === 'api.github.com' && r.method() === 'GET') github.push(url.pathname);
  });
  resetFakeGithub();
  await page.route('https://api.github.com/**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const r = fakeGithub(route.request().url());
    return route.fulfill({ status: r.status, headers: r.headers, body: r.body });
  });
  const stream = streamServer();
  const port = await stream.listening;
  const toStream = (route) => route.continue({ url: `http://127.0.0.1:${port}${new URL(route.request().url()).pathname}` });
  await page.route('**/api/repo/sveltejs/svelte', toStream);
  await page.route('**/api/repo/vitejs/vite', toStream);
  // Results served by the Worker ask it to name their eras (phase 9); answer "no AI names" so the heuristic stays.
  await page.route('**/api/eras', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"eras":[],"source":"heuristic"}' }));
  try {
    // AC2: invalid input → inline error tied with aria-describedby, no request.
    await page.goto(baseURL, { waitUntil: 'load' });
    await page.locator(CHART).waitFor({ state: 'visible', timeout: 10_000 });
    await page.evaluate(() => localStorage.clear());
    const before = api.length + github.length;
    await submit(page, 'github.com/sveltejs');
    const input = page.locator(INPUT);
    const describedBy = await input.getAttribute('aria-describedby');
    const error = describedBy && (await page.locator(`[id="${describedBy}"]`).innerText());
    assert(error && /not a GitHub repository/.test(error), `inline error linked via aria-describedby (got "${error}")`);
    assert((await input.getAttribute('aria-invalid')) === 'true', 'input is aria-invalid');
    assert(api.length + github.length === before, 'no request for invalid input');
    assert(await page.evaluate(() => document.activeElement?.id === 'rr-repo'), 'focus stays in the field');
    await shoot(page, '01-input-invalid');

    // AC1 + AC6: paste a /tree/ URL → progress "n of m" (a solid 2 px line) → chart → ?repo=.
    await submit(page, 'https://github.com/sveltejs/svelte/tree/main');
    const progress = page.locator('[data-testid="progress"]');
    await progress.getByText('Reading sveltejs/svelte: 18 of 51 requests').waitFor({ timeout: 10_000 });
    assert(!(await input.getAttribute('aria-describedby')), 'the inline error is gone after a valid submit');
    const bar = await page.locator('[role="progressbar"]').evaluate((el) => ({ now: el.getAttribute('aria-valuenow'), max: el.getAttribute('aria-valuemax'), label: el.getAttribute('aria-label') }));
    assert(bar.now === '18' && bar.max === '51' && /sveltejs\/svelte/.test(bar.label), `determinate, labelled progressbar (got ${JSON.stringify(bar)})`);
    const fill = await page.locator('.rr-bar-fill').evaluate((el) => [getComputedStyle(el).strokeWidth, getComputedStyle(el).strokeDasharray]);
    assert(fill[0] === '2px' && fill[1] === 'none', `progress is a solid 2 px line (got ${fill})`);
    assert(/Reading the history of sveltejs\/svelte/.test(await announced(page)), 'progress is announced politely');
    assert(await page.locator('.rr-frame').getAttribute('aria-busy') === 'true', 'chart frame is aria-busy while loading');
    await runAxe(page, 'loading');
    await shoot(page, '02-progress-desktop');
    await shoot(page, '03-progress-mobile', MOBILE);
    await page.setViewportSize(DESKTOP);
    stream.release();
    await chartOf(page, 'sveltejs/svelte');
    const search = await page.evaluate(() => location.search);
    assert(search === '?repo=sveltejs/svelte', `URL becomes ?repo=sveltejs/svelte (got ${search})`);
    assert(/Showing sveltejs\/svelte/.test(await announced(page)), 'result is announced politely');
    assert((await page.title()) === 'sveltejs/svelte, Repo Rivers', 'document title names the repo');
    await shoot(page, '04-result-svelte');

    // Sampled badge: a keyboard-operable disclosure.
    const badge = page.locator('.rr-badge');
    assert((await badge.innerText()).startsWith('Estimated from'), 'an "Estimated from" source button');
    await badge.focus();
    await page.keyboard.press('Enter');
    const panel = page.locator('.rr-popover');
    await panel.waitFor({ state: 'visible' });
    assert((await badge.getAttribute('aria-expanded')) === 'true', 'badge is aria-expanded');
    const text = await panel.innerText();
    for (const want of ['Mode', 'GitHub requests', '516', 'Truncated quarters', '35 of', 'Sampled: one comparison per quarter']) assert(text.includes(want), `popover lists "${want}"`);
    await runAxe(page, 'sampled popover');
    await shoot(page, '05-sampled-popover');
    await page.keyboard.press('Escape');
    assert(!(await panel.isVisible()) && (await page.evaluate(() => document.activeElement?.classList.contains('rr-badge'))), 'Escape closes the popover and returns focus');

    // AC1: reload renders from localStorage with no /api call.
    api.length = 0;
    await page.reload({ waitUntil: 'load' });
    await chartOf(page, 'sveltejs/svelte');
    await sleep(300);
    assert(api.length === 0, `reload makes no /api call (got ${api})`);

    // AC5: Cancel aborts the stream and restores the previous chart.
    const aborted = stream.log.aborted;
    await submit(page, 'vitejs/vite');
    await progress.getByText('18 of 51 requests').waitFor({ timeout: 10_000 });
    await progress.getByRole('button', { name: 'Cancel' }).click();
    await chartOf(page, 'sveltejs/svelte');
    await sleep(300);
    assert(stream.log.aborted === aborted + 1, `the stream was aborted (aborts ${stream.log.aborted})`);
    assert((await page.evaluate(() => location.search)) === '?repo=sveltejs/svelte', 'URL unchanged after cancel');
    assert(await page.evaluate(() => document.activeElement?.id === 'rr-repo'), 'focus returns to the field after cancel');

    // AC3: every F10 state, with its copy and actions (Worker answers mocked).
    await page.route('**/api/repo/nope/missing', (r) => r.fulfill(ndjson([{ type: 'error', code: 'not_found', message: 'x' }])));
    await page.route('**/api/repo/tiny/one', (r) => r.fulfill(ndjson([{ type: 'progress', done: 3, total: 3, label: 'x' }, { type: 'error', code: 'too_little', message: 'x' }])));
    await page.route('**/api/repo/blank/void', (r) => r.fulfill(ndjson([{ type: 'error', code: 'empty', message: 'x' }])));
    const resetAt = '2026-10-20T14:05:00Z';
    await page.route(`**/api/repo/${FAKE_REPO.owner}/${FAKE_REPO.name}`, (r) => r.fulfill(ndjson([{ type: 'error', code: 'rate_limited', message: 'x', resetAt }])));

    await expectError(page, 'nope/missing', 'Couldn’t find nope/missing', ['Check the spelling', 'Show a sample instead'], '06-error-not-found');
    await page.getByRole('button', { name: 'Check the spelling' }).click();
    assert(await page.evaluate(() => document.activeElement?.id === 'rr-repo'), '"Check the spelling" focuses the field');

    const got = await expectError(page, `${FAKE_REPO.owner}/${FAKE_REPO.name}`, 'GitHub’s hourly limit was reached', ['Try from your browser', 'Show a sample instead'], '07-error-rate-limited');
    const local = await page.evaluate((t) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(Date.parse(t)), resetAt);
    assert(got.body.includes(`after ${local}`), `local reset time ${local} shown (got "${got.body}")`);
    const apiBefore = api.length;
    github.length = 0;
    await page.getByRole('button', { name: 'Try from your browser' }).click();
    await chartOf(page, `${FAKE_REPO.owner}/${FAKE_REPO.name}`);
    assert(api.length === apiBefore && github.length === 34, `the browser read GitHub itself: 34 requests, no /api (got ${github.length}, /api ${api.length - apiBefore})`);
    assert(/Your browser read GitHub directly/.test(await page.locator('[data-testid="fallback-notice"]').innerText()), 'the UI says the browser read GitHub');

    await expectError(page, 'tiny/one', 'This repo has too little history to draw', ['Try another repo', 'Show a sample instead'], '08-error-too-little');
    await expectError(page, 'blank/void', 'Empty repository', ['Try another repo', 'Show a sample instead']);

    // Chrome may refetch the favicon while offline; that is not the app's request.
    allowConsoleError(/ERR_INTERNET_DISCONNECTED.*\/favicon\.svg/);
    await page.context().setOffline(true);
    api.length = 0;
    await expectError(page, 'offline/case', 'You’re offline', ['Try again', 'Show a sample instead'], '09-error-offline');
    assert(api.length === 0, 'no request while offline');
    await page.getByRole('button', { name: 'Show a sample instead' }).click();
    await chartOf(page, 'vitejs/vite');
    assert(!(await page.evaluate(() => location.search.includes('repo='))), '"Show a sample instead" drops ?repo=');
    await page.context().setOffline(false);

    // Worker unavailable: the static page answers /api instead of the Worker, and GitHub is unreachable too.
    allowConsoleError(/ERR_INTERNET_DISCONNECTED|ERR_FAILED.*api\.github\.com\/repos\/down/);
    await page.route('**/api/repo/down/both', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>repo rivers</title>' }));
    await page.route('https://api.github.com/repos/down/**', (r) => r.abort('internetdisconnected'));
    await expectError(page, 'down/both', 'The Repo Rivers service isn’t answering', ['Try again', 'Show a sample instead']);

    // AC4: an unreachable Worker (here: the SPA fallback page) → automatic browser fallback with a notice.
    await page.evaluate(() => localStorage.clear());
    await page.unroute(`**/api/repo/${FAKE_REPO.owner}/${FAKE_REPO.name}`);
    await page.route(`**/api/repo/${FAKE_REPO.owner}/${FAKE_REPO.name}`, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>repo rivers</title>' }));
    resetFakeGithub();
    github.length = 0;
    await submit(page, `https://github.com/${FAKE_REPO.owner}/${FAKE_REPO.name}.git`);
    await chartOf(page, `${FAKE_REPO.owner}/${FAKE_REPO.name}`);
    const notice = await page.locator('[data-testid="fallback-notice"]').innerText();
    assert(/service didn’t answer, so your browser reads GitHub directly/.test(notice), `automatic fallback notice (got "${notice}")`);
    assert(github.length === 34, `fallback read GitHub from the browser (${github.length} requests)`);
    const after = await page.evaluate(() => location.search);
    assert(after === `?repo=${FAKE_REPO.owner}/${FAKE_REPO.name}&sample=vite`, `URL follows the fallback result, keeping ?sample= (got ${after})`);
    await runAxe(page, 'fallback result');
    await shoot(page, '10-fallback-notice');

    // Back/forward follow ?repo= (popstate), from the cache.
    await page.goBack();
    await page.waitForFunction(() => !location.search.includes(`repo=`));
    await chartOf(page, 'vitejs/vite');
    await page.goForward();
    await chartOf(page, `${FAKE_REPO.owner}/${FAKE_REPO.name}`);
  } finally {
    await stream.close();
  }
}
