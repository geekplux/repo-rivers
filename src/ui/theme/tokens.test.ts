import { describe, expect, it } from 'vitest';
import { PALETTES, contrast, type Theme } from '../../core/palette.ts';
import css from './tokens.css?raw';

// Radix Colors 3.0 (radix-ui.com/colors), steps 1..12.
const RADIX = {
  light: {
    blue: ['#fbfdff', '#f4faff', '#e6f4fe', '#d5efff', '#c2e5ff', '#acd8fc', '#8ec8f6', '#5eb1ef', '#0090ff', '#0588f0', '#0d74ce', '#113264'],
    slate: ['#fcfcfd', '#f9f9fb', '#f0f0f3', '#e8e8ec', '#e0e1e6', '#d9d9e0', '#cdced6', '#b9bbc6', '#8b8d98', '#80838d', '#60646c', '#1c2024'],
  },
  dark: {
    blue: ['#0d1520', '#111927', '#0d2847', '#003362', '#004074', '#104d87', '#205d9e', '#2870bd', '#0090ff', '#3b9eff', '#70b8ff', '#c2e6ff'],
    slate: ['#111113', '#18191b', '#212225', '#272a2d', '#2e3135', '#363a3f', '#43484e', '#5a6169', '#696e77', '#777b84', '#b0b4ba', '#edeef0'],
  },
} as const;

// DESIGN.md §2, role → [light, dark].
const ROLES: Record<string, [string, string]> = {
  ground: ['blue-1', 'blue-2'], ink: ['blue-12', 'blue-12'], muted: ['slate-11', 'slate-11'],
  'water-a': ['blue-12', 'blue-12'], 'water-b': ['blue-11', 'blue-11'], 'on-water': ['blue-1', 'blue-1'],
  line: ['blue-7', 'blue-6'], hair: ['blue-6', 'blue-5'], band: ['blue-3', 'blue-3'],
  solid: ['blue-12', 'blue-12'], 'on-solid': ['blue-1', 'blue-1'], field: ['#ffffff', 'blue-1'], focus: ['blue-9', 'blue-9'],
};

/** The custom properties declared in the first block after `marker`. */
const block = (marker: string): Record<string, string> => {
  const at = css.indexOf(marker);
  if (at < 0) throw new Error(`tokens.css has no ${marker} block`);
  const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
};
const light = block('\n:root {');
const darkMedia = block(":root:not([data-theme='light'])");
const darkChosen = block(":root[data-theme='dark']");
const vars: Record<Theme, Record<string, string>> = { light, dark: { ...light, ...darkChosen } };

/** Resolves `var(--x)` chains to a literal value. */
const resolve = (theme: Theme, name: string): string => {
  const v = vars[theme][name];
  if (v === undefined) throw new Error(`--${name} is not defined in ${theme}`);
  const ref = /^var\(--([\w-]+)\)$/.exec(v);
  return ref ? resolve(theme, ref[1]!) : v.toLowerCase();
};

describe('theme tokens', () => {
  it('the system-dark block and the chosen-dark block are identical', () => {
    expect(darkMedia).toEqual(darkChosen);
  });

  it('both dark blocks are screen-only, so print is always light', () => {
    expect(css).toMatch(/@media screen and \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme='light'\]\)/);
    expect(css).toMatch(/@media screen\s*\{\s*:root\[data-theme='dark'\]/);
  });

  it.each(['light', 'dark'] as const)('%s: the Radix blue and slate scales', (theme) => {
    for (const scale of ['blue', 'slate'] as const) {
      expect(RADIX[theme][scale].map((_, i) => resolve(theme, `${scale}-${i + 1}`))).toEqual(RADIX[theme][scale]);
    }
  });

  it.each([['light', 0], ['dark', 1]] as const)('%s: the semantic roles of DESIGN §2', (theme, i) => {
    const want = Object.fromEntries(Object.entries(ROLES).map(([role, s]) => [role, s[i].startsWith('#') ? s[i] : resolve(theme, s[i])]));
    expect(Object.fromEntries(Object.keys(ROLES).map((role) => [role, resolve(theme, role)]))).toEqual(want);
  });

  it.each(['light', 'dark'] as const)('%s: the --rr-* aliases and river fills equal PALETTES (CVD-checked in palette.test.ts)', (theme) => {
    const p = PALETTES[theme];
    const want = { bg: p.background, ink: p.ink, 'ink-2': p.secondary, grid: p.graticule, focus: p.focus };
    const got = Object.fromEntries(Object.keys(want).map((k) => [k, resolve(theme, `rr-${k}`).toUpperCase()]));
    expect(got).toEqual(want);
    expect(p.fills.map((_, i) => resolve(theme, `rr-river-${i}`).toUpperCase())).toEqual(p.fills);
  });

  it.each(['light', 'dark'] as const)('%s: text contrast ≥ 4.5:1 on ground, band and field; focus ring ≥ 3:1', (theme) => {
    const c = (a: string, b: string) => contrast(resolve(theme, a), resolve(theme, b));
    const pairs = ['ink', 'muted'].flatMap((text) => ['ground', 'band', 'field'].map((bg) => c(text, bg)));
    expect(Math.min(...pairs)).toBeGreaterThanOrEqual(4.5);
    expect(c('on-solid', 'solid')).toBeGreaterThanOrEqual(4.5);
    expect(c('on-water', 'water-b')).toBeGreaterThanOrEqual(4.5);
    expect(c('focus', 'ground')).toBeGreaterThanOrEqual(3);
  });
});
