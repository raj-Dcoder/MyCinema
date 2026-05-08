# MyCinema Security and Scalability Audit

Date: 2026-05-07
Scope: local repository scan, Electron main/preload/renderer review, dependency audit, build verification, secret search, and practical public-release readiness.

## Executive Summary

MyCinema is not ready for a public Twitter/LinkedIn release yet. The app builds successfully and has several good security foundations, but there are high-priority release blockers around exposed API keys, a real-looking GitHub token in a local release guide, Electron hardening, dependency vulnerabilities, and public torrent/download functionality.

The biggest issue is that `MAIN_VITE_*` API keys from `.env` are injected into the production main bundle. A public desktop app cannot keep those keys secret if they are packaged into `out/main/index.js` or an installer. Anyone can extract them and abuse your TMDB/OpenSubtitles quota or get the keys blocked.

For 100 daily users, local playback and local SQLite storage should be fine, but the shared API keys, torrent discovery, startup scanning, and dependency/update story need work before public attention.

## Overall Readiness

Status: Not public-release ready

Recommended release decision: Private demo only until the critical/high items below are fixed.

Estimated risk if released now:

- API quota/key abuse: High
- Reputation/platform risk from torrent features: High
- User system/file exposure risk from Electron compromise: Medium to High
- Dependency supply-chain risk: Medium to High
- Performance risk at 100 users/day: Medium, mostly because external API quota and torrent/network behavior scale per user

## What I Checked

- Project structure and stack
- `.env`, release docs, source files, and build output for secrets
- Electron `BrowserWindow`, preload bridge, custom protocols, and IPC handlers
- Filesystem access and delete paths
- TMDB, OpenSubtitles, PeerJS, YouTube, and torrent-related network paths
- SQLite usage and query style
- Renderer CSP and risky DOM insertion patterns
- NPM dependency vulnerabilities with `npm audit`
- Production build with `npm run build`

## Positive Findings

- `.env` is ignored by `.gitignore`, and `git log --all -- .env` showed no committed `.env` history in this local repo.
- `RELEASE_GUIDE.md`, `test-parse.js`, and `out/main/index.js` are not tracked by Git in this local repo.
- SQLite usage in `src/main/db.ts` mostly uses prepared statements instead of string-concatenated SQL.
- The preload layer uses `contextBridge` to expose a controlled `window.api` surface.
- Local media protocols and many IPC file operations call `isSafeFilePath`.
- Download deletion has explicit root checks before recursive removal.
- `window.open` is denied and external URLs are routed through `shell.openExternal`.
- Renderer CSP exists and blocks inline scripts.
- `npm run build` completed successfully.

## Critical Findings

### 1. API keys are embedded in production build output

Evidence:

- `.env` contains TMDB and OpenSubtitles keys.
- `src/main/index.ts:1387-1388` reads `process.env.MAIN_VITE_*` and `import.meta.env`.
- `src/main/tmdb.ts:58-62` also reads `import.meta.env`.
- `out/main/index.js` contains the resolved key values after `npm run build`.

Impact:

Anyone who downloads the app can extract the keys from the bundled JavaScript. This can cause quota exhaustion, account suspension, billing/abuse issues, and public leakage.

Recommended fix:

- Rotate both exposed API keys before public release.
- Stop build-time injection of secrets into Electron bundles.
- Prefer one of these approaches:
  - User-provided API keys stored locally by the user.
  - A small backend proxy with rate limiting, abuse detection, and server-side keys.
  - Remove authenticated API features from public builds until a backend exists.
- Add a secret scan in CI before release.

Severity: Critical

### 2. Release guide contains a real-looking GitHub token

Evidence:

- `RELEASE_GUIDE.md:38` contains a `ghp_...` token-like value.
- The file is not tracked locally, but it exists in the project folder and could be accidentally shared, copied, zipped, screenshotted, or committed later.

Impact:

If valid or ever valid, this token may grant access to GitHub actions, releases, repositories, or account data depending on scopes.

Recommended fix:

- Revoke/rotate that GitHub token immediately.
- Replace the value with a placeholder such as `<YOUR_GITHUB_TOKEN>`.
- Keep release instructions free of real credentials.
- Consider deleting local copies containing old tokens.

Severity: Critical

## High Findings

### 3. Electron hardening is weaker than ideal for public release

Evidence:

- `src/main/index.ts:401` sets `sandbox: false`.
- `src/main/index.ts:406` sets `webSecurity: false`.
- `src/renderer/index.html:8` allows `connect-src` to any `http:` and `https:` URL.

Impact:

If renderer XSS or malicious remote content is introduced later, disabled web security and unsandboxed renderer increase the blast radius. In an Electron app with filesystem and IPC access, this matters a lot.

Recommended fix:

- Re-enable `webSecurity` if possible.
- Keep `contextIsolation: true` explicit.
- Use `sandbox: true` if compatible with preload.
- Restrict CSP `connect-src` to known endpoints.
- Add a permission handler that denies unexpected permissions.
- Re-test custom `media://`, `subtitle://`, and `audio://` protocols after hardening.

Severity: High

