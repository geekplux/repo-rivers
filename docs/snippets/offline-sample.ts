// Read a committed sample without any network. Run: node docs/snippets/offline-sample.ts svelte
import { readFileSync } from 'node:fs';
import { parseAggregate, selectView } from '../../src/core/index.ts';

const id = process.argv[2] ?? 'vite';
const aggregate = parseAggregate(JSON.parse(readFileSync(`src/samples/${id}.json`, 'utf8')));

const people = selectView(aggregate, { dimension: 'contributors', topN: 5, includeBots: false });
for (const era of aggregate.eras ?? []) {
  const range = `${people.buckets[era.start]?.label} to ${people.buckets[era.end]?.label}`;
  console.log(`${era.title} (${range}): ${era.note}`);
}
console.log('Top contributors:', people.rivers.map((r) => r.label).join(', '));
