// Documentation guards (PLAN phase 10): TSDoc on the public core API, relative links in Markdown, and
// EXTENDING.md examples that are verbatim copies of the type-checked files in docs/snippets/.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aggregateCommits } from '../docs/snippets/adapter.ts';
import { parseAggregate } from '../src/core/index.ts';

const read = (file: string): string => readFileSync(file, 'utf8');

/** True when the nearest non-blank line above `i` closes a `/** … *\/` block. */
const documented = (lines: readonly string[], i: number): boolean => {
  let j = i - 1;
  while (j >= 0 && lines[j]!.trim() === '') j--;
  if (!lines[j]?.trim().endsWith('*/')) return false;
  while (j >= 0 && !lines[j]!.includes('/*')) j--;
  return lines[j]?.trim().startsWith('/**') ?? false;
};

describe('TSDoc on src/core/index.ts', () => {
  const INDEX = 'src/core/index.ts';
  const source = read(INDEX);
  const statements = [...source.matchAll(/^export\s+(?:type\s+)?(\*|\{[^}]*\})\s+from\s+'([^']+)';/gm)];
  const DECL = /^export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|function|interface|type|class|enum)\s+([A-Za-z0-9_$]+)/;

  it('has a /** comment before every export statement', () => {
    const lines = source.split('\n');
    const exports = lines.flatMap((line, i) => (line.startsWith('export ') ? [i] : []));
    expect(exports.length).toBe(statements.length);
    expect(exports.filter((i) => !documented(lines, i)).map((i) => lines[i])).toEqual([]);
  });

  it('every re-exported declaration has TSDoc at its source', () => {
    const missing: string[] = [];
    for (const [, what, from] of statements) {
      const file = join(dirname(INDEX), from!);
      const lines = read(file).split('\n');
      const names = what === '*' ? null : what!.slice(1, -1).split(',').map((s) => s.trim().replace(/^type\s+/, '')).filter(Boolean);
      const declared = new Map(lines.flatMap((line, i) => (DECL.test(line) ? [[DECL.exec(line)![1]!, i] as const] : [])));
      for (const name of names ?? declared.keys()) {
        const at = declared.get(name);
        if (at === undefined) missing.push(`${file}: ${name} is not declared with \`export\``);
        else if (!documented(lines, at)) missing.push(`${file}:${at + 1} ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

/** Markdown files of the repo, outside dependencies and build output. */
function markdownFiles(dir = '.'): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return ['node_modules', '.git', 'dist', '.wrangler', '.cache', 'screenshots'].includes(e.name) ? [] : markdownFiles(path);
    return e.name.endsWith('.md') ? [path] : [];
  });
}

/** GitHub's heading anchors: lowercase, punctuation dropped, spaces to hyphens. */
const slug = (heading: string): string =>
  heading.trim().toLowerCase().replace(/`/g, '').replace(/[^\p{L}\p{N} _-]/gu, '').replace(/ /g, '-');
const anchors = (markdown: string): Set<string> =>
  new Set([...markdown.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => slug(m[1]!)));
/** Text without fenced code blocks and inline code, where link syntax is not a link. */
const prose = (markdown: string): string => markdown.replace(/^```[\s\S]*?^```/gm, '').replace(/`[^`\n]*`/g, '');

describe('Markdown links', () => {
  const files = markdownFiles();

  it('covers the documentation files', () => {
    for (const f of ['README.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'docs/EXTENDING.md', 'docs/GOOD_FIRST_ISSUES.md']) {
      expect(files).toContain(normalize(f));
    }
  });

  it.each(files)('%s: relative links and images resolve', (file) => {
    const text = prose(read(file));
    const targets = [
      ...[...text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map((m) => m[1]!),
      ...[...text.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]!),
    ];
    const broken = targets
      .filter((t) => !/^(?:[a-z]+:|\/\/)/i.test(t))
      .filter((t) => {
        const [path, hash] = t.split('#') as [string, string | undefined];
        const target = path ? normalize(join(dirname(file), decodeURI(path))) : file;
        if (!existsSync(target)) return true;
        return hash !== undefined && target.endsWith('.md') && !anchors(read(target)).has(hash);
      });
    expect(broken).toEqual([]);
  });
});

describe('docs/EXTENDING.md examples', () => {
  const doc = read('docs/EXTENDING.md');
  const snippets = readdirSync('docs/snippets').map((f) => read(join('docs/snippets', f)));

  it('every ts block is a verbatim copy of a type-checked file in docs/snippets', () => {
    const blocks = [...doc.matchAll(/^```ts\n([\s\S]*?)^```/gm)].map((m) => m[1]!);
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    expect(blocks.filter((b) => !snippets.some((s) => s.includes(b)))).toEqual([]);
  });

  it('every CSS custom property it mentions exists in tokens.css', () => {
    const tokens = read('src/ui/theme/tokens.css');
    const named = [...new Set([...doc.matchAll(/--rr-[\w-]+/g)].map((m) => m[0]))].filter((t) => !t.endsWith('-'));
    expect(named.filter((t) => !tokens.includes(`${t}:`))).toEqual([]);
  });

  it('the offline example runs on a committed sample', () => {
    const run = spawnSync(process.execPath, ['docs/snippets/offline-sample.ts', 'express'], { encoding: 'utf8' });
    expect(run.stderr).toBe('');
    expect(run.stdout).toMatch(/^Top contributors: tj, dougwilson/m);
  });

  it('the adapter example builds a valid aggregate', () => {
    const commits = Array.from({ length: 12 }, (_, i) => ({
      meta: { sha: `c${i}`, date: new Date(Date.UTC(2024, i, 15)).toISOString(), parents: 1, login: i % 2 ? 'ada' : 'lin', name: 'x', email: 'x@example.org' },
      files: [{ path: i < 6 ? 'src/a.ts' : 'lib/a.ts', status: 'modified' as const, changes: 10 + i }],
    }));
    const agg = aggregateCommits(commits, { owner: 'example-org', name: 'tide', defaultBranch: 'main', headSha: 'c11' });
    expect(parseAggregate(JSON.parse(JSON.stringify(agg)))).toEqual(agg);
    expect([agg.time.unit, agg.totals.commits.reduce((a, b) => a + b, 0), agg.paths.prefixes]).toEqual(['month', 12, ['lib', 'src']]);
  });
});
