import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

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
