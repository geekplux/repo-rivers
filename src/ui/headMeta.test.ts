import { describe, expect, it } from 'vitest';
import { parseAggregate } from '../core/schema.ts';
import { selectView } from '../core/view.ts';
import express from '../samples/express.json';
import vite from '../samples/vite.json';
import { metaLine, sourceLabel } from './headMeta.ts';

const VITE = parseAggregate(vite);
const EXPRESS = parseAggregate(express);

describe('chart head meta', () => {
  it('names the measure, the bucket unit and the span, as one sentence', () => {
    expect(metaLine(VITE, selectView(VITE, { dimension: 'modules' }))).toBe('Lines changed per quarter, Apr 2020 to Oct 2026.');
    expect(metaLine(VITE, selectView(VITE, { dimension: 'contributors' }))).toBe('Commits per quarter, Apr 2020 to Oct 2026.');
    expect(metaLine(EXPRESS, selectView(EXPRESS, { dimension: 'contributors' }))).toBe('Commits per year, Jan 2009 to Oct 2026.');
  });

  it('says how much of the history was read', () => {
    expect(sourceLabel(VITE.source)).toBe('Estimated from 6,310 of 9,799 commits');
    expect(sourceLabel({ ...VITE.source, mode: 'full', commitsSeen: 1200, commitsTotal: 1200 })).toBe('Read from all 1,200 commits');
    expect(sourceLabel({ ...VITE.source, mode: 'synthetic' })).toBe('Synthetic data');
  });

  it('uses no middle dot', () => {
    expect(metaLine(VITE, selectView(VITE, { dimension: 'modules' })) + sourceLabel(VITE.source)).not.toContain('·');
  });
});
