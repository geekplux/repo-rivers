/**
 * Template era names: used for the built-in samples, before AI names arrive, and whenever
 * the model is unavailable or answers badly. Deterministic, from the {@link EraSummary} alone.
 */
import type { Era } from '../schema.ts';
import { moduleLabel as label, type EraSummary } from './summary.ts';
import { NOTE_MAX, TITLE_MAX, clampText } from './validate.ts';

/** A module's chart label short enough for a title: the last path segment when the whole is over 20 characters. */
const short = (id: string): string => ((m) => (m.length <= 20 ? m : (m.split('/').pop() ?? m).slice(0, 20)))(label(id));
const last = (id: string): string => label(id).split('/').pop() || label(id);
const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;
const fits = (t: string): boolean => t.length <= TITLE_MAX;

/** Titles like "The packages/vite era" and notes like "58% of changes in packages/vite; 31 contributors (12 new)". */
export function heuristicEras(summary: EraSummary): Era[] {
  // Every module the summary names, to tell when a last path segment alone would be ambiguous.
  const modules = new Set(summary.eras.flatMap((e) => [...e.top.map(([m]) => m), ...e.moves.flatMap(([a, b]) => [a, b]), ...(e.shift ?? [])]));
  const tail = (m: string): string => ([...modules].some((o) => o !== m && last(o) === last(m)) ? short(m) : last(m));
  const used = new Set<string>();
  return summary.eras.map((e, i): Era => {
    const lead = e.top[0]?.[0];
    const before = summary.eras[i - 1]?.top[0]?.[0];
    const move = e.moves[0];
    const second = e.top[1] && e.top[1][1] >= 15 ? e.top[1][0] : null;
    const shift = e.shift && `From ${short(e.shift[0])} to ${short(e.shift[1])}`;
    const pair = lead && second && `${tail(lead)} and ${tail(second)}`;
    // A big move into a named module names the era; else a change of lead within it, the lead module, or how
    // the lead module changed since the last era.
    let title = !lead ? 'A quiet stretch'
      : move && move[2] >= 50 && move[1] !== 'other' ? `The move to ${short(move[1])}`
      : shift && fits(shift) ? shift
      : lead !== before ? `The ${short(lead)} era`
      : e.leadTrend !== 'steady' ? `${short(lead)} ${e.leadTrend === 'rising' ? 'picks up' : 'winds down'}`
      : pair && fits(pair) ? pair : `More ${short(lead)}`;
    if (used.has(title)) title = lead && before && lead !== before ? `Back to ${short(lead)}` : title;
    if (used.has(title)) title = `${title}, ${e.from.slice(0, 4)}`;
    used.add(title);
    const parts = [
      e.top[0] ? `${e.top[0][1]}% of changes in ${label(e.top[0][0])}` : 'no changes recorded',
      e.contributors > 0 && `${plural(e.contributors, 'contributor')}${e.newcomers > 0 && i > 0 ? ` (${e.newcomers} new)` : ''}`,
      move && `${plural(move[2], 'file')} moved from ${move[0] === 'other' ? 'smaller modules' : label(move[0])} to ${label(move[1])}`,
      e.activity !== 'medium' && (e.activity === 'high' ? 'a busy stretch' : 'below-average activity'),
    ].filter((p): p is string => Boolean(p));
    let note = '';
    for (const p of parts) if (`${note}; ${p}`.length <= NOTE_MAX + 2) note = note ? `${note}; ${p}` : p;
    return { start: e.start, end: e.end, title: clampText(title, TITLE_MAX), note: clampText(note, NOTE_MAX), source: 'heuristic' };
  });
}
