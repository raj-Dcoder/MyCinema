# 17 Final Report And Post Release

Use this gate to close the release.

The goal is to give the user a short, accurate report and identify anything left to check manually.

## Final Repository Check

```powershell
git status --short
```

If release-related files are still modified or untracked, explain what remains. Do not silently leave intended release changes uncommitted.

## Final Report

Tell the user:

1. released version
2. release-prep commit hash
3. whether `npm run build` passed
4. whether `git push` succeeded
5. whether `npm run release:publish` succeeded
6. release mode: signed or explicitly approved unsigned
7. whether `npm run verify:installer-signature` reported valid Windows signatures, or why signature verification was skipped
8. whether the GitHub release body was verified or updated
9. release URL, if available
10. any remaining risks or manual checks

Keep the report short and clear.

## Release Video Disclaimer

If a release, demo, or awareness video is published for MyCinema, include this line clearly in the video description or on-screen notes:

```text
This video is only for educational and awareness purposes.
```

## Auto-Updater Testing Notes

1. Always uninstall an older version from the PC before testing a new installer manually.
2. The auto-update banner appears only in a packaged app.
3. The auto-update banner does not appear while running `npm run dev`.

## Closure

Report:

```text
Completed gate: 17 Final Report And Post Release
Released version:
Commit:
Build:
Publish:
Mode:
Signature:
GitHub body:
Remaining work:
```

