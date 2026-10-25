# Extending repo-rivers

Everything that counts, samples, lays out and names eras lives in `src/core`: pure TypeScript with no DOM access, used unchanged by the browser, the Cloudflare Worker and Node 22 scripts. The public surface is [`src/core/index.ts`](../src/core/index.ts), and every export there has TSDoc. The examples on this page are type-checked copies of [`docs/snippets/`](snippets/node-script.ts) (`pnpm typecheck` covers them).

## Public API

| Step | Function | Input → output |
|---|---|---|
| Parse input | `parseRepoInput` | pasted text → `RepoRef` or `null` |
| Fetch | `fetchRepoAggregate` | `RepoRef` → `RepoAggregate` (GitHub REST, within a request budget) |
| Aggregate | `buildAggregate` | `BucketObservation[]` → `RepoAggregate` |
| Validate | `parseAggregate` | unknown JSON → `RepoAggregate`, or throws `AggregateParseError` |
| Select | `selectView` | `RepoAggregate` + options → `RiverView` (modules or contributors, depth, top N, bots) |
| Lay out | `layoutRivers` | `RiverView` + width → `RiverLayout` (SVG paths, labels, markers) |
| Eras | `segmentEras`, `summarizeForEras`, `heuristicEras` | `RepoAggregate` → era boundaries, a person-free summary, template names |

`RepoAggregate` (schema v1, [`src/core/schema.ts`](../src/core/schema.ts)) is the stored, cacheable format. `RiverView` and `RiverLayout` are derived on demand and never stored.

## Use it from a Node script

Run with the Node 22 that pnpm provides: `pnpm exec node docs/snippets/node-script.ts vitejs/vite`. Without `GITHUB_TOKEN` the fetch is unauthenticated and spends at most 55 of your 60 hourly requests.

```ts
// Fetch a repository's history from Node 22 and lay it out. Run: pnpm exec node docs/snippets/node-script.ts vitejs/vite
import { fetchRepoAggregate, layoutRivers, parseRepoInput, selectView } from '../../src/core/index.ts';

const ref = parseRepoInput(process.argv[2] ?? 'expressjs/express');
if (!ref) throw new Error('Expected owner/name or a GitHub URL');

const aggregate = await fetchRepoAggregate(ref, {
  token: process.env.GITHUB_TOKEN, // optional; without it the fetch stays within 55 requests
  onProgress: ({ done, total, label }) => console.error(`${label} (${done}/${total})`),
});

const view = selectView(aggregate, { dimension: 'modules', depth: 'auto', topN: 8 });
for (const river of view.rivers) console.log(river.label.padEnd(30), river.total, view.metric);

const layout = layoutRivers(view, {
  width: 960,
  asOf: aggregate.generatedAt,
  truncatedBuckets: aggregate.source.truncatedBuckets,
});
console.log(`${layout.rivers.length} river paths; labels dropped: ${layout.labels.dropped.join(', ') || 'none'}`);
```

To work offline, read a committed sample instead (`pnpm exec node docs/snippets/offline-sample.ts svelte`):

```ts
// Read a committed sample without any network. Run: pnpm exec node docs/snippets/offline-sample.ts svelte
import { readFileSync } from 'node:fs';
import { parseAggregate, selectView } from '../../src/core/index.ts';

const id = process.argv[2] ?? 'vite';
const aggregate = parseAggregate(JSON.parse(readFileSync(`src/samples/${id}.json`, 'utf8')));

const people = selectView(aggregate, { dimension: 'contributors', topN: 5, includeBots: false });
for (const era of aggregate.eras ?? []) {
  const range = `${people.buckets[era.start]?.label} to ${people.buckets[era.end]?.label}`;
  console.log(`${era.title} (${range}): ${era.note}`);
}
console.log('Top contributors:', people.rivers.filter((r) => r.kind !== 'other').map((r) => r.label).join(', '));
```

## Adding a built-in sample

