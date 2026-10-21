import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { parseAggregate } from '../core/schema.ts';
import { selectView } from '../core/view.ts';
import svelte from '../samples/svelte.json';
import { DataTable } from './DataTable.tsx';

const AGG = parseAggregate(svelte);
const cells = (row: string, tag: string): string[] =>
  [...row.matchAll(new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 'g'))].map((m) => m[1]!);

describe('DataTable', () => {
  it.each([
    ['modules', selectView(AGG, { dimension: 'modules' })],
    ['contributors with bots', selectView(AGG, { dimension: 'contributors', includeBots: true })],
  ])('%s: values equal the view model, with caption and scoped headers', (_, view) => {
    const html = renderToStaticMarkup(createElement(DataTable, { view, caption: 'cap' }));
    expect(html).toMatch(/<caption id="[^"]+">cap<\/caption>/);
    expect(html).toContain('<summary>View as table</summary>');
    const head = html.match(/<thead>(.*)<\/thead>/)![1]!;
    expect(cells(head, 'th')).toEqual(['River', ...view.buckets.map((b) => b.label), 'Total']);
    expect(head.match(/scope="col"/g)).toHaveLength(view.buckets.length + 2);
    const rows = [...html.match(/<tbody>(.*)<\/tbody>/)![1]!.matchAll(/<tr>(.*?)<\/tr>/g)].map((m) => m[1]!);
    expect(rows.map((r) => r.match(/<th scope="row">(.*?)<\/th>/)![1])).toEqual(view.rivers.map((r) => (r.bot ? `${r.label} · bot` : r.label)));
    const values = rows.map((r) => cells(r, 'td').map((v) => Number(v.replaceAll(',', ''))));
    expect(values).toEqual(view.rivers.map((r) => [...r.values, r.total]));
  });
});
