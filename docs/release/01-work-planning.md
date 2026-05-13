# 01 Work Planning

Use this gate before coding starts.

The goal is to make the requested change intentional before touching files. Do not do release notes, version bumps, packaging, publishing, or GitHub release work in this gate.

## Inputs

Collect or infer:

- feature, fix, or improvement requested
- reason for the change
- expected user-visible behavior
- likely files or modules affected
- risks
- validation plan

If the request is unclear and a risky assumption would change behavior, ask one concise question. Otherwise make a reasonable assumption and continue.

## Planning Output

Write a short plan in chat:

```text
Feature/fix:
Reason:
Expected user-visible behavior:
Likely files:
Risks:
Validation plan:
```

## Branch Guidance

If a new branch is needed and the user did not name one, use the `codex/` prefix.

Example:

```powershell
git switch -c codex/descriptive-release-work
```

Do not create a branch only for planning unless coding will begin immediately.

## Approval Gate

Stop after the plan unless the user already asked the agent to implement.

Report:

```text
Completed gate: 01 Work Planning
Plan:
Assumptions:
Next suggested gate: 02 Coding Standards
Approval needed: coding may begin
```

