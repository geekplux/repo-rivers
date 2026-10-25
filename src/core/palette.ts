/**
 * The chrome colours of both themes and the colour science that checks them: Machado 2009 colour-vision
 * simulation in linear sRGB, sRGB↔CIELAB (D65), CIEDE2000 and WCAG 2 contrast. Pure; no DOM. The rivers carry no
 * hue: two waters that differ in lightness (src/ui/theme/tokens.css, checked in tokens.test.ts; tones.ts).
 */

/** The two colour themes, matching `prefers-color-scheme`. */
export type Theme = 'light' | 'dark';
/** The colour-vision deficiencies the palette is simulated under (Machado 2009, severity 1.0). */
export type Cvd = 'protanopia' | 'deuteranopia' | 'tritanopia';
/** A colour as three channels: sRGB (gamma or linear, 0..1) or CIELAB. */
export type Triple = readonly [number, number, number];

/** Theme chrome colours (the Radix roles ground, ink, muted, hair and focus of src/ui/theme/tokens.css). */
export interface ThemePalette {
  background: string;
  ink: string;
  secondary: string;
  graticule: string;
  focus: string;
}

/** Light and dark chrome; tokens.test.ts checks the CSS roles against these. */
export const PALETTES: Readonly<Record<Theme, ThemePalette>> = {
  light: { background: '#FBFDFF', ink: '#113264', secondary: '#60646C', graticule: '#ACD8FC', focus: '#0090FF' },
  dark: { background: '#111927', ink: '#C2E6FF', secondary: '#B0B4BA', graticule: '#004074', focus: '#0090FF' },
};

/** Machado, Oliveira & Fernandes (2009) matrices at severity 1.0, row-major; apply to **linear** RGB. */
export const MACHADO: Readonly<Record<Cvd, readonly number[]>> = {
  protanopia: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deuteranopia: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritanopia: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const mul = (m: readonly number[], [a, b, c]: Triple): Triple =>
  [0, 3, 6].map((r) => m[r]! * a + m[r + 1]! * b + m[r + 2]! * c) as unknown as Triple;
const XYZ = [0.4124564, 0.3575761, 0.1804375, 0.2126729, 0.7151522, 0.072175, 0.0193339, 0.119192, 0.9503041];
const RGB = [3.2404542, -1.5371385, -0.4985314, -0.969266, 1.8760108, 0.041556, 0.0556434, -0.2040259, 1.0572252];
const WHITE: Triple = [0.95047, 1, 1.08883];
const E = 216 / 24389;
const K = 24389 / 27;
const labF = (t: number): number => (t > E ? Math.cbrt(t) : (K * t + 16) / 116);
const byte = (c: number): string => Math.round(255 * Math.min(1, Math.max(0, toGamma(c)))).toString(16).padStart(2, '0');
const lum = (hex: string): number => mul([0.2126, 0.7152, 0.0722, 0, 0, 0, 0, 0, 0], hexToLinear(hex))[0];

/** `#RRGGBB` → linear sRGB in 0..1. */
export function hexToLinear(hex: string): Triple {
  return [1, 3, 5].map((i) => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255)) as unknown as Triple;
}

/** Simulates a colour-vision deficiency on linear RGB (Machado 2009, severity 1.0), clamped to 0..1. */
export function simulate(rgb: Triple, cvd: Cvd): Triple {
  return mul(MACHADO[cvd], rgb).map((c) => Math.min(1, Math.max(0, c))) as unknown as Triple;
}

/** Linear sRGB → CIELAB (D65). */
export function linearToLab(rgb: Triple): Triple {
  const [x, y, z] = mul(XYZ, rgb).map((v, i) => labF(v / WHITE[i]!)) as unknown as Triple;
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** CIELAB (D65) → `#rrggbb`, clamped to the sRGB gamut. */
export function labToHex([l, a, b]: Triple): string {
  const fy = (l + 16) / 116;
  const inv = (f: number): number => (f ** 3 > E ? f ** 3 : (116 * f - 16) / K);
  const xyz: Triple = [inv(fy + a / 500) * WHITE[0], (l > K * E ? fy ** 3 : l / K) * WHITE[1], inv(fy - b / 200) * WHITE[2]];
  return `#${mul(RGB, xyz).map(byte).join('')}`;
}

/** `#RRGGBB` → CIELAB, optionally as seen with a colour-vision deficiency. */
export function hexToLab(hex: string, cvd?: Cvd): Triple {
  const rgb = hexToLinear(hex);
  return linearToLab(cvd ? simulate(rgb, cvd) : rgb);
}

/** CIEDE2000 colour difference (Sharma, Wu & Dalal 2005), kL = kC = kH = 1. */
export function deltaE2000([l1, a1, b1]: Triple, [l2, a2, b2]: Triple): number {
  const rad = Math.PI / 180;
  const cBar = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));
  const [p1, p2] = [a1 * (1 + g), a2 * (1 + g)];
  const [c1, c2] = [Math.hypot(p1, b1), Math.hypot(p2, b2)];
  const hue = (b: number, a: number): number => (b === 0 && a === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const [h1, h2] = [hue(b1, p1), hue(b2, p2)];
  let dh = c1 * c2 === 0 ? 0 : h2 - h1;
  if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(c1 * c2) * Math.sin((dh / 2) * rad);
  const lBar = (l1 + l2) / 2;
  const cpBar = (c1 + c2) / 2;
  let hBar = h1 + h2;
  if (c1 * c2 !== 0) hBar = Math.abs(h1 - h2) <= 180 ? hBar / 2 : (hBar + (hBar < 360 ? 360 : -360)) / 2;
  const t = 1 - 0.17 * Math.cos((hBar - 30) * rad) + 0.24 * Math.cos(2 * hBar * rad)
    + 0.32 * Math.cos((3 * hBar + 6) * rad) - 0.2 * Math.cos((4 * hBar - 63) * rad);
  const sl = 1 + (0.015 * (lBar - 50) ** 2) / Math.sqrt(20 + (lBar - 50) ** 2);
  const sc = 1 + 0.045 * cpBar;
  const sh = 1 + 0.015 * cpBar * t;
  const rt = -2 * Math.sqrt(cpBar ** 7 / (cpBar ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hBar - 275) / 25) ** 2)) * rad);
  const [x, y, z] = [(l2 - l1) / sl, (c2 - c1) / sc, dH / sh];
  return Math.sqrt(x * x + y * y + z * z + rt * y * z);
}

/** WCAG 2 contrast ratio between two `#RRGGBB` colours (1..21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].toSorted((p, q) => q - p) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
