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

/**
 * "or open Vite, Svelte or Express": the sample names are quiet text toggle buttons with `aria-pressed`; the
 * pressed one has a heavier underline (not colour alone).
 */
export function SampleSwitcher({ value, onSelect }: { value: string; onSelect: (id: string) => void }) {
  const last = samples.length - 1;
  return (
    <nav aria-label="Built-in samples" className="rr-or">
      or open{' '}
      {samples.map((s, i) => (
        <span key={s.id}>
          <button type="button" aria-pressed={s.id === value} onClick={() => onSelect(s.id)}>{s.title}</button>
          {i < last - 1 ? ', ' : i === last - 1 ? ' or ' : ''}
        </span>
      ))}
    </nav>
  );
}
