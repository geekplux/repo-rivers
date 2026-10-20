import { describe, expect, it } from 'vitest';
import demo from '../samples/demo.json' with { type: 'json' };
import { AggregateParseError, parseAggregate } from './schema.ts';
import { samples } from '../samples/index.ts';

const clone = (): Record<string, any> => structuredClone(demo) as Record<string, any>;

function expectRejects(mutate: (a: Record<string, any>) => void, path: string): void {
  const a = clone();
  mutate(a);
  let err: unknown;
  try {
    parseAggregate(a);
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(AggregateParseError);
  expect((err as AggregateParseError).path).toBe(path);
}

describe('parseAggregate', () => {
  it('accepts the synthetic demo sample', () => {
    const agg = parseAggregate(clone());
    expect(agg.source.mode).toBe('synthetic');
    expect(agg.time.unit).toBe('month');
    expect(agg.time.starts).toHaveLength(24);
    expect(agg.paths.prefixes).toHaveLength(5);
    expect(agg.paths.transfers).toHaveLength(1);
    expect(agg.contributors.people).toHaveLength(4);
  });

  it('loads the demo through the sample registry', async () => {
    const entry = samples.find((s) => s.id === 'demo');
    expect(entry?.title).toBe('Demo (synthetic)');
    await expect(entry!.load()).resolves.toMatchObject({ schemaVersion: 1 });
  });

  it('rejects non-objects', () => {
    expect(() => parseAggregate(null)).toThrow(AggregateParseError);
    expect(() => parseAggregate([])).toThrow(AggregateParseError);
  });

  it('rejects a wrong schemaVersion', () => {
    expectRejects((a) => (a.schemaVersion = 2), 'schemaVersion');
    expectRejects((a) => delete a.schemaVersion, 'schemaVersion');
  });

  it('rejects array lengths that do not match the bucket count', () => {
    expectRejects((a) => a.totals.commits.pop(), 'totals.commits');
    expectRejects((a) => a.paths.weights[2].push(1), 'paths.weights[2]');
    expectRejects((a) => a.contributors.commits.pop(), 'contributors.commits');
    expectRejects((a) => a.paths.weights.pop(), 'paths.weights');
  });

  it('rejects negative, NaN or infinite weights', () => {
    expectRejects((a) => (a.paths.weights[1][3] = -1), 'paths.weights[1][3]');
    expectRejects((a) => (a.paths.weights[0][0] = Number.NaN), 'paths.weights[0][0]');
    expectRejects((a) => (a.contributors.commits[0][5] = Infinity), 'contributors.commits[0][5]');
    expectRejects((a) => (a.totals.commits[0] = '3'), 'totals.commits[0]');
  });

  it('rejects out-of-range transfer indices', () => {
    expectRejects((a) => (a.paths.transfers[0].from = 5), 'paths.transfers[0].from');
    expectRejects((a) => (a.paths.transfers[0].to = -1), 'paths.transfers[0].to');
    expectRejects((a) => (a.paths.transfers[0].bucket = 24), 'paths.transfers[0].bucket');
    expectRejects((a) => (a.paths.transfers[0].from = 1.5), 'paths.transfers[0].from');
  });

  it('rejects bad time axes', () => {
    expectRejects((a) => (a.time.starts = []), 'time.starts');
    expectRejects((a) => (a.time.starts = a.time.starts.toReversed()), 'time.starts[1]');
    expectRejects((a) => (a.time.end = a.time.starts[0]), 'time.end');
    expectRejects((a) => (a.time.unit = 'day'), 'time.unit');
  });

  it('validates optional eras and source fields', () => {
    const ok = clone();
    ok.eras = [{ start: 0, end: 11, title: 'Early', note: 'n', source: 'heuristic' }];
    expect(parseAggregate(ok).eras).toHaveLength(1);
    expectRejects((a) => (a.eras = [{ start: 5, end: 2, title: 't', note: 'n', source: 'ai' }]), 'eras[0].end');
    expectRejects((a) => (a.source.truncatedBuckets = [30]), 'source.truncatedBuckets[0]');
    expectRejects((a) => (a.source.mode = 'guess'), 'source.mode');
    expectRejects((a) => (a.contributors.people[3].bot = 'yes'), 'contributors.people[3].bot');
  });
});
