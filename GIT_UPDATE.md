# Git Update Workflow

This file is the required end-to-end workflow for an AI agent updating the local MyCinema codebase to GitHub. The agent must follow these steps carefully so the user does not need to run Git commands manually.

## Purpose

- Review all local code changes safely.
- Verify the project before committing.
- Use `RELEASE_NOTES.md` as the source for the commit message.
- Commit only the intended files.
- Push the completed update to the configured GitHub remote.
- Avoid overwriting or deleting user work.

## Agent Rules

1. Never use destructive commands such as `git reset --hard`, `git clean -fd`, or `git checkout -- <file>` unless the user explicitly asks for that exact action.
2. Never commit secrets, API keys, local environment files, generated caches, temporary profiles, or unrelated machine-specific files.
3. Treat existing uncommitted changes as user work unless you created them during the current task.
4. Stage only files that belong to the requested update.
5. Read `RELEASE_NOTES.md` before creating the commit message.
6. Run verification before committing whenever the project has available scripts.
7. If a command fails, diagnose the error and fix the underlying issue before continuing.
8. After a successful push, report the branch, commit hash, and remote destination to the user.

## Preflight Checks

Run these commands from the repository root:

```bash
git rev-parse --show-toplevel
git status --short --branch
git remote -v
git branch --show-current
```

Confirm the working directory is the MyCinema repository and the remote points to the expected GitHub repository.

## Inspect Local Changes

Review the changed files before staging anything:

```bash
git status --short
git diff --stat
git diff -- . ':!package-lock.json'
```

If `package-lock.json` changed, inspect it separately:

```bash
git diff -- package-lock.json
```

Check for untracked files:

```bash
git ls-files --others --exclude-standard
```

Do not stage files such as:

- `.env`
- `.tmp-*`
- `node_modules/`
- `dist/`, `build/`, `out/` unless release packaging explicitly requires them
- log files
- scratch files
- local browser or test profiles

## Verify Release Notes

Open and read `RELEASE_NOTES.md`.

Use the latest top section as the main source for:

- release version
- user-facing summary
- commit subject
- commit body bullets

If release notes are missing, outdated, or do not describe the current code changes, update `RELEASE_NOTES.md` before committing.

Recommended commit message format:

```text
Release MyCinema vX.Y.Z

- Summary bullet from RELEASE_NOTES.md
- Summary bullet from RELEASE_NOTES.md
- Summary bullet from RELEASE_NOTES.md

Refs: RELEASE_NOTES.md
```

For small non-release fixes, use:

```text
Update MyCinema workflow

- Brief description of the change
- Brief description of verification

Refs: RELEASE_NOTES.md
```

## Dependency Check

Do not run `npm install` during a normal Git update. MyCinema already has a committed `package-lock.json`, and dependency installation is not required just to review, commit, and push code changes.

Run `npm install` only when one of these is true:

- `node_modules/` is missing and verification cannot run.
- `package.json` changed.
- `package-lock.json` changed.
- The build fails because an installed package is missing.

If `npm install` is required, run it once, then review any lockfile changes before staging:

```bash
npm install
git diff -- package-lock.json
```

## Run Verification

Use the MyCinema build script before committing:

```bash
npm run build
```

Optional deeper packaging verification:

```bash
npm run pack
```

Run `npm run pack` or `npm run dist` only when the user specifically asks for packaging verification or a distributable release build. These commands can take longer and may create large local artifacts.

If verification fails:

1. Read the error carefully.
2. Fix the code or configuration issue.
3. Re-run the failed command.
4. Continue only after verification passes or after clearly documenting why the failure is unrelated and cannot be fixed in the current task.

## Stage Intended Files

Stage files explicitly instead of using broad staging.

Preferred:

```bash
git add path/to/file1 path/to/file2 RELEASE_NOTES.md
```

Acceptable only after careful review:

```bash
git add -p
```

Avoid:

```bash
git add .
git add -A
```

After staging, verify the staged set:

```bash
git status --short
git diff --cached --stat
git diff --cached
```

Confirm no unwanted files are staged.

## Commit

Create the commit using a message based on `RELEASE_NOTES.md`:

```bash
git commit -m "Release MyCinema vX.Y.Z" -m "- Bullet from release notes
- Bullet from release notes
- Bullet from release notes

Refs: RELEASE_NOTES.md"
```

After commit:

```bash
git status --short --branch
git log -1 --oneline
```

Save the short commit hash for the final report.

## Push To GitHub

Check branch and upstream:

```bash
git branch --show-current
git rev-parse --abbrev-ref --symbolic-full-name @{u}
```

If the branch already tracks a remote branch:

```bash
git push
```

If there is no upstream:

```bash
git push -u origin <current-branch>
```

After pushing:

```bash
git status --short --branch
git log -1 --oneline
```

Confirm the local branch is clean and in sync with the remote.

## If Push Is Rejected

If Git says the remote contains work that is not local:

```bash
git fetch origin
git status --short --branch
git log --oneline --left-right --graph HEAD...@{u}
```

Then rebase local work on top of the remote branch:

```bash
git pull --rebase
```

If conflicts occur:

1. Open each conflicted file.
2. Preserve both the remote changes and the intended local changes when possible.
3. Remove conflict markers.
4. Run verification again.
5. Continue the rebase:

```bash
git add path/to/resolved-file
git rebase --continue
```

When the rebase finishes:

```bash
npm run build
git push
```

Never force-push unless the user explicitly approves it.

## Final Agent Report

After the push succeeds, report:

- branch name
- commit hash
- commit subject
- remote pushed to
- verification command results
- any files intentionally left uncommitted

Example:

```text
Pushed to GitHub successfully.

Branch: master
Commit: abc1234 Release MyCinema vX.Y.Z
Remote: origin/master
Verified: npm run build passed
Left uncommitted: none
```

## Quick Command Checklist

Use this checklist for normal updates:

```bash
git status --short --branch
git remote -v
git diff --stat
git diff
npm run build
git add <intended-files>
git diff --cached --stat
git diff --cached
git commit -m "Release MyCinema vX.Y.Z" -m "<message from RELEASE_NOTES.md>"
git status --short --branch
git push
git status --short --branch
git log -1 --oneline
```

The workflow is complete only when the verified commit is pushed to GitHub and the final report is given to the user.
