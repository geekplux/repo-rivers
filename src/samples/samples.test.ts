import { describe, expect, it } from 'vitest';
import { heuristicEras } from '../core/eras/heuristic.ts';
import { summarizeForEras } from '../core/eras/summary.ts';
import { ERA_BAND, MOUTH_ROOM } from '../core/layout/guides.ts';
import { layoutRivers } from '../core/layout/layout.ts';
import { parseAggregate } from '../core/schema.ts';
import { selectView } from '../core/view.ts';
import { samples } from './index.ts';

const MAX_BYTES = 50 * 1024;
const files = import.meta.glob<string>('./*.json', { eager: true, query: '?raw', import: 'default' });

describe.each(samples.map((s) => s.id))('built-in sample %s', (id) => {
  const raw = files[`./${id}.json`]!;
  const agg = parseAggregate(JSON.parse(raw));

  it('is valid and at most 50 KB', () => {
    expect(new TextEncoder().encode(raw).length).toBeLessThanOrEqual(MAX_BYTES);
    expect(agg.repo.name).toBe(id);
    expect(`${agg.repo.owner}/${agg.repo.name}`).toBe(samples.find((s) => s.id === id)!.repo);
  });

  it('declares the room above its plot in the default view (`head`), which the page holds while it loads', () => {
    const view = selectView(agg, { dimension: 'modules', depth: 'auto', includeBots: false });
    const top = ERA_BAND + 8;
    const L = layoutRivers(view, { width: 1200, top, labelRoom: MOUTH_ROOM, gap: 2, inset: 0, asOf: agg.generatedAt, truncatedBuckets: agg.source.truncatedBuckets });
    expect(L.plot.top - top).toBe(samples.find((s) => s.id === id)!.head ?? 0);
  });

  it('ships heuristic eras offline, matching the deterministic segments (pnpm eras:build)', () => {
    expect(agg.eras).toEqual(heuristicEras(summarizeForEras(agg)));
    expect(agg.eras!.every((e) => e.source === 'heuristic')).toBe(true);
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
