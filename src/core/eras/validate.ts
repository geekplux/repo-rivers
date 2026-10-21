/**
 * Strict checks at both ends of the model call (docs/PLAN.md §4.6): the {@link EraSummary} a client sends is
 * rebuilt from a closed schema (identifiers only, no free text), and the model's titles and notes are
 * stripped of markup and clamped. Anything else is rejected, so the caller falls back to the heuristic.
 */
import type { Era } from '../schema.ts';
import type { Segment } from './segment.ts';
import { SUMMARY_MAX_BYTES, type EraFacts, type EraSummary } from './summary.ts';

/** Era title and note limits, in characters. */
export const TITLE_MAX = 32;
export const NOTE_MAX = 120;
/** Module and repository identifiers: path-like, no spaces, at most 40 characters. */
export const IDENT = /^[A-Za-z0-9._@+/()-]{1,40}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const UNITS = ['week', 'month', 'quarter', 'year'] as const;
const TRENDS = ['rising', 'falling', 'steady'] as const;
const LEVELS = ['low', 'medium', 'high'] as const;

type Obj = Record<string, unknown>;
const bad = (why: string): never => {
  throw new TypeError(`invalid era summary: ${why}`);
};
function exact(v: unknown, keys: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) bad('expected an object');
  const want = keys.split(' ');
  const got = Object.keys(v as Obj);
  if (got.length !== want.length || !got.every((k) => want.includes(k))) bad(`expected exactly the keys ${keys}`);
  return v as Obj;
}
const int = (v: unknown, max: number): number => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max ? (v as number) : bad('integer out of range'));
const id = (v: unknown): string => (typeof v === 'string' && IDENT.test(v) ? v : bad('not an identifier'));
const pick = <T extends string>(v: unknown, options: readonly T[]): T => (options.includes(v as T) ? (v as T) : bad('unknown value'));
const month = (v: unknown): string => (typeof v === 'string' && MONTH.test(v) ? v : bad('expected YYYY-MM'));
function list<T>(v: unknown, max: number, item: (x: unknown) => T): T[] {
  if (!Array.isArray(v) || v.length > max) bad(`expected an array of at most ${max}`);
  return (v as unknown[]).map(item);
}
const tuple = (v: unknown, n: number): unknown[] => (Array.isArray(v) && v.length === n ? v : bad(`expected a ${n}-tuple`));

/**
 * Validates an unknown value as an {@link EraSummary} and returns a rebuilt copy with a fixed key order (its
 * `JSON.stringify` is the canonical form). Throws a `TypeError` on any extra key, free text, overlong
 * identifier, non-contiguous segments or more than {@link SUMMARY_MAX_BYTES}.
 */
export function parseEraSummary(input: unknown): EraSummary {
  const s = exact(input, 'v repo unit eras');
  if (s.v !== 1) bad('unsupported version');
  const eras = list(s.eras, 6, (e): EraFacts => {
    const f = exact(e, 'start end from to top trend activity contributors newcomers moves');
    return {
      start: int(f.start, 9999), end: int(f.end, 9999), from: month(f.from), to: month(f.to),
      top: list(f.top, 4, (t) => { const [m, p] = tuple(t, 2); return [id(m), int(p, 100)]; }),
      trend: pick(f.trend, TRENDS), activity: pick(f.activity, LEVELS),
      contributors: int(f.contributors, 1e6), newcomers: int(f.newcomers, 1e6),
      moves: list(f.moves, 2, (t) => { const [a, b, n] = tuple(t, 3); return [id(a), id(b), int(n, 1e6)]; }),
    };
  });
  if (eras.length === 0) bad('expected at least one era');
  eras.forEach((e, i) => (e.end < e.start || e.start !== (i === 0 ? 0 : eras[i - 1]!.end + 1)) && bad('segments must be contiguous from 0'));
  const out: EraSummary = { v: 1, repo: id(s.repo), unit: pick(s.unit, UNITS), eras };
  if (new TextEncoder().encode(JSON.stringify(out)).length > SUMMARY_MAX_BYTES) bad('larger than 2 KB');
  return out;
}

/** Strips markup, control characters and wrapping quotes, collapses spaces, and cuts to `max` with an ellipsis. */
export function clampText(text: string, max: number): string {
  const t = text
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\p{Cc}\p{Cf}*_`#~[\]{}<>|\\]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.–-]+$/, '')}…`;
}

/**
 * Era names from untrusted text or JSON (`{ eras: [{ title, note }] }`, one per segment, in order): clamped
 * to {@link TITLE_MAX}/{@link NOTE_MAX}. Returns null when the shape or the segment count does not match, or a
 * title is empty after cleaning.
 */
export function parseNames(raw: unknown, segments: readonly Segment[], source: Era['source']): Era[] | null {
  let value = raw;
  try {
    if (typeof raw === 'string') value = JSON.parse(raw);
  } catch {
    return null;
  }
  const items = (value as { eras?: unknown } | null)?.eras;
  if (!Array.isArray(items) || items.length !== segments.length) return null;
  const eras = items.map((item: unknown, i): Era | null => {
    const { title, note } = (item ?? {}) as { title?: unknown; note?: unknown };
    if (typeof title !== 'string' || typeof note !== 'string') return null;
    const era = { start: segments[i]!.start, end: segments[i]!.end, title: clampText(title, TITLE_MAX), note: clampText(note, NOTE_MAX), source };
    return era.title ? era : null;
  });
  return eras.every((e) => e !== null) ? (eras as Era[]) : null;
}

/** Checks eras received from `/api/eras` (or a cache) against the expected segments; returns clamped copies or null. */
export function checkEras(raw: unknown, segments: readonly Segment[]): Era[] | null {
  if (!Array.isArray(raw)) return null;
  const sources = raw.map((e: { source?: unknown } | null) => e?.source);
  const same = raw.every((e: Partial<Era> | null, i) => e?.start === segments[i]?.start && e?.end === segments[i]?.end);
  if (!same || !sources.every((s) => s === 'ai' || s === 'heuristic') || new Set(sources).size !== 1) return null;
  return parseNames({ eras: raw }, segments, sources[0] as Era['source']);
}
