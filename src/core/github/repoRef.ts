/** A GitHub repository, as `owner/name`. */
export interface RepoRef {
  owner: string;
  name: string;
}

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const NAME = /^[A-Za-z0-9._-]{1,100}$/;
const URL_FORM = /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/?#]+)\/([^/?#]+)(?:[/?#].*)?$/i;
const SSH_FORM = /^git@github\.com:([^/]+)\/([^/]+)$/i;
const BARE_FORM = /^([^/:@\s]+)\/([^/:@\s]+)$/;

/**
 * Parses what a user pastes: `owner/name`, `https://github.com/owner/name` (with or without a trailing
 * `/tree/…`, query or `.git`) or `git@github.com:owner/name.git`. Returns `null` for anything else, so
 * the UI can show an inline error without making a request.
 */
export function parseRepoInput(input: string): RepoRef | null {
  const text = input.trim();
  const m = URL_FORM.exec(text) ?? SSH_FORM.exec(text) ?? BARE_FORM.exec(text);
  if (!m) return null;
  const owner = m[1]!;
  const name = m[2]!.replace(/\.git$/i, '');
  if (!OWNER.test(owner) || !NAME.test(name) || name === '.' || name === '..') return null;
  return { owner, name };
}
