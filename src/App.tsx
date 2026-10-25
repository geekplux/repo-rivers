import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { layoutRivers } from './core/layout/layout.ts';
import type { RepoAggregate } from './core/schema.ts';
import { caveats, describeEras, describeView, eraLine, idleLine, readoutLine } from './core/summary.ts';
import { selectView } from './core/view.ts';
import { findSample } from './samples/index.ts';
import { Controls, type ControlValue } from './ui/Controls.tsx';
import { DataTable } from './ui/DataTable.tsx';
import { EraTrack } from './ui/EraTrack.tsx';
import { Progress } from './ui/Progress.tsx';
import { REPO_INPUT_ID, RepoInput } from './ui/RepoInput.tsx';
import { FallbackNotice, SourceNote } from './ui/SourceNote.tsx';
import { ErrorState } from './ui/states/ErrorState.tsx';
import { errorCopy, loadingLine, type ErrorAction } from './ui/states/copy.ts';
import { useEras } from './ui/useEras.ts';
import { useRepo } from './ui/useRepo.ts';
import { Readout } from './ui/Readout.tsx';
import { RiverChart } from './ui/RiverChart.tsx';
import { SampleSwitcher, useSampleParam } from './ui/SampleSwitcher.tsx';
import { EMPTY, useRiverFocus } from './ui/useRiverFocus.ts';
import { useMedia, useWidth } from './ui/useSize.ts';
import { Wordmark } from './ui/Wordmark.tsx';

type Loaded = { id: string; aggregate: RepoAggregate } | { id: string; error: string };
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Home/End scroll the mobile chart region to its ends (when the region itself has focus). */
function scrollEnds(e: KeyboardEvent<HTMLDivElement>) {
  if (e.target !== e.currentTarget || (e.key !== 'Home' && e.key !== 'End')) return;
  e.preventDefault();
  e.currentTarget.scrollLeft = e.key === 'Home' ? 0 : e.currentTarget.scrollWidth;
}

