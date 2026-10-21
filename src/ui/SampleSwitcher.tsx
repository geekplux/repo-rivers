import { useEffect, useState } from 'react';
import { findSample, samples, type SampleEntry } from '../samples/index.ts';

const fromUrl = (): SampleEntry => findSample(new URLSearchParams(location.search).get('sample') ?? '') ?? samples[0]!;

/** The selected sample, kept in `?sample=<id>` (pushState, no reload; back/forward work); selecting one drops `?repo=`. */
export function useSampleParam(): [SampleEntry, (id: string) => void] {
  const [sample, setSample] = useState(fromUrl);
  useEffect(() => {
    const sync = () => setSample(fromUrl());
    addEventListener('popstate', sync);
    return () => removeEventListener('popstate', sync);
  }, []);
  const select = (id: string) => {
    const url = new URL(location.href);
    url.searchParams.set('sample', id);
    url.searchParams.delete('repo'); // a sample replaces a pasted repo
    history.pushState(null, '', url);
    setSample(fromUrl());
  };
  return [sample, select];
}

/** Samples (Vite · Svelte · Express): quiet text toggle buttons with `aria-pressed`; the pressed one is bold and underlined. */
export function SampleSwitcher({ value, onSelect }: { value: string; onSelect: (id: string) => void }) {
  return (
    <nav aria-label="Built-in samples" className="rr-chips">
      <span className="rr-muted">or open a sample</span>
      {samples.map((s) => (
        <button key={s.id} type="button" aria-pressed={s.id === value} onClick={() => onSelect(s.id)}>
          {s.title}
        </button>
      ))}
    </nav>
  );
}
