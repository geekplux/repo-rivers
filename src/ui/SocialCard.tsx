import { useEffect, useId, useMemo, useState } from 'react';
import { layoutRivers } from '../core/layout/layout.ts';
import type { RepoAggregate } from '../core/schema.ts';
import { caveats, describeEras, describeView } from '../core/summary.ts';
import { selectView } from '../core/view.ts';
import { findSample, samples } from '../samples/index.ts';
import { EraTrack } from './EraTrack.tsx';
import { RiverChart } from './RiverChart.tsx';
import { EMPTY, useRiverFocus } from './useRiverFocus.ts';
import { Wordmark } from './Wordmark.tsx';

/** Chart width inside the 1280×640 card (48 px side padding) and plot height that leaves room for the pitch. */
const WIDTH = 1184;
const HEIGHT = 350;
const OPTIONS = { dimension: 'modules', depth: 'auto', includeBots: false } as const;

/**
 * `?embed=social`: a fixed 1280×640 card (wordmark, pitch, chart with its eras) for the social preview image
 * and the gallery. `?sample=` picks the sample (Vite by default). Same chart and focus model as the app.
 */
export function SocialCard() {
  const sample = findSample(new URLSearchParams(location.search).get('sample') ?? '') ?? samples[0]!;
  const [agg, setAgg] = useState<RepoAggregate | null>(null);
  useEffect(() => void sample.load().then(setAgg), [sample]);
  useEffect(() => void (document.title = `${sample.title} · repo rivers`), [sample]);
  const view = useMemo(() => agg && selectView(agg, OPTIONS), [agg]);
  const layout = useMemo(() => agg && view && layoutRivers(view, { width: WIDTH, height: HEIGHT, asOf: agg.generatedAt, truncatedBuckets: agg.source.truncatedBuckets }), [agg, view]);
  const focus = useRiverFocus(layout, view?.rivers ?? [], sample.id);
  const [era, setEra] = useState<number | null>(null);
  const summaryId = useId();
  const eras = agg?.eras ?? [];
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
          {agg && view ? <><b>{agg.repo.owner}/{agg.repo.name}</b> · {view.metric} per {agg.time.unit} by folder, {years} · </> : null}
          paste a URL or open a sample; no account, no key
        </p>
        {agg && view && layout && (
          <div className="rr-stack">
            <RiverChart aggregate={agg} view={view} layout={layout} mobile={false} active={era !== null && !focus.active.pinned ? EMPTY : focus.active}
              chart={focus.chart} svg={focus.svg} describedBy={summaryId} eras={eras} activeEra={era} />
            <EraTrack eras={eras} layout={layout} buckets={view.buckets} active={era} onActive={setEra} />
          </div>
        )}
        {agg && view && layout && (
          <p id={summaryId} className="rr-sr">{describeView(agg, view, caveats(agg, view, layout.clipped))} {describeEras(view, eras)}</p>
        )}
      </main>
    </div>
  );
}