export function App() {
  const [sample, select] = useSampleParam();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [options, setOptions] = useState<ControlValue>({ dimension: 'modules', depth: 'auto', includeBots: false });
  const [switched, setSwitched] = useState(false);
  const [frame, width] = useWidth<HTMLDivElement>();
  const mobile = useMedia('(max-width: 640px)');
  const still = useMedia('(prefers-reduced-motion: reduce)');
  const summaryId = useId();
  const repo = useRepo();
  const rs = repo.state;
  const repoName = rs.status === 'idle' ? '' : `${rs.ref.owner}/${rs.ref.name}`;
  const busy = rs.status === 'loading' || rs.status === 'error';

  useEffect(() => {
    let live = true;
    sample.load().then(
      (aggregate) => live && setLoaded({ id: sample.id, aggregate }),
      (e: unknown) => live && setLoaded({ id: sample.id, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => void (live = false);
  }, [sample]);

  const current: Loaded | null = rs.status === 'done' ? { id: `repo:${repoName}`, aggregate: rs.aggregate } : loaded;
  const agg = current && 'aggregate' in current ? current.aggregate : null;
  const view = useMemo(() => agg && selectView(agg, options), [agg, options]);
  const [hues, setHues] = useState<Record<string, number>>({}); // sticky hues across control changes
  const layout = useMemo(() => {
    if (!agg || !view || width <= 0) return null;
    const truncatedBuckets = view.metric === 'lines changed' ? agg.source.truncatedBuckets : [];
    return layoutRivers(view, { width, mobile, asOf: agg.generatedAt, truncatedBuckets, previousColors: hues });
  }, [agg, view, width, mobile, hues]);
  // Heuristic eras at once; AI names swap in later when the Worker served this repo (and are cached with it).
  const eras = useEras(agg, rs.status === 'done' && rs.via === 'worker', (named, a) => {
    if (rs.status === 'done' && rs.aggregate === a) repo.remember(rs.ref, { ...a, eras: named });
  });
  const [era, setEra] = useState<number | null>(null);
  const eraOn = era === null ? undefined : eras[era];
  const [acted, setActed] = useState(false); // the live readout stays quiet until the first user action
  const change = (next: ControlValue) => {
    if (layout) setHues(Object.fromEntries(layout.rivers.map((r) => [r.id, r.color])));
    setOptions(next);
    setActed(true);
  };
  const focus = useRiverFocus(layout, view?.rivers ?? [], current?.id ?? '');
  const title = repoName || (findSample(loaded?.id ?? '') ?? sample).title;
  useEffect(() => void (document.title = `${title} · repo rivers`), [title]);
  const [status, setStatus] = useState(rs.status);
  if (status !== rs.status) {
    setStatus(rs.status);
    if (rs.status === 'done') setSwitched(true); // "Showing …" until the first movement
  }
  const shownStatus = useRef(rs.status);
  useEffect(() => {
    // After a state change the pressed button (Cancel, an error action) may be gone: keep focus in the card.
    // Only after a user action, so a deep-link page load (?repo=) leaves focus where the browser put it.
    if (shownStatus.current === rs.status) return;
    shownStatus.current = rs.status;
    if (acted && document.activeElement === document.body) document.getElementById('rr-title')?.focus();
  }, [rs.status, acted]);
  const onError = (a: ErrorAction) => {
    if (rs.status !== 'error') return;
    setActed(true);
    if (a === 'edit') return document.getElementById(REPO_INPUT_ID)?.focus();
    if (a === 'sample') return (repo.clear(), setActed(true), select(sample.id));
    repo.load(rs.ref, { browser: a === 'browser' });
  };

  const notes = agg && view && caveats(agg, view, layout?.clipped);
  const { active } = focus;
  const moved = active.bucket !== null && (rs.status === 'done' || loaded?.id === sample.id);
  if (moved && !acted) setActed(true);
  if (moved && switched) setSwitched(false); // "Showing …" only until the first movement in the new chart
  // The idle line starts with owner/name, so a pasted repo (title = owner/name) is not named twice.
  const idle = agg && view ? `${switched ? (repoName ? 'Showing ' : `Showing ${title}: `) : ''}${idleLine(agg, view)}` : '';
  const failed = rs.status === 'error' ? errorCopy(rs.failure, repoName) : null;
  const readout = rs.status === 'loading' ? loadingLine(repoName, rs.progress)
    : failed ? failed.title // the visible readout names the error; the live region (below) speaks it in full
    : view && eraOn ? eraLine(view, eraOn)
    : view && notes && active.bucket !== null ? readoutLine(view, notes, active.river, active.bucket) : idle;
  const unit = agg?.time.unit;
  useEffect(() => {
    // On mobile, an era tapped or focused in the track shows its note in the readout: bring it on screen.
    if (!mobile || era === null) return;
    const el = document.querySelector('[data-testid="readout"]');
    const r = el?.getBoundingClientRect();
    if (r && (r.top < 0 || r.bottom > innerHeight)) el!.scrollIntoView({ block: 'nearest', behavior: still ? 'instant' : 'smooth' });
  }, [era, mobile, still]);
  return (
    <div className="rr-page">
      <header className="rr-header">
        <Wordmark />
        <a href="https://github.com/geekplux/repo-rivers">GitHub</a>
      </header>
      <main>
        <div className="rr-intro">
          <h1 className="rr-hero">See any GitHub repo’s history as rivers.</h1>
          <p className="rr-lede">Modules flow across time, widen when busy, and split or merge when code moves.</p>
        </div>
        <div className="rr-inputs">
          <RepoInput initial={repoName} onSubmit={(ref) => (setActed(true), repo.load(ref))} />
          <SampleSwitcher value={rs.status === 'idle' ? sample.id : ''} onSelect={(id) => (repo.clear(), setSwitched(true), setActed(true), select(id))} />
        </div>
        <section className="rr-card" aria-labelledby="rr-title">
          <div className="rr-card-head">
            <h2 id="rr-title" tabIndex={-1}>{title}</h2>
            {agg && !busy && (
              <div className="rr-meta-row">
                <p className="rr-meta">
                  {repoName ? '' : `${agg.repo.owner}/${agg.repo.name} · `}{view?.metric} per {unit} · read {day.format(Date.parse(agg.generatedAt))}
                </p>
                <SourceNote source={agg.source} buckets={agg.time.starts.length} unit={unit ?? 'bucket'} />
              </div>
            )}
          </div>
          {rs.status === 'done' && rs.via === 'browser' && <FallbackNotice automatic={rs.fellBack} />}
          {loaded && 'error' in loaded && <p role="alert">Could not load this sample: {loaded.error}</p>}
          {mobile && !busy && <p className="rr-muted rr-caption">Scroll for later years <span aria-hidden="true">→</span></p>}
          <div ref={frame} className="rr-frame" aria-busy={rs.status === 'loading' || (rs.status === 'idle' && loaded?.id !== sample.id)}
            {...(mobile && !busy && { role: 'region', 'aria-label': 'River chart, scrolls sideways', tabIndex: 0, onKeyDown: scrollEnds })}>
            {rs.status === 'loading' && <Progress repo={repoName} progress={rs.progress} fellBack={rs.fellBack} onCancel={() => (repo.cancel(), document.getElementById(REPO_INPUT_ID)?.focus())} />}
            {failed && <ErrorState copy={failed} onAction={onError} />}
            {!busy && agg && view && layout && view.rivers.length > 0 && (
              <div className="rr-stack">
                <RiverChart aggregate={agg} view={view} layout={layout} mobile={mobile} active={eraOn && !active.pinned ? EMPTY : active} chart={focus.chart} svg={focus.svg} describedBy={summaryId}
                  eras={eras} activeEra={era} />
                {/* After the chart in tab order, drawn above it (CSS order). */}
                <EraTrack eras={eras} layout={layout} buckets={view.buckets} active={era} onActive={setEra} />
              </div>
            )}
            {!busy && view?.rivers.length === 0 && <p className="rr-empty">No {view.metric} to draw for this selection.</p>}
          </div>
          {!busy && layout && view && (
            <p className="rr-key rr-muted">
              {layout.estimated.length > 0 && (
                <span><svg width="22" height="6" aria-hidden="true"><line x1="2" x2="20" y1="3" y2="3" className="rr-estimated" /></svg>estimated from sampled commits</span>
              )}
              {layout.partial && (
                <span><svg width="8" height="14" aria-hidden="true"><line x1="4" x2="4" y1="0" y2="14" className="rr-survey" /></svg>last {unit} is partial, {layout.partial.text}</span>
              )}
              {view.rivers.some((r) => r.bot) && (
                <span><svg width="18" height="12" aria-hidden="true"><rect x="1.5" y="1.5" width="15" height="9" className="rr-bot rr-key-bot" /></svg>dotted outline: bot</span>
              )}
            </p>
          )}
          <Readout text={readout} spoken={failed ? `${failed.title}. ${failed.body}` : eraOn ? '' : readout} pinned={active.pinned} live={acted} />
          <Controls value={options} onChange={change} disabled={busy} />
          {!busy && agg && view && notes && (
            <div className="rr-more">
              {/* Closed by default; the chart's aria-describedby still reads the summary (hidden text counts for descriptions). */}
              <details className="rr-describe">
                <summary>Read as text</summary>
                <p id={summaryId} className="rr-summary">{describeView(agg, view, notes)} {describeEras(view, eras)}</p>
              </details>
              <DataTable view={view} eras={eras} caption={`${view.metric} per ${unit} in ${agg.repo.owner}/${agg.repo.name}; rows are rivers, columns are ${unit}s`} />
            </div>
          )}
        </section>
      </main>
      <footer className="rr-footer">
        Data from the GitHub API, sampled when a history is large. Built-in samples work offline, with no key.
        {/* Matches DAILY_AI_CAP in wrangler.jsonc; the cap keeps a public demo from running up a Workers AI bill. */}
        {' '}AI era names are capped site-wide each day; past the cap, eras get rule-based names.{' '}
        <a href="https://github.com/geekplux/repo-rivers">Source</a>
      </footer>
    </div>
  );
}
