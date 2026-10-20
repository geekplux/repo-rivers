import { describe, expect, it } from 'vitest';
import type { FailureCode } from '../../data/loadRepo.ts';
import { errorCopy, loadingLine, resetTime } from './copy.ts';

const CODES: FailureCode[] = ['not_found', 'rate_limited', 'empty', 'too_little', 'offline', 'unavailable', 'upstream'];

describe('error copy (PLAN §3, F10)', () => {
  it('gives every state a title, one sentence and 1–2 actions', () => {
    for (const code of CODES) {
      const c = errorCopy({ code, via: 'worker' }, 'o/n');
      expect(c.title.length).toBeGreaterThan(0);
      expect(c.body).toMatch(/\.$/);
      expect(c.actions.length).toBeGreaterThanOrEqual(1);
      expect(c.actions.length).toBeLessThanOrEqual(2);
    }
  });

  it('uses the planned titles', () => {
    expect(errorCopy({ code: 'not_found', via: 'worker' }, 'o/n').title).toBe('Couldn’t find o/n');
    expect(errorCopy({ code: 'too_little', via: 'worker' }, 'o/n').title).toBe('This repo has too little history to draw');
    expect(errorCopy({ code: 'empty', via: 'worker' }, 'o/n').title).toBe('Empty repository');
    expect(errorCopy({ code: 'offline', via: 'worker' }, 'o/n').body).toMatch(/samples still work/);
  });

  it('shows the local reset time, and offers the browser only when the Worker was limited', () => {
    const worker = errorCopy({ code: 'rate_limited', via: 'worker', resetAt: '2026-10-20T12:05:00Z' }, 'o/n', 'Europe/Berlin');
    expect(worker.title).toBe('GitHub’s hourly limit reached');
    expect(worker.body).toContain('resets at 14:05');
    expect(worker.actions.map((a) => a.label)).toEqual(['Try from your browser', 'Show a sample instead']);
    const browser = errorCopy({ code: 'rate_limited', via: 'browser', resetAt: '2026-10-20T12:05:00Z' }, 'o/n', 'UTC');
    expect(browser.body).toContain('12:05');
    expect(browser.actions.map((a) => a.id)).toEqual(['sample']);
    expect(resetTime(undefined)).toBeNull();
  });
});

const at = (done: number) => loadingLine('o/n', { done, total: 51, label: '' });

describe('loadingLine', () => {
  it('changes only at 25% steps', () => {
    expect(loadingLine('o/n', null)).toBe('Reading the history of o/n');
    expect(at(1)).toBe('Reading the history of o/n · 0% of requests done');
    expect(at(12)).toBe(at(1));
    expect(at(13)).toBe('Reading the history of o/n · 25% of requests done');
    expect(at(51)).toBe('Reading the history of o/n · 100% of requests done');
  });
});
