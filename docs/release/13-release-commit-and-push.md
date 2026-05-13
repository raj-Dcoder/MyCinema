# 13 Release Commit And Push

Use this gate to commit and push the complete version changeset.

The goal is to ensure the pushed commit contains everything that should ship, not only release metadata.

## Review Changes

```powershell
git status --short
git diff --stat
git diff -- package.json package-lock.json src/renderer/src/components/WhatsNewOnboarding.tsx RELEASE_NOTES.md
```

Also inspect all source files identified in `06-change-analysis.md`.

## Complete Version Changeset

The release commit must include:

1. all app/source changes analyzed in `06-change-analysis.md` that are part of the release
2. `package.json`
3. `package-lock.json`
4. `src/renderer/src/components/WhatsNewOnboarding.tsx`
5. `RELEASE_NOTES.md`
6. any build or release configuration changes intentionally part of the release

Do not stage:

- `.env`
- `.tmp-release-body.md`
- `.release-work/`
- `node_modules/`
- `dist/`, `build/`, or `out/` unless release packaging explicitly requires them
- logs
- scratch files
- local browser/test profiles
- unrelated user work

## Stage Explicitly

Prefer explicit paths:

```powershell
git add package.json package-lock.json src/renderer/src/components/WhatsNewOnboarding.tsx RELEASE_NOTES.md
git add src/main/index.ts src/preload/index.ts src/renderer/src
```

Adjust the second command to match the actual files from `06-change-analysis.md`.

Avoid broad staging:

```powershell
git add .
git add -A
```

## Confirm Staged Files

```powershell
git diff --cached --stat
git status --short
```

Confirm no unwanted files are staged.

## Commit

Recommended release commit:

```powershell
git commit -m "Release MyCinema vX.Y.Z" -m "- Bullet from RELEASE_NOTES.md
- Bullet from RELEASE_NOTES.md
- Bullet from RELEASE_NOTES.md

Refs: RELEASE_NOTES.md"
```

Alternative when the release process has historically used this subject:

```powershell
git commit -m "Prepare release X.Y.Z"
```

If commit fails because there is nothing staged, stop and explain why.

## Push

Check branch and upstream:

```powershell
git branch --show-current
git rev-parse --abbrev-ref --symbolic-full-name @{u}
```

If the branch already tracks a remote branch:

```powershell
git push
```

If there is no upstream:

```powershell
git push -u origin <current-branch>
```

After pushing:

```powershell
git status --short --branch
git log -1 --oneline
git rev-parse --short HEAD
```

## If Push Is Rejected

If Git says the remote contains work that is not local:

```powershell
git fetch origin
git status --short --branch
git log --oneline --left-right --graph HEAD...@{u}
```

Then rebase local work on top of the remote branch:

```powershell
git pull --rebase
```

If conflicts occur:

1. open each conflicted file
2. preserve both remote changes and intended local release changes when possible
3. remove conflict markers
4. run verification again
5. continue the rebase

```powershell
git add path/to/resolved-file
git rebase --continue
npm run build
git push
```

Never force-push unless the user explicitly approves it.

## Approval Gate

Report:

```text
Completed gate: 13 Release Commit And Push
Branch:
Commit:
Remote:
Build status:
Files intentionally left uncommitted:
Next suggested gate: 14 GitHub Token
Approval needed: prepare publishing credentials
```

