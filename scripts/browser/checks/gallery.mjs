// `pnpm gallery` (docs/PLAN.md phase 11, Cyanotype since R7): renders the shareable assets with the harness's one
// browser at the design's 1440 px width. examples/<sample>-{light,dark,contributors}.png (the chart card),
// docs/social-preview.png (1280×640), docs/images/hero.webp (the README's still: the page from the header to the
// readout) and docs/hero.gif (the arrive reveal + a hover pass, ≤ 5 s, 3 plays). The WebP and the GIF need ffmpeg.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assert } from '../lib.mjs';

const ROOT = join(import.meta.dirname, '../../..');
const FFMPEG = process.env.FFMPEG_PATH ?? '/usr/bin/ffmpeg';
const FPS = 10;
/** The hero GIF's limits: at most 5 s per play, and 3 plays in all (ffmpeg `-loop 2` = 2 repeats). */
const MAX_SECONDS = 5;
const LOOPS = 2;
const MB = 1024 * 1024;
const PAGE = { width: 1440, height: 1300 };
const CHART = '[data-testid="river-chart"]';
const rel = (p) => p.slice(ROOT.length + 1);

/** Width and height from a PNG's IHDR chunk. */
export const pngSize = (file) => {
  const b = readFileSync(file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
};

async function open(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  await page.locator(CHART).waitFor({ state: 'visible', timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** The chart card from its top to the bottom of the readout, with an 8 px margin (page scrolled to the top). */
const cardClip = (page) => page.evaluate(() => {
  scrollTo(0, 0);
  const c = document.querySelector('.rr-card').getBoundingClientRect();
  const r = document.querySelector('[data-testid="readout"]').getBoundingClientRect();
  return { x: Math.floor(c.left - 8), y: Math.floor(c.top - 8), width: Math.ceil(c.width + 16), height: Math.ceil(r.bottom - c.top + 16) };
});

async function shootCard(page, file) {
  const clip = await cardClip(page);
  assert(clip.y + clip.height <= PAGE.height, `${rel(file)}: the card fits the viewport`);
  await page.screenshot({ path: file, clip });
  console.log(`  wrote ${rel(file)} (${clip.width}×${clip.height}, ${(statSync(file).size / 1024).toFixed(0)} KB)`);
}

/** Points along a river at each bucket's x (scanning down the column for the river's own path). */
const riverPoints = (page, id, B) => page.evaluate(([chart, rid, buckets]) => {
  const svg = document.querySelector(chart);
  const box = svg.getBoundingClientRect();
  const axis = svg.querySelector('.rr-axis-line');
  const [left, right] = [Number(axis.getAttribute('x1')), Number(axis.getAttribute('x2'))];
  const w = (right - left) / buckets;
  const points = [];
  for (let i = 0; i < buckets; i++) {
    const x = box.left + left + (i + 0.5) * w;
    const ys = [];
    for (let y = box.top; y < box.bottom; y += 2) if (document.elementFromPoint(x, y)?.getAttribute('data-river') === rid) ys.push(y);
    if (ys.length) points.push([x, ys[Math.floor(ys.length / 2)]]);
  }
  return points;
}, [CHART, id, B]);

/** Holds the arrive motion (Web Animations, ui/motion.ts) paused from its first frame, so the frames can step it. */
const holdArrive = () => {
  window.rrHeld = [];
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (frames, options) {
    const a = animate.call(this, frames, options);
    if (String(options?.id).startsWith('rr-arrive')) {
      a.pause();
      window.rrHeld.push(a);
    }
    return a;
  };
};

/** The page from the top to the bottom of the under row (readout and legend), 24 px below. */
const heroClip = (page) => page.evaluate(() => {
  scrollTo(0, 0);
  const u = document.querySelector('.rr-under').getBoundingClientRect();
  return { x: 0, y: 0, width: innerWidth, height: Math.ceil(u.bottom + 24) };
});

/** Frames of the arrive reveal (held, stepped) and a hover pass along the two largest rivers. */
async function heroFrames(page, url, dir) {
  let n = 0;
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(holdArrive);
  await open(page, url);
  const clip = await cardClip(page);
  const frame = async () => {
    const path = join(dir, `f${String(++n).padStart(4, '0')}.png`);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.screenshot({ path, clip });
    return path;
  };
  const hold = (path, count) => { for (let i = 0; i < count; i++) copyFileSync(path, join(dir, `f${String(++n).padStart(4, '0')}.png`)); };
  const held = await page.evaluate(() => window.rrHeld.length);
  assert(held >= 1, 'the arrive reveal runs without reduced motion');
  for (const t of [0, 90, 180, 270, 360, 450, 540, 640, 720, 800, 900]) {
    await page.evaluate((ms) => window.rrHeld.forEach((a) => (a.currentTime = ms)), t);
    await frame();
  }
  await page.evaluate(() => window.rrHeld.forEach((a) => a.finish()));
  const still = await frame();
  hold(still, 3);
  await page.emulateMedia({ reducedMotion: 'reduce' }); // instant fades during the hover pass
  const rivers = await page.locator(`${CHART} path[data-river]`).evaluateAll((ps) =>
    ps.filter((p) => p.dataset.river !== 'other').map((p) => ({ id: p.dataset.river, total: Number(p.dataset.total) })).toSorted((a, b) => b.total - a.total));
  const B = JSON.parse(readFileSync(join(ROOT, 'src/samples/vite.json'), 'utf8')).time.starts.length;
  const [first, second] = [await riverPoints(page, rivers[0].id, B), await riverPoints(page, rivers[1].id, B)];
  assert(first.length >= 10 && second.length >= 3, `hover paths found (${first.length}, ${second.length})`);
  const every = Math.ceil(first.length / 14); // at most 14 hover frames on the first river
  for (const pass of [first.filter((_, i) => i % every === 0 || i === first.length - 1), second.slice(-6)]) {
    let last;
    for (const [x, y] of pass) {
      await page.mouse.move(x, y);
      last = await frame();
    }
    hold(last, 2);
  }
  await page.mouse.move(0, 0);
  hold(still, 5);
  return { frames: n };
}

/** A lossy WebP of `png` at `quality` (ffmpeg's libwebp); false when ffmpeg is missing. */
function toWebp(png, out, quality) {
  const run = spawnSync(FFMPEG, ['-v', 'error', '-y', '-i', png, '-c:v', 'libwebp', '-quality', String(quality), '-compression_level', '6', out], { encoding: 'utf8' });
  if (run.error) return false;
  assert(run.status === 0, `ffmpeg failed: ${run.stderr}`);
  return true;
}

function makeGif(dir, out) {
  const probe = spawnSync(FFMPEG, ['-version'], { stdio: 'ignore' });
  if (probe.error || probe.status !== 0) return false;
  for (const [width, colors] of [[960, 128], [880, 96], [800, 64]]) {
    const filter = `scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${colors}[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`;
    const run = spawnSync(FFMPEG, ['-v', 'error', '-y', '-framerate', String(FPS), '-start_number', '1', '-i', join(dir, 'f%04d.png'), '-vf', filter, '-loop', String(LOOPS), out], { encoding: 'utf8' });
    assert(run.status === 0, `ffmpeg failed: ${run.stderr}`);
    const size = statSync(out).size;
    console.log(`  wrote ${rel(out)} at ${width} px, ${colors} colours: ${(size / MB).toFixed(2)} MB`);
    if (size <= 2 * MB) return true;
  }
  throw new Error('check failed: docs/hero.gif stays over 2 MB');
}

export default async function gallery({ page, baseURL }) {
  const at = (q) => new URL(q, baseURL).href;
  mkdirSync(join(ROOT, 'examples'), { recursive: true });
  await page.setViewportSize(PAGE);
  for (const id of ['vite', 'svelte', 'express']) {
    await page.emulateMedia({ colorScheme: 'light' });
    await open(page, at(`?sample=${id}`));
    await shootCard(page, join(ROOT, `examples/${id}-light.png`));
    await page.locator('.rr-seg label', { hasText: 'Contributors' }).click();
    await page.mouse.move(0, 0);
    await page.locator(`${CHART} path[data-river]`).first().waitFor();
    await shootCard(page, join(ROOT, `examples/${id}-contributors.png`));
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page, at(`?sample=${id}`));
    await shootCard(page, join(ROOT, `examples/${id}-dark.png`));
  }
  await page.emulateMedia({ colorScheme: 'light' });

  // Social preview: exactly 1280×640, ≤ 1 MB, nothing cut off.
  await page.setViewportSize({ width: 1280, height: 640 });
  await open(page, at('?embed=social'));
  const fits = await page.evaluate(() => document.documentElement.scrollHeight <= 640 && document.querySelector('.rr-stack').getBoundingClientRect().bottom <= 632);
  assert(fits, 'the social card fits in 1280×640');
  const social = join(ROOT, 'docs/social-preview.png');
  await page.screenshot({ path: social });
  const dims = pngSize(social);
  const bytes = statSync(social).size;
  assert(dims.width === 1280 && dims.height === 640 && bytes <= MB, `social preview 1280×640 ≤ 1 MB (got ${dims.width}×${dims.height}, ${bytes} B)`);
  console.log(`  wrote ${rel(social)} (1280×640, ${(bytes / 1024).toFixed(0)} KB)`);

  // Hero still (README): the redesigned page at 1440, light, at rest; a WebP of at most 300 KB.
  await page.setViewportSize(PAGE);
  await open(page, at('?sample=vite'));
  const dir = mkdtempSync(join(tmpdir(), 'rr-hero-'));
  try {
    const png = join(dir, 'hero.png');
    await page.screenshot({ path: png, clip: await heroClip(page) });
    const webp = join(ROOT, 'docs/images/hero.webp');
    for (const q of [86, 78, 70]) {
      if (!toWebp(png, webp, q)) throw new Error(`check failed: ${FFMPEG} is needed for docs/images/hero.webp`);
      if (statSync(webp).size <= 300 * 1024) break;
    }
    const kb = statSync(webp).size / 1024;
    assert(kb <= 300, `docs/images/hero.webp ≤ 300 KB (got ${kb.toFixed(0)} KB)`);
    console.log(`  wrote docs/images/hero.webp (${pngSize(png).width}×${pngSize(png).height}, ${kb.toFixed(0)} KB)`);

    // Hero GIF (docs/LAUNCH.md): frames → GIF (≤ 2 MB, ≤ 5 s, 3 plays).
    const { frames } = await heroFrames(page, at('?sample=vite'), dir);
    assert(frames / FPS <= MAX_SECONDS, `hero GIF ≤ ${MAX_SECONDS} s (got ${frames / FPS} s)`);
    if (!makeGif(dir, join(ROOT, 'docs/hero.gif'))) console.log(`  ${FFMPEG} not found: no GIF written`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
