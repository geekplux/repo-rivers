import { describe, expect, it } from 'vitest';
import { repoFromSearch, withRepo } from './urlState.ts';

describe('?repo= URL state', () => {
  it('reads a valid repo and ignores invalid ones', () => {
    expect(repoFromSearch('?repo=sveltejs/svelte&sample=vite')).toEqual({ owner: 'sveltejs', name: 'svelte' });
    expect(repoFromSearch('?repo=sveltejs%2Fsvelte')).toEqual({ owner: 'sveltejs', name: 'svelte' });
    expect(repoFromSearch('?repo=not a repo')).toBeNull();
    expect(repoFromSearch('?sample=vite')).toBeNull();
  });

  it('sets ?repo=owner/name with a readable slash, keeping ?sample=, and removes it', () => {
    const ref = { owner: 'sveltejs', name: 'svelte' };
    expect(withRepo('https://x.dev/', ref)).toBe('https://x.dev/?repo=sveltejs/svelte');
    expect(withRepo('https://x.dev/?sample=express&repo=a/b', ref)).toBe('https://x.dev/?repo=sveltejs/svelte&sample=express');
    expect(withRepo('https://x.dev/?repo=a/b&sample=express', null)).toBe('https://x.dev/?sample=express');
    expect(withRepo('https://x.dev/?repo=a/b', null)).toBe('https://x.dev/');
  });
});
