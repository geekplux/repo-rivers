# Launch kit

> **Drafts only. Do not post until Sean approves.** Nothing in this file has been posted anywhere. Replace `<demo link>` with the hosted URL after deployment.

Assets: the social preview [`docs/social-preview.png`](social-preview.png) (1280×640), the README GIF [`docs/hero.gif`](hero.gif) and the [gallery](../examples/README.md). Regenerate them with `pnpm build && pnpm gallery`.

## Show HN

**Title:** Show HN: repo-rivers – a GitHub repo's history as rivers of folders and people

**Body:**

> I wanted to see how a codebase grew and moved, not just how many commits it had. repo-rivers draws a repository's history as a timeline-sankey: each top-level folder (or contributor) is a river that widens when it gets busy, and dashed arrows show files moving from one folder into another, such as Svelte's `test` moving into `packages` in 2023.
>
> Try it: <demo link>. Three samples (Vite, Svelte, Express) are bundled and render offline. Paste `owner/name` or a GitHub URL for any public repository; no account and no key.
>
> How it works:
> - The GitHub REST API gives the default branch's history. Small repositories are read commit by commit; larger ones are sampled with one comparison per time bucket, which caps a fetch at 55 requests (the unauthenticated limit is 60 an hour). A "sampled" badge says what was estimated.
> - Paths are mapped to folders (depth 1 to 3) and commits to contributors, then bucketed by week, month, quarter or year.
> - A pure layout function draws the ribbons in SVG. Runtime dependencies are React and React DOM.
> - Era boundaries are computed deterministically. One small model call (Workers AI) names them, from a summary of at most 2 KB with no person names and no commit messages; without it, eras get template names.
> - Colours come from a colour-vision-deficiency-tested palette, every river has a direct label, and the chart works with the keyboard and a screen reader (prose summary and data table).
>
> Limits: default branch only, sampled data for large histories, and GitHub lists at most 300 files per comparison (a move-finder fills in large reorganisations).
>
> It's MIT-licensed and runs on Cloudflare Workers. I'd like to hear which repositories tell a good story, and where the chart misleads.

## X

**Single post:**

> Paste a GitHub repo, see its history as rivers: folders widen when busy, and dashed arrows show code moving between them. Svelte's 2023 move into packages/ is one picture. No account, no key; samples work offline. <demo link>

**Thread (3 posts):**

1. > repo-rivers draws a repository's history as a timeline-sankey: one river per top-level folder or contributor, quarter by quarter. Here is Vite moving from src/node to packages/vite. <demo link> [attach docs/hero.gif]
2. > Svelte, 2016 to 2026: the Q1 2019 spike is the Svelte 3 rewrite, and in Q2 2023 dashed arrows carry 952 files from test/ and 231 from src/ into packages/. Express, 2009 to 2026: a long, steady river. [attach examples/svelte-light.png]
3. > Under the hood: the GitHub REST API (sampled to stay under the 60 requests/hour limit), a pure SVG layout, and one small cached model call that names the eras. Keyboard and screen-reader friendly, colour-blind-safe palette, MIT. Source: https://github.com/geekplux/repo-rivers

## Demo scenarios

### 1. Onboarding to Svelte

A developer joins a project built on Svelte and wants a mental map of the repository before reading code.

1. Open `<demo link>?sample=svelte`.
2. The chart shows `src` and `test` until 2023, then `packages`. The bracket *The move to packages* and the dashed arrows explain why old blog posts and issues point to paths that no longer exist.
3. Tab into the chart and press the arrow keys: the readout gives lines changed and the share of each quarter, so the busiest folders of the last year are clear.
4. Switch to **Contributors** to see who has been active recently, and open **View as table** to copy the numbers.

Takeaway in under a minute: where the code lives now, when it moved, and who to ask.

### 2. Express's long steady river

A conference speaker wants one picture of how a mature project ages.

1. Open `<demo link>?sample=express` (one bucket per year, 2009 to 2026).
2. The early years are the widest: `spec` and `docs` flow and then end, and `test` takes over.
3. After 2015 the river is narrow and steady, `lib` and `test` year after year, with a bump in 2024 around Express 5.
4. **Contributors** shows the hand-over: tj from 2009 to 2013, dougwilson from 2014, and newer maintainers in 2024.

The slide: a busy youth, then a long, steady maintenance river.

### 3. A maintainer's anniversary post

A maintainer wants an image for their project's tenth-anniversary post.

1. Paste the repository (`owner/name` or its GitHub URL). A progress line shows how far the reading has got; the result is cached in the Worker and the browser.
2. Choose **Modules** for the shape of the code, or **Contributors** to thank the people who carried each era. Bots are hidden by default.
3. Share the `?repo=owner/name` link, which reproduces the view, and take a screenshot for the post (SVG/PNG export is on the roadmap).

## Comparison with alternatives

Each tool answers a different question; several work well together. Facts below are from each project's documentation as we understand it; where we are not sure, the cell says "see project docs".

| Tool | What it shows | Setup cost | Offline / no key |
| --- | --- | --- | --- |
| **repo-rivers** | Activity per top-level folder or per contributor over the whole history (lines changed or commits per bucket), file moves between folders, and named eras. | None in the browser; `pnpm i && pnpm dev` to run locally. | Built-in samples work offline with no key. Other public repositories need network access to the GitHub API; no key is required. |
| [Gource](https://github.com/acaudwell/Gource) | An animation of the repository's file tree over time, with contributors shown as they change files. | Install a desktop program and run it in a local clone. | Works offline on a local clone; no key. |
| GitHub Insights: Contributors and Code frequency | Contributors: commits over time for the repository and its top contributors. Code frequency: additions and deletions per week for the whole repository. | None for a repository hosted on GitHub (the Insights tab). | Needs github.com; no key for public repositories. |
| [git-of-theseus](https://github.com/erikbern/git-of-theseus) | Stacked plots of the lines in the code base by the year they were added (cohorts), by author and by file extension, and survival curves of lines. | A Python package; analyse a local clone, then plot. | Works offline on a local clone; no key. |
| [Hercules](https://github.com/src-d/hercules) and labours | Line burndown (code age) for the repository, files and people, plus ownership and coupling analyses; see project docs for the full list. | A Go program (Hercules) and a Python plotter (labours). | Works offline on a local clone; no key. |
| [githubnext/repo-visualizer](https://github.com/githubnext/repo-visualizer) | A diagram of the repository's current file tree: folders as nested circles, files coloured by type. | Add it as a GitHub Action in the repository's workflows. | Runs in GitHub Actions; see project docs. |
| [githistory.xyz](https://githistory.xyz) | The history of a single file, commit by commit, with animated changes between versions. | None in the browser: swap `github.com` for `githistory.xyz` in a file's URL. Other ways to run it: see project docs. | The website needs network access; see project docs for rate limits and local use. |

Where repo-rivers fits: it looks at the whole history at the folder and contributor level, starts from a URL with no install, and shows reorganisations (files moving between folders) as part of the picture.
