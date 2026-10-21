/**
 * Template era names (docs/PLAN.md §4.6): used for the built-in samples, before AI names arrive, and whenever
 * the model is unavailable or answers badly. Deterministic, from the {@link EraSummary} alone.
 */
import type { Era } from '../schema.ts';
import type { EraSummary } from './summary.ts';
import { NOTE_MAX, TITLE_MAX, clampText } from './validate.ts';

/** A module name short enough for a title: the last path segment when the whole is over 20 characters. */
const short = (m: string): string => (m.length <= 20 ? m : (m.split('/').pop() ?? m).slice(0, 20));
const tail = (m: string): string => m.split('/').pop() || m;
const plural = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;

/** Titles like "The packages/vite era" and notes like "58% of changes in packages/vite; 31 contributors (12 new)". */
export function heuristicEras(summary: EraSummary): Era[] {
  const used = new Set<string>();
  return summary.eras.map((e, i): Era => {
    const lead = e.top[0]?.[0];
    const before = summary.eras[i - 1]?.top[0]?.[0];
    const move = e.moves[0];
    const second = e.top[1] && e.top[1][1] >= 15 ? e.top[1][0] : null;
    // A big move between named modules names the era; else the lead module, or how it changed since the last era.
    let title = !lead ? 'A quiet stretch'
      : move && move[2] >= 50 && move[0] !== 'other' ? `The move to ${short(move[1])}`
      : lead !== before ? `The ${short(lead)} era`
      : e.trend !== 'steady' ? `${short(lead)} ${e.trend === 'rising' ? 'picks up' : 'winds down'}`
      : second ? `${tail(lead)} and ${tail(second)}` : `More ${short(lead)}`;
    if (used.has(title)) title = `${title}, ${e.from.slice(0, 4)}`;
    used.add(title);
    const parts = [
      e.top[0] ? `${e.top[0][1]}% of changes in ${e.top[0][0]}` : 'no changes recorded',
      e.contributors > 0 && `${plural(e.contributors, 'contributor')}${e.newcomers > 0 && i > 0 ? ` (${e.newcomers} new)` : ''}`,
      move && `${plural(move[2], 'file')} moved from ${move[0] === 'other' ? 'smaller modules' : move[0]} to ${move[1]}`,
      e.activity !== 'medium' && (e.activity === 'high' ? 'a busy stretch' : 'a quiet stretch'),
    ].filter((p): p is string => Boolean(p));
    let note = '';
    for (const p of parts) if (`${note}; ${p}`.length <= NOTE_MAX + 2) note = note ? `${note}; ${p}` : p;
    return { start: e.start, end: e.end, title: clampText(title, TITLE_MAX), note: clampText(note, NOTE_MAX), source: 'heuristic' };
  });
}
