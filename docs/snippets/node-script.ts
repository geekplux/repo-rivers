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
