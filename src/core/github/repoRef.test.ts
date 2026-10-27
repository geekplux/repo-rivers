import { describe, expect, it } from 'vitest';
import { parseRepoInput } from './repoRef.ts';

const SVELTE = { owner: 'sveltejs', name: 'svelte' };

describe('parseRepoInput', () => {
  it.each([
    'sveltejs/svelte',
    '  sveltejs/svelte  ',
    'https://github.com/sveltejs/svelte',
    'http://www.github.com/sveltejs/svelte/',
    'github.com/sveltejs/svelte',
    'https://github.com/sveltejs/svelte/tree/main/packages/svelte',
    'https://github.com/sveltejs/svelte.git',
    'https://github.com/sveltejs/svelte?tab=readme#top',
    'git@github.com:sveltejs/svelte.git',
    'git@github.com:sveltejs/svelte',
  ])('accepts %s', (input) => expect(parseRepoInput(input)).toEqual(SVELTE));

  it('keeps dots, dashes and underscores in names', () => {
    expect(parseRepoInput('geekplux/repo-rivers')).toEqual({ owner: 'geekplux', name: 'repo-rivers' });
    expect(parseRepoInput('vercel/next.js')).toEqual({ owner: 'vercel', name: 'next.js' });
  });

  it.each([
    '',
    'svelte',
    'sveltejs/svelte/extra',
    'https://gitlab.com/sveltejs/svelte',
    'https://github.com/sveltejs',
    'https://evil.example/github.com/sveltejs/svelte',
    'ftp://github.com/sveltejs/svelte',
    '-bad/name',
    'owner/..',
    'own er/name',
    'a'.repeat(40) + '/name',
    'owner/' + 'n'.repeat(101),
    'git@gitlab.com:sveltejs/svelte.git',
  ])('rejects %j', (input) => expect(parseRepoInput(input)).toBeNull());
});
