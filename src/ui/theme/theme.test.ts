import { describe, expect, it } from 'vitest';
import src from '../../../public/theme.js?raw';
import { THEME_KEY, applyTheme, parseTheme, readTheme, resolveTheme, storedFor, writeTheme, type ThemeName } from './theme.ts';

const memory = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};
const blocked = {
  getItem: (): string | null => { throw new Error('SecurityError'); },
  setItem: (): void => { throw new Error('QuotaExceededError'); },
  removeItem: (): void => { throw new Error('SecurityError'); },
};
const root = () => {
  const attrs = new Map<string, string>();
  return { attrs, setAttribute: (k: string, v: string) => void attrs.set(k, v), removeAttribute: (k: string) => void attrs.delete(k) };
};

/** Runs the shipped pre-paint script with fake globals; returns the data-theme it set. */
const run = (storage: object) => {
  const r = root();
  // oxlint-disable-next-line no-new-func
  new Function('localStorage', 'document', src)(storage, { documentElement: r });
  return r.attrs.get('data-theme');
};

describe('theme', () => {
  it('parses only the two theme names', () => {
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('light')).toBe('light');
    for (const v of [null, undefined, '', 'Dark', 'system']) expect(parseTheme(v)).toBeNull();
  });

  it('follows the system until something is stored', () => {
    expect(resolveTheme(null, false)).toBe('light');
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('stores a pick only when it differs from the system', () => {
    expect(storedFor('dark', false)).toBe('dark');
    expect(storedFor('light', true)).toBe('light');
    expect(storedFor('dark', true)).toBeNull();
    expect(storedFor('light', false)).toBeNull();
  });

  it('toggling twice returns to following the system', () => {
    const s = memory();
    let stored: ThemeName | null = null;
    for (const systemDark of [false, true]) {
      for (let i = 0; i < 2; i++) {
        const next = storedFor(resolveTheme(stored, systemDark) === 'dark' ? 'light' : 'dark', systemDark);
        writeTheme(s, next);
        stored = readTheme(s);
        expect(resolveTheme(stored, systemDark)).toBe(i === 0 ? (systemDark ? 'light' : 'dark') : (systemDark ? 'dark' : 'light'));
      }
      expect(s.m.has(THEME_KEY)).toBe(false);
    }
  });

  it('reads and writes under the shared key, and survives blocked or missing storage', () => {
    const s = memory({ [THEME_KEY]: 'dark' });
    expect(readTheme(s)).toBe('dark');
    writeTheme(s, 'light');
    expect(s.m.get(THEME_KEY)).toBe('light');
    writeTheme(s, null);
    expect(s.m.has(THEME_KEY)).toBe(false);
    expect(readTheme(memory({ [THEME_KEY]: 'sepia' }))).toBeNull();
    expect(readTheme(blocked)).toBeNull();
    expect(readTheme(undefined)).toBeNull();
    expect(() => writeTheme(blocked, 'dark')).not.toThrow();
  });

  it('mirrors the stored pick onto data-theme, and removes it when following the system', () => {
    const r = root();
    applyTheme(r, 'dark');
    expect(r.attrs.get('data-theme')).toBe('dark');
    applyTheme(r, null);
    expect(r.attrs.has('data-theme')).toBe(false);
  });

  it('public/theme.js applies the same stored pick before first paint', () => {
    expect(src).toContain(`'${THEME_KEY}'`);
    expect(run(memory({ [THEME_KEY]: 'dark' }))).toBe('dark');
    expect(run(memory({ [THEME_KEY]: 'light' }))).toBe('light');
    expect(run(memory({ [THEME_KEY]: '"><script>' }))).toBeUndefined();
    expect(run(memory())).toBeUndefined();
    expect(run(blocked)).toBeUndefined();
  });
});
