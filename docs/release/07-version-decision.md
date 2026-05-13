# 07 Version Decision

Use this gate to choose the next semantic version.

The goal is to choose one version and use it exactly in every later release step.

## Read Current Version

```powershell
node -p "require('./package.json').version"
```

## Version Rules

Choose:

- `PATCH` (`X.Y.Z+1`) for bug fixes, small polish, dependency fixes, security hardening, or minor reliability work.
- `MINOR` (`X.Y+1.0`) for user-visible features, new screens, new workflows, or meaningful app capabilities.
- `MAJOR` (`X+1.0.0`) only for breaking changes, major rewrites, user-impacting migrations, or compatibility-breaking behavior.

When in doubt between patch and minor, use minor if the release includes a user-visible capability. Otherwise use patch.

## Output

Record the chosen version as:

```text
X.Y.Z
```

Use that exact value in:

- `package.json`
- `package-lock.json`
- `src/renderer/src/components/WhatsNewOnboarding.tsx`
- top section of `RELEASE_NOTES.md`
- GitHub release tag, title, and body

## Approval Gate

Report:

```text
Completed gate: 07 Version Decision
Current version:
Chosen version:
Reason:
Next suggested gate: 08 Version Files
Approval needed: update version files
```

