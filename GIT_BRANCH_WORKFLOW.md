# Git Branch Workflow For MyCinema

This file is a simple command guide for working professionally with Git and GitHub while building MyCinema.

## Core Idea

Keep `master` stable.

Do risky or meaningful work in a separate branch:

```bash
master
  \
   codex/experiment/watch-party-voice
```

A branch is a risk container. If the feature works, merge it later. If it fails, `master` stays safe.

## Daily Safety Commands

Check where you are and what changed:

```bash
git status
```

Check current branch:

```bash
git branch --show-current
```

See all local branches:

```bash
git branch
```

See remote branches too:

```bash
git branch -a
```

## Start A New Feature Branch

First go to the stable branch:

```bash
git switch master
```

Get latest GitHub changes:

```bash
git pull origin master
```

Create a new branch:

```bash
git switch -c codex/experiment/watch-party-voice
```

Use branch names like:

```bash
codex/experiment/watch-party-voice
feature/push-to-talk
bugfix/video-sync-drift
refactor/player-controls
```

## Save Your Work With Commits

See changed files:

```bash
git status
```

See exact code changes:

```bash
git diff
```

Stage selected files:

```bash
git add path/to/file.ts
```

Stage all current changes:

```bash
git add .
```

Commit:

```bash
git commit -m "Add watch party voice prototype"
```

Good commit messages:

```bash
git commit -m "Add push-to-talk signaling"
git commit -m "Add floating mic control"
git commit -m "Allow dev multi-client testing"
```

Avoid vague messages:

```bash
git commit -m "changes"
git commit -m "fix"
git commit -m "final"
```

## Push Your Branch To GitHub

First push for a new branch:

```bash
git push -u origin codex/experiment/watch-party-voice
```

After that, normal push:

```bash
git push
```

## Sync Your Branch With `master`

This means bringing latest stable changes from `master` into your feature branch.

Go to `master`:

```bash
git switch master
```

Pull latest GitHub version:

```bash
git pull origin master
```

Go back to your feature branch:

```bash
git switch codex/experiment/watch-party-voice
```

Merge latest `master` into your branch:

```bash
git merge master
```

Run this when:

- your branch is more than a day old
- you changed `master` separately
- you are about to merge the feature
- you want to catch conflicts early

## Handle Merge Conflicts

If Git says there is a conflict:

```bash
git status
```

Open the conflicted files and look for:

```text
<<<<<<< HEAD
your branch code
=======
master branch code
>>>>>>> master
```

Edit the file so only the correct final code remains.

Then:

```bash
git add path/to/conflicted-file.ts
git commit
```

## Compare Feature Branch With `master`

See what your branch changed:

```bash
git diff master...HEAD
```

See only changed file names:

```bash
git diff --name-only master...HEAD
```

See commit history:

```bash
git log --oneline --graph --decorate --all
```

## Test Before Merging

For MyCinema:

```bash
npm run build
```

For local dev:

```bash
npm run dev
```

For two-client watch-party testing:

```bash
npm run dev:host
```

In another terminal:

```bash
npm run dev:guest
```

## Professional Solo GitHub Workflow

Even if you work alone, use Pull Requests as a review checkpoint.

Recommended flow:

1. Create a GitHub Issue for the feature.
2. Create a branch from `master`.
3. Commit small logical steps.
4. Push the branch to GitHub.
5. Open a Draft Pull Request into `master`.
6. Review your own diff.
7. Run build/tests.
8. Merge only when stable.

Pull Request checklist:

```md
## What changed
- 

## Why
- 

## How tested
- 

## Risks
- 
```

## Merge Back Into `master`

Professional option: merge using GitHub Pull Request.

Local option:

```bash
git switch master
git pull origin master
git merge codex/experiment/watch-party-voice
npm run build
git push origin master
```

## Delete A Finished Branch

Delete local branch:

```bash
git branch -d codex/experiment/watch-party-voice
```

Delete remote GitHub branch:

```bash
git push origin --delete codex/experiment/watch-party-voice
```

## Useful Rescue Commands

Undo unstaged changes in one file:

```bash
git restore path/to/file.ts
```

Unstage a file:

```bash
git restore --staged path/to/file.ts
```

See recent commits:

```bash
git log --oneline -10
```

See remote URL:

```bash
git remote -v
```

Do not run these casually:

```bash
git reset --hard
git clean -fd
```

They can delete work.

## Upstream And Origin

For your own MyCinema repo, usually you only need:

```text
origin = your GitHub repo
```

Check it:

```bash
git remote -v
```

In open-source projects:

```text
upstream = original official repo
origin = your fork
local = your laptop copy
```

For MyCinema, `origin` is enough unless you fork from someone else later.

## MyCinema Branch Recommendation

Use this pattern:

```bash
master
codex/experiment/watch-party-voice
feature/watch-party-voice
bugfix/player-sync
refactor/video-controls
```

For risky prototypes:

```bash
codex/experiment/name
```

For features you intend to ship:

```bash
feature/name
```

For bugs:

```bash
bugfix/name
```
