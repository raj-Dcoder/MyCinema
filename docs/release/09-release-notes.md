# 09 Release Notes

Use this gate to update `RELEASE_NOTES.md`.

The goal is to write accurate public release notes from the real change analysis.

## File To Update

```text
RELEASE_NOTES.md
```

Add the new release section at the top of the file.

## Required Shape

```markdown
# MyCinema vX.Y.Z

One short sentence describing the release focus.

### Category Name
- **Specific Change**: Clear user-facing explanation.
- **Specific Fix**: Clear user-facing explanation.

### Security & Privacy
- **Specific Safety Note**: Explain the actual security/privacy behavior.

***
```

## Rules

1. Use `06-change-analysis.md` as the source of truth.
2. Keep wording user-facing and specific.
3. Group related changes under meaningful headings.
4. Include `Security & Privacy` whenever the release touches downloads, networking, files, external links, subtitles, browser navigation, auto-updates, backups, imports, exports, IPC, preload, main-process permissions, storage, tokens, or user data.
5. If there is no meaningful security or privacy change, omit the `Security & Privacy` section.
6. Do not use vague bullets like "various improvements" unless the diff truly cannot be summarized more specifically.
7. Do not include older release sections in the new top section.

## Evidence To Show

After editing, show the new top section only:

```powershell
Get-Content RELEASE_NOTES.md -TotalCount 80
```

Adjust the count if the new release section is longer.

## Approval Gate

Stop for user approval before applying in-app What's New.

Report:

```text
Completed gate: 09 Release Notes
Release notes draft:
Source changes represented:
Any omitted changes:
Next suggested gate: 10 What's New Onboarding
Approval needed: approve notes or request edits
```

