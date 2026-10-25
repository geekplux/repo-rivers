import { useEffect, useId, useMemo, useState } from 'react';
import { ERA_BAND, riverNameWidth } from '../core/layout/guides.ts';
import { layoutRivers } from '../core/layout/layout.ts';
import type { RepoAggregate } from '../core/schema.ts';
import { caveats, describeEras, describeView } from '../core/summary.ts';
import { selectView } from '../core/view.ts';
import { findSample, samples } from '../samples/index.ts';
import { RiverChart } from './RiverChart.tsx';
import { EMPTY } from './useRiverFocus.ts';
import { Wordmark } from './Wordmark.tsx';

/** Chart width inside the 1280×640 card (48 px side padding) and plot height that leaves room for the pitch. */
const WIDTH = 1184;
const HEIGHT = 320;
const OPTIONS = { dimension: 'modules', depth: 'auto', includeBots: false } as const;

/**
 * `?embed=social`: a fixed 1280×640 card (wordmark, pitch, chart with its eras) for the social preview image
 * and the gallery. `?sample=` picks the sample (Vite by default). A screenshot-only embed, so the chart and its
 * eras are static: no tab stops, the chart is an image named by a summary and described by the prose below.
 */
export function SocialCard() {
  const sample = findSample(new URLSearchParams(location.search).get('sample') ?? '') ?? samples[0]!;
  const [agg, setAgg] = useState<RepoAggregate | null>(null);
  useEffect(() => void sample.load().then(setAgg), [sample]);
  useEffect(() => void (document.title = `${sample.title}, Repo Rivers`), [sample]);
  const view = useMemo(() => agg && selectView(agg, OPTIONS), [agg]);
  const eras = agg?.eras ?? [];
  const layout = useMemo(() => agg && view && layoutRivers(view, {
    width: WIDTH, height: HEIGHT, gap: 2, top: agg.eras?.length ? ERA_BAND + 8 : 8, measure: riverNameWidth, asOf: agg.generatedAt, truncatedBuckets: agg.source.truncatedBuckets,
  }), [agg, view]);
  const summaryId = useId();
  const years = view ? `${view.buckets[0]?.label.slice(-4)}–${view.buckets.at(-1)?.label.slice(-4)}` : '';
  return (
    <div className="rr-social">
      <header className="rr-header">
        <Wordmark />
        <span className="rr-muted">github.com/geekplux/repo-rivers</span>
      </header>
      <main>
        <h1 className="rr-social-pitch">See any GitHub repo’s history as rivers.</h1>
        <p className="rr-social-sub">
          {agg && view ? <><b>{agg.repo.owner}/{agg.repo.name}</b>: {view.metric} per {agg.time.unit} by folder, {years}. </> : null}
          Paste a URL or open a sample; no account, no key.
        </p>
        {agg && view && layout && (
          <RiverChart aggregate={agg} view={view} layout={layout} mobile={false} active={EMPTY} describedBy={summaryId} eras={eras} interactive={false} />
        )}
        {agg && view && layout && (
          <p id={summaryId} className="rr-sr">{describeView(agg, view, caveats(agg, view, layout.clipped))} {describeEras(view, eras)}</p>
        )}
      </main>
    </div>
  );
}
