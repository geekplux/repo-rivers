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
