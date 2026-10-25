// Applies a stored light/dark pick before first paint (src/ui/theme/theme.ts owns the logic; the key must match
// THEME_KEY). An external file because the CSP (public/_headers) allows no inline script.
try {
  var t = localStorage.getItem('repo-rivers:theme');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
} catch {
  // Storage blocked: follow the system theme.
}
