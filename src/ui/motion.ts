/**
 * Motion (docs/redesign/DESIGN.md §6): minimal, ease-out, run with the Web Animations API so nothing is computed
 * per frame on the main thread. Arrive: a clip reveal (left to right, top to bottom on the phone), 900 ms, once per
 * load and after choosing a sample or drawing a repo, with the era rules and names fading in over the last 250 ms.
 * Focus: the river fades are CSS transitions (250 ms); the focused river's moved-files dashes run forward once
 * (600 ms). A view switch (Modules or Contributors, folder depth, bots) crossfades in 250 ms. Theme: instant.
 * Under `prefers-reduced-motion: reduce` nothing here runs. The helpers above the DOM section are pure and tested.
 */

/** The ease-out every motion uses (the CSS fades and the progress line use the same keyword). */
export const EASE_OUT = 'ease-out';
export const ARRIVE_MS = 900;
export const ERA_FADE_MS = 250;
export const DASH_MS = 600;
export const CROSSFADE_MS = 250;
/** One period of a transfer's `6 3` dash; on focus the dashes run forward three periods. */
export const DASH_PERIOD = 9;
export const DASH_RUN = 3 * DASH_PERIOD;
/** `Animation.id` of the arrive reveal and of the era fade (the browser checks and `pnpm gallery` find them by id). */
export const ARRIVE_ID = 'rr-arrive';
export const ERA_FADE_ID = 'rr-arrive-eras';

/**
 * The key of one arrival: the source drawn (a sample id or `repo:owner/name`) and a counter the page bumps each
 * time data arrives (a sample loaded, a repo drawn, a sample reopened after an error). A dimension, depth or bots
 * switch, the theme, a resize or a focus change leave it as it is, so they never replay the reveal.
 */
export const arriveKey = (source: string, arrivals: number): string => `${source}#${arrivals}`;

/**
 * Remembers which arrivals have played, so each plays once even when the chart component is replaced (crossing
 * the phone breakpoint mounts the other chart with the same key) or React runs an effect twice.
 * `claim(key)` is true the first time it sees `key` and false after that; `undefined` (a static picture) never plays.
 */
export function createArrivals(): { claim: (key: string | undefined) => boolean } {
  let played: string | undefined;
  return {
    claim(key) {
      if (key === undefined || key === played) return false;
      played = key;
      return true;
    },
  };
}

/** The view inside one arrival: what a switch of Modules or Contributors, folder depth or bots changes. */
export const viewKey = (o: { dimension: string; depth: string | number; includeBots: boolean }): string => `${o.dimension}|${o.depth}|${o.includeBots}`;

/** A crossfade runs when the view changes within one arrival (a new arrival reveals instead). */
export const crossfades = (prev: { arrive?: string; view?: string }, next: { arrive?: string; view?: string }): boolean =>
  prev.arrive !== undefined && prev.arrive === next.arrive && prev.view !== next.view;

/** The dashes run when focus moves onto a river; moving between buckets of the same river or releasing does not. */
export const runsDashes = (prev: string | null, next: string | null): boolean => next !== null && next !== prev;

/** The reveal's keyframes: a clip that opens left to right on the desktop, top to bottom on the phone. */
export const revealFrames = (phone: boolean): Keyframe[] => [
  { clipPath: phone ? 'inset(0 0 100% 0)' : 'inset(0 100% 0 0)' },
  { clipPath: 'inset(0 0 0 0)' },
];

/** Era rules and names: hidden until the last 250 ms of the reveal, then an ease-out fade. */
export const eraFadeFrames = (): Keyframe[] => [
  { opacity: 0 },
  { opacity: 0, offset: (ARRIVE_MS - ERA_FADE_MS) / ARRIVE_MS, easing: EASE_OUT },
  { opacity: 1 },
];

/** The dashes run forward (toward the arrowhead) by `DASH_RUN` and end where they rest. */
export const dashFrames = (): Keyframe[] => [{ strokeDashoffset: `${DASH_RUN}px` }, { strokeDashoffset: '0px' }];

// ---- DOM (browser only) ----

/** The page's arrivals (one page, one chart at a time). */
export const arrivals = createArrivals();

export const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Plays the arrive motion on the water group and the era marks (nothing under reduced motion). */
export function playArrive(water: Element | null, eras: readonly (Element | null)[], phone: boolean): void {
  if (reducedMotion() || !water) return;
  water.animate(revealFrames(phone), { id: ARRIVE_ID, duration: ARRIVE_MS, easing: EASE_OUT, fill: 'backwards' });
  for (const e of eras) e?.animate(eraFadeFrames(), { id: ERA_FADE_ID, duration: ARRIVE_MS, fill: 'backwards' });
}

/** Runs the dashes of the focused river's transfers forward once (`.rr-xfer.rr-on` inside `root`). */
export function runDashes(root: Element | null): void {
  if (reducedMotion() || !root) return;
  for (const p of root.querySelectorAll('.rr-xfer.rr-on .rr-transfer')) p.animate(dashFrames(), { id: 'rr-dash', duration: DASH_MS, easing: EASE_OUT });
}

/**
 * Crossfades from `ghost` (a copy of the drawing before the switch, inserted just before `live`) to `live`, then
 * removes the copy. Returns a function that removes it at once (for a second switch or an unmount).
 */
export function playCrossfade(live: Element, ghost: Element): () => void {
  for (const el of [ghost, ...ghost.querySelectorAll('*')]) {
    for (const a of Array.from(el.attributes)) if (a.name.startsWith('data-')) el.removeAttribute(a.name); // copied: removing edits the live map; not found by queries
  }
  ghost.classList.add('rr-ghost');
  live.parentNode?.insertBefore(ghost, live);
  const options = { duration: CROSSFADE_MS, easing: EASE_OUT };
  const out = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { ...options, id: 'rr-crossfade-out', fill: 'forwards' });
  live.animate([{ opacity: 0 }, { opacity: 1 }], { ...options, id: 'rr-crossfade-in' });
  const remove = () => ghost.remove();
  out.finished.then(remove, remove);
  return remove;
}
