import type { CommitMeta } from './commits.ts';
import type { Person } from './schema.ts';

const KNOWN = 'dependabot renovate github-actions greenkeeper allcontributors pre-commit-ci codecov';
const KNOWN_BOTS = new Set(KNOWN.split(' '));

/** 32-bit FNV-1a of the UTF-8 bytes, as 8 hex digits. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) h = Math.imul(h ^ byte, 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Bot rules: GitHub type `Bot`, `…[bot]`, `…-bot`/`…_bot`/`bot`, or a known automation account. */
export function isBot(c: Pick<CommitMeta, 'login' | 'name' | 'userType'>): boolean {
  const handle = (c.login ?? c.name).trim().toLowerCase();
  return c.userType === 'Bot' || handle.endsWith('[bot]') || /(^|[-_])bot$/.test(handle) || KNOWN_BOTS.has(handle);
}

/** The contributor of a commit: id = login, else `anon:<fnv1a(email)>`. Never exposes the email. */
export function personOf(c: CommitMeta): Person {
  const id = c.login ?? `anon:${fnv1a(c.email.trim().toLowerCase())}`;
  const label = c.login ?? (c.name.includes('@') || !c.name.trim() ? id : c.name.trim());
  return { id, label, bot: isBot(c) };
}
