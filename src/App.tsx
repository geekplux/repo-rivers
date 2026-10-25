import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { layoutRivers } from './core/layout/layout.ts';
import type { RepoAggregate } from './core/schema.ts';
import { ERA_BAND, MOUTH_ROOM, PHONE, phoneSize } from './core/layout/guides.ts';
import { flipOf } from './core/layout/transpose.ts';
import { caveats, describeEras, describeView, eraLine, focusReadout, idleReadout, legendItems, plain, readoutCaveats, type Rich } from './core/summary.ts';
import { selectView } from './core/view.ts';
import { findSample } from './samples/index.ts';
import { Controls, type ControlValue } from './ui/Controls.tsx';
import { EraList } from './ui/EraList.tsx';
import { Progress } from './ui/Progress.tsx';
import { REPO_INPUT_ID, RepoInput } from './ui/RepoInput.tsx';
import { metaLine } from './ui/headMeta.ts';
import { FallbackNotice, SourceNote } from './ui/SourceNote.tsx';
import { ErrorState } from './ui/states/ErrorState.tsx';
import { errorCopy, loadingLine, type ErrorAction } from './ui/states/copy.ts';
import { useEras } from './ui/useEras.ts';
import { useRepo } from './ui/useRepo.ts';
import { arriveKey, viewKey } from './ui/motion.ts';
import { Legend, Readout } from './ui/Readout.tsx';
import { PhoneChart } from './ui/PhoneChart.tsx';
import { cls, RiverChart } from './ui/RiverChart.tsx';
import { RiverIndex } from './ui/RiverIndex.tsx';
import { SampleSwitcher, useSampleParam } from './ui/SampleSwitcher.tsx';
import { EMPTY, useRiverFocus } from './ui/useRiverFocus.ts';
import { useMedia, useNameMeasure, useWidth } from './ui/useSize.ts';
import { ThemeButton } from './ui/ThemeButton.tsx';
import { Wordmark } from './ui/Wordmark.tsx';

type Loaded = { id: string; aggregate: RepoAggregate } | { id: string; error: string };
const SOURCE = 'https://github.com/geekplux/repo-rivers';
const MADE = [
  ['geekplux.com', 'https://geekplux.com'],
  ['Vert', 'https://vert.geekplux.com'],
  ['Explorable', 'https://explorable.geekplux.com'],
  ['Pagelapse', 'https://pagelapse.geekplux.com'],
  ['Reasontrail', 'https://reasontrail.geekplux.com'],
  ['markvis', 'https://github.com/geekplux/markvis'],
] as const;

