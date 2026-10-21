import { erasRoute, type AiRunner } from './erasRoute.ts';
import { json } from './http.ts';
import { repoRoute, type RouteDeps } from './repoRoute.ts';

/** Generated bindings (`wrangler types`) plus the optional secret; `AI` may be absent (local dev, tests), and
 * `RIVERS_KV` is absent in PR Previews (wrangler.jsonc `previews`), which then run uncached. */
export interface WorkerEnv extends Omit<Env, 'API_LIMIT' | 'AI' | 'RIVERS_KV'> {
  RIVERS_KV?: Env['RIVERS_KV'];
  GITHUB_TOKEN?: string;
  AI?: AiRunner;
  /** Absent in unit tests; enforced by `wrangler dev` and in production. */
  API_LIMIT?: Env['API_LIMIT'];
}

const LIMIT_WINDOW_S = 60;

/** Routes `/api/*` (assets are served before the Worker runs for every other path). */
export async function handle(request: Request, env: WorkerEnv, ctx: Pick<ExecutionContext, 'waitUntil'>, deps?: RouteDeps): Promise<Response> {
  const { pathname } = new URL(request.url);
  const method = pathname === '/api/eras' ? 'POST' : 'GET';
  if (request.method !== method) return json({ type: 'error', code: 'invalid', message: `Only ${method} is supported` }, 405, { allow: method });
  if (env.API_LIMIT) {
    const ip = request.headers.get('cf-connecting-ip') ?? 'local';
    if (!(await env.API_LIMIT.limit({ key: ip })).success) {
      const resetAt = new Date(Date.now() + LIMIT_WINDOW_S * 1000).toISOString();
      const message = 'Too many requests to this site; try again in a minute';
      return json({ type: 'error', code: 'too_many_requests', message, resetAt }, 429, { 'retry-after': String(LIMIT_WINDOW_S) });
    }
  }
  if (pathname === '/api/eras') return erasRoute(request, env);
  if (pathname === '/api/health') return json({ ok: true, ai: Boolean(env.AI), token: Boolean(env.GITHUB_TOKEN) });
  const m = /^\/api\/repo\/([^/]+)\/([^/]+)\/?$/.exec(pathname);
  if (m) {
    let owner: string, name: string;
    try {
      [owner, name] = [decodeURIComponent(m[1]!), decodeURIComponent(m[2]!)];
    } catch {
      [owner, name] = ['', ''];
    }
    const { response, done } = repoRoute(owner, name, env, deps);
    ctx.waitUntil(done);
    return response;
  }
  return json({ type: 'error', code: 'not_found', message: 'No such API route' }, 404);
}

export default {
  fetch: (request, env, ctx) => handle(request, env, ctx),
} satisfies ExportedHandler<WorkerEnv>;