### 4. Public torrent search and download features carry legal, safety, and reputation risk

Evidence:

- `src/main/index.ts:1690` exposes `search-torrent-sources`.
- The app queries YTS, EZTV, Torrentio, APIBay, MediaFusion, and WebTorrent trackers.
- `src/main/index.ts:2233` starts torrent downloads from renderer-provided magnet URLs.
- `src/main/index.ts:1295` enables DHT.

Impact:

Publicly advertising this may create copyright, ISP, privacy, malware, and platform reputation problems. Users may download unsafe content, expose IP addresses, or interpret the app as a piracy tool.

Recommended fix:

- Decide whether public builds should include torrent features at all.
- If kept, add explicit legal/privacy warnings, disable by default, and support only user-supplied legal magnets.
- Add magnet validation, size limits, content warnings, and optional network privacy guidance.
- Consider removing third-party torrent index integrations from public demo builds.

Severity: High

### 5. Dependency audit reports high vulnerabilities

Evidence:

- `npm audit --omit=dev --json`: 7 production vulnerabilities, including high issues through `webtorrent`, `bittorrent-tracker`, `ip`, `ip-set`, and `load-ip-set`.
- `npm audit --json`: 23 total vulnerabilities, including high issues in `electron`, `electron-builder`, `webtorrent`, `tar`, `lodash`, and related transitive packages.
- `package.json` uses `electron` `^29.1.0`, while audit reports multiple fixed Electron ranges above current.

Impact:

Public desktop apps have a broader attack surface than simple web demos. Old Electron versions and vulnerable torrent dependencies increase exploitation and supply-chain risk.

Recommended fix:

- Upgrade Electron to a current supported major version and retest the app.
- Upgrade electron-builder and Vite/electron-vite.
- Reassess or replace WebTorrent if no safe upgrade path exists.
- Run `npm audit` after each upgrade and keep a release checklist.

Severity: High

### 6. OpenSubtitles download URL is fetched without host validation

Evidence:

- `src/main/index.ts:2628` fetches `downloadUrl` returned by OpenSubtitles.

Impact:

If the API response is compromised, proxied, or malformed, the app may fetch arbitrary URLs. This is not a direct credential leak because the API key is not sent to that URL, but it is still unnecessary SSRF/network-abuse surface from the main process.

Recommended fix:

- Validate that `downloadUrl` uses `https:`.
- Allowlist expected OpenSubtitles download hostnames.
- Add response size limits before writing subtitle files.

Severity: High

## Medium Findings

### 7. IPC methods need stricter input validation

Evidence:

- `src/preload/index.ts` exposes many IPC methods to renderer code.
- Examples: `scanFolder`, `openFolder`, `getMediaInfo`, `startTorrentDownload`, `downloadOnlineSubtitle`.
- Many handlers check file paths, but most do not validate argument types, numeric ranges, string lengths, URL shape, or enum values deeply.

Impact:

If renderer code is compromised or buggy, main-process handlers may receive unexpected values. Current checks reduce risk, but public desktop apps should validate IPC boundaries as if they were API endpoints.

Recommended fix:

- Add small validators for every IPC handler.
- Reject unexpected types, huge strings, invalid magnet URLs, invalid media types, invalid file IDs, invalid track indexes, and paths outside allowed roots.
- Return safe error objects instead of throwing.

Severity: Medium

### 8. Custom DNS bypass can surprise users and complicate privacy expectations

Evidence:

- `src/main/index.ts:15-16` uses Google/Cloudflare resolvers.
- `src/main/tmdb.ts:19-24` uses Cloudflare DNS-over-HTTPS.

Impact:

Bypassing local DNS may help when ISP DNS blocks domains, but it also overrides user/network policy and reveals lookups to public DNS providers. For public software, that should be explicit.

Recommended fix:

- Make custom DNS opt-in.
- Add a setting that explains the privacy tradeoff.
- Default to system DNS unless needed.

Severity: Medium

### 9. External links allow all HTTP URLs

Evidence:

- `src/main/index.ts:450-452` allows `http://` and `https://` through `shell.openExternal`.

Impact:

Opening untrusted plain HTTP links can expose users to tampering or tracking. The app currently only denies dangerous schemes, which is good, but it can be tighter.

Recommended fix:

- Prefer `https:` only.
- Allowlist known domains when practical.
- Prompt before opening unknown domains.

Severity: Medium

### 10. DOM insertion patterns need ongoing discipline

Evidence:

- `src/renderer/src/components/VideoPlayer.tsx:1112` uses `innerHTML`.
- `src/renderer/src/components/DetailScreen.tsx:872` uses `dangerouslySetInnerHTML` for a static style block.

Impact:

The current style block appears static, and the toast HTML appears local, but these patterns can become XSS bugs if dynamic values are later interpolated.

Recommended fix:

- Replace `innerHTML` with DOM node creation or React state.
- Keep `dangerouslySetInnerHTML` only for static trusted strings.
- Add comments/tests if dynamic data is ever involved.

Severity: Medium

### 11. Startup scanning may be expensive for very large libraries

Evidence:

