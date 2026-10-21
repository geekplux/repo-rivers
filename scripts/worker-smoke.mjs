// Worker smoke check: `pnpm check:worker` (run `pnpm build` first). Starts `pnpm dev:worker` (wrangler.dev.jsonc,
// no AI binding) with every Cloudflare credential removed from the environment, so it can never open a remote
// session. Expects /api/health to report `ai: false` and POST /api/eras to answer with the heuristic names, then
// kills the whole process group and confirms nothing is left. Port: WORKER_PORT (default 8787).
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { heuristicEras } from '../src/core/eras/heuristic.ts';
import { summarizeForEras } from '../src/core/eras/summary.ts';
import { parseAggregate } from '../src/core/schema.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOST = '127.0.0.1';
const PORT = Number(process.env.WORKER_PORT ?? 8787);
const BASE = `http://${HOST}:${PORT}`;
const REMOTE_HINTS = /remote proxy|remote connection|remote resource|not supported/i;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let child;
let log = '';

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
    await sleep(250);
  }
  throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`);
}

const exited = () => !child || child.exitCode !== null || child.signalCode !== null;
const groupAlive = () => {
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch {
    return false;
  }
};
function killGroup(signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    // group already gone
  }
}

/** Never hand wrangler a Cloudflare credential: drop CLOUDFLARE_* / CF_* and turn telemetry off. */
function cleanEnv() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLOUDFLARE_|CF_)/.test(k)));
  return { ...env, WRANGLER_SEND_METRICS: 'false', CI: '1' };
}

async function main() {
  if (!existsSync(join(ROOT, 'dist/index.html'))) throw new Error('dist/ is missing: run `pnpm build` first');
  const script = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts['dev:worker'];
  if (!/^wrangler dev -c wrangler\.dev\.jsonc --port \d+$/.test(script)) throw new Error(`unexpected dev:worker script: ${script}`);
  if (/"ai"\s*:/.test(readFileSync(join(ROOT, 'wrangler.dev.jsonc'), 'utf8'))) throw new Error('wrangler.dev.jsonc must not bind AI');
  if (!(await portFree())) throw new Error(`port ${PORT} is in use (set WORKER_PORT to use another port)`);

  const args = ['exec', ...script.replace(/--port \d+$/, `--port ${PORT}`).split(' '), '--ip', HOST];
  console.log(`$ pnpm ${args.slice(1).join(' ')}  (CLOUDFLARE_*/CF_* unset)`);
  child = spawn('pnpm', args, { cwd: ROOT, env: cleanEnv(), detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  console.log(`wrangler dev pid ${child.pid} (process group)`);
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (d) => (log += d));

  let health;
  await waitFor(
    async () => {
      if (exited()) throw new Error('wrangler dev exited early');
      if (REMOTE_HINTS.test(log)) throw new Error('wrangler dev tried to go remote');
      health = await fetch(`${BASE}/api/health`).then((r) => (r.ok ? r.json() : null), () => null);
      return health !== null;
    },
    60_000,
    `${BASE}/api/health`,
  );
  console.log(`GET /api/health -> ${JSON.stringify(health)}`);
  if (health.ok !== true || health.ai !== false) throw new Error('expected { ok: true, ai: false }');

  const sample = JSON.parse(readFileSync(join(ROOT, 'src/samples/express.json'), 'utf8'));
  const summary = summarizeForEras(parseAggregate(sample));
  const res = await fetch(`${BASE}/api/eras`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ summary }) });
  const body = await res.json();
  console.log(`POST /api/eras (express summary) -> ${res.status} source=${body.source}`);
  for (const era of body.eras ?? []) console.log(`  ${era.start}..${era.end}  ${era.title}`);
  if (res.status !== 200 || body.source !== 'heuristic') throw new Error('expected 200 with source "heuristic"');
  if (JSON.stringify(body.eras) !== JSON.stringify(heuristicEras(summary))) throw new Error('eras differ from heuristicEras(summary)');

  const bad = await fetch(`${BASE}/api/eras`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"summary":{}}' });
  console.log(`POST /api/eras (invalid summary) -> ${bad.status}`);
  if (bad.status !== 400) throw new Error('expected 400 for an invalid summary');
  if (REMOTE_HINTS.test(log)) throw new Error('wrangler dev tried to go remote');
}

async function cleanup() {
  if (!child) return true;
  killGroup('SIGTERM');
  await waitFor(async () => !groupAlive(), 8000, 'wrangler exit').catch(() => killGroup('SIGKILL'));
  const gone = await waitFor(async () => !groupAlive(), 3000, 'wrangler exit').then(() => true, () => false);
  const free = await waitFor(portFree, 5000, 'port').then(() => true, () => false);
  console.log(gone && free ? `cleanup ok (process group ${child.pid} gone, port ${PORT} free)` : 'cleanup FAILED: wrangler still running');
  return gone && free;
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => void cleanup().finally(() => process.exit(130)));

let exitCode = 0;
try {
  await main();
  console.log('worker smoke: passed');
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  if (log) console.error(`--- wrangler output ---\n${log.trim()}`);
  exitCode = 1;
} finally {
  if (!(await cleanup())) exitCode = 1;
}
process.exit(exitCode);
