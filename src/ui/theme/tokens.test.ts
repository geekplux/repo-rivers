import { describe, expect, it } from 'vitest';
import { PALETTES } from '../../core/palette.ts';
import css from './tokens.css?raw';

// The CSS custom properties must be exactly the CVD-checked palettes, so the chart can theme without JS.
const [light, dark] = css.split('prefers-color-scheme: dark');
const tokens = (block: string): Record<string, string> =>
  Object.fromEntries([...block.matchAll(/--rr-([\w-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1]!, m[2]!.toUpperCase()]));

describe('theme tokens', () => {
  it.each([['light', light!], ['dark', dark!]] as const)('%s tokens equal PALETTES', (theme, block) => {
    const p = PALETTES[theme];
    const want = { bg: p.background, ink: p.ink, 'ink-2': p.secondary, grid: p.graticule, focus: p.focus };
    expect(tokens(block)).toEqual({ ...want, ...Object.fromEntries(p.fills.map((f, i) => [`river-${i}`, f])) });
  });
});
