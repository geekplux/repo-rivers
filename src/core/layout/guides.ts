/**
 * The chart's guides (docs/redesign/DESIGN.md §4): the era band above the plot and the year ticks of the axis
 * below it. Pure geometry and text fitting, ported from docs/redesign/target/gen.mjs `chart()` and `yearTicks()`.
 */
import type { Era } from '../schema.ts';
import { eraRange } from '../summary.ts';

/** Height of the era band above the plot. */
export const ERA_BAND = 84;
/** Room below the plot for the axis: baseline 8 below, ticks to 16, year labels on 32. */
export const AXIS_ROOM = 44;
/** Room right of the desktop plot for river names at the mouth: the plot ends at 1180 of a 1440 page. */
export const MOUTH_ROOM = 140;
/** River names: 13 px Alegreya Sans italic 500, about 6.3 px per character plus 4 (gen.mjs `charW`). */
export const riverNameWidth = (s: string): number => 6.3 * s.length + 4;
/** Era names: 16 px Alegreya Sans 500, about 7.7 px per character. */
export const eraTitleWidth = (s: string): number => 7.7 * s.length;
/** Year labels: 13 px lining numerals, about 6.5 px per character. */
const yearWidth = (s: string): number => 6.5 * s.length;

/**
 * Greedy word wrap of an era name inside `max` px, at most two lines; when words are left over, the second line
 * ends with an ellipsis (shortened until it fits). A single word wider than `max` keeps its own line.
 */
export function wrapTitle(title: string, max: number, measure: (s: string) => number = eraTitleWidth): string[] {
  const lines: string[] = [];
  for (const word of title.split(/\s+/).filter(Boolean)) {
    const last = lines.at(-1);
    const next = last === undefined ? word : `${last} ${word}`;
    if (last === undefined || measure(next) > max) lines.push(word);
    else lines[lines.length - 1] = next;
  }
  if (lines.length <= 2) return lines;
  const words = lines.slice(1).join(' ').split(' ');
  while (words.length > 1 && measure(`${words.join(' ')}…`) > max) words.pop();
  return [lines[0]!, `${words.join(' ')}…`];
}

/** One era as drawn: its span on x, its name in lines and its range. */
export interface EraMark { x0: number; x1: number; lines: string[]; range: string }

/** Every era's rule (at its start), name wrapped inside its width minus 16, and range text. */
export function eraMarks(eras: readonly Pick<Era, 'start' | 'end' | 'title'>[], buckets: readonly { label: string }[], left: number, bw: number,
  measure: (s: string) => number = eraTitleWidth): EraMark[] {
  return eras.map((e) => {
    const [x0, x1] = [left + e.start * bw, left + (e.end + 1) * bw];
    return { x0, x1, lines: wrapTitle(e.title, x1 - x0 - 16, measure), range: eraRange(buckets, e) };
  });
}

/**
 * Year ticks on the axis: one at the start of each year (the first bucket of a new calendar year), with the year
 * left-aligned at the tick. The first bucket gets its year too when it starts a year; otherwise only when the
 * next label is at least 3 buckets (and 40 px) away. Crowded labels thin to every 2nd, 5th or 10th year.
 */
export function yearTicks(buckets: readonly { start: string }[], left: number, bw: number): { x: number; text: string }[] {
  const years = buckets.map((b) => b.start.slice(0, 4));
  let ticks = years.flatMap((y, i) => (i === 0 || y !== years[i - 1] ? [{ i, x: left + i * bw, text: y }] : []));
  const [first, next] = ticks;
  const startsYear = buckets[0]?.start.slice(5, 10) === '01-01';
  if (first && next && !startsYear && (next.i < 3 || next.x - first.x < 40)) ticks = ticks.slice(1);
  const clear = (t: typeof ticks): boolean => t.every((k, j) => j === 0 || k.x - t[j - 1]!.x >= yearWidth(t[j - 1]!.text) + 12);
  for (const step of [1, 2, 5, 10, 20]) {
    const kept = step === 1 ? ticks : ticks.filter((t) => Number(t.text) % step === 0);
    if (clear(kept) || step === 20) return kept.map(({ x, text }) => ({ x, text }));
  }
  return [];
}