export function App() {
  const [sample, select] = useSampleParam();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [options, setOptions] = useState<ControlValue>({ dimension: 'modules', depth: 'auto', includeBots: false });
  const [switched, setSwitched] = useState(false);
  // Bumped each time data arrives (a sample loaded, a repo drawn, a sample reopened after an error): with the
  // source it keys the arrive reveal (DESIGN §6), which a view switch, the theme, a resize or focus never replay.
  const [arrivals, setArrivals] = useState(0);
  const [frame, width] = useWidth<HTMLDivElement>();
  const mobile = useMedia('(max-width: 640px)');
  const measure = useNameMeasure();
  const summaryId = useId();
  const repo = useRepo();
  const rs = repo.state;
  const repoName = rs.status === 'idle' ? '' : `${rs.ref.owner}/${rs.ref.name}`;
  const busy = rs.status === 'loading' || rs.status === 'error';

  useEffect(() => {
    let live = true;
    sample.load().then(
      (aggregate) => live && (setLoaded({ id: sample.id, aggregate }), setArrivals((n) => n + 1)),
      (e: unknown) => live && setLoaded({ id: sample.id, error: e instanceof Error ? e.message : String(e) }),
    );
    return () => void (live = false);
  }, [sample]);

  const current: Loaded | null = rs.status === 'done' ? { id: `repo:${repoName}`, aggregate: rs.aggregate } : loaded;
  const agg = current && 'aggregate' in current ? current.aggregate : null;
  const view = useMemo(() => agg && selectView(agg, options), [agg, options]);
  // Heuristic eras at once; AI names swap in later when the Worker served this repo (and are cached with it).
  const eras = useEras(agg, rs.status === 'done' && rs.via === 'worker', (named, a) => {
    if (rs.status === 'done' && rs.aggregate === a) repo.remember(rs.ref, { ...a, eras: named });
  });
  const banded = eras.length > 0;
  const layout = useMemo(() => {
    if (!agg || !view || width <= 0) return null;
    const truncatedBuckets = view.metric === 'lines changed' ? agg.source.truncatedBuckets : [];
    const common = { gap: 2, measure, asOf: agg.generatedAt, truncatedBuckets, inset: 0 };
    if (mobile) {
      // Phone (DESIGN §5): laid out with time along x, about 56 px per bucket, and drawn transposed (time runs down).
      const size = phoneSize(width, view.buckets.length);
      return layoutRivers(view, { ...common, width: size.length, height: size.cross, top: 0, labelRoom: 0, phone: true });
    }
    // Desktop (DESIGN §4): the plot flush with the column's left edge, a fixed room right of it for river names.
    return layoutRivers(view, { ...common, width, top: banded ? ERA_BAND + 8 : 8, labelRoom: MOUTH_ROOM });
  }, [agg, view, width, mobile, banded, measure]);
  const flip = useMemo(() => (mobile && layout ? flipOf(layout, PHONE.left, PHONE.top) : null), [mobile, layout]);
  const [era, setEra] = useState<number | null>(null);
  const [eraHeld, setEraHeld] = useState(false); // an era button with keyboard focus (not a hover)
  const onEra = useCallback((e: number | null, held: boolean) => (setEra(e), setEraHeld(held)), []);
  const eraOn = era === null ? undefined : eras[era];
  const [acted, setActed] = useState(false); // the live readout stays quiet until the first user action
  const change = (next: ControlValue) => {
    setOptions(next);
    setActed(true);
  };
  const focus = useRiverFocus(layout, view?.rivers ?? [], current?.id ?? '', flip);
  const shownSample = findSample(loaded?.id ?? '') ?? sample;
  const title = repoName || shownSample.title;
  // The chart head names the repository as owner/name, for samples too (from the registry, before the JSON loads).
  const heading = repoName || shownSample.repo;
  useEffect(() => void (document.title = `${heading}, Repo Rivers`), [heading]);
  const [status, setStatus] = useState(rs.status);
  if (status !== rs.status) {
    setStatus(rs.status);
    if (rs.status === 'done') {
      setSwitched(true); // "Showing …" until the first movement
      setArrivals((n) => n + 1);
    }
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
    if (a === 'sample') return (repo.clear(), setActed(true), setArrivals((n) => n + 1), select(sample.id));
    repo.load(rs.ref, { browser: a === 'browser' });
  };

  const notes = agg && view && caveats(agg, view, layout?.clipped);
  const { active } = focus;
  const shown = eraOn && !active.pinned ? EMPTY : active; // an era in focus wins over a hovered river
  const moved = active.bucket !== null && (rs.status === 'done' || loaded?.id === sample.id);
  if (moved && !acted) setActed(true);
  if (moved && switched) setSwitched(false); // "Showing …" only until the first movement in the new chart
  const idle: Rich = view ? idleReadout(view) : [];
  const failed = rs.status === 'error' ? errorCopy(rs.failure, repoName) : null;
  const readout: Rich | string = rs.status === 'loading' ? loadingLine(repoName, rs.progress)
    : failed ? failed.title // the visible readout names the error; the live region (below) speaks it in full
    : view && eraOn ? eraLine(view, eraOn)
    : view && notes && active.bucket !== null ? focusReadout(view, notes, active.river, active.bucket) : idle;
  const focused = !failed && rs.status !== 'loading' && !eraOn && view && notes && active.bucket !== null;
  // The caveats the chart draws as marks (estimate, partial bucket, clipped column) are spoken, not shown.
  const text = typeof readout === 'string' ? readout : plain(readout) + (focused ? readoutCaveats(view, notes, active.bucket!) : '');
  // After a sample switch or a drawn repo, the live region names it until the first movement in the new chart.
  const spoken = failed ? `${failed.title}. ${failed.body}` : eraOn ? '' : switched && readout === idle ? `Showing ${repoName ? heading : `${title}: ${heading}`}. ${text}` : text;
  const unit = agg?.time.unit;
  const drawn = !busy && agg && view && layout && view.rivers.length > 0;
  const waiting = rs.status === 'idle' && !drawn && !(loaded && 'error' in loaded);
  const motion = { arrive: arriveKey(current?.id ?? '', arrivals), viewKey: viewKey(options) };
  // Phone: while a river (or an era) is pinned or has keyboard focus, the readout docks to the bottom of the viewport
  // (DESIGN §5); a plain hover never docks it.
  const docked = Boolean(mobile && drawn && ((eraOn && eraHeld) || focus.held));
  return (
    <>
      <header className="rr-header">
        <div className="rr-wrap">
          <a className="rr-brand" href="/"><Wordmark /></a>
          <nav className="rr-nav" aria-label="Site">
            <a href={SOURCE}>Source</a>
            <ThemeButton />
          </nav>
        </div>
      </header>
      {/* While the first sample loads, main is at least a screen tall, so the footer never shows and then moves. */}
      <main className={cls('rr-wrap', waiting && 'rr-waiting')}>
        <div className="rr-intro">
          <h1 className="rr-hero">A repository’s history, <i>drawn as rivers</i></h1>
          <div className="rr-go">
            <RepoInput initial={repoName} onSubmit={(ref) => (setActed(true), repo.load(ref))} />
            <SampleSwitcher value={rs.status === 'idle' ? sample.id : ''} onSelect={(id) => (repo.clear(), setSwitched(true), setActed(true), select(id))} />
          </div>
        </div>
        <section className="rr-card" aria-labelledby="rr-title">
          <div className="rr-card-head">
            <div>
              <h2 id="rr-title" tabIndex={-1}>{heading}</h2>
              {/* Always there (empty until the data arrives), so the head keeps its height: no layout shift. */}
              <div className="rr-meta">
                {agg && view && !busy && <>{metaLine(agg, view)} <SourceNote source={agg.source} buckets={agg.time.starts.length} unit={unit ?? 'bucket'} /></>}
              </div>
            </div>
            <Controls value={options} onChange={change} disabled={busy} />
          </div>
          {rs.status === 'done' && rs.via === 'browser' && <FallbackNotice automatic={rs.fellBack} />}
          {loaded && 'error' in loaded && <p role="alert">Could not load this sample: {loaded.error}</p>}
          {/* While the first sample loads, the frame keeps the chart's height (rr-waiting), so nothing below it jumps. */}
          <div ref={frame} className={cls('rr-frame', waiting && 'rr-waiting')} style={waiting ? { '--rr-head': `${sample.head ?? 0}px` } as CSSProperties : undefined} aria-busy={rs.status === 'loading' || (rs.status === 'idle' && loaded?.id !== sample.id)}>
            {rs.status === 'loading' && <Progress repo={repoName} progress={rs.progress} fellBack={rs.fellBack} onCancel={() => (repo.cancel(), document.getElementById(REPO_INPUT_ID)?.focus())} />}
            {failed && <ErrorState copy={failed} onAction={onError} />}
            {drawn && (flip ? (
              <PhoneChart aggregate={agg} view={view} layout={layout} width={width} flip={flip} active={shown} chart={focus.chart} svg={focus.svg} describedBy={summaryId}
                eras={eras} activeEra={era} onEra={onEra} {...motion} />
            ) : (
              <RiverChart aggregate={agg} view={view} layout={layout} active={shown} chart={focus.chart} svg={focus.svg} describedBy={summaryId}
                eras={eras} activeEra={era} onEra={onEra} {...motion} />
            ))}
            {!busy && view?.rivers.length === 0 && <p className="rr-empty">No {view.metric} to draw for this selection.</p>}
          </div>
          <div className="rr-under">
            <Readout text={readout} spoken={spoken} pinned={active.pinned} live={acted} docked={docked} />
            {!busy && layout && view && unit && (
              <Legend items={legendItems({
                unit, estimated: layout.estimated.length > 0, partial: layout.partial !== null, moved: layout.transfers.length > 0,
                bots: view.rivers.some((r) => r.bot), ai: eras.some((e) => e.source === 'ai'),
              })} turned={mobile} />
            )}
          </div>
          {/* Never shown: the chart's aria-describedby reads it (hidden text counts for descriptions). */}
          {!busy && agg && view && notes && <p id={summaryId} className="rr-summary" hidden>{describeView(agg, view, notes)} {describeEras(view, eras)}</p>}
        </section>
        {drawn && unit && (
          <>
            <RiverIndex view={view} unit={unit} repo={heading} active={shown.river} pinned={shown.pinned} onPick={focus.table.pick} onClear={focus.table.clear} />
            <EraList eras={eras} buckets={view.buckets} />
          </>
        )}
      </main>
      <footer className="rr-footer">
        <div className="rr-wrap">
          <div>
            <p>Data from the GitHub API, read without an account; large histories are sampled. The built-in samples work offline.</p>
            {/* Matches DAILY_AI_CAP in wrangler.jsonc; the cap keeps a public demo from running up a Workers AI bill. */}
            <p>AI era names are capped site-wide each day; past the cap, eras get rule-based names.</p>
            <p>Open source under MIT. <a href={SOURCE}>Source on GitHub</a></p>
          </div>
          <div>
            <p className="rr-made-by">Made by GeekPlux</p>
            <ul className="rr-made">
              {MADE.map(([name, href]) => <li key={href}><a href={href}>{name}</a></li>)}
            </ul>
          </div>
        </div>
      </footer>
    </>
  );
}
