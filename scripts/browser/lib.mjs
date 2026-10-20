// Shared helpers for headless-browser checks (see docs/PLAN.md §5).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const DESKTOP = { width: 1280, height: 800 };
export const MOBILE = { width: 390, height: 844 };

let screenshotDir = 'docs/screenshots';

/** Sets (and creates) the directory that `shoot`/`shootCvd` write into. */
export function setScreenshotDir(dir) {
  mkdirSync(dir, { recursive: true });
  screenshotDir = dir;
}

/** Throws with `message` unless `condition` holds. */
export function assert(condition, message) {
  if (!condition) throw new Error(`check failed: ${message}`);
}

/** Resizes the viewport, waits for layout to settle, and writes `<name>.png`. */
export async function shoot(page, name, viewport = DESKTOP) {
  await page.setViewportSize(viewport);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const path = join(screenshotDir, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`  wrote ${path}`);
  return path;
}

// Machado, Oliveira & Fernandes (2009), severity 1.0, applied in linear RGB (feColorMatrix default).
const CVD = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};

/** Writes `<name>-protanopia.png`, `-deuteranopia.png`, `-tritanopia.png` via SVG filters on <html>. */
export async function shootCvd(page, name, viewport = DESKTOP) {
  const paths = [];
  for (const [kind, m] of Object.entries(CVD)) {
    const values = [0, 3, 6].map((r) => `${m.slice(r, r + 3).join(' ')} 0 0`).join(' ') + ' 0 0 0 1 0';
    await page.evaluate(
      ({ cvd, matrix }) => {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.id = 'rr-cvd-filters';
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('style', 'position:absolute;width:0;height:0');
        svg.innerHTML = `<filter id="rr-cvd"><feColorMatrix type="matrix" values="${matrix}"/></filter>`;
        document.body.append(svg);
        document.documentElement.style.filter = 'url(#rr-cvd)';
        document.documentElement.dataset.cvd = cvd;
      },
      { cvd: kind, matrix: values },
    );
    paths.push(await shoot(page, `${name}-${kind}`, viewport));
    await page.evaluate(() => {
      document.getElementById('rr-cvd-filters')?.remove();
      document.documentElement.style.filter = '';
      delete document.documentElement.dataset.cvd;
    });
  }
  return paths;
}

/** Presses Tab until `selector` has focus (max `limit` presses); throws otherwise. */
export async function tabTo(page, selector, limit = 40) {
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate((s) => document.activeElement?.matches(s) ?? false, selector)) return;
  }
  throw new Error(`check failed: could not Tab to ${selector} within ${limit} presses`);
}
