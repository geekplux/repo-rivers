import { useId } from 'react';

/** The confluence mark (DESIGN §7): two streams join and run on, a third leaves; ink blue at the source to sky at the mouth. */
export function Logo({ size = 28 }: { size?: number }) {
  const id = useId();
  return (
    <svg className="rr-logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#113264" />
          <stop offset=".55" stopColor="#0090ff" />
          <stop offset="1" stopColor="#7ce2fe" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7" fill="#0d2847" />
      <path d="M4 8.5C11 8.5 12 14 17 14.3L28 14.3L28 17.7L17 17.7C12 18 11 23.5 4 23.5L4 20.5C9 20.5 10 16.4 12.6 16C10 15.6 9 11.5 4 11.5Z" fill={`url(#${id})`} />
      <path d="M18.5 19.6C22 19.6 23.2 24 28 24L28 26C22.5 26 21 21.6 18.5 21.6Z" fill="#7ce2fe" />
    </svg>
  );
}

/** Logo and "Repo Rivers" (16/700). */
export function Wordmark() {
  return (
    <span className="rr-wordmark">
      <Logo />
      Repo Rivers
    </span>
  );
}
