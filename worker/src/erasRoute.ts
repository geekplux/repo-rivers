import { heuristicEras } from '../../src/core/eras/heuristic.ts';
import { ERA_MODEL, eraRequest } from '../../src/core/eras/prompt.ts';
import type { EraSummary } from '../../src/core/eras/summary.ts';
import { checkEras, parseEraSummary, parseNames } from '../../src/core/eras/validate.ts';
import type { Era } from '../../src/core/schema.ts';
import { dailyCap, takeBudget } from './budget.ts';
import { json } from './http.ts';
import type { KvStore } from './kv.ts';

/** The part of the Workers AI binding the route uses (lets tests pass a fake). */
export interface AiRunner {
  run(model: string, input: ReturnType<typeof eraRequest>): Promise<unknown>;
}

/** Bindings the route needs; without `AI` every answer is the heuristic; without `RIVERS_KV` (PR Previews)
 * nothing is cached and, since there is nowhere to count the daily budget, no AI call is made either. */
export interface ErasEnv {
  RIVERS_KV?: KvStore;
  AI?: AiRunner;
  /** Site-wide AI calls per UTC day (wrangler.jsonc `vars`); defaults to `DEFAULT_DAILY_AI_CAP` in budget.ts. */
  DAILY_AI_CAP?: string;
}

/** AI names are immutable per summary; KV keeps them this long. */
export const ERAS_TTL_SECONDS = 90 * 86_400;
const MAX_BODY = 4096;

/** `eras:v1:{sha256 hex of the canonical summary}`. */
export async function erasKey(summary: EraSummary): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(summary)));
  return `eras:v1:${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** One model call; null on any failure or unusable output. The output is never logged. */
async function nameWithAi(ai: AiRunner, summary: EraSummary): Promise<Era[] | null> {
  try {
    const out = await ai.run(ERA_MODEL, eraRequest(summary));
    const response = out !== null && typeof out === 'object' && 'response' in out ? out.response : out;
    return parseNames(response, summary.eras, 'ai');
  } catch {
    console.error('era naming failed');
    return null;
  }
}

/**
 * `POST /api/eras` with `{ summary }`: 400 unless the summary passes `parseEraSummary`. A KV hit answers with
 * no model call; otherwise one `env.AI.run` per new summary hash, cached for 90 days, while today's site-wide
 * budget lasts. Any failure, invalid output, a spent budget or a missing binding answers
 * `{ eras: heuristic, source: 'heuristic' }` (not cached).
 */
export async function erasRoute(request: Request, env: ErasEnv): Promise<Response> {
  let summary: EraSummary | null = null;
  try {
    if (Number(request.headers.get('content-length') ?? 0) <= MAX_BODY) {
      const text = await request.text();
      const body: unknown = text.length <= MAX_BODY ? JSON.parse(text) : null;
      if (body && typeof body === 'object' && Object.keys(body).join() === 'summary') summary = parseEraSummary((body as { summary: unknown }).summary);
    }
  } catch {
    summary = null;
  }
  if (!summary) return json({ type: 'error', code: 'invalid', message: 'Expected { summary } with a valid era summary' }, 400);
  const key = await erasKey(summary);
  const cached = env.RIVERS_KV ? await env.RIVERS_KV.get(key).catch(() => null) : null;
  if (cached) {
    try {
      const eras = checkEras(JSON.parse(cached), summary.eras);
      if (eras?.[0]?.source === 'ai') return json({ eras, source: 'ai' });
    } catch {
      // corrupt entry: name again
    }
  }
  const allowed = env.AI ? await takeBudget(env.RIVERS_KV, dailyCap(env.DAILY_AI_CAP)) : false;
  const eras = env.AI && allowed ? await nameWithAi(env.AI, summary) : null;
  if (!eras) return json({ eras: heuristicEras(summary), source: 'heuristic' });
  await env.RIVERS_KV?.put(key, JSON.stringify(eras), { expirationTtl: ERAS_TTL_SECONDS }).catch(() => console.error('KV write failed'));
  return json({ eras, source: 'ai' });
}
