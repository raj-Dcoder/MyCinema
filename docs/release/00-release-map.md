# 00 Release Map

This is the map for moving MyCinema from coding to a published release.

The process is intentionally numbered. The number tells the user and the agent where the release is, what has been completed, and what must not happen yet.

## Tracking Policy

Commit and track these files:

- `docs/release/*.md`
- `RELEASE_NOTES.md`
- source, config, and package files that intentionally belong to a release

Do not commit temporary working files:

- `.release-work/`
- `.tmp-release-body.md`
- local logs, profiles, packaged output, secrets, or machine-specific files

Reason: the reusable process belongs in Git so future agents follow the same rules. Per-release scratch records can contain local observations, draft notes, artifact paths, or pre-approval text, so they should stay local unless the user explicitly asks to archive them in the repo.

## Core Rule

Never run the full release process blindly.

The agent must complete one numbered file, show evidence, and stop at the approval gate. Continue only when the user explicitly asks to proceed to the next numbered file.

## Sequence

1. `01-work-planning.md` - define the intended code change before implementation.
2. `02-coding-standards.md` - make code changes safely and consistently.
3. `03-developer-verification.md` - verify the code before release preparation.
4. `04-release-record.md` - create or update the local release record.
5. `05-release-preflight.md` - inspect Git state and repository readiness.
6. `06-change-analysis.md` - analyze real changes since the last release point.
7. `07-version-decision.md` - choose the next semantic version.
8. `08-version-files.md` - update package version files.
9. `09-release-notes.md` - update `RELEASE_NOTES.md`.
10. `10-whats-new-onboarding.md` - draft and apply the in-app What's New content.
11. `11-local-release-verification.md` - run build and consistency checks.
12. `12-github-release-body.md` - prepare the GitHub release description.
13. `13-release-commit-and-push.md` - commit and push the complete version changeset.
14. `14-github-token.md` - load `GH_TOKEN` from the Windows User environment.
15. `15-package-and-publish.md` - package and publish the GitHub release.
16. `16-published-release-verification.md` - verify the published GitHub release.
17. `17-final-report-and-post-release.md` - produce the final release report.

## Non-Negotiable Rules

1. Work from the repository root.
2. Do not print, paste, commit, or store the real GitHub token anywhere.
3. Use the saved Windows User environment variable named `GH_TOKEN`; do not ask the user to paste the token into chat.
4. Do not revert unrelated local changes unless the user explicitly asks.
5. Do not invent release notes. Every feature, fix, security note, or behavior change must come from the actual diff or existing project context.
6. Do not publish a GitHub release until `npm run build` passes.
7. Do not publish a GitHub release until these all agree on the same version:
   - `package.json`
   - `package-lock.json`
   - `src/renderer/src/components/WhatsNewOnboarding.tsx` `LATEST_RELEASE.version`
   - top section of `RELEASE_NOTES.md`
   - GitHub release tag, title, and body
8. The release commit must include the complete version changeset: all feature code, bug-fix code, improvement code, new files, removed files, version bump, release notes, and in-app What's New update together.
9. Stage only files that belong to the release. If unrelated user changes exist, leave them unstaged.

## Gate Report Format

At the end of every numbered file, report:

```text
Completed gate:
Commands run:
Files changed:
Evidence:
Risks or warnings:
Next suggested gate:
Approval needed:
```

Then stop.

