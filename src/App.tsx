import { useEffect, useState } from 'react';
import type { RepoAggregate } from './core/schema.ts';
import { samples } from './samples/index.ts';
import { MinimalRivers } from './ui/MinimalRivers.tsx';

type Loaded = { id: string } & ({ status: 'ready'; aggregate: RepoAggregate } | { status: 'error'; message: string });

export function App() {
  const [sampleId, setSampleId] = useState(samples[0]!.id);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const sample = samples.find((s) => s.id === sampleId) ?? samples[0]!;
  const state = loaded?.id === sample.id ? loaded : { status: 'loading' as const };

  useEffect(() => {
    let live = true;
    const id = sample.id;
    sample.load().then(
      (aggregate) => live && setLoaded({ id, status: 'ready', aggregate }),
      (e: unknown) => live && setLoaded({ id, status: 'error', message: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      live = false;
    };
  }, [sample]);

  return (
    <main>
      <header>
        <h1>repo-rivers</h1>
        <p>A repository's history as rivers of modules and contributors.</p>
      </header>
      <nav aria-label="Built-in samples">
        {samples.map((s) => (
          <button key={s.id} type="button" aria-pressed={s.id === sampleId} onClick={() => setSampleId(s.id)}>
            {s.title}
          </button>
        ))}
      </nav>
      <section aria-live="polite" aria-busy={state.status === 'loading'}>
        <h2>{sample.title}</h2>
        {state.status === 'loading' && <p>Loading sample…</p>}
        {state.status === 'error' && <p role="alert">Could not load this sample: {state.message}</p>}
        {state.status === 'ready' && <MinimalRivers key={sample.id} aggregate={state.aggregate} />}
      </section>
    </main>
  );
}
