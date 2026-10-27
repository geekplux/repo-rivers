import { existsSync, readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { parse } from 'yaml';

type Workflow = { jobs: Record<string, { steps: { run?: string }[] }> };

it('.github/workflows/ci.yml is valid YAML that runs every check; the old ci/ copy is gone', () => {
  const wf = parse(readFileSync('.github/workflows/ci.yml', 'utf8')) as Workflow;
  const runs = Object.values(wf.jobs).flatMap((j) => j.steps.map((s) => s.run));
  const checks = ['install --frozen-lockfile', 'lint', 'typecheck', 'test', 'build', 'check:browser --phase 1'];
  expect(runs).toEqual(expect.arrayContaining(checks.map((c) => `pnpm ${c}`)));
  expect(existsSync('ci')).toBe(false);
});
