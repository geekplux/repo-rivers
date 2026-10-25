// Repo Rivers redesign v1 ("Cyanotype"): builds preview/*.html (local check) and parts.json (canvas boards).
// Data: real samples from geekplux/repo-rivers main @ c4342e2, laid out by its own layoutRivers (dump.ts → data.json).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const D = JSON.parse(readFileSync(new URL('./data.json', import.meta.url)));
const OUT = new URL('./', import.meta.url).pathname;
mkdirSync(OUT + 'preview', { recursive: true });

// Radix Colors 3.0, steps 1..12.
const R = {
  slate: ['#fcfcfd', '#f9f9fb', '#f0f0f3', '#e8e8ec', '#e0e1e6', '#d9d9e0', '#cdced6', '#b9bbc6', '#8b8d98', '#80838d', '#60646c', '#1c2024'],
  slateD: ['#111113', '#18191b', '#212225', '#272a2d', '#2e3135', '#363a3f', '#43484e', '#5a6169', '#696e77', '#777b84', '#b0b4ba', '#edeef0'],
  blue: ['#fbfdff', '#f4faff', '#e6f4fe', '#d5efff', '#c2e5ff', '#acd8fc', '#8ec8f6', '#5eb1ef', '#0090ff', '#0588f0', '#0d74ce', '#113264'],
  blueD: ['#0d1520', '#111927', '#0d2847', '#003362', '#004074', '#104d87', '#205d9e', '#2870bd', '#0090ff', '#3b9eff', '#70b8ff', '#c2e6ff'],
};
const vars = (dark) =>
  ['slate', 'blue'].map((n) => R[dark ? n + 'D' : n].map((v, i) => `--${n}-${i + 1}:${v}`).join(';')).join(';') +
  (dark
    ? ';--ground:var(--blue-2);--ink:var(--blue-12);--muted:var(--slate-11);--line:var(--blue-6);--hair:var(--blue-5);--water-a:var(--blue-12);--water-b:var(--blue-11);--on-water:var(--blue-1);--solid:var(--blue-12);--on-solid:var(--blue-1);--field:var(--blue-1);--band:var(--blue-3)'
    : ';--ground:var(--blue-1);--ink:var(--blue-12);--muted:var(--slate-11);--line:var(--blue-7);--hair:var(--blue-6);--water-a:var(--blue-12);--water-b:var(--blue-11);--on-water:var(--blue-1);--solid:var(--blue-12);--on-solid:var(--blue-1);--field:#ffffff;--band:var(--blue-3)');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = (v) => Math.round(v * 10) / 10;
const n0 = new Intl.NumberFormat('en-US');
const FONTS = 'https://fonts.googleapis.com/css2?family=Alegreya+Sans:ital,wght@0,400;0,500;0,700;1,400;1,500&display=swap';

const CSS = `
.rr{box-sizing:border-box;font-family:'Alegreya Sans',ui-sans-serif,system-ui,sans-serif;font-size:16px;line-height:24px;color:var(--ink);background:var(--ground);-webkit-font-smoothing:antialiased;font-variant-numeric:lining-nums}
.rr *{box-sizing:border-box}
.rr a{color:inherit;text-decoration:none}
.rr button{font:inherit;color:inherit;background:none;border:0;padding:0;margin:0;cursor:pointer}
.rr input{font:inherit;color:inherit}
.rr .num{font-variant-numeric:lining-nums tabular-nums}
.rr .muted{color:var(--muted)}
.rr .wrap{width:1200px;margin:0 auto}
.rr .hdr{height:72px;display:flex;align-items:center}
.rr .hdr .wrap{display:flex;align-items:center;justify-content:space-between}
.rr .brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:16px;letter-spacing:-.005em}
.rr .nav{display:flex;align-items:center;gap:4px;color:var(--muted);margin-right:-12px}
.rr .nav a{height:44px;display:flex;align-items:center;padding:0 12px}
.rr .icon{width:44px;height:44px;display:flex;align-items:center;justify-content:center;color:var(--muted)}
.rr .hero{padding:104px 0 0}
.rr h1{font-size:56px;line-height:60px;font-weight:500;letter-spacing:-.025em;margin:0 0 0 -3px;max-width:880px;text-wrap:balance}
.rr h1 i{font-weight:400}
.rr .go{display:flex;align-items:center;gap:12px;margin-top:40px}
.rr .field{width:440px;height:48px;border:.5px solid var(--line);background:var(--field);border-radius:6px;display:flex;align-items:center;padding:0 16px;color:var(--muted)}
.rr .field b{font-weight:400;color:var(--ink)}
.rr .btn{height:48px;padding:0 24px;border-radius:6px;background:var(--solid);color:var(--on-solid);font-weight:500;display:flex;align-items:center}
.rr .or{margin-left:16px;color:var(--muted)}
.rr .or a{color:var(--ink);border-bottom:.5px solid var(--line);padding-bottom:1px}
.rr .or a.on{border-bottom:1.5px solid var(--ink)}
.rr .head{display:flex;align-items:flex-end;justify-content:space-between;margin-top:104px}
.rr h2{font-size:22px;line-height:28px;font-weight:500;letter-spacing:-.01em;margin:0}
.rr .meta{font-size:13px;line-height:20px;color:var(--muted);margin-top:4px}
.rr .meta button{border-bottom:.5px dashed var(--muted);color:var(--muted);line-height:16px}
.rr .ctl{display:flex;align-items:center;gap:16px}
.rr .seg{display:flex;height:36px;border:.5px solid var(--line);border-radius:6px;padding:3px}
.rr .seg button{padding:0 14px;border-radius:3px;font-size:16px;color:var(--muted)}
.rr .seg button.on{background:var(--band);color:var(--ink);font-weight:500}
.rr .sel{height:36px;display:flex;align-items:center;gap:6px;color:var(--muted)}
.rr .sel b{color:var(--ink);font-weight:500}
.rr .chart{display:block;margin-top:16px}
.rr .chart text{font-family:'Alegreya Sans',ui-sans-serif,sans-serif}
.rr .under{display:flex;justify-content:space-between;align-items:baseline;margin-top:4px;min-height:24px}
.rr .read b{font-weight:500}
.rr .legend{display:flex;gap:20px;font-size:13px;color:var(--muted)}
.rr .legend span{display:flex;align-items:center;gap:6px}
.rr .sec{display:grid;grid-template-columns:280px 920px;align-items:start;margin-top:144px}
.rr .sec h2.at-th{margin-top:-6px}
.rr .sec h2.at-row{margin-top:13px}
.rr .sec h2{padding:0}
.rr table{border-collapse:collapse;width:920px}
.rr th{font-size:13px;line-height:20px;font-weight:400;color:var(--muted);text-align:left;padding:0 0 10px;border-bottom:.5px solid var(--line)}
.rr td{height:48px;border-bottom:.5px solid var(--hair);padding:0}
.rr td.r,.rr th.r{text-align:right}
.rr tr.on td{background:var(--band)}
.rr tr.on td:first-child{box-shadow:inset 0 0 0 0 transparent}
.rr .rname{font-style:italic;font-weight:500}
.rr .era td{height:auto;padding:16px 0;vertical-align:top}
.rr .era .t{font-weight:500}
.rr .foot{margin-top:160px;border-top:.5px solid var(--line);padding:32px 0 56px}
.rr .foot .wrap{display:grid;grid-template-columns:520px 680px;font-size:13px;line-height:20px;color:var(--muted)}
.rr .foot p{margin:0 0 6px;max-width:440px}
.rr .made{display:flex;gap:20px;color:var(--ink)}
.rr .made a{border-bottom:.5px solid var(--line)}
.rr .made .first{font-weight:500}
`;

