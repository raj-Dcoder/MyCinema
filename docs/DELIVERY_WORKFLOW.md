# MyCinema Delivery Workflow

Use this workflow whenever the user brings a problem, bug, issue, or feature request.

This is a lightweight Agile + gated DevOps process for solo development with Codex in the loop. The goal is to keep `master` stable, make one intentional change at a time, show evidence after every gate, and let the user decide whether to continue, revise, add another item, or move to release.

## Core Rule

Do not jump straight from a request to deployment.

For every implementation item, complete one gate, report the result, and wait for the user's direction before crossing major boundaries such as branch creation, implementation completion, release preparation, or publishing.

## Operating Loop

1. The user describes a problem, bug, issue, or feature.
2. Codex analyzes the request and explains the most efficient implementation path.
3. Codex creates or uses the right branch for meaningful code work.
4. Codex implements the change in a focused way.
5. Codex verifies the change and reports evidence.
6. The user confirms whether the item is done.
7. Codex asks whether there is another item.
8. If yes, repeat from step 1.
9. If no, move to the release process in `docs/release/00-release-map.md`.

## Gate 01 - Intake

Goal: understand what the user wants before designing the solution.

Collect or infer:

- request type: bug, issue, feature, improvement, refactor, docs, or release
- problem statement in plain language
- expected user-visible behavior
- affected area, if known
- urgency or priority, if the user provides it
- acceptance criteria

Ask only if missing information would make implementation risky. Otherwise make a reasonable assumption and state it.

Report:

```text
Completed gate: 01 Intake
Request type:
Problem:
Expected behavior:
Acceptance criteria:
Assumptions:
Next suggested gate: 02 Solution Analysis
Approval needed: analyze implementation approach
```

## Gate 02 - Solution Analysis

Goal: explain how to implement the change efficiently before touching code.

Do:

- inspect the relevant files and existing patterns
- identify likely root cause or implementation surface
- compare simple options if there is more than one reasonable path
- recommend the smallest reliable approach
- define validation steps before coding starts

Report:

```text
Completed gate: 02 Solution Analysis
Recommended approach:
Files likely to change:
Risks:
Validation plan:
Next suggested gate: 03 Branch Setup
Approval needed: create/use branch and begin implementation
```

## Gate 03 - Branch Setup

Goal: protect stable work before coding.

Do:

```powershell
git status --short --branch
git branch --show-current
```

Rules:

- Do not revert unrelated local changes.
- If meaningful code work starts from `master`, create a branch.
- Use the `codex/` prefix unless the user names a branch.
- Prefer names like `codex/fix-player-resume`, `codex/feature-library-filters`, or `codex/docs-delivery-workflow`.
- If the current branch is already appropriate, continue on it and say why.

Report:

```text
Completed gate: 03 Branch Setup
Branch:
Existing local changes:
Files intentionally left alone:
Next suggested gate: 04 Implementation
Approval needed: implement the scoped change
```

## Gate 04 - Implementation

Goal: make the smallest complete change that satisfies the accepted approach.

Do:

- follow existing app architecture and style
- keep edits scoped to the accepted request
- avoid unrelated refactors
- update docs or tests when the change needs them
- preserve user changes in the working tree

Report:

```text
Completed gate: 04 Implementation
What changed:
Files changed:
Important decisions:
Next suggested gate: 05 Verification
Approval needed: run verification
```

## Gate 05 - Verification

Goal: prove the implementation works before asking the user to accept it.

Choose validation based on the change:

- `npm run build` for broad TypeScript/Electron safety
- targeted unit, integration, or script checks when available
- manual app verification for UI, playback, scanning, downloads, or release behavior
- browser verification for local frontend changes when relevant

If a check fails, fix the issue and rerun the check before reporting the gate as complete.

Report:

```text
Completed gate: 05 Verification
Commands run:
Results:
Manual checks:
Risks or warnings:
Next suggested gate: 06 User Acceptance
Approval needed: confirm whether this item is done
```

## Gate 06 - User Acceptance

Goal: put the user back in control after the implementation is verified.

Summarize:

- what was implemented
- what changed for the user
- what evidence proves it works
- any known limitations or follow-up risks

Then ask:

```text
Is this item accepted, or do you want a revision?
```

If the user requests changes, return to the appropriate earlier gate.

## Gate 07 - Next Item Decision

Goal: decide whether to continue development or begin release.

After the user accepts an item, ask:

```text
Do you have another problem, bug, issue, or feature for this release?
```

If the user has another item, return to `Gate 01 - Intake`.

If the user says there are no more items, move to `docs/release/00-release-map.md` and start release preparation at release gate `04-release-record.md`. Release gates `01-03` are already covered by this delivery workflow.

## Release Handoff

Start the release process only when:

- all requested implementation items are accepted
- the user confirms there are no more items for this release
- local verification for the final implementation item has passed or any skipped check is clearly explained

From there, follow `docs/release/00-release-map.md` gate by gate, starting at `04-release-record.md` for the normal delivery handoff. The release process has its own approval checkpoints for versioning, release notes, What's New content, commit, push, packaging, publishing, and final verification.

## Done Definition

An implementation item is done only when:

- the accepted behavior is implemented
- relevant verification passes
- changed files are summarized
- unrelated local changes are left untouched
- the user has accepted the item or asked for no further revision

The release is done only when the release gates are complete and the final report has been provided.
