# 05 Release Preflight

Use this gate before analyzing changes for a release.

The goal is to inspect the repository state and make sure the release path is not ambiguous.

## Commands

Run from the repository root:

```powershell
git rev-parse --show-toplevel
git status --short --branch
git remote -v
git branch --show-current
git log -1 --oneline
git diff --stat
```

Identify:

1. current branch and upstream status
2. last commit hash and message
3. modified, deleted, and untracked files
4. files that look release-related
5. files that look unrelated, temporary, local-only, or unsafe to stage

## Stop Conditions

Stop and ask the user before continuing if:

- the branch has no tracking remote and pushing would be ambiguous
- the remote does not point to the expected GitHub repository
- there are unrelated local changes that may conflict with release work
- secrets, `.env`, local profiles, build output, or large artifacts appear staged or likely to be staged

## Approval Gate

Report:

```text
Completed gate: 05 Release Preflight
Branch:
Upstream:
Last commit:
Changed files:
Untracked files:
Potentially unrelated files:
Next suggested gate: 06 Change Analysis
Approval needed: analyze release changes
```

