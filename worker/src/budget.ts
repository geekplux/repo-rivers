import type { KvStore } from './kv.ts';

/**
 * Site-wide daily cap on Workers AI calls. API_LIMIT is per IP, so many IPs (or one visitor varying the
 * summary to dodge the cache) could still run the 70B model without end; this bounds the bill per UTC day.
 * KV counters are not atomic, so the cap is soft (a burst can overshoot by a few calls). Every attempt counts,
 * failed or not (a failed call is billed too); cache hits never count.
 */
export const DEFAULT_DAILY_AI_CAP = 200;
const BUDGET_TTL_SECONDS = 2 * 86_400;

/** `budget:eras:<YYYY-MM-DD>` for the UTC day of `now`. */
export const budgetKey = (now: Date): string => `budget:eras:${now.toISOString().slice(0, 10)}`;

/** `DAILY_AI_CAP` as a whole number; anything else falls back to the default. "0" switches AI naming off. */
export function dailyCap(raw: string | undefined): number {
  return raw !== undefined && /^\d+$/.test(raw.trim()) ? Number(raw) : DEFAULT_DAILY_AI_CAP;
}

/**
 * Takes one unit of today's budget: true if the model may be called. False when it is used up, or when there is
 * no KV to count in (PR Previews fail closed, so a public preview URL cannot spend without limit).
 */
export async function takeBudget(kv: KvStore | undefined, cap: number, now = new Date()): Promise<boolean> {
  if (!kv || cap <= 0) return false;
  const key = budgetKey(now);
  let used = 0;
  try {
    used = Number.parseInt((await kv.get(key)) ?? '0', 10) || 0;
  } catch {
    console.error('budget read failed');
  }
  if (used >= cap) return false;
  await kv.put(key, String(used + 1), { expirationTtl: BUDGET_TTL_SECONDS }).catch(() => console.error('budget write failed'));
  return true;
}
