import { parseAggregate, type RepoAggregate } from '../core/schema.ts';

/** A built-in sample: bundled JSON that renders offline, without any API key. */
export interface SampleEntry {
  id: string;
  title: string;
  load(): Promise<RepoAggregate>;
}

/** Built-in samples, in the order they are offered. Each JSON file is a lazy chunk. */
export const samples: readonly SampleEntry[] = [
  {
    id: 'demo',
    title: 'Demo (synthetic)',
    load: async () => parseAggregate((await import('./demo.json')).default),
  },
];

/** Looks up a sample by id. */
export function findSample(id: string): SampleEntry | undefined {
  return samples.find((s) => s.id === id);
}