- `src/main/index.ts:244-257` scans all saved folders at startup.
- `src/main/scanner.ts` recursively walks folders, runs ffprobe, may fetch metadata, and sends `library-updated` after each file.

Impact:

For users with huge libraries, first launch can be CPU, disk, and network heavy. It does not affect server scalability because this is local, but it affects user experience and API quotas.

Recommended fix:

- Add incremental scan state.
- Limit concurrent ffprobe/TMDB work.
- Batch UI updates.
- Let users disable startup scan.

Severity: Medium

## Low Findings

### 12. Logs may reveal private local paths and searches

Evidence:

- Many logs include file paths, torrent titles, subtitle URLs, and search terms.

Impact:

Usually local-only, but users sharing logs may expose personal filenames, watched content, or local folder structure.

Recommended fix:

- Add privacy mode for logs.
- Redact API keys from all URLs.
- Avoid logging full local paths unless debug mode is enabled.

Severity: Low

### 13. Build artifacts contain secrets even though they are ignored by Git

Evidence:

- `out/main/index.js` contains keys after build.
- `out/` is ignored and not tracked locally.

Impact:

Ignored build artifacts are still dangerous if shared as zips, uploaded manually, or packaged into installers.

Recommended fix:

- Clean `out/` before sharing source archives.
- More importantly, remove secret injection so generated artifacts cannot contain secrets.

Severity: Low as Git hygiene, Critical as release/package hygiene

## Scalability Assessment

### 100 people per day

Expected app performance:

- Desktop UI: likely fine because each user runs locally.
- SQLite: fine for personal libraries.
- Local playback: fine, bound by each user machine.
- Startup scanning: can be slow for users with very large media folders.
- API usage: risky because all users share your embedded keys.
- Torrent discovery/download: unpredictable and can be resource-heavy per user.

Main scaling bottleneck:

The app currently has no backend. That is good for server cost, but bad for shared secrets and abuse control. Every user will call TMDB/OpenSubtitles and torrent services directly using the app logic. If keys are embedded, public usage scales abuse against your accounts.

### What happens if 100 users open the app daily?

- TMDB trending/search calls increase per install.
- OpenSubtitles searches/downloads increase per install and may hit daily quotas.
- PeerJS public server use increases for watch-together features.
- Torrent tracker/DHT traffic increases from each active downloader.
- No central app server is likely to crash, because there is no central server.
- Your third-party API accounts and app reputation are the fragile parts.

### Recommended public-release scaling plan

- Move keys behind a backend proxy or require user-supplied keys.
- Add API caching and rate limiting if using a backend.
- Add request timeouts and retry limits.
- Batch scanner UI updates.
- Add a user-controlled startup scan toggle.
- Monitor crash reports and update failures after release.

## Safe-for-Everybody Assessment

Current answer: not yet.

The app is safe enough for a controlled personal demo, but not safe enough to market broadly without caveats because:

- It includes torrent search/download features tied to public indexers.
- It exposes API keys in public builds.
- It has old Electron/dependency vulnerabilities.
- It disables Electron `webSecurity`.
- It can write downloaded subtitles beside media files.
- It can recursively scan and process arbitrary user-selected folders.

For a public portfolio demo, consider a safer release mode:

- Keep local library/player features.
- Disable torrent download/search by default or remove it.
- Use placeholder/demo metadata or user-provided API keys.
- Add clear privacy and legal language.
- Ship with updated Electron and hardened settings.

## Immediate Action Checklist

1. Revoke/rotate the GitHub token found in `RELEASE_GUIDE.md`.
2. Rotate TMDB and OpenSubtitles keys found in `.env`.
3. Remove real keys from `.env` before sharing the project folder.
4. Replace token/key examples in docs with placeholders.
5. Stop injecting `MAIN_VITE_*` secrets into packaged builds.
6. Delete/regenerate `out/` and `dist/` after fixing secret injection.
7. Upgrade Electron and vulnerable dependencies.
8. Decide whether torrent features belong in the public build.
9. Harden Electron settings and tighten CSP.
10. Add IPC input validation.

## Recommended Release Gates

Do not post publicly until these pass:

- `npm run build` succeeds.
- `npm audit --omit=dev` has no high/critical production vulnerabilities, or each remaining issue has a documented accepted risk.
- Secret scan finds no real keys in source, docs, `out/`, `dist/`, or release artifacts.
- Packaged installer does not contain API keys.
- Electron security checklist is reviewed.
- Torrent feature policy is decided and reflected in UI/docs.
- Fresh install smoke test passes on a clean machine/profile.

## Verification Performed

- `git ls-files .env` returned no tracked `.env`.
- `git log --all -- .env` returned no local committed history for `.env`.
- `git ls-files RELEASE_GUIDE.md test-parse.js out/main/index.js` returned no tracked files.
- Secret scan found secrets in `.env`, `RELEASE_GUIDE.md`, and generated `out/main/index.js`.
- `npm audit --omit=dev --json` reported 7 production vulnerabilities.
- `npm audit --json` reported 23 total vulnerabilities.
- `npm run build` completed successfully, but generated output still contained API keys.

