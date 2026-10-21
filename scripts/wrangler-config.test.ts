import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

/** Parses the JSONC used by wrangler configs: drops comments outside strings, then JSON.parse. */
function readJsonc(path: string): Record<string, unknown> {
  const text = readFileSync(path, 'utf8');
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"') {
      const end = /"(?:[^"\\]|\\.)*"/y;
      end.lastIndex = i;
      const m = end.exec(text)!;
      out += m[0];
      i += m[0].length - 1;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 1;
    } else out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1')) as Record<string, unknown>;
}

it('wrangler.dev.jsonc is wrangler.jsonc minus the AI binding; dev:worker uses it, types use the deploy config', () => {
  const deploy = readJsonc('wrangler.jsonc');
  const dev = readJsonc('wrangler.dev.jsonc');
  expect(deploy.ai).toEqual({ binding: 'AI' });
  expect(dev).not.toHaveProperty('ai');
  const { ai: _ai, ...rest } = deploy;
  expect(dev).toEqual(rest);
  const scripts = (JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }).scripts;
  expect(scripts['dev:worker']).toBe('wrangler dev -c wrangler.dev.jsonc --port 8787');
  expect(scripts['types:worker']).toBe('wrangler types -c wrangler.jsonc');
  expect(scripts['check:worker']).toBe('node scripts/worker-smoke.mjs');
});

it('deploy prep: real 32-hex KV id, observability, dry-run script only, security headers', () => {
  const deploy = readJsonc('wrangler.jsonc');
  expect(deploy.kv_namespaces).toEqual([{ binding: 'RIVERS_KV', id: 'e15b4e2e25d64a9fa1ae087ef86d8a0b' }]);
  expect(deploy.observability).toEqual({ enabled: true });
  // Rate-limit namespace ids are per account; explorable (same account) uses 1001.
  expect(deploy.ratelimits).toEqual([{ name: 'API_LIMIT', namespace_id: '1002', simple: { limit: 20, period: 60 } }]);
  const scripts = (JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> }).scripts;
  expect(scripts['check:deploy']).toBe('wrangler deploy --dry-run --outdir .wrangler/dry-run');
  // Nothing that deploys can be run by accident: the only `wrangler deploy` is the dry run.
  expect(Object.keys(scripts).filter((k) => /deploy/.test(k))).toEqual(['check:deploy']);
  expect(Object.values(scripts).filter((v) => /wrangler (pages )?deploy/.test(v))).toEqual([scripts['check:deploy']]);
  const headers = readFileSync('public/_headers', 'utf8');
  expect(headers).toContain(
    "Content-Security-Policy: default-src 'self'; connect-src 'self' https://api.github.com; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'",
  );
  expect(headers).toMatch(/\/assets\/\*\n {2}Cache-Control: public, max-age=31536000, immutable/);
  expect(headers).toContain('X-Content-Type-Options: nosniff');
  expect(headers).toContain('Referrer-Policy: strict-origin-when-cross-origin');
});
