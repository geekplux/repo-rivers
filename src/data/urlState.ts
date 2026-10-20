import { parseRepoInput, type RepoRef } from '../core/github/repoRef.ts';

/** The repository in `?repo=owner/name`, if valid. */
export function repoFromSearch(search: string): RepoRef | null {
  const value = new URLSearchParams(search).get('repo');
  return value ? parseRepoInput(value) : null;
}

/** `href` with `?repo=owner/name` set (a readable, unescaped slash) or removed; other parameters are kept. */
export function withRepo(href: string, ref: RepoRef | null): string {
  const url = new URL(href);
  url.searchParams.delete('repo');
  const rest = url.searchParams.toString();
  const repo = ref ? `repo=${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.name)}` : '';
  url.search = [repo, rest].filter(Boolean).join('&');
  return url.toString();
}