// ---------- logo: three streams, two joining and one leaving (a confluence) ----------
function logo(size = 28, id = 'lg') {
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">
<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#113264"/><stop offset=".55" stop-color="#0090ff"/><stop offset="1" stop-color="#7ce2fe"/></linearGradient></defs>
<rect width="32" height="32" rx="7" fill="#0d2847"/>
<path d="M4 8.5C11 8.5 12 14 17 14.3L28 14.3L28 17.7L17 17.7C12 18 11 23.5 4 23.5L4 20.5C9 20.5 10 16.4 12.6 16C10 15.6 9 11.5 4 11.5Z" fill="url(#${id})"/>
<path d="M18.5 19.6C22 19.6 23.2 24 28 24L28 26C22.5 26 21 21.6 18.5 21.6Z" fill="#7ce2fe"/>
</svg>`;
}

// ---------- shared chart helpers ----------
const centre = (r, i) => (r.top[i] + r.bottom[i]) / 2;
const mid = (pts) => pts.slice(1).map((b, j) => { const a = pts[j]; const m = (a[0] + b[0]) / 2; return `C${r1(m)},${r1(a[1])} ${r1(m)},${r1(b[1])} ${r1(b[0])},${r1(b[1])}`; }).join('');
/** Two tones, chosen so rivers that run side by side differ (greedy over how many columns each pair touches). */
function tones(L) {
  const n = L.rivers.length, B = L.rivers[0].thickness.length;
  const w = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < B; i++) {
    const live = L.rivers.map((r, j) => [r, j]).filter(([r]) => r.thickness[i] > 0 && r.kind !== 'other').map(([, j]) => j);
    for (let k = 1; k < live.length; k++) { w[live[k - 1]][live[k]]++; w[live[k]][live[k - 1]]++; }
  }
  const t = new Array(n).fill(-1);
  const order = [...Array(n).keys()].sort((a, b) => w[b].reduce((x, y) => x + y) - w[a].reduce((x, y) => x + y));
  for (const j of order) { const c = [0, 0]; for (let k = 0; k < n; k++) if (t[k] >= 0) c[t[k]] += w[j][k]; t[j] = c[0] <= c[1] ? 0 : 1; }
  return t;
}
const charW = (s) => s.length * 6.3 + 4; // 13px Alegreya Sans italic 500, measured ≈ 6.1 px per char

function yearTicks(s) {
  const t = s.buckets.map((b, i) => ({ i, y: b.start.slice(0, 4), first: b.start.slice(5, 10) === '01-01' || i === 0 })).filter((t) => t.first);
  return t[1] && t[0].i === 0 && t[1].i - t[0].i < 3 && t[0].y !== t[1].y && s.unit === 'quarter' ? t.slice(1) : t;
}

/** Desktop chart: 1440 wide SVG; plot laid out at 1200 and placed at x = 40, labels in course or at the mouth. */
function chart(key, o = {}) {
  const s = D[key];
  const L = s.desk;
  const P = 'c' + Math.random().toString(36).slice(2, 7);
  const X0 = 116, ERA = 84, AX = 44;
  const bw = L.bucketWidth;
  const W = 1440, H = ERA + L.plot.bottom + AX;
  const T = tones(L);
  const fills = (j, r) => (r.kind === 'other' ? `url(#${P}h)` : T[j] ? 'var(--water-b)' : 'var(--water-a)');
  const dim = (r) => (o.focus && r.id !== o.focus ? ' opacity=".18"' : '');
  let g = '';
  // era bands and hairlines
  const eras = s.eras.map((e, k) => ({ ...e, k, x0: L.plot.left + e.start * bw, x1: L.plot.left + (e.end + 1) * bw }));
  if (o.era !== undefined) { const e = eras[o.era]; g += `<rect x="${r1(e.x0)}" y="${-ERA + 8}" width="${r1(e.x1 - e.x0)}" height="${ERA - 8 + L.plot.bottom + 8}" fill="var(--band)"/>`; }
  // each era's name sits on its own rule; a long name wraps to two lines inside its reach
  const wrapT = (t, max) => { const out = ['']; for (const w of t.split(' ')) { const c = out.at(-1) ? out.at(-1) + ' ' + w : w; if (c.length * 7.7 > max && out.at(-1)) out.push(w); else out[out.length - 1] = c; } return out; };
  eras.forEach((e) => {
    g += `<line x1="${r1(e.x0)}" x2="${r1(e.x0)}" y1="-8" y2="${L.plot.bottom + 8}" stroke="var(--line)" stroke-width=".5"/>`;
    const lines = wrapT(e.title, e.x1 - e.x0 - 16).slice(0, 2);
    const eo = o.reveal === undefined || o.reveal >= 1 ? '' : o.reveal >= 0.75 ? ' opacity=".5"' : ' opacity="0"';
    lines.forEach((ln, i) => { g += `<text x="${r1(e.x0)}" y="${-30 - (lines.length - 1 - i) * 20}" font-size="16" font-weight="500" fill="var(--ink)"${eo}>${esc(ln)}</text>`; });
    g += `<text x="${r1(e.x0)}" y="-14" font-size="13" fill="var(--muted)" class="num"${eo}>${esc(eraRange(s, e))}</text>`;
  });
  // rivers
  L.rivers.forEach((r, j) => { g += `<path d="${r.path}" fill="${o.focus === r.id ? 'var(--water-a)' : fills(j, r)}"${dim(r)}${r.kind === 'other' ? ' stroke="var(--water-b)" stroke-width=".5"' : ''}/>`; });
  // transfers: cut through the water as a dashed ground-coloured channel with an arrowhead
  L.transfers.filter((t) => t.always || (o.focus && (t.to === o.focus || t.from === o.focus))).forEach((t) => {
    const on = o.focus && (t.to === o.focus || t.from === o.focus);
    const op = o.focus && !on ? ' opacity=".18"' : '';
    const w = Math.max(1.5, t.width);
    g += `<path d="${t.path}" fill="none" stroke="var(--ground)" stroke-width="${r1(w + 2)}"${op}/>`;
    g += `<path d="${t.path}" fill="none" stroke="var(--${on ? 'ink' : 'water-b'})" stroke-width="${r1(Math.min(w, 3.5))}" stroke-dasharray="6 3"${op}/>`;
    const [ex, ey] = t.end;
    g += `<path d="M${r1(ex)},${r1(ey)}l-7,-3.5v7z" fill="var(--${on ? 'ink' : 'water-b'})"${op}/>`;
  });
  // labels
  const boxes = [];
  L.transfers.filter((t) => t.always || (o.focus && (t.to === o.focus || t.from === o.focus))).forEach((t) => boxes.push({ x0: Math.min(t.start[0], t.end[0]) - 4, x1: Math.max(t.start[0], t.end[0]) + 8, y0: Math.min(t.start[1], t.end[1]) - 4, y1: Math.max(t.start[1], t.end[1]) + 4 }));
  const hit = (bx) => boxes.some((q) => !(q.x1 < bx.x0 || bx.x1 < q.x0 || q.y1 < bx.y0 || bx.y1 < q.y0));
  const defs = [];
  const labels = [];
  const B = s.buckets.length;
  L.rivers.forEach((r, j) => {
    const text = r.kind === 'other' ? 'other' : r.label;
    const need = charW(text) + 20;
    // smoothed centreline (5-column mean) and the longest run where it stays well inside the river
    const sm = r.thickness.map((_, i) => { let a = 0, n = 0; for (let k = i - 2; k <= i + 2; k++) if (k >= 0 && k < B && r.thickness[k] > 0) { a += centre(r, k); n++; } return n ? a / n : centre(r, i); });
    const ok = (i) => r.thickness[i] >= 17 && Math.abs(sm[i] - centre(r, i)) <= (r.thickness[i] - 15) / 2;
    let best = null;
    for (let a = 0; a < B; a++) {
      if (!ok(a) || (a > 0 && ok(a - 1))) continue;
      let b = a; while (b + 1 < B && ok(b + 1)) b++;
      const len = (b - a) * bw;
      if (!best || len > best.len) best = { a, b, len };
    }
    r._sm = sm;
    const at = (arr, x) => { const f = (x - L.plot.left) / bw - 0.5; const i = Math.max(0, Math.min(B - 1, Math.floor(f))); const k = Math.min(B - 1, i + 1); const t = Math.max(0, Math.min(1, f - i)); return arr[i] + (arr[k] - arr[i]) * t; };
    // first choice: a straight label slanted with the river's course (least-squares line through the smoothed centreline)
    if (best && best.len >= need) {
      const tw0 = charW(text);
      const x0 = L.plot.left + bw * (best.a + 0.5) + Math.max(0, (best.len - tw0) / 2);
      const pts = []; for (let i = best.a; i <= best.b; i++) { const x = L.plot.left + bw * (i + 0.5); if (x >= x0 - bw && x <= x0 + tw0 + bw) pts.push([x, sm[i]]); }
      const mx = pts.reduce((q, p) => q + p[0], 0) / pts.length, my = pts.reduce((q, p) => q + p[1], 0) / pts.length;
      const sxx = pts.reduce((q, p) => q + (p[0] - mx) ** 2, 0), sxy = pts.reduce((q, p) => q + (p[0] - mx) * (p[1] - my), 0);
      const k = Math.max(-0.35, Math.min(0.35, sxx ? sxy / sxx : 0));
      const yl = (x) => my + k * (x - mx);
      let fit = true;
      for (let q = 0; q <= 12 && fit; q++) { const x = x0 + (tw0 * q) / 12; if (at(r.top, x) > yl(x) - 8 || at(r.bottom, x) < yl(x) + 8) fit = false; }
      const cbox = { x0, x1: x0 + tw0, y0: Math.min(yl(x0), yl(x0 + tw0)) - 9, y1: Math.max(yl(x0), yl(x0 + tw0)) + 9 };
      if (fit && !hit(cbox)) {
        boxes.push(cbox);
        const fd = o.focus && r.id !== o.focus;
        const ang = (Math.atan(k) * 180) / Math.PI;
        labels.push(`<text x="${r1(x0)}" y="${r1(yl(x0) + 4.5)}" transform="rotate(${r1(ang)} ${r1(x0)} ${r1(yl(x0))})" font-size="13" font-style="italic" font-weight="500" fill="var(--${r.kind === 'other' || fd ? 'ink' : 'on-water'})"${fd ? ' opacity=".45"' : ''}${r.kind === 'other' ? ' paint-order="stroke" stroke="var(--ground)" stroke-width="3"' : ''}>${esc(text)}</text>`);
        return;
      }
    }
    // fallback: a straight label where the whole name fits inside the river
    const tw = charW(text);
    const cand = r.thickness.map((t, i) => [t, i]).sort((a, b) => b[0] - a[0]);
    for (const [t, i] of cand) {
      if (t < 17) break;
      const cx = Math.min(L.plot.right - tw / 2 - 4, Math.max(L.plot.left + tw / 2 + 4, L.plot.left + bw * (i + 0.5)));
      for (const dy of [0, -3, 3, -6, 6]) {
        const y = centre(r, i) + dy;
        let fit = true;
        for (let q = 0; q <= 10 && fit; q++) { const x = cx - tw / 2 + (tw * q) / 10; if (at(r.top, x) > y - 8 || at(r.bottom, x) < y + 8) fit = false; }
        if (!fit) continue;
        const sb = { x0: cx - tw / 2, x1: cx + tw / 2, y0: y - 9, y1: y + 9 };
        if (hit(sb)) continue;
        boxes.push(sb);
        const fade = o.focus && r.id !== o.focus;
        labels.push(`<text x="${r1(cx)}" y="${r1(y + 4.5)}" text-anchor="middle" font-size="13" font-style="italic" font-weight="500" fill="var(--${r.kind === 'other' || fade ? 'ink' : 'on-water'})"${fade ? ' opacity=".45"' : ''}${r.kind === 'other' ? ' paint-order="stroke" stroke="var(--ground)" stroke-width="3"' : ''}>${esc(text)}</text>`);
        return;
      }
    }
    r._mouth = true;
  });
  // mouth labels: rivers alive at the present, unlabelled in course, stacked in the gutter with leaders
  const mouth = L.rivers.filter((r) => r._mouth && r.thickness[B - 1] > 0);
  let lastY = -1e9;
  const gx = L.plot.right + 14;
  mouth.forEach((r) => {
    const ry = centre(r, B - 1);
    const y = Math.max(ry, lastY + 17);
    lastY = y;
    const fade = o.focus && r.id !== o.focus ? ' opacity=".35"' : '';
    labels.push(`<path d="M${r1(L.plot.right + 1)},${r1(ry)}C${r1(gx - 6)},${r1(ry)} ${r1(gx - 8)},${r1(y)} ${r1(gx - 2)},${r1(y)}" fill="none" stroke="var(--line)" stroke-width=".5"${fade}/>`);
    labels.push(`<text x="${r1(gx + 2)}" y="${r1(y + 4.5)}" font-size="13" font-style="italic" font-weight="500" fill="var(--ink)"${fade}>${esc(r.kind === 'other' ? 'other' : r.label)}</text>`);
  });
  // earlier rivers that ended before the present and stayed thin: a small label above their peak
  L.rivers.filter((r) => r._mouth && r.thickness[B - 1] === 0).forEach((r) => {
    let k = 0; r.thickness.forEach((t, i) => { if (t > r.thickness[k]) k = i; });
    const x = L.plot.left + bw * (k + 0.5), y = r.top[k] - 6;
    const pb = { x0: x - charW(r.label) / 2, x1: x + charW(r.label) / 2, y0: y - 13, y1: y + 3 };
    if (hit(pb)) return;
    boxes.push(pb);
    labels.push(`<text x="${r1(x)}" y="${r1(y)}" text-anchor="middle" font-size="13" font-style="italic" font-weight="500" fill="var(--ink)" paint-order="stroke" stroke="var(--ground)" stroke-width="4" stroke-linejoin="round"${o.focus && r.id !== o.focus ? ' opacity=".35"' : ''}>${esc(r.label)}</text>`);
  });
  // focus crosshair
  if (o.focus && o.bucket !== undefined) {
    const r = L.rivers.find((q) => q.id === o.focus);
    const x = L.plot.left + bw * (o.bucket + 0.5);
    g += `<line x1="${r1(x)}" x2="${r1(x)}" y1="${-ERA + 8}" y2="${L.plot.bottom + 8}" stroke="var(--ink)" stroke-width=".5"/>`;
    labels.push(`<circle cx="${r1(x)}" cy="${r1(centre(r, o.bucket))}" r="4.5" fill="var(--ground)" stroke="var(--ink)" stroke-width="1.5"/>`);
  }
  // axis
  let ax = `<line x1="${L.plot.left}" x2="${L.plot.right}" y1="${L.plot.bottom + 8}" y2="${L.plot.bottom + 8}" stroke="var(--line)" stroke-width=".5"/>`;
  L.estimated.forEach((e) => { ax += `<line x1="${r1(e.x0)}" x2="${r1(e.x1)}" y1="${L.plot.bottom + 8}" y2="${L.plot.bottom + 8}" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="1 3"/>`; });
  yearTicks(s).forEach((t) => {
    const x = L.plot.left + t.i * bw;
    ax += `<line x1="${r1(x)}" x2="${r1(x)}" y1="${L.plot.bottom + 8}" y2="${L.plot.bottom + 16}" stroke="var(--line)" stroke-width=".5"/><text x="${r1(x)}" y="${L.plot.bottom + 32}" font-size="13" fill="var(--muted)" class="num">${t.y}</text>`;
  });
  if (L.partial) ax += `<line x1="${r1(L.partial.x)}" x2="${r1(L.partial.x)}" y1="0" y2="${L.plot.bottom + 8}" stroke="var(--ink)" stroke-width=".5" stroke-dasharray="2 3"/>`;
  const clip = o.reveal !== undefined ? `<clipPath id="${P}r"><rect x="0" y="${-ERA}" width="${r1(L.plot.left + (L.plot.right - L.plot.left) * o.reveal)}" height="${H}"/></clipPath>` : '';
  const cl = o.reveal !== undefined ? ` clip-path="url(#${P}r)"` : '';
  return `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaOf(s))}">
<defs><pattern id="${P}h" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--ground)"/><line x1="0" y1="0" x2="0" y2="6" stroke="var(--water-b)" stroke-width="1.6"/></pattern>${defs.join('')}${clip}</defs>
<g transform="translate(${X0},${ERA})"><g${cl}>${g}${labels.join('')}</g>${ax}</g>
</svg>`;
}
const sumT = (r, a, b) => r.thickness.slice(a, b + 1).reduce((x, y) => x + y, 0);

function eraRange(s, e) {
  const a = s.buckets[e.start].label, b = s.buckets[e.end].label;
  return a === b ? a : `${a} to ${b}`;
}
const _y=0;
const ariaOf = (s) => `${s.repo.owner}/${s.repo.name}: ${s.rivers.length} rivers of ${s.metric} per ${s.unit}, ${s.buckets[0].label} to ${s.buckets.at(-1).label}.`;

// ---------- page sections ----------
function header(dark) {
  const sun = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true">${dark ? '<circle cx="10" cy="10" r="3.5"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>' : '<path d="M15.5 12.3A6.5 6.5 0 0 1 7.7 4.5a6.5 6.5 0 1 0 7.8 7.8z"/>'}</svg>`;
  return `<header class="hdr"><div class="wrap"><a class="brand" href="#">${logo(28, dark ? 'lgd' : 'lgl')}Repo Rivers</a><nav class="nav"><a href="#">Source</a><button class="icon" aria-label="${dark ? 'Switch to light theme' : 'Switch to dark theme'}">${sun}</button></nav></div></header>`;
}
function hero(sample) {
  const names = { vite: 'Vite', svelte: 'Svelte', express: 'Express' };
  const links = Object.entries(names).map(([k, v]) => `<a href="#" class="${k === sample ? 'on' : ''}">${v}</a>`);
  return `<section class="hero"><div class="wrap">
<h1>A repository’s history, <i>drawn as rivers</i></h1>
<form class="go"><label class="field" aria-label="GitHub repository"><span>github.com/<b></b>owner/name</span></label><button class="btn" type="button">Draw</button><span class="or">or open ${links[0]}, ${links[1]} or ${links[2]}</span></form>
</div></section>`;
}
function chartHead(key, dim) {
  const s = D[key];
  const months = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const per = s.metric === 'lines changed' ? 'Lines changed' : 'Commits';
  const est = s.source.mode === 'sampled' ? ` <button type="button">Estimated from ${n0.format(s.source.commitsSeen)} of ${n0.format(s.source.commitsTotal)} commits</button>` : '';
  const ctl = dim === 'modules'
    ? `<div class="sel">Folder depth <b>Auto</b><svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.2"/></svg></div>`
    : `<label class="sel"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x=".75" y=".75" width="14.5" height="14.5" rx="3" fill="none" stroke="currentColor" stroke-width=".75"/></svg>Include bots</label>`;
  return `<div class="wrap head"><div><h2>${esc(s.repo.owner)}/${esc(s.repo.name)}</h2><div class="meta">${per} per ${s.unit}, ${months(s.buckets[0].start)} to ${months(s.generatedAt)}.${est}</div></div>
<div class="ctl">${ctl}<div class="seg" role="radiogroup" aria-label="Rivers by"><button class="${dim === 'modules' ? 'on' : ''}" role="radio" aria-checked="${dim === 'modules'}">Modules</button><button class="${dim === 'contributors' ? 'on' : ''}" role="radio" aria-checked="${dim === 'contributors'}">Contributors</button></div></div></div>`;
}
function under(key, read) {
  const s = D[key];
  const leg = `<span><svg width="22" height="6" aria-hidden="true"><line x1="0" x2="22" y1="3" y2="3" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="1 3"/></svg>estimated</span>
<span><svg width="6" height="14" aria-hidden="true"><line x1="3" x2="3" y1="0" y2="14" stroke="var(--ink)" stroke-width=".5" stroke-dasharray="2 3"/></svg>quarter in progress</span>
<span><svg width="22" height="8" aria-hidden="true"><path d="M0,4h14" stroke="var(--water-b)" stroke-width="1.5" stroke-dasharray="4 3"/><path d="M22,4l-7,-3.5v7z" fill="var(--water-b)"/></svg>files moved</span>`;
  let l = s.unit === 'quarter' ? leg : leg.replace('quarter in progress', 'year in progress');
  if (!s.transfers.length) l = l.replace(/<span><svg width="22" height="8"[\s\S]*?files moved<\/span>/, '');
  if (!s.desk.estimated.length) l = l.replace(/<span>[^]*?estimated<\/span>/, '');
  return `<div class="wrap under"><p class="read" aria-live="polite" style="margin:0">${read}</p><div class="legend">${l}</div></div>`;
}
function idle(key) {
  const s = D[key];
  const all = s.rivers.reduce((a, r) => a + r.total, 0);
  const top = s.rivers[0];
  const moves = s.transfers.reduce((a, t) => a + t.files, 0);
  return `<i>${esc(top.label)}</i> carries ${Math.round((100 * top.total) / all)}% of all ${s.metric}${moves ? `, and ${n0.format(moves)} files moved between modules` : ''}.`;
}
function spark(r, w = 360, h = 24) {
  const max = Math.max(...r.values) || 1;
  const n = r.values.length;
  const pts = r.values.map((v, i) => [(i / (n - 1)) * w, h - (v / max) * h]);
  const d = `M0,${h}L${pts.map((p) => `${r1(p[0])},${r1(p[1])}`).join('L')}L${w},${h}Z`;
  return `<svg width="${w}" height="${h}" aria-hidden="true" style="display:block"><path d="${d}" fill="var(--water-${r.kind === 'other' ? 'b' : 'a'})"${r.kind === 'other' ? ' opacity=".55"' : ''}/></svg>`;
}
function index(key, focus) {
  const s = D[key];
  const all = s.rivers.reduce((a, r) => a + r.total, 0);
  const yr = (i) => s.buckets[i].start.slice(0, 4);
  const rows = s.rivers.map((r) => {
    const f = r.values.findIndex((v) => v > 0);
    const l = r.values.length - 1 - [...r.values].reverse().findIndex((v) => v > 0);
    const span = l === r.values.length - 1 ? `${yr(f)} to now` : yr(f) === yr(l) ? yr(f) : `${yr(f)} to ${yr(l)}`;
    return `<tr class="${r.id === focus ? 'on' : ''}"><td style="width:240px"><span class="rname">${esc(r.kind === 'other' ? 'other' : r.label)}</span>${r.bot ? ' <span class="muted">bot</span>' : ''}</td><td style="width:380px">${spark(r)}</td><td class="r num" style="width:120px">${n0.format(r.total)}</td><td class="r num" style="width:80px">${(100 * r.total / all).toFixed(r.total / all < 0.1 ? 1 : 0)}%</td><td class="r num muted" style="width:100px">${span}</td></tr>`;
  }).join('');
  const what = s.metric === 'lines changed' ? 'Lines changed' : 'Commits';
  return `<section class="wrap sec"><h2 class="at-th">Rivers</h2><table><caption style="position:absolute;left:-9999px">Every river, largest first</caption><thead><tr><th>${D[key].rivers[0].kind === 'contributor' ? 'Contributor' : 'Module'}</th><th>Each ${s.unit}, scaled to its own peak</th><th class="r">${what}</th><th class="r">Share</th><th class="r">Active</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}
function eras(key) {
  const s = D[key];
  const rows = s.eras.map((e) => `<tr class="era"><td style="width:240px" class="num muted">${esc(eraRange(s, e))}</td><td><div class="t">${esc(e.title)}</div><div class="muted">${esc(e.note.charAt(0).toUpperCase() + e.note.slice(1).replace(/; /g, ', '))}.</div></td></tr>`).join('');
  return `<section class="wrap sec"><h2 class="at-row">Eras</h2><table><tbody>${rows}</tbody></table></section>`;
}
function footer() {
  return `<footer class="foot"><div class="wrap"><div><p>Data from the GitHub API, read without an account; large histories are sampled. The built-in samples work offline.</p><p>AI era names are capped site-wide each day; past the cap, eras get rule-based names.</p><p>Open source under MIT. <a href="#" style="border-bottom:.5px solid var(--line);color:var(--ink)">Source on GitHub</a></p></div>
<div><p style="color:var(--ink);font-weight:500">Made by GeekPlux</p><div class="made"><a class="first" href="#">geekplux.com</a><a href="#">Vert</a><a href="#">Explorable</a><a href="#">Pagelapse</a><a href="#">Reasontrail</a><a href="#">markvis</a></div></div></div></footer>`;
}

function page({ key, dark = false, focus, bucket, read, era }) {
  const dim = key.endsWith('contributors') ? 'contributors' : 'modules';
  const sample = key.split('-')[0];
  return `<div class="rr" style="${vars(dark)};width:1440px">${header(dark)}${hero(sample)}${chartHead(key, dim)}${chart(key, { focus, bucket, era })}${under(key, read ?? idle(key))}${index(key, focus)}${eras(key)}${footer()}</div>`;
}

// ---------- phone: time runs down the page ----------
function phoneChart(key, o = {}) {
  const s = D[key];
  const L = s.phone;
  const P = 'p' + Math.random().toString(36).slice(2, 7);
  const bw = L.bucketWidth;
  const T = tones(L);
  const LX = 50, TOP = 24; // cross axis starts at x = 50 (year labels left of it); time starts at y = 24
  const W = 390, H = TOP + L.width + 24;
  const tx = (x, y) => [LX + y - L.plot.top, TOP + x];
  let g = '';
  L.rivers.forEach((r, j) => {
    const fill = r.kind === 'other' ? `url(#${P}h)` : T[j] ? 'var(--water-b)' : 'var(--water-a)';
    g += `<path d="${r.path}" fill="${fill}"${o.focus && r.id !== o.focus ? ' opacity=".18"' : ''}/>`;
  });
  let out = '';
  // eras: a full-width rule with the era name where the reach begins
  s.eras.forEach((e, k) => {
    const [, y] = tx(L.plot.left + e.start * bw, 0);
    if (k > 0) out += `<line x1="16" x2="374" y1="${r1(y)}" y2="${r1(y)}" stroke="var(--line)" stroke-width=".5"/>`;
  });
  yearTicks(s).forEach((t) => {
    const [, y] = tx(L.plot.left + t.i * bw, 0);
    out += `<text x="16" y="${r1(y + 4)}" font-size="13" fill="var(--muted)" class="num">${t.y}</text>`;
  });
  // labels: along each river (reading downward), where a smoothed centreline stays inside it
  const B = s.buckets.length;
  const defs = [];
  L.rivers.forEach((r, j) => {
    const text = r.kind === 'other' ? 'other' : r.label;
    const sm = r.thickness.map((_, i) => { let a = 0, n = 0; for (let k = i - 2; k <= i + 2; k++) if (k >= 0 && k < B && r.thickness[k] > 0) { a += centre(r, k); n++; } return n ? a / n : centre(r, i); });
    const ok = (i) => r.thickness[i] >= 16 && Math.abs(sm[i] - centre(r, i)) <= (r.thickness[i] - 14) / 2;
    let best = null;
    for (let a = 0; a < B; a++) {
      if (!ok(a) || (a > 0 && ok(a - 1))) continue;
      let b = a; while (b + 1 < B && ok(b + 1)) b++;
      if (!best || b - a > best.b - best.a) best = { a, b };
    }
    if (!best || (best.b - best.a) * bw < charW(text) + 16) return;
    const pts = [];
    for (let i = best.a; i <= best.b; i++) { const [x, y] = tx(L.plot.left + bw * (i + 0.5), sm[i]); pts.push([x - 4.5, y]); }
    const d = `M${r1(pts[0][0])},${r1(pts[0][1])}` + pts.slice(1).map((q, k) => { const a = pts[k]; const m = (a[1] + q[1]) / 2; return `C${r1(a[0])},${r1(m)} ${r1(q[0])},${r1(m)} ${r1(q[0])},${r1(q[1])}`; }).join('');
    defs.push(`<path id="${P}l${j}" d="${d}"/>`);
    const off = Math.max(0, ((best.b - best.a) * bw - charW(text)) / 2);
    const fd = o.focus && r.id !== o.focus;
    out += `<text font-size="13" font-style="italic" font-weight="500" fill="var(--${r.kind === 'other' || fd ? 'ink' : 'on-water'})"${fd ? ' opacity=".45"' : ''}${r.kind === 'other' ? ' paint-order="stroke" stroke="var(--ground)" stroke-width="3"' : ''}><textPath href="#${P}l${j}" startOffset="${r1(off)}">${esc(text)}</textPath></text>`;
  });
  s.eras.forEach((e, k) => {
    const [, y] = tx(L.plot.left + e.start * bw, 0);
    out += `<text x="374" y="${r1(y + (k ? 20 : 4))}" text-anchor="end" font-size="13" font-weight="500" fill="var(--ink)" paint-order="stroke" stroke="var(--ground)" stroke-width="6" stroke-linejoin="round">${esc(e.title)}</text>`;
  });
  if (o.focus && o.bucket !== undefined) {
    const [, y] = tx(L.plot.left + bw * (o.bucket + 0.5), 0);
    out += `<line x1="16" x2="374" y1="${r1(y)}" y2="${r1(y)}" stroke="var(--ink)" stroke-width=".5"/>`;
  }
  return `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(ariaOf(s))}" style="margin-top:12px">
<defs><pattern id="${P}h" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--ground)"/><line x1="0" y1="0" x2="0" y2="6" stroke="var(--water-b)" stroke-width="1.6"/></pattern>${defs.join('')}</defs>
<g transform="matrix(0 1 1 0 ${LX - L.plot.top} ${TOP})">${g}</g>${out}</svg>`;
}
const PCSS = `
.rr.ph .wrap{width:auto;margin:0 16px}
.rr.ph .hdr{height:60px}
.rr.ph .hdr .wrap{flex:1}
.rr.ph .nav a{padding:0 8px}
.rr.ph .hero{padding-top:40px}
.rr.ph h1{font-size:32px;line-height:36px}
.rr.ph .go{flex-wrap:wrap;margin-top:24px;gap:8px}
.rr.ph .field{width:262px}
.rr.ph .btn{padding:0 20px}
.rr.ph .or{margin:4px 0 0;width:100%}
.rr.ph .head{display:block;margin-top:64px}
.rr.ph .ctl{margin-top:16px;justify-content:space-between}
.rr.ph .sec{display:block;margin-top:80px}
.rr.ph .sec h2{margin:0 0 12px!important}
.rr.ph table{width:100%}
.rr.ph .foot .wrap{display:block}
.rr.ph .era td:first-child{width:104px!important;padding-right:12px}
.rr.ph .made{flex-wrap:wrap;gap:8px 16px;margin-top:6px}
.rr.ph .dock{position:absolute;left:0;right:0;bottom:0;height:72px;background:var(--ground);border-top:.5px solid var(--line);padding:12px 16px;font-size:16px;line-height:24px}
`;
function phone({ key, dark = false, focus, bucket, read, dock }) {
  const s = D[key];
  const all = s.rivers.reduce((a, r) => a + r.total, 0);
  const rows = s.rivers.map((r) => `<tr class="${r.id === focus ? 'on' : ''}"><td><span class="rname">${esc(r.kind === 'other' ? 'other' : r.label)}</span></td><td style="width:110px">${spark(r, 100, 20)}</td><td class="r num" style="width:56px">${(100 * r.total / all).toFixed(r.total / all < 0.1 ? 1 : 0)}%</td></tr>`).join('');
  return `<div class="rr ph" style="${vars(dark)};width:390px;position:relative">${header(dark)}${hero(key.split('-')[0]).replace(/or open/, 'or open')}${chartHead(key, 'modules')}${phoneChart(key, { focus, bucket })}
<div class="wrap" style="margin-top:8px"><p class="read" style="margin:0">${read ?? idle(key)}</p></div>
<section class="wrap sec"><h2 class="at-th">Rivers</h2><table><thead><tr><th>Module</th><th>Over time</th><th class="r">Share</th></tr></thead><tbody>${rows}</tbody></table></section>
${eras(key).replace('class="wrap sec"', 'class="wrap sec"')}${footer()}${dock ? `<div class="dock">${dock}</div>` : ''}</div>`;
}

