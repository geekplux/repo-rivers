import { describe, expect, it } from 'vitest';
import { parseAggregate } from '../core/schema.ts';
import { samples } from './index.ts';

const MAX_BYTES = 50 * 1024;
const files = import.meta.glob<string>('./*.json', { eager: true, query: '?raw', import: 'default' });

describe.each(samples.map((s) => s.id))('built-in sample %s', (id) => {
  const raw = files[`./${id}.json`]!;
  const agg = parseAggregate(JSON.parse(raw));

  it('is valid and at most 50 KB', () => {
    expect(new TextEncoder().encode(raw).length).toBeLessThanOrEqual(MAX_BYTES);
    expect(agg.repo.name).toBe(id);
  });

  it('states honestly how it was fetched', () => {
    const { source, time } = agg;
    expect(['full', 'sampled']).toContain(source.mode);
    expect(source.requests).toBeGreaterThan(0);
    expect(source.requests).toBeLessThanOrEqual(source.authenticated ? 600 : 55);
    expect(source.commitsSeen).toBeLessThanOrEqual(source.commitsTotal);
    expect(source.truncatedBuckets.every((b) => b >= 0 && b < time.starts.length)).toBe(true);
    expect(source.notes.length).toBeGreaterThan(0);
    expect(source.truncatedBuckets.length === 0 || /300 files/.test(source.notes.join(' '))).toBe(true);
    expect(raw).not.toMatch(/@[\w-]+\.\w+/); // no email addresses
  });
});

describe('built-in sample svelte', () => {
  it('shows the 2023 move of the compiler into packages/svelte as a transfer', () => {
    const agg = parseAggregate(JSON.parse(files['./svelte.json']!));
    const name = (i: number): string | undefined => agg.paths.prefixes[i];
    const moves = agg.paths.transfers.filter((t) => name(t.to)?.startsWith('packages/svelte') && name(t.from)?.startsWith('src/'));
    expect(moves.reduce((n, t) => n + t.files, 0)).toBeGreaterThanOrEqual(100);
    expect(moves.every((t) => agg.time.starts[t.bucket]?.startsWith('2023'))).toBe(true);
  });
});