See [CONTRIBUTING.md](../CONTRIBUTING.md#adding-a-built-in-sample). Samples are aggregates produced by `fetchRepoAggregate` and committed as JSON under 50 KB, so they render offline.

## Adding a source adapter

A source (GitLab, a local `git log`, a fixture) only has to produce `BucketObservation`s ([`src/core/commits.ts`](../src/core/commits.ts)); `buildAggregate` does the rest. The contract:

- `bucket` is an index into `time.starts`. Several observations may share a bucket; their commits and files are added up.
- `commits` are `CommitMeta`: `sha`, ISO `date`, `parents` (more than 1 marks a merge, which is not counted), `name`, `email`, and `login`/`userType` when known. The email is only hashed, never stored, and only when there is no login.
- `files` are `FileChange`s with `changes` = additions + deletions. A `renamed` file with a `previousPath` in another folder becomes a transfer. Lockfiles, build output and vendored code are ignored for you.
- `scale` (≥ 1) multiplies commit counts when you saw only part of a bucket's commits. `files` must cover the whole bucket.

A minimal adapter for a source that returns every commit with its files:

```ts
// A source adapter: turn commits from any source into BucketObservation[] and let buildAggregate do the rest.
import {
  assertEnoughHistory,
  bucketIndex,
  bucketStarts,
  buildAggregate,
  chooseUnit,
  nextStart,
  type AggregateMeta,
  type BucketObservation,
  type CommitMeta,
  type FileChange,
  type RepoAggregate,
} from '../../src/core/index.ts';

/** One commit as your source reports it, e.g. a parsed `git log --numstat` entry. */
export interface SourceCommit {
  meta: CommitMeta;
  files: FileChange[];
}

/** Every commit was read, so each becomes its own observation with `scale: 1`. */
export function aggregateCommits(commits: readonly SourceCommit[], repo: AggregateMeta['repo']): RepoAggregate {
  const times = commits.map((c) => Date.parse(c.meta.date));
  const [first, last] = [Math.min(...times), Math.max(...times)];
  const unit = chooseUnit(first, last, 24);
  const starts = bucketStarts(first, last, unit);
  const observations: BucketObservation[] = commits.map((c, i) => ({
    bucket: bucketIndex(starts, times[i]!),
    commits: [c.meta],
    files: c.files,
    scale: 1,
  }));
  const aggregate = buildAggregate(observations, {
    repo,
    generatedAt: new Date().toISOString(),
    source: {
      mode: 'full',
      authenticated: false,
      commitsTotal: commits.length,
      commitsSeen: commits.length,
      requests: 0,
      truncatedBuckets: [],
      notes: ['Read from a local clone.'],
    },
    time: {
      unit,
      starts: starts.map((s) => new Date(s).toISOString()),
      end: new Date(nextStart(starts.at(-1)!, unit)).toISOString(),
    },
  });
  assertEnoughHistory(aggregate.totals.commits.reduce((a, b) => a + b, 0), starts.length);
  return aggregate;
}
```

Put a new adapter under `src/core/<source>/`, inject `fetch` as `fetchRepoAggregate` does, and test it against recorded fixtures in `tests/fixtures/` rather than the network.

## Theming

Colours and fonts are CSS custom properties in [`src/ui/theme/tokens.css`](../src/ui/theme/tokens.css): the Radix Colors blue and slate scales, light and dark, and the roles the page uses (`--ground`, `--ink`, `--muted`, `--water-a`, `--water-b`, `--on-water`, `--line`, `--hair`, `--band`, `--solid`, `--on-solid`, `--field`, `--focus`). The dark scales apply when the system is dark and no light theme is chosen, or when dark is chosen with the header button. The font is one family, `--rr-font`; label placement measures river names with the loaded font (13 px italic 500) and falls back to about 6.3 px per character (`riverNameWidth`, passed as `measure` in `LayoutOptions`):

```css
:root {
  --rr-font: 'Iowan Old Style', Georgia, serif;
}
```

The chrome roles `--ground`, `--ink`, `--muted`, `--hair` and `--focus` must also be changed in `PALETTES` in [`src/core/palette.ts`](../src/core/palette.ts); a test keeps the two equal. Rivers carry no hue: each is `--water-a` or `--water-b` (a two-colouring in [`src/core/tones.ts`](../src/core/tones.ts)), and "other" is hatched. `pnpm test` checks that both waters have at least 3:1 contrast against `--ground`, that they differ in lightness under protanopia, deuteranopia and tritanopia simulation, and that text has at least 4.5:1.
