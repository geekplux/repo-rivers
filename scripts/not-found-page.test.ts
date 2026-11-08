// The page an unknown path gets, and the home page's canonical. Workers static assets answer any path that is not a
// file with dist/404.html at status 404 (`not_found_handling: "404-page"`), so a made-up URL no longer passes for a
// second copy of the home page (it used to get index.html with 200).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NOT_FOUND_TITLE, notFoundHtml, notFoundPage } from './not-found-page.ts';

const index = readFileSync('index.html', 'utf8');
const homeTitle = /<title>([^<]*)<\/title>/.exec(index)?.[1];

describe('home page', () => {
  it('names its absolute canonical URL once', () => {
    expect(index.match(/rel="canonical"/g)).toHaveLength(1);
    expect(index).toContain('<link rel="canonical" href="https://reporivers.geekplux.com/" />');
  });
});

describe('404 page', () => {
  const page = notFoundHtml(index, NOT_FOUND_TITLE);

  it('has its own title, not the home page title', () => {
    expect(homeTitle).toBe('Repo Rivers');
    expect(page).toContain(`<title>${NOT_FOUND_TITLE}</title>`);
    expect(page).not.toContain(`<title>${homeTitle}</title>`);
  });

  it('is noindex and names no canonical', () => {
    expect(page).toContain('<meta name="robots" content="noindex" />');
    expect(page).not.toContain('rel="canonical"');
  });

  it('keeps the rest of the shell (the app still opens on a mistyped link)', () => {
    expect(page).toContain('<script type="module" src="/src/main.tsx"></script>');
    expect(page).toContain('<script src="/theme.js"></script>');
  });

  it('refuses a shell without a title', () => {
    expect(() => notFoundHtml('<html><head></head></html>', NOT_FOUND_TITLE)).toThrow('no <title>');
  });

  it('is emitted as 404.html next to index.html, and only where there is an index.html', () => {
    const emitted: { fileName: string; source: string }[] = [];
    const hook = notFoundPage().generateBundle as { handler: (...args: unknown[]) => void };
    const ctx = { emitFile: (file: { fileName: string; source: string }) => emitted.push(file) };
    hook.handler.call(ctx, {}, {});
    expect(emitted).toEqual([]);
    hook.handler.call(ctx, {}, { 'index.html': { type: 'asset', source: index } });
    expect(emitted.map((file) => file.fileName)).toEqual(['404.html']);
    expect(emitted[0]!.source).toContain(`<title>${NOT_FOUND_TITLE}</title>`);
  });

  it('is what both wrangler configs serve for an unknown path', () => {
    for (const config of ['wrangler.jsonc', 'wrangler.dev.jsonc']) {
      const text = readFileSync(config, 'utf8');
      expect(text).toMatch(/"not_found_handling":\s*"404-page"/);
      expect(text).not.toContain('single-page-application');
    }
  });
});