// ---------- motion board ----------
function motion() {
  const frames = [0.12, 0.45, 0.8, 1].map((p, i) => {
    const svg = chart('vite-modules', { reveal: p }).replace(/width="1440" height="(\d+)" viewBox="0 0 1440 (\d+)"/, (m, h) => `width="560" height="${Math.round((h - 0) * 560 / 1240)}" viewBox="100 0 1240 ${h}"`);
    return `<figure style="margin:0"><div style="border:.5px solid var(--line);border-radius:6px;overflow:hidden">${svg}</div><figcaption class="num" style="font-size:13px;color:var(--muted);margin-top:8px">${[90, 360, 640, 900][i]} ms</figcaption></figure>`;
  }).join('');
  const rows = [
    ['Arrive', 'The rivers run in from the source: a clip reveals left to right, 900 ms ease-out. Era rules and names fade in over the last 250 ms. Once per page load.'],
    ['Point at a river', 'Other rivers fade to 18% in 250 ms ease-out; the readout under the chart changes at once, no animation. Moving between quarters only moves the hairline.'],
    ['Files moved', 'On focus, the dashed channels into and out of the river turn to ink and run their dashes forward once, 600 ms.'],
    ['Switch Modules and Contributors', 'Crossfade 250 ms. Lanes keep their order; the readout keeps the selected quarter.'],
    ['Choose a sample or draw a repo', 'The page scrolls the chart into view (smooth), then the arrive motion plays again. While a repo loads, the axis fills left to right with its progress.'],
    ['Theme', 'Instant. No transition on colour.'],
    ['Reduced motion', 'Everything instant: no reveal, no fades, no smooth scroll.'],
  ].map(([a, b]) => `<tr><td style="width:280px;height:auto;padding:14px 0;vertical-align:top;font-weight:500">${a}</td><td style="height:auto;padding:14px 0" class="muted">${b}</td></tr>`).join('');
  return `<div class="rr" style="${vars(false)};width:1440px;padding:72px 120px 96px"><h2 style="font-size:22px">Motion</h2><div style="display:grid;grid-template-columns:repeat(2,560px);gap:40px 80px;margin-top:32px">${frames}</div><table style="width:1200px;margin-top:64px"><tbody>${rows}</tbody></table></div>`;
}

