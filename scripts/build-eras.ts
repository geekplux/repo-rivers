// Writes era names into the built-in samples. Usage: pnpm eras:build [--ai]
// Default: deterministic heuristic names, offline, no key. `--ai` names them with one Workers AI REST call
// per sample, and only with CLOUDFLARE_ACCOUNT_ID and WORKERS_AI_TOKEN set explicitly for this purpose
// (a token scoped to Workers AI). Any other Cloudflare credential in the environment is never read.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { heuristicEras } from '../src/core/eras/heuristic.ts';
import { ERA_MODEL, eraRequest } from '../src/core/eras/prompt.ts';
import { summarizeForEras, type EraSummary } from '../src/core/eras/summary.ts';
import { parseNames } from '../src/core/eras/validate.ts';
import { parseAggregate, type Era } from '../src/core/schema.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLES = ['vite', 'svelte', 'express'];
const MAX_BYTES = 50 * 1024;

/** One Workers AI REST call; null (heuristic) on any failure. */
async function nameWithAi(summary: EraSummary, account: string, token: string): Promise<Era[] | null> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/ai/run/${ERA_MODEL}`;
  try {
    const res = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(eraRequest(summary)) });
    const body = (await res.json()) as { success?: boolean; result?: { response?: unknown } };
    return res.ok && body.success ? parseNames(body.result?.response, summary.eras, 'ai') : null;
  } catch {
    return null;
  }
}

const ai = process.argv.includes('--ai');
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.WORKERS_AI_TOKEN;
if (ai && !(account && token)) {
  console.error('--ai needs CLOUDFLARE_ACCOUNT_ID and WORKERS_AI_TOKEN; writing heuristic eras instead');
}
for (const id of SAMPLES) {
  const file = join(ROOT, 'src/samples', `${id}.json`);
  const agg = parseAggregate(JSON.parse(readFileSync(file, 'utf8')));
  const summary = summarizeForEras(agg);
  const eras = (ai && account && token ? await nameWithAi(summary, account, token) : null) ?? heuristicEras(summary);
  const json = `${JSON.stringify(parseAggregate({ ...agg, eras }))}\n`;
  if (json.length > MAX_BYTES) throw new Error(`${id}.json would be larger than 50 KB`);
  writeFileSync(file, json);
  console.log(`${id}: ${eras.length} eras (${eras[0]?.source}), ${(json.length / 1024).toFixed(1)} KB`);
  for (const e of eras) console.log(`  ${e.start}-${e.end} ${e.title} | ${e.note}`);
}
