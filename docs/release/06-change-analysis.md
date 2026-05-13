# 06 Change Analysis

Use this gate to understand what actually changed before writing release notes or What's New content.

The goal is to prevent invented release notes and prevent the in-app What's New section from being written blindly.

## Commands

Run targeted inspection commands:

```powershell
git diff --stat HEAD
git diff --name-status HEAD
git diff HEAD -- package.json package-lock.json src src/main src/preload src/renderer electron-builder.yml
git status --short
```

For untracked source files, inspect the actual file contents before including them in a release.

## Analysis Buckets

Summarize real changes into these buckets:

1. new features
2. bug fixes
3. UI/UX improvements
4. performance or reliability changes
5. security and privacy changes
6. developer, build, or release changes
7. breaking changes or migration notes, if any

This analysis becomes the source material for:

- `RELEASE_NOTES.md`
- in-app What's New
- commit message
- GitHub release body

## Stop Conditions

If there are no meaningful app changes, stop and tell the user there is nothing to release.

If the diff contains mixed unrelated work, separate what belongs to the release from what should remain unstaged.

## Approval Gate

Report:

```text
Completed gate: 06 Change Analysis
Release-worthy changes:
Unrelated/local changes:
Security/privacy impact:
Suggested version bump:
Next suggested gate: 07 Version Decision
Approval needed: choose release version
```

