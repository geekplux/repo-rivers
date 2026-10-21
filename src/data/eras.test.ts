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
import { ERA_INSET, eraBoxes } from '../ui/EraTrack.tsx';
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
    expect(eraLine(VIEW, AI[0]!)).toBe(`Named 0 · ${VIEW.buckets[0]!.label}–${VIEW.buckets[AI[0]!.end]!.label} · Note 0`);
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

describe('eraBoxes', () => {
  it('aligns brackets to bucket boundaries (inset 3 px) and reserves 48 px when every bracket is at least 200 px', () => {
    const { boxes, height } = eraBoxes([{ start: 0, end: 9 }, { start: 10, end: 19 }], 4, 30, 700);
    expect(boxes.map((b) => [b.x, b.x + b.width])).toEqual([[4 + ERA_INSET, 4 + 300 - ERA_INSET], [304 + ERA_INSET, 4 + 600 - ERA_INSET]]);
    expect(height).toBe(48);
    expect(boxes.map((b) => [b.row2, b.room])).toEqual([[false, 294 - 8], [false, 294 - 8]]);
  });

  it('alternates rows when any bracket is under 200 px: each title runs to the next same-row bracket or the track end', () => {
    const eras = [{ start: 0, end: 1 }, { start: 2, end: 9 }, { start: 10, end: 11 }, { start: 12, end: 19 }];
    const { boxes, height } = eraBoxes(eras, 4, 30, 700);
    expect(height).toBe(72);
    expect(boxes.map((b) => b.row2)).toEqual([false, true, false, true]);
    expect(boxes.map((b) => b.room)).toEqual([307 - 7 - 8, 367 - 67 - 8, 700 - 307 - 8, 700 - 367 - 8]);
    // The height comes from the segments alone: the same for any names.
    expect(eraBoxes(eras.map((e) => ({ ...e, title: 'x' })), 4, 30, 700).height).toBe(72);
  });
});
