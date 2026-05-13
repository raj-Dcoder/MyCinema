# 14 GitHub Token

Use this gate immediately before publishing.

The goal is to load GitHub credentials safely without exposing secrets.

## Rules

1. Use the saved Windows User environment variable named `GH_TOKEN`.
2. Do not ask the user to paste the token into chat.
3. Do not print the token.
4. Do not commit or store the token.
5. Do not publish if the token is missing.

## Check User Environment Variable

```powershell
if ([Environment]::GetEnvironmentVariable("GH_TOKEN", "User")) { "GH_TOKEN user variable is set" } else { "GH_TOKEN user variable is missing" }
```

## Load Into Current Terminal Session

Only if the variable is set:

```powershell
$env:GH_TOKEN = [Environment]::GetEnvironmentVariable("GH_TOKEN", "User")
```

## If Missing

Stop and ask the user to set the Windows User environment variable outside the repo:

```powershell
[Environment]::SetEnvironmentVariable("GH_TOKEN", "paste-your-github-token-here", "User")
```

Do not ask the user to paste the token into chat.

## Approval Gate

Report:

```text
Completed gate: 14 GitHub Token
GH_TOKEN status: set or missing, never the value
Next suggested gate: 15 Package And Publish
Approval needed: publish release
```

