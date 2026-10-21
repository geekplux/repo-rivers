// A tiny fake of the GitHub REST endpoints that `fetchRepoAggregate` uses in full mode, for browser checks
// (phase 8): `example-org/tide`, 30 commits from 2024 to 2026 with a `lib` → `src` move. Deterministic.
export const FAKE_REPO = { owner: 'example-org', name: 'tide' };

const DIRS = ['lib', 'docs', 'test', 'src/ui'];
const people = ['ada', 'lin', 'sam'];
const sha = (i) => `f${String(i).padStart(39, '0')}`;
const commits = Array.from({ length: 30 }, (_, i) => {
  const date = new Date(Date.UTC(2024, 0, 5) + i * 26 * 86_400_000).toISOString().replace('.000Z', 'Z');
  const who = people[i % 3];
  const dir = i >= 15 && DIRS[i % 4] === 'lib' ? 'src/core' : DIRS[i % 4];
  const files = [{ filename: `${dir}/file-${i % 5}.ts`, status: 'modified', changes: 20 + ((i * 37) % 90) }];
  if (i === 15) files.push(...[1, 2, 3, 4].map((k) => ({ filename: `src/core/file-${k}.ts`, previous_filename: `lib/file-${k}.ts`, status: 'renamed', changes: 0 })));
  return {
    sha: sha(i),
    commit: { author: { name: who, email: `${who}@example.invalid`, date } },
    author: { login: who, type: 'User' },
    parents: [{ sha: sha(i - 1) }],
    files,
  };
}).toReversed(); // newest first, like GitHub

export const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'accept, x-github-api-version, if-none-match, authorization',
  'access-control-expose-headers': 'Link, ETag, X-RateLimit-Remaining, X-RateLimit-Reset',
};

let remaining = 60;
/** Answers one GitHub API URL: `{ status, headers, body }`. Unknown paths are 404 like GitHub's. */
export function fakeGithub(href) {
  const url = new URL(href);
  const base = `/repos/${FAKE_REPO.owner}/${FAKE_REPO.name}`;
  remaining = Math.max(0, remaining - 1);
  const headers = { ...CORS, 'content-type': 'application/json; charset=utf-8', 'x-ratelimit-remaining': String(remaining), 'x-ratelimit-reset': '1792466700' };
  const ok = (body, extra = {}) => ({ status: 200, headers: { ...headers, ...extra }, body: JSON.stringify(body) });
  if (url.pathname === base) return ok({ name: FAKE_REPO.name, description: 'A fake repository for offline checks', default_branch: 'main' });
  if (url.pathname === `${base}/commits`) {
    const q = url.searchParams;
    const until = q.get('until') ? Date.parse(q.get('until')) : Infinity;
    const since = q.get('since') ? Date.parse(q.get('since')) : -Infinity;
    const list = commits.filter((c) => Date.parse(c.commit.author.date) <= until && Date.parse(c.commit.author.date) >= since);
    const per = Number(q.get('per_page') ?? 30);
    const page = Number(q.get('page') ?? 1);
    const last = Math.max(1, Math.ceil(list.length / per));
    const link = last > 1 ? { link: `<https://api.github.com${base}/commits?per_page=${per}&page=${last}>; rel="last"` } : {};
    return ok(list.slice((page - 1) * per, page * per).map(({ files: _files, ...c }) => c), link);
  }
  const detail = commits.find((c) => url.pathname === `${base}/commits/${c.sha}`);
  if (detail) return ok(detail);
  return { status: 404, headers, body: '{"message":"Not Found"}' };
}

/** Resets the fake rate-limit counter (one call per check run). */
export function resetFakeGithub() {
  remaining = 60;
}
