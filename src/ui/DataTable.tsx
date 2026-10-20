import { useId } from 'react';
import type { RiverView } from '../core/view.ts';

const num = new Intl.NumberFormat('en');

/** "View as table": every river by bucket, with a caption and row/column headers; values straight from the view. */
export function DataTable({ view, caption }: { view: RiverView; caption: string }) {
  const id = useId();
  return (
    <details className="rr-table">
      <summary>View as table</summary>
      {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrollable region must be keyboard-scrollable */}
      <div className="rr-table-scroll" role="region" aria-labelledby={id} tabIndex={0}>
        <table>
          <caption id={id}>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">River</th>
              {view.buckets.map((b) => <th scope="col" key={b.start}>{b.label}</th>)}
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {view.rivers.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.bot ? `${r.label} · bot` : r.label}</th>
                {r.values.map((v, i) => <td key={i}>{num.format(v)}</td>)}
                <td>{num.format(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
