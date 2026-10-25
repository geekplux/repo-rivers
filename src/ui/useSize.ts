import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { riverNameWidth } from '../core/layout/guides.ts';

/** Content-box width (padding excluded) of the referenced element, measured before first paint and on every resize. */
export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pad = getComputedStyle(el);
    setWidth(el.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight));
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Live `matchMedia(query).matches`. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = matchMedia(query);
      mq.addEventListener('change', notify);
      return () => mq.removeEventListener('change', notify);
    },
    () => matchMedia(query).matches,
  );
}

const NAME_FONT = 'italic 500 13px "Alegreya Sans"';

/**
 * Width of a river name (13 px Alegreya Sans italic 500) measured on a canvas once the face has loaded, plus 2 px
 * for the italic overhang; until then, and where there is no canvas (jsdom), the gen.mjs estimate. The function
 * changes once, when the font arrives, so a layout memoised on it is laid out again with real widths.
 */
export function useNameMeasure(): (text: string) => number {
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    let live = true;
    if (typeof document !== 'undefined' && document.fonts?.load) {
      document.fonts.load(NAME_FONT).then((faces) => live && faces.length > 0 && setReady(true), () => undefined);
    }
    return () => void (live = false);
  }, []);
  return useMemo(() => {
    const ctx = ready ? document.createElement('canvas').getContext('2d') : null;
    if (!ctx) return riverNameWidth;
    ctx.font = NAME_FONT;
    const cache = new Map<string, number>();
    return (text) => cache.get(text) ?? (cache.set(text, ctx.measureText(text).width + 2), cache.get(text)!);
  }, [ready]);
}
