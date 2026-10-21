# Security policy

## Reporting a vulnerability

Please report security issues privately with [GitHub private vulnerability reporting](https://github.com/geekplux/repo-rivers/security/advisories/new) (the repository's Security tab, then "Report a vulnerability"). Do not open a public issue.

Include what you found, how to reproduce it, and the impact you expect. This is a volunteer project, so responses are best effort; we will acknowledge your report as soon as we can and agree a disclosure date with you once a fix is ready.

## Scope

- The web app and the Cloudflare Worker in this repository: `/api/repo`, `/api/eras` and `/api/health`.
- Handling of the optional `GITHUB_TOKEN` Worker secret, which must never reach a response, a log or the browser.
- The era endpoint's input validation, which must not let it act as a general-purpose model proxy.

Supported version: the latest commit on `main`. There are no released versions yet.
