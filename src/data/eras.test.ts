import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { heuristicEras } from '../core/eras/heuristic.ts';
import { summarizeForEras } from '../core/eras/summary.ts';
import { parseAggregate, type Era } from '../core/schema.ts';
import { describeEras, eraLine } from '../core/summary.ts';
import { selectView } from '../core/view.ts';
import svelte from '../samples/svelte.json';
import { DataTable } from '../ui/DataTable.tsx';
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

  it('the table has an era footer row spanning each era’s buckets', () => {
    const html = renderToStaticMarkup(createElement(DataTable, { view: VIEW, caption: 'c', eras: AI }));
    const foot = html.match(/<tfoot>(.*)<\/tfoot>/)![1]!;
    expect(foot).toContain('<th scope="row">Era</th>');
    const spans = [...foot.matchAll(/colSpan="(\d+)"[^>]*>([^<]*)</gi)].map((m) => [Number(m[1]), m[2]]);
    expect(spans).toEqual(AI.map((e) => [e.end - e.start + 1, `${e.title} (named by AI)`]));
    expect(foot).toMatch(/<\/td><td><\/td><\/tr>$/); // the row covers the Total column
    expect(renderToStaticMarkup(createElement(DataTable, { view: VIEW, caption: 'c' }))).not.toContain('<tfoot>');
  });
});
