const IGNORED_FILES = new Set(
  'pnpm-lock.yaml package-lock.json yarn.lock Cargo.lock go.sum composer.lock Gemfile.lock poetry.lock'.split(' '),
);
const IGNORED_DIRS = new Set(['dist', 'build', 'vendor', 'node_modules', '__snapshots__']);
const CONTAINERS = new Set(['packages', 'apps', 'crates', 'libs', 'modules', 'plugins', 'src']);

/** Maximum lines changed counted per file per bucket. */
export const FILE_CAP = 2000;

/** Prefixes are stored to this depth and collapsed by the view. */
export const MAX_DEPTH = 3;

/** True for lockfiles, build output, vendored code, minified files, source maps and snapshots. */
export function isIgnored(path: string): boolean {
  const parts = path.split('/');
  const file = parts.pop() ?? '';
  return IGNORED_FILES.has(file) || parts.some((d) => IGNORED_DIRS.has(d)) || /\.min\.|\.(map|snap)$/.test(file);
}

/** The directory of `path`, truncated to `depth` segments; root files give `""`. */
export function prefixOf(path: string, depth: number = MAX_DEPTH): string {
  return path.split('/').slice(0, -1).slice(0, depth).join('/');
}

/** Truncates a stored prefix to `depth` segments (`""` stays `""`). */
export function collapsePrefix(prefix: string, depth: number): string {
  return prefix.split('/').slice(0, depth).join('/');
}

/** 2 when one container directory (`packages`, `src`, …) holds more than half the weight, else 1. */
export function autoDepth(prefixes: readonly string[], totals: readonly number[]): 1 | 2 {
  const all = totals.reduce((a, b) => a + b, 0);
  const byTop = new Map<string, number>();
  prefixes.forEach((p, i) => {
    const top = collapsePrefix(p, 1);
    if (CONTAINERS.has(top)) byTop.set(top, (byTop.get(top) ?? 0) + (totals[i] ?? 0));
  });
  return [...byTop.values()].some((w) => w > all / 2) ? 2 : 1;
}
