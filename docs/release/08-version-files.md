# 08 Version Files

Use this gate to update package version metadata.

The goal is to update package versions without creating a Git tag yet.

## Update Version

Replace `X.Y.Z` with the approved version:

```powershell
npm version X.Y.Z --no-git-tag-version
```

## Verify Version Files

```powershell
node -p "require('./package.json').version"
node -p "require('./package-lock.json').version"
node -p "require('./package-lock.json').packages[''].version"
```

All three outputs must be exactly `X.Y.Z`.

## Stop Conditions

Stop if:

- `npm version` fails
- `package-lock.json` does not update consistently
- the version differs between package files

Do not continue to release notes until the package version is consistent.

## Approval Gate

Report:

```text
Completed gate: 08 Version Files
Version:
Files changed:
Verification output:
Next suggested gate: 09 Release Notes
Approval needed: update release notes
```

