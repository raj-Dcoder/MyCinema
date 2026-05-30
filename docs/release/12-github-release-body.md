# 12 GitHub Release Body

Use this gate to prepare the GitHub release description before publishing.

The goal is to make sure the GitHub release body is meaningful and matches the approved release notes.

## Temporary File

Create:

```text
.tmp-release-body.md
```

This file must not be committed.

## Body Rules

The body must be Markdown and must describe the same release written in the top section of `RELEASE_NOTES.md`.

Include:

1. release title and version
2. meaningful feature, fix, and security sections
3. only the current release section

Do not include:

- older release sections
- the GitHub token
- secrets
- local-only artifact paths unless the user asks

## Electron Builder Note

`npm run release:publish` usually uses release metadata from the package/build configuration.

If the generated GitHub release body is empty or incomplete after publishing, use `.tmp-release-body.md` in `16-published-release-verification.md` to update the release body with the GitHub API or `gh` CLI.

## Approval Gate

Show the prepared body to the user before commit and publish work.

Report:

```text
Completed gate: 12 GitHub Release Body
Temp body path:
Body preview:
Next suggested gate: 13 Release Commit And Push
Approval needed: commit and push release candidate
```

