# 03 Developer Verification

Use this gate after coding and before release preparation.

The goal is to prove the code is healthy enough to become a release candidate. Do not update versions, release notes, What's New, tags, or GitHub releases in this gate.

## Standard Checks

Run the checks that fit the change:

```powershell
npm run build
```

Optional checks when relevant:

```powershell
npm run pack
npm run dev
```

Use `npm run pack` only when packaging verification is useful or requested. It can create larger local artifacts.

## Dependency Rule

Do not run `npm install` during normal verification unless one of these is true:

- `node_modules/` is missing and verification cannot run.
- `package.json` changed.
- `package-lock.json` changed.
- the build fails because an installed package is missing.

If `npm install` is required, run it once, then inspect lockfile changes:

```powershell
npm install
git diff -- package-lock.json
```

## Failure Handling

If a command fails:

1. Read the error.
2. Fix the underlying code or configuration issue when it belongs to the current task.
3. Re-run the failed command.
4. Continue only after verification passes or after clearly documenting why the failure is unrelated and cannot be fixed in the current task.

## Approval Gate

Report:

```text
Completed gate: 03 Developer Verification
Commands run:
Results:
Failures fixed:
Remaining risk:
Next suggested gate: 04 Release Record
Approval needed: begin release preparation
```

