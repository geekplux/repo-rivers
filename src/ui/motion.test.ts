import { describe, expect, it } from 'vitest';
import {
  ARRIVE_MS, DASH_PERIOD, DASH_RUN, ERA_FADE_MS, arriveKey, createArrivals, crossfades, dashFrames, eraFadeFrames, revealFrames, runsDashes, viewKey,
} from './motion.ts';

describe('motion (DESIGN §6)', () => {
  it('the arrive reveal plays once per arrival', () => {
    const a = createArrivals();
    expect(a.claim(arriveKey('vite', 1))).toBe(true); // page load
    expect(a.claim(arriveKey('vite', 1))).toBe(false); // the same arrival again (an effect run twice, a resize past the phone breakpoint)
    expect(a.claim(arriveKey('svelte', 2))).toBe(true); // a sample chosen
    expect(a.claim(arriveKey('repo:sveltejs/svelte', 3))).toBe(true); // a repo drawn
    expect(a.claim(arriveKey('repo:sveltejs/svelte', 4))).toBe(true); // the same repo drawn again
    expect(a.claim(arriveKey('repo:sveltejs/svelte', 4))).toBe(false);
  });

  it('a static picture (no key) never plays', () => {
    const a = createArrivals();
    expect(a.claim(undefined)).toBe(false);
    expect(a.claim(undefined)).toBe(false);
  });

  it('a view switch crossfades within one arrival; a new arrival reveals instead', () => {
    const modules = viewKey({ dimension: 'modules', depth: 'auto', includeBots: false });
    const people = viewKey({ dimension: 'contributors', depth: 'auto', includeBots: false });
    const vite = arriveKey('vite', 1);
    expect(crossfades({ arrive: vite, view: modules }, { arrive: vite, view: people })).toBe(true);
    expect(crossfades({ arrive: vite, view: modules }, { arrive: vite, view: viewKey({ dimension: 'modules', depth: 2, includeBots: false }) })).toBe(true);
    expect(crossfades({ arrive: vite, view: modules }, { arrive: vite, view: modules })).toBe(false); // theme, resize, focus
    expect(crossfades({ arrive: vite, view: modules }, { arrive: arriveKey('svelte', 2), view: people })).toBe(false);
    expect(crossfades({ view: modules }, { view: people })).toBe(false); // the static social card
  });

  it('the dashes run when focus moves onto a river, not between its buckets or on release', () => {
    expect(runsDashes(null, 'm:packages')).toBe(true);
    expect(runsDashes('m:packages', 'm:test')).toBe(true);
    expect(runsDashes('m:packages', 'm:packages')).toBe(false);
    expect(runsDashes('m:packages', null)).toBe(false);
  });

  it('keyframes: the clip opens along time; era marks fade in over the last 250 ms; dashes run forward and rest', () => {
    expect(revealFrames(false)).toEqual([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }]);
    expect(revealFrames(true)).toEqual([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }]);
    const fade = eraFadeFrames();
    expect(fade[1]!.offset! * ARRIVE_MS).toBeCloseTo(ARRIVE_MS - ERA_FADE_MS);
    expect([fade[0]!.opacity, fade[1]!.opacity, fade.at(-1)!.opacity]).toEqual([0, 0, 1]);
    expect(DASH_RUN % DASH_PERIOD).toBe(0); // whole periods: the pattern ends where it rests
    expect(dashFrames()).toEqual([{ strokeDashoffset: `${DASH_RUN}px` }, { strokeDashoffset: '0px' }]);
  });
});
