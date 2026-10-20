import { describe, expect, it } from 'vitest';
import { fnv1a, isBot, personOf } from './identity.ts';
import { autoDepth, collapsePrefix, isIgnored, prefixOf } from './paths.ts';

describe('bot detection', () => {
  it.each([
    [{ login: 'octo', name: 'Octo', userType: 'Bot' }, true], // GitHub type
    [{ login: 'dependabot[bot]', name: 'x' }, true], // [bot] suffix
    [{ login: 'release-bot', name: 'x' }, true],
    [{ login: 'ci_BOT', name: 'x' }, true],
    [{ name: 'bot' }, true], // no login: the name is checked
    [{ login: 'renovate', name: 'x' }, true], // known list
    [{ login: 'pre-commit-ci', name: 'x' }, true],
    [{ login: 'abbot', name: 'x' }, false],
    [{ login: 'robotics', name: 'x' }, false],
    [{ login: 'ada', name: 'renovate', userType: 'User' }, false],
  ])('%o -> %s', (c, bot) => expect(isBot(c)).toBe(bot));
});

describe('contributor ids', () => {
  it('uses the login, else a hash of the email, never the raw email', () => {
    const base = { sha: 's', date: '2024-01-01T00:00:00Z', parents: 1, name: 'Ada', email: 'Ada@Example.com ' };
    expect(personOf({ ...base, login: 'ada' })).toEqual({ id: 'ada', label: 'ada', bot: false });
    const anon = personOf(base);
    expect(anon.id).toBe(`anon:${fnv1a('ada@example.com')}`);
    expect(anon.id).toMatch(/^anon:[0-9a-f]{8}$/);
    expect(anon.label).toBe('Ada');
    expect(JSON.stringify(personOf({ ...base, name: 'ada@example.com' }))).not.toContain('@');
    expect(fnv1a('')).toBe('811c9dc5');
  });
});

describe('paths', () => {
  const ignored = ['pnpm-lock.yaml', 'packages/x/package-lock.json', 'go.sum', 'dist/index.js', 'a/build/x.js'];
  ignored.push('vendor/lib.c', 'node_modules/x/y.js', 'web/app.min.js', 'web/app.js.map', 'src/__snapshots__/a.ts.snap');
  it.each(ignored)('ignores %s', (p) => expect(isIgnored(p)).toBe(true));
  it.each(['src/build.ts', 'docs/minimal.md', 'map.ts'])('keeps %s', (p) => expect(isIgnored(p)).toBe(false));
  it('maps files to prefixes up to depth 3, root files to ""', () => {
    expect(prefixOf('README.md')).toBe('');
    expect(prefixOf('src/a.ts')).toBe('src');
    expect(prefixOf('packages/vite/src/node/x.ts')).toBe('packages/vite/src');
    expect(collapsePrefix('packages/vite/src', 2)).toBe('packages/vite');
    expect(collapsePrefix('', 1)).toBe('');
  });
  it('chooses depth 2 only when one container holds > 50% of the weight', () => {
    expect(autoDepth(['packages/a', 'packages/b', 'docs'], [30, 30, 40])).toBe(2);
    expect(autoDepth(['src', 'docs', 'test'], [50, 30, 20])).toBe(1);
    expect(autoDepth(['lib/a', 'lib/b'], [90, 10])).toBe(1); // lib is not a container
  });
});
