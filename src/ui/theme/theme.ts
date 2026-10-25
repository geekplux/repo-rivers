import { useCallback, useEffect, useState } from 'react';

/**
 * Light/dark theme (DESIGN §1): follows the system until the visitor picks one with the header button. The pick is
 * remembered in localStorage and cleared when it equals the system theme, so a visitor who switches back follows the
 * system again. `data-theme` on <html> carries a stored pick (public/theme.js sets it before first paint); without
 * it, tokens.css follows `prefers-color-scheme`.
 */
export type ThemeName = 'light' | 'dark';

/** localStorage key; public/theme.js reads the same key (theme.test.ts checks it). */
export const THEME_KEY = 'repo-rivers:theme';
export const SYSTEM_DARK = '(prefers-color-scheme: dark)';

type Read = Pick<Storage, 'getItem'>;
type Write = Pick<Storage, 'setItem' | 'removeItem'>;

/** A stored value, or null when it is missing or not a theme name. */
export function parseTheme(value: string | null | undefined): ThemeName | null {
  return value === 'light' || value === 'dark' ? value : null;
}

/** The theme in effect: the stored pick, else the system's. */
export function resolveTheme(stored: ThemeName | null, systemDark: boolean): ThemeName {
  return stored ?? (systemDark ? 'dark' : 'light');
}

/** What to store after the visitor picks `next`: nothing when it equals the system theme. */
export function storedFor(next: ThemeName, systemDark: boolean): ThemeName | null {
  return next === resolveTheme(null, systemDark) ? null : next;
}

/** The stored pick; null when storage is missing, blocked or holds something else. */
export function readTheme(storage: Read | undefined): ThemeName | null {
  try {
    return parseTheme(storage?.getItem(THEME_KEY));
  } catch {
    return null;
  }
}

/** Stores the pick, or clears it for null. Storage errors (private mode, quota) are ignored: the pick still applies. */
export function writeTheme(storage: Write | undefined, value: ThemeName | null): void {
  try {
    if (value) storage?.setItem(THEME_KEY, value);
    else storage?.removeItem(THEME_KEY);
  } catch {
    // The page still switches; it just won't be remembered.
  }
}

/** Mirrors the pick onto `data-theme` (removed when following the system). */
export function applyTheme(root: Pick<HTMLElement, 'setAttribute' | 'removeAttribute'>, stored: ThemeName | null): void {
  if (stored) root.setAttribute('data-theme', stored);
  else root.removeAttribute('data-theme');
}

const storage = (): Storage | undefined => {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
};

/** The theme in effect and a toggle; follows system changes while nothing is stored and syncs across tabs. */
export function useTheme(): { theme: ThemeName; toggle: () => void } {
  const [stored, setStored] = useState(() => readTheme(storage()));
  const [systemDark, setSystemDark] = useState(() => matchMedia(SYSTEM_DARK).matches);
  useEffect(() => {
    const mq = matchMedia(SYSTEM_DARK);
    const onSystem = () => setSystemDark(mq.matches);
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY || e.key === null) setStored(parseTheme(e.newValue));
    };
    mq.addEventListener('change', onSystem);
    addEventListener('storage', onStorage);
    return () => (mq.removeEventListener('change', onSystem), removeEventListener('storage', onStorage));
  }, []);
  useEffect(() => applyTheme(document.documentElement, stored), [stored]);
  const theme = resolveTheme(stored, systemDark);
  const toggle = useCallback(() => {
    const next = storedFor(theme === 'dark' ? 'light' : 'dark', systemDark);
    writeTheme(storage(), next);
    setStored(next);
  }, [theme, systemDark]);
  return { theme, toggle };
}
