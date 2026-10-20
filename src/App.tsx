import { useEffect, useState } from 'react';
import type { RepoAggregate } from './core/schema.ts';
import { findSample } from './samples/index.ts';
import { RiverChart } from './ui/RiverChart.tsx';
import { SampleSwitcher, useSampleParam } from './ui/SampleSwitcher.tsx';
import { useMedia, useWidth } from './ui/useSize.ts';
import { Wordmark } from './ui/Wordmark.tsx';

type Loaded = { id: string; aggregate: RepoAggregate } | { id: string; error: string };
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export function App() {
  const [sample, select] = useSampleParam();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [frame, width] = useWidth<HTMLDivElement>();
  const mobile = useMedia('(max-width: 640px)');

  useEffect(() => {
    let live = true;
    sample.load().then(
      (aggregate) => live && setLoaded({ id: sample.id, aggregate }),
      (e: unknown) => live && setLoaded({ id: sample.id, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => void (live = false);
  }, [sample]);

  const agg = loaded && 'aggregate' in loaded ? loaded.aggregate : null;
  const shown = findSample(loaded?.id ?? '') ?? sample;
  return (
    <div className="rr-page">
      <header className="rr-header">
        <Wordmark />
        <a href="https://github.com/geekplux/repo-rivers">GitHub</a>
      </header>
      <main>
        <h1 className="rr-hero">See any GitHub repo’s history as rivers.</h1>
        <p className="rr-lede">Modules flow across time, widen when busy, and split or merge when code moves.</p>
        <SampleSwitcher value={sample.id} onSelect={select} />
        <section className="rr-card" aria-labelledby="rr-title" aria-busy={loaded?.id !== sample.id}>
          <div className="rr-card-head">
            <h2 id="rr-title">{shown.title}</h2>
            {agg && (
              <p className="rr-meta">
                {agg.repo.owner}/{agg.repo.name} · lines changed per {agg.time.unit} · {agg.source.mode}, read {day.format(Date.parse(agg.generatedAt))}
              </p>
            )}
          </div>
          {loaded && 'error' in loaded && <p role="alert">Could not load this sample: {loaded.error}</p>}
          {mobile && <p className="rr-muted rr-caption">Scroll for later years →</p>}
          <div ref={frame} className="rr-frame" {...(mobile && { role: 'region', 'aria-label': 'River chart, scrolls sideways', tabIndex: 0 })}>
            {agg && width > 0 && <RiverChart aggregate={agg} width={width} mobile={mobile} />}
          </div>
        </section>
      </main>
      <footer className="rr-footer">
        Data from the GitHub API, sampled when a history is large. Built-in samples work offline, with no key.{' '}
        <a href="https://github.com/geekplux/repo-rivers">Source</a>
      </footer>
    </div>
  );
}