// ---------- system board ----------
function system() {
  const sw = (dark) => {
    const T = dark ? 'Dark' : 'Light';
    const P = dark ? R.blueD : R.blue, S = dark ? R.slateD : R.slate;
    const items = dark
      ? [['Ground', P[1], 'blue 2'], ['Ink', P[11], 'blue 12'], ['Muted text', S[10], 'slate 11'], ['Water A', P[11], 'blue 12'], ['Water B', P[10], 'blue 11'], ['Rules', P[5], 'blue 6'], ['Band', P[2], 'blue 3']]
      : [['Ground', P[0], 'blue 1'], ['Ink', P[11], 'blue 12'], ['Muted text', S[10], 'slate 11'], ['Water A', P[11], 'blue 12'], ['Water B', P[10], 'blue 11'], ['Rules', P[6], 'blue 7'], ['Band', P[2], 'blue 3']];
    return `<div style="${vars(dark)};background:var(--ground);color:var(--ink);padding:24px;border:.5px solid var(--line);border-radius:6px"><div style="font-weight:500;margin-bottom:12px">${T}</div>${items.map(([n, h, k]) => `<div style="display:flex;align-items:center;gap:12px;height:36px"><span style="width:28px;height:28px;border-radius:4px;background:${h};box-shadow:inset 0 0 0 .5px var(--line)"></span><span style="width:110px">${n}</span><span class="num" style="font-size:13px;color:var(--muted)">${k}, ${h}</span></div>`).join('')}</div>`;
  };
  const big = logo(160, 'lgb').replace('<svg', '<svg style="display:block"');
  return `<div class="rr" style="${vars(false)};width:1440px;padding:72px 120px 96px">
<div style="display:grid;grid-template-columns:280px 520px 400px">
<div><h2>Logo</h2><div style="margin-top:24px">${big}</div><div style="display:flex;align-items:flex-end;gap:20px;margin-top:20px">${logo(48, 'lg48')}${logo(28, 'lg28')}${logo(16, 'lg16')}</div><p class="muted" style="font-size:13px;line-height:20px;margin-top:16px;max-width:220px">Two streams join and run on; a third leaves. Ink blue at the source to sky at the mouth, on cyanotype blue.</p>
<div style="display:grid;gap:12px;margin-top:24px;justify-items:start"><div style="background:#0d2847;padding:16px 20px;border-radius:6px;display:flex;align-items:center;gap:10px;color:#c2e6ff;font-weight:700">${logo(28, 'lgk')}Repo Rivers</div><div style="background:#fff;padding:16px 20px;border-radius:6px;border:.5px solid var(--line);display:flex;align-items:center;gap:10px;font-weight:700">${logo(28, 'lgw')}Repo Rivers</div></div></div>
<div><h2>Type</h2><div style="margin-top:24px;display:grid;gap:16px">
<div><div style="font-size:56px;line-height:60px;font-weight:500;letter-spacing:-.025em">Rivers <i style="font-weight:400">drawn</i></div><div class="muted num" style="font-size:13px">56 / 60, 500, italic 400. Headline</div></div>
<div><div style="font-size:22px;line-height:28px;font-weight:500">vitejs/vite</div><div class="muted num" style="font-size:13px">22 / 28, 500. Section and chart titles</div></div>
<div><div>Lines changed per quarter</div><div class="muted num" style="font-size:13px">16 / 24, 400 and 500. Body, controls, readout</div></div>
<div><div style="font-size:13px;font-style:italic;font-weight:500">packages/create-vite</div><div class="muted num" style="font-size:13px">13 / 20. River names (italic 500), meta, axis</div></div>
<p class="muted" style="font-size:13px;line-height:20px;margin:0">Alegreya Sans, one family. River names are set in italic, the way maps set water.</p></div></div>
<div style="display:grid;gap:16px">${sw(false)}${sw(true)}</div></div>
<h2 style="margin-top:72px">Components</h2>
<div style="display:flex;flex-wrap:wrap;gap:40px;align-items:center;margin-top:24px">
<div class="go" style="margin:0"><label class="field"><span>github.com/owner/name</span></label><button class="btn" type="button">Draw</button></div>
<div class="go" style="margin:0"><label class="field" style="width:400px;border-color:var(--ink);box-shadow:0 0 0 2px var(--blue-9)"><span style="color:var(--ink)">sveltejs/svelte</span></label></div>
<div class="seg" role="radiogroup"><button class="on">Modules</button><button>Contributors</button></div>
<div class="sel">Folder depth <b>Auto</b></div>
</div>
<p class="muted" style="font-size:13px;line-height:20px;margin-top:24px;max-width:900px">Rivers carry no hue: two blues of different lightness alternate lane by lane, names sit in or beside each river, “other” is hatched, a focused river keeps full strength while the rest fade, and moved files are dashed with an arrow. Nothing depends on telling colours apart. Lines 0.5 px; radius 6 outside, 3 inside the 3 px padded control. Focus ring 2 px blue 9.</p>
<div style="display:flex;gap:40px;margin-top:24px;align-items:flex-start">
<div style="width:580px;padding:24px;border:.5px solid var(--line);border-radius:6px"><div style="font-weight:500">Loading</div><p class="muted" style="margin:6px 0 16px">Reading sveltejs/svelte: 18 of 51 requests</p><svg width="530" height="10" aria-hidden="true"><line x1="0" x2="530" y1="5" y2="5" stroke="var(--line)" stroke-width=".5"/><line x1="0" x2="187" y1="5" y2="5" stroke="var(--ink)" stroke-width="2"/></svg></div>
<div style="width:580px;padding:24px;border:.5px solid var(--line);border-radius:6px"><div style="font-weight:500">GitHub’s hourly limit is used up</div><p class="muted" style="margin:6px 0 16px">It resets at 14:20. You can read the history from your browser instead, on your own allowance.</p><div style="display:flex;gap:12px"><button class="btn" style="height:40px;padding:0 16px">Read from my browser</button><button style="height:40px;padding:0 16px;border:.5px solid var(--line);border-radius:6px">Open a sample</button></div></div>
</div></div>`;
}

