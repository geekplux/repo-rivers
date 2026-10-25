import { parseAggregate, type RepoAggregate } from '../core/schema.ts';

/** A built-in sample: bundled JSON that renders offline, without any API key. */
export interface SampleEntry {
  id: string;
  title: string;
  /** The sample's repository as owner/name, so the chart head can name it before the JSON has loaded. */
  repo: string;
  load(): Promise<RepoAggregate>;
}

/** Built-in samples, in the order they are offered; the first is the default. Each JSON file is a lazy chunk. */
export const samples: readonly SampleEntry[] = [
  { id: 'vite', title: 'Vite', repo: 'vitejs/vite', load: async () => parseAggregate((await import('./vite.json')).default) },
  { id: 'svelte', title: 'Svelte', repo: 'sveltejs/svelte', load: async () => parseAggregate((await import('./svelte.json')).default) },
  { id: 'express', title: 'Express', repo: 'expressjs/express', load: async () => parseAggregate((await import('./express.json')).default) },
];

/** Looks up a sample by id. */
export function findSample(id: string): SampleEntry | undefined {
  return samples.find((s) => s.id === id);
}
