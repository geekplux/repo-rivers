// Throwaway Phase-1 renderer: centred stacked bands, one path per module. Replaced by RiverChart (P5).
import { useEffect } from 'react';
import type { RepoAggregate } from '../core/schema.ts';

// Okabe-Ito subset; bands are also separated by paper-coloured strokes and labelled directly.
const COLORS = ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00'];
const W = 960;
const H = 420;
const PAD = 24;

const moduleLabel = (prefix: string): string => (prefix === '' ? '(root files)' : `${prefix}/`);

function edge(xs: number[], ys: number[]): string {
  return ys
    .map((y, i) => {
      if (i === 0) return `${xs[0]},${y}`;
      const x0 = xs[i - 1]!;
      const mid = (x0 + xs[i]!) / 2;
      return `C${mid},${ys[i - 1]} ${mid},${y} ${xs[i]},${y}`;
    })
    .join(' ');
}

export function MinimalRivers({ aggregate }: { aggregate: RepoAggregate }) {
  const { prefixes, weights } = aggregate.paths;
  const B = aggregate.time.starts.length;
  const xs = Array.from({ length: B }, (_, i) => PAD + (i * (W - 2 * PAD)) / Math.max(1, B - 1));
  const totals = xs.map((_, t) => weights.reduce((sum, row) => sum + (row[t] ?? 0), 0));
  const k = (H - 2 * PAD) / Math.max(1, ...totals);
  const cursor = totals.map((total) => H / 2 - (total * k) / 2);

  const bands = prefixes.map((prefix, m) => {
    const top = cursor.slice();
    const bottom = top.map((y, t) => y + (weights[m]![t] ?? 0) * k);
    bottom.forEach((y, t) => (cursor[t] = y));
    const peak = weights[m]!.reduce((best, v, t, row) => (v > row[best]! ? t : best), 0);
    const d = `M${edge(xs, top)} L${edge(xs.toReversed(), bottom.toReversed())} Z`;
    return { prefix, d, peak, mid: (top[peak]! + bottom[peak]!) / 2, thick: bottom[peak]! - top[peak]! };
  });

  const first = aggregate.time.starts[0]!.slice(0, 7);
  const last = aggregate.time.starts[B - 1]!.slice(0, 7);
  const label =
    `River chart of lines changed per ${aggregate.time.unit} in ${aggregate.repo.owner}/${aggregate.repo.name}, ` +
    `${first} to ${last}, for ${prefixes.length} modules: ${prefixes.map(moduleLabel).join(', ')}.`;

  useEffect(() => {
    performance.mark('rivers-rendered');
  }, []);

  return (
    <svg data-testid="river-chart" role="img" aria-label={label} viewBox={`0 0 ${W} ${H}`} width="100%">
      {bands.map((b, m) => (
        <path
          key={b.prefix}
          data-river={b.prefix || '(root)'}
          d={b.d}
          fill={COLORS[m % COLORS.length]}
          stroke="#faf7f0"
          strokeWidth={1.5}
        />
      ))}
      {bands
        .filter((b) => b.thick >= 16)
        .map((b) => (
          <text
            key={b.prefix}
            x={Math.min(Math.max(xs[b.peak]!, PAD + 60), W - PAD - 60)}
            y={b.mid}
            textAnchor="middle"
            dominantBaseline="middle"
            className="river-label"
          >
            {moduleLabel(b.prefix)}
          </text>
        ))}
    </svg>
  );
}
