# 16 Published Release Verification

Use this gate after publishing.

The goal is to confirm the GitHub release exists, has a meaningful body, and matches the approved release notes.

## Verify With GitHub CLI

Replace `X.Y.Z` with the release version:

```powershell
gh release view vX.Y.Z --json name,tagName,body,url
```

## Verify With GitHub API

If `gh` is unavailable, use the GitHub API with `GH_TOKEN` loaded:

```powershell
$headers = @{ Authorization = "Bearer $env:GH_TOKEN"; Accept = "application/vnd.github+json" }
Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/raj-Dcoder/MyCinema/releases/tags/vX.Y.Z"
```

Do not print the token.

## Body Repair

If the release body is empty, generic, or missing the real notes, update it from `.tmp-release-body.md`.

With `gh`:

```powershell
gh release edit vX.Y.Z --notes-file .tmp-release-body.md
```

With the API:

```powershell
$release = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/raj-Dcoder/MyCinema/releases/tags/vX.Y.Z"
$body = Get-Content -Raw .tmp-release-body.md
Invoke-RestMethod -Method Patch -Headers $headers -Uri "https://api.github.com/repos/raj-Dcoder/MyCinema/releases/$($release.id)" -Body (@{ body = $body } | ConvertTo-Json)
```

## Cleanup

After the release body is verified:

```powershell
Remove-Item .tmp-release-body.md -ErrorAction SilentlyContinue
```

## Approval Gate

Report:

```text
Completed gate: 16 Published Release Verification
Release URL:
Tag/title:
Body verified or updated:
Temp body removed:
Next suggested gate: 17 Final Report And Post Release
Approval needed: finish release report
```

