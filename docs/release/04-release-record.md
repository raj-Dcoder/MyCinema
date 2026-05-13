# 04 Release Record

Use this gate when the user is ready to start release preparation.

The goal is to create a local release record that keeps the agent and user oriented without committing drafts or local artifact details.

## Recommended Location

Use:

```text
.release-work/vX.Y.Z/release-record.md
```

If the version is not chosen yet, use:

```text
.release-work/current-release/release-record.md
```

`.release-work/` is ignored and should not be committed by default.

## Release Record Template

```markdown
# MyCinema Release Record

## State
- Current gate:
- Candidate version:
- Branch:
- Last commit:
- Release owner/user approval:

## Change Summary
- Features:
- Fixes:
- UI/UX:
- Performance/reliability:
- Security/privacy:
- Developer/build/release:
- Breaking changes/migrations:

## Version Consistency
- package.json:
- package-lock.json:
- package-lock packages root:
- WhatsNewOnboarding LATEST_RELEASE.version:
- RELEASE_NOTES top section:
- GitHub tag/title/body:

## Verification
- Build:
- Packaged app:
- Installed app:
- GitHub release body:

## Decisions
- Version type:
- Release notes approved:
- What's New approved:
- Publish approved:

## Risks
- 
```

## Approval Gate

After creating or updating the local record, stop.

Report:

```text
Completed gate: 04 Release Record
Record path:
Current state:
Next suggested gate: 05 Release Preflight
Approval needed: inspect repository state
```

