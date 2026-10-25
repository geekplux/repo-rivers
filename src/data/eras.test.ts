import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { heuristicEras } from '../core/eras/heuristic.ts';
import { summarizeForEras } from '../core/eras/summary.ts';
import { parseAggregate, type Era } from '../core/schema.ts';
import { describeEras, eraLine } from '../core/summary.ts';
import { selectView } from '../core/view.ts';
import svelte from '../samples/svelte.json';
import { EraList } from '../ui/EraList.tsx';
import { requestEras } from './eras.ts';

const AGG = parseAggregate(svelte);
const SUMMARY = summarizeForEras(AGG);
const VIEW = selectView(AGG, { dimension: 'modules' });
const AI: Era[] = SUMMARY.eras.map(({ start, end }, i) => ({ start, end, title: `Named ${i}`, note: `Note ${i}`, source: 'ai' }));
const reply = (body: unknown, status = 200, type = 'application/json') =>
  vi.fn<typeof fetch>(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': type } }));

describe('requestEras', () => {
  it('posts { summary } and returns AI eras for the same segments', async () => {
    const f = reply({ eras: AI, source: 'ai' });
    expect(await requestEras(SUMMARY, { fetch: f })).toEqual(AI);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('/api/eras');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ summary: SUMMARY });
  });

  it.each([
    ['a 503', reply('busy', 503, 'text/plain')],
    ['the SPA page instead of the Worker', reply('<!doctype html>', 200, 'text/html')],
    ['a heuristic answer', reply({ eras: heuristicEras(SUMMARY), source: 'heuristic' })],
    ['other segments', reply({ eras: AI.slice(1), source: 'ai' })],
    ['a network error', vi.fn<typeof fetch>(async () => Promise.reject(new TypeError('Failed to fetch')))],
  ])('is silent (null) on %s', async (_, f) => {
    expect(await requestEras(SUMMARY, { fetch: f })).toBeNull();
  });
});

describe('era text', () => {
  it('readout line and prose summary name every era and say when AI named them', () => {
    expect(eraLine(VIEW, AI[0]!)).toBe(`Named 0, ${VIEW.buckets[0]!.label} to ${VIEW.buckets[AI[0]!.end]!.label}. Note 0.`);
    const prose = describeEras(VIEW, AI);
    expect(prose.startsWith(`${AI.length} eras: Named 0 (`)).toBe(true);
    expect(prose).toMatch(/written by AI\.$/);
    expect(describeEras(VIEW, heuristicEras(SUMMARY))).not.toMatch(/AI/);
    expect(describeEras(VIEW, [])).toBe('');
  });

  it('the Eras list shows every era, AI or rule-based, and nothing without eras', () => {
    const items = (eras: Era[]) => [...renderToStaticMarkup(createElement(EraList, { eras, buckets: VIEW.buckets })).matchAll(/<li>(.*?)<\/li>/g)].map((m) => m[1]!.split(/<[^>]+>/).filter(Boolean));
    expect(items(AI)).toEqual(AI.map((e, i) => [`${VIEW.buckets[e.start]!.label} to ${VIEW.buckets[e.end]!.label}`, `Named ${i}`, ', named by AI', `Note ${i}.`]));
    const rules = heuristicEras(SUMMARY);
    expect(items(rules).map((t) => t[1])).toEqual(rules.map((e) => e.title));
    expect(items(rules).flat().join()).not.toMatch(/AI/);
    expect(renderToStaticMarkup(createElement(EraList, { eras: [], buckets: VIEW.buckets }))).toBe('');
  });
});