// ---------- assemble ----------
function svelteFocus() {
  const s = D['svelte-modules'];
  const t = [...s.transfers].sort((a, b) => b.files - a.files)[0];
  const r = s.rivers.find((q) => q.id === t.to);
  const b = t.bucket;
  const col = s.rivers.reduce((a, q) => a + (q.values[b] || 0), 0);
  const from = s.rivers.find((q) => q.id === t.from);
  const read = `<i>${esc(r.label)}</i>, ${s.buckets[b].label}: <b class="num">${n0.format(r.values[b])}</b> lines changed, ${Math.round(100 * r.values[b] / col)}% of the quarter. ${n0.format(t.files)} files moved in from <i>${esc(from.label)}</i>.`;
  return { focus: t.to, bucket: b, read };
}
const sf = svelteFocus();
const boards = {
  V2Home: { w: 1440, html: page({ key: 'vite-modules' }) },
  V2HomeDark: { w: 1440, html: page({ key: 'vite-modules', dark: true }) },
  V2Focus: { w: 1440, html: page({ key: 'svelte-modules', ...sf, era: 3 }) },
  V2People: { w: 1440, html: page({ key: 'express-contributors', dark: false }) },
  V2Phone: { w: 390, html: phone({ key: 'vite-modules' }) },
  V2PhoneDark: { w: 390, html: phone({ key: 'svelte-modules', dark: true, focus: sf.focus, bucket: sf.bucket, dock: sf.read }) },
  V2Motion: { w: 1440, html: motion() },
  V2System: { w: 1440, html: system() },
};
const ALLCSS = CSS + PCSS;
for (const [n, b] of Object.entries(boards)) {
  writeFileSync(`${OUT}preview/${n}.html`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="${FONTS}"><style>body{margin:0}${ALLCSS}</style></head><body>${b.html}</body></html>`);
}
writeFileSync(OUT + 'parts.json', JSON.stringify({ FONTS, CSS: ALLCSS, boards: Object.fromEntries(Object.entries(boards).map(([k, v]) => [k, v.html])), widths: Object.fromEntries(Object.entries(boards).map(([k, v]) => [k, v.w])) }));
console.log('ok', Object.keys(boards).join(' '));
