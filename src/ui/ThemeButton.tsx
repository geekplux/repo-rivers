import { useTheme } from './theme/theme.ts';

/** Header icon button: a moon in light (switches to dark), a sun in dark (switches to light). */
export function ThemeButton() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button type="button" className="rr-icon" onClick={toggle} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true" focusable="false">
        {dark ? (
          <>
            <circle cx="10" cy="10" r="3.5" />
            <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" />
          </>
        ) : (
          <path d="M15.5 12.3A6.5 6.5 0 0 1 7.7 4.5a6.5 6.5 0 1 0 7.8 7.8z" />
        )}
      </svg>
    </button>
  );
}
