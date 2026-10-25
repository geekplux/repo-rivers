import { readFileSync, writeFileSync } from 'node:fs';
const R = '/home/user/repo-rivers/src/';
const { parseAggregate } = await import(R + 'core/schema.ts');
const { selectView } = await import(R + 'core/view.ts');
const { layoutRivers } = await import(R + 'core/layout/layout.ts');
const out: any = {};
for (const id of ['vite', 'svelte', 'express']) {
  const agg = parseAggregate(JSON.parse(readFileSync(R + `samples/${id}.json`, 'utf8')));
  for (const dimension of ['modules', 'contributors'] as const) {
    const view = selectView(agg, { dimension, depth: 'auto', includeBots: false });
    const mk = (width: number, height: number) => {
      const L = layoutRivers(view, { width, height, gap: 2, measure: () => 0, asOf: agg.generatedAt, truncatedBuckets: view.metric === 'lines changed' ? agg.source.truncatedBuckets : [] });
      return { width: L.width, height: L.height, plot: L.plot, bucketWidth: L.bucketWidth, columns: L.columns,
        rivers: L.rivers.map(r => ({ id: r.id, label: r.label, kind: r.kind, bot: r.bot, path: r.path, top: r.edges.top, bottom: r.edges.bottom, thickness: r.thickness })),
        transfers: L.transfers.map(t => ({ from: t.from, to: t.to, bucket: t.bucket, files: t.files, path: t.path, width: t.width, start: t.start, end: t.end, always: t.alwaysVisible })),
        clipped: L.clipped, partial: L.partial, estimated: L.estimated };
    };
    out[`${id}-${dimension}`] = {
      repo: agg.repo, generatedAt: agg.generatedAt, source: agg.source, unit: agg.time.unit, eras: agg.eras ?? [],
      buckets: view.buckets, metric: view.metric,
      rivers: view.rivers.map(r => ({ id: r.id, label: r.label, kind: r.kind, bot: r.bot, values: r.values, total: r.total, peak: r.peak })),
      transfers: view.transfers,
      desk: mk(1068, 480), phone: mk(1560, 300),
    };
  }
}
writeFileSync('data.json', JSON.stringify(out));
for (const [k, v] of Object.entries(out) as any) console.log(k, v.buckets.length, v.unit, v.rivers.map((r: any) => r.label + ':' + r.total).join(' | '), 'eras', v.eras.map((e: any) => `${e.start}-${e.end} ${e.title}`).join(' / '), 'transfers', v.transfers.length);
