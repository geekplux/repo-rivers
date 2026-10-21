// `pnpm size`: budgets for the built app (docs/PLAN.md phase 5). Run after `pnpm build`.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const DIST = join(import.meta.dirname, '../dist');
const KB = 1024;
const gz = (file) => gzipSync(readFileSync(join(DIST, file)), { level: 9 }).length;
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const initial = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
const assets = readdirSync(join(DIST, 'assets'));
const fonts = readdirSync(join(DIST, 'fonts')).filter((f) => f.endsWith('.woff2'));
const samples = ['vite', 'svelte', 'express'].map((id) => assets.find((f) => f.startsWith(`${id}-`) && f.endsWith('.js')));

const rows = [
  ['initial JS (gzip)', initial.reduce((s, f) => s + gz(f), 0), 100 * KB, initial.length > 0],
  ...fonts.map((f) => [`font ${f}`, statSync(join(DIST, 'fonts', f)).size, 40 * KB, true]),
  ...samples.map((f, i) => [`sample ${f ?? ['vite', 'svelte', 'express'][i]} (gzip)`, f ? gz(`assets/${f}`) : 0, 50 * KB, Boolean(f)]),
];
if (fonts.length === 0) rows.push(['font (none found)', 0, 40 * KB, false]);
let ok = true;
for (const [name, bytes, budget, found] of rows) {
  const pass = found && bytes <= budget;
  ok &&= pass;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}: ${(bytes / KB).toFixed(1)} KB / ${budget / KB} KB${found ? '' : ' (missing)'}`);
}
process.exit(ok ? 0 : 1);
