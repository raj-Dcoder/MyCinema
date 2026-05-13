# 11 Local Release Verification

Use this gate after version, release notes, and What's New content are updated.

The goal is to verify the release candidate before any commit, push, package, or publish step.

## Build

Run:

```powershell
npm run build
```

If the build fails:

1. Fix the issue.
2. Run `npm run build` again.
3. Continue only after the build exits successfully.

Warnings are acceptable only if the command exits successfully.

## Version Consistency

Replace `X.Y.Z` with the chosen version:

```powershell
node -p "require('./package.json').version"
node -p "require('./package-lock.json').version"
node -p "require('./package-lock.json').packages[''].version"
rg -n "version: 'X.Y.Z'|# MyCinema vX.Y.Z" src/renderer/src/components/WhatsNewOnboarding.tsx RELEASE_NOTES.md
```

All package version outputs must be exactly `X.Y.Z`. The `rg` output must show the What's New version and the top release note section.

## Optional Manual Checks

When useful, launch or package locally:

```powershell
npm run dev
npm run pack
```

Manual checks should include:

- app opens
- version is correct where visible
- What's New appears for the new version
- main changed workflow works
- no obvious runtime or console errors

## Approval Gate

Report:

```text
Completed gate: 11 Local Release Verification
Build result:
Version consistency:
Manual checks:
Remaining warnings:
Next suggested gate: 12 GitHub Release Body
Approval needed: prepare GitHub release body
```

