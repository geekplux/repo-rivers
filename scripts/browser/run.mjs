// Headless-browser check harness: `pnpm check:browser --phase <n>`.
// Starts `vite preview` in its own process group, drives ONE system Chrome offline, and always cleans up.
// `--worker` (`pnpm check:fullstack`) serves dist/ + /api through `wrangler dev -c wrangler.dev.jsonc` instead,
// with every CLOUDFLARE_*/CF_* variable removed so it can never reach Cloudflare.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { consoleAllowed, setScreenshotDir } from './lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const worker = argv.includes('--worker');
const HOST = '127.0.0.1';
const PORT = Number(process.env.CHECK_PORT ?? (worker ? 8787 : 4173)); // override only if taken on a shared box
const BASE_URL = `http://${HOST}:${PORT}/`;
const MARKER = `--rr-harness=${process.pid}`; // ignored by Chrome; lets cleanup find our browser
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const gallery = argv.includes('--gallery'); // `pnpm gallery`: renders examples/, docs/social-preview.png, docs/hero.gif
const phaseArg = argv.find((a) => a.startsWith('--phase='))?.slice(8) ?? argv[argv.indexOf('--phase') + 1];
if (!gallery && (!argv.some((a) => a.startsWith('--phase')) || !/^\d+$/.test(phaseArg ?? ''))) {
  console.error('usage: pnpm check:browser --phase <n> | node scripts/browser/run.mjs --gallery');
  process.exit(2);
}
const phase = gallery ? null : Number(phaseArg);

let server;
let serverLog = '';
let browser;
let cleaning;
let signalExitCode; // set when interrupted; wins over the normal exit code

function portFree() {
  return new Promise((done) => {
    const probe = createServer().once('error', () => done(false));
    probe.listen(PORT, HOST, () => probe.close(() => done(true)));
  });
}

async function waitFor(predicate, timeoutMs, what) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await predicate()) return;
    await sleep(200);
  }
  throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`);
}

const browserAlive = () => spawnSync('pgrep', ['-f', '--', MARKER]).status === 0;
const groupAlive = () => {
  try {
    process.kill(-server.pid, 0);
    return true;
  } catch {
    return false;
  }
};
const serverExited = () => !server || server.exitCode !== null || server.signalCode !== null;

function killGroup(signal) {
  try {
    process.kill(-server.pid, signal);
  } catch {
    // group already gone
  }
}

async function cleanup() {
  cleaning ??= (async () => {
    let ok = true;
    if (browser) {
      await Promise.race([browser.close().catch(() => {}), sleep(5000)]);
    }
    if (browserAlive()) {
      spawnSync('pkill', ['-KILL', '-f', '--', MARKER]);
      console.error('killed a leftover harness browser');
    }
    if (server) {
      killGroup('SIGTERM');
      await waitFor(async () => !groupAlive(), 8000, 'preview server exit').catch(() => killGroup('SIGKILL'));
      await waitFor(async () => !groupAlive(), 2000, 'preview server exit').catch(() => (ok = false));
    }
    if (browserAlive()) ok = false;
    if (!ok) console.log('cleanup FAILED: preview server or browser still running');
    else if (!(await waitFor(portFree, 5000, 'port').then(() => true, () => false))) {
      console.log(`cleanup ok (our processes are gone; port ${PORT} is now held by a process this run did not start)`);
    } else console.log('cleanup ok');
    return ok;
  })();
  return cleaning;
}

for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
  process.on(signal, () => {
    console.error(`\nreceived ${signal}, cleaning up`);
    signalExitCode ??= code;
    void cleanup().finally(() => process.exit(signalExitCode));
  });
}

async function main() {
  const checks = ['smoke', gallery ? 'gallery' : `phase-${phase}`].map((n) => join(ROOT, 'scripts/browser/checks', `${n}.mjs`));
  for (const file of checks) if (!existsSync(file)) throw new Error(`missing check ${file}`);
  if (!existsSync(join(ROOT, 'dist/index.html'))) throw new Error('dist/ is missing: run `pnpm build` first');
  if (!(await portFree())) throw new Error(`port ${PORT} is already in use by another process (set CHECK_PORT to use a different port)`);

  const [bin, args] = worker
    ? ['node_modules/wrangler/bin/wrangler.js', ['dev', '-c', 'wrangler.dev.jsonc', '--ip', HOST, '--port', String(PORT)]]
    : ['node_modules/vite/bin/vite.js', ['preview', '--host', HOST, '--port', String(PORT), '--strictPort']];
  const env = worker
    ? { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLOUDFLARE_|CF_)/.test(k))), WRANGLER_SEND_METRICS: 'false', CI: '1' }
    : process.env;
  server = spawn(process.execPath, [join(ROOT, bin), ...args], {
    cwd: ROOT,
    env,
    detached: true, // own process group, killed as a whole
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', (d) => (serverLog += d));
  const name = worker ? 'wrangler dev (CLOUDFLARE_*/CF_* unset)' : 'vite preview';
  console.log(`${name} pid ${server.pid} (process group)`);
  const ready = worker ? new URL('api/health', BASE_URL).href : BASE_URL;
  await waitFor(
    async () => {
      if (serverExited()) throw new Error(`${name} exited early`);
      if (worker && /remote proxy|remote connection|remote resource/i.test(serverLog)) throw new Error('wrangler dev tried to go remote');
      return fetch(ready).then((r) => r.ok, () => false);
    },
    60_000,
    `HTTP 200 from ${ready}`,
  );

  browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
    headless: true,
    args: ['--disable-dev-shm-usage', MARKER],
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false,
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const problems = [];
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === HOST) return route.continue();
    problems.push(`blocked network request: ${url.href}`);
    return route.abort('blockedbyclient');
  });
  page.on('console', (msg) => msg.type() === 'error' && !consoleAllowed(msg) && problems.push(`console error: ${msg.text()}`));
  page.on('pageerror', (err) => problems.push(`page error: ${err.message}`));

  if (!gallery) setScreenshotDir(join(ROOT, 'docs/screenshots', `phase-${phase}`));
  for (const file of checks) {
    console.log(`running ${file.slice(ROOT.length + 1)}`);
    await (await import(pathToFileURL(file).href)).default({ page, baseURL: BASE_URL, phase, worker });
  }
  if (problems.length > 0) throw new Error(problems.join('\n'));
  console.log(gallery ? 'gallery: all assets written' : `phase ${phase}: all browser checks passed`);
}

let exitCode = 0;
try {
  await main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  if (serverLog.trim()) console.error(`--- server output ---\n${serverLog.trim().slice(-4000)}`);
  exitCode = 1;
} finally {
  if (!(await cleanup())) exitCode = 1;
}
process.exit(signalExitCode ?? exitCode);
