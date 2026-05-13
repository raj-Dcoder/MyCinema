# 02 Coding Standards

Use this gate while implementing the requested app change.

The goal is to modify the code safely without mixing in release packaging, publishing, or unrelated cleanup.

## Agent Rules

1. Prefer the repo's existing patterns, frameworks, helpers, and file organization.
2. Keep edits scoped to the requested behavior.
3. Do not revert unrelated local changes.
4. Treat uncommitted changes as user work unless the agent created them in the current task.
5. Never commit secrets, API keys, `.env` files, local profiles, generated caches, logs, or packaged artifacts.
6. Do not run destructive Git commands such as `git reset --hard`, `git clean -fd`, or `git checkout -- <file>` unless the user explicitly requests that exact operation.
7. Add comments only where the code is not self-explanatory.
8. Keep user-facing copy accurate, clear, and consistent with MyCinema's cinematic media-product voice.

## Frontend Rules

1. Match the existing visual system before inventing a new one.
2. Build the actual usable experience, not a marketing page.
3. Keep controls stable and responsive across desktop and mobile sizes where relevant.
4. Use existing icon libraries and component patterns when available.
5. Do not let text overlap or overflow its container.
6. Avoid generic one-note palettes and decorative effects that do not support the task.

## Implementation Evidence

After coding, inspect:

```powershell
git status --short
git diff --stat
git diff -- <changed-files>
```

Summarize:

- changed files
- what changed
- why it changed
- assumptions
- anything intentionally not completed

## Approval Gate

Stop before release preparation.

Report:

```text
Completed gate: 02 Coding Standards
Changed files:
Behavior changed:
Assumptions:
Next suggested gate: 03 Developer Verification
Approval needed: run verification
```

