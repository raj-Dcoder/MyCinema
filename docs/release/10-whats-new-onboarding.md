# 10 What's New Onboarding

Use this gate to draft and apply the in-app What's New content.

The goal: the first thing a user sees after updating is a small, plain,
scannable changelog — in the style of VS Code release notes / Slack
"What's new" / Linear changelogs — followed (only for flagship features)
by a short spotlight tour that walks them to the new control.

## Files To Update

```text
src/renderer/src/components/WhatsNewOnboarding.tsx   # LATEST_RELEASE data only
src/renderer/src/components/ProductTour.tsx          # only when a tour is needed
```

Update the `LATEST_RELEASE` data object only. Do not restyle the dialog
component unless the template itself is broken.

## Required Updates

1. Set `LATEST_RELEASE.version` to `X.Y.Z`.
2. Rewrite `title`, `highlight`, `description`, and `updates` from the same
   real changes described in `RELEASE_NOTES.md` (gate 09). Nothing else —
   the modal renders entirely from this data object.
3. Set `tourId` only when this release adds a tour in `ProductTour.tsx`;
   otherwise set it to `null`.

The dialog appears once per version through
`getWhatsNewStorageKey(LATEST_RELEASE.version)`, so changing the version
is required.

## Experience Direction

Compact dark cinematic card. "WHAT'S NEW" pill plus version badge, one
short prominent heading with an accent-gradient highlighted word, one
description line, and a vertical list of soft update rows (tinted icon
tile + title + one short description + chevron). Subtle ambient glow
behind the card. Footer: "Don't show again for this version" toggle plus
one gradient "Continue →" pill button.

Do not rebuild it as full-screen cinematic slides, neon/particle
onboarding, marketing reveal copy, large illustrations, or heavy
glassmorphism.

## Writing Rules

1. Max 5 updates, most user-visible first. Bug-fix-only or security-only
   releases get 1-2 updates, not filler.
2. Every update is `Title. One short clause.` Title = outcome in 6 words
   or fewer (never the mechanism). Description = a single clause, max
   ~12 words, saying what changed plus where to find it ("in the
   Downloads tab", "under Settings > Features").
3. The heading `title` is short and prominent (one line), `highlight` is
   one word from it, and `description` is 1-2 plain sentences framing the
   release.
4. `icon` must be one of the existing `UPDATE_ICONS` keys — pick the
   closest match. Never add one-off icons per release.
5. Write for a non-technical user. Never lead with implementation details,
   APIs, validation names, storage keys, IPC, refactors, or internal
   service names.
6. Never use hype adjectives or slang (`seamless`, `insane`,
   `mind-blowing`, `supercharge`, Gen Z slang). Never use vague fillers
   (`various improvements`, `bug fixes and performance`,
   `stability updates`) unless the diff truly cannot be summarized more
   specifically.
7. If the release has ONE flagship feature needing orientation (new
   tab/screen/workflow), do not explain it all in text — add a tour
   (Step 5B of `RELEASE_GUIDE.md`) instead.

Good vs bad:

```text
Bad:  No more broken links. (vague — what links, where?)
Good: True season-pack sizes. Season packs now show the full-season total.

Bad:  Audio pipeline resync hardened. (jargon)
Good: Audio stays in sync. External audio now starts at the right moment.

Bad:  Insane new download experience!!! (hype, says nothing)
Good: Download queue control. Set a limit and manage multiple downloads
      at once.
```

## Reference Shape

```ts
const LATEST_RELEASE: ReleaseNotes = {
  version: 'X.Y.Z',
  title: 'A better watching experience.',
  highlight: 'experience.',
  description: "We've made some improvements and added new features to make the app faster, smoother and more reliable.",
  tourId: 'focus-tube', // or null when no tour was added
  updates: [
    {
      icon: 'download', // download | layers | bell | audio | shield | sparkles | fix | play
      title: 'Download queue control',
      description: 'Set how many downloads run at once in the Downloads tab.',
    },
  ],
}
```

## Tour Decision (Step 5B)

- New tab / screen / multi-click workflow the user must be walked to →
  add a spotlight tour in `ProductTour.tsx` (`TOURS` registry, max 4
  steps, last step ends at the off-switch/Settings), anchor targets with
  `data-tour="..."`, set `LATEST_RELEASE.tourId`.
- One small new button/menu/toggle with no workflow around it → single
  static hint in `FeatureGuides.tsx` (`InlineFeatureGuide`), no tour.
- Fixes, polish, performance, or security-only changes → dialog alone,
  no tour, no hint.

Preview the tour in dev with `?tour=<id>` and click through every step,
including Skip and Back, before packaging.

## Approval Gate

Show the final dialog data (and tour steps, if any) before release packaging.

Report:

```text
Completed gate: 10 What's New Onboarding
Version:
Updates (count):
Tour:
Files changed:
Risks:
Next suggested gate: 11 Local Release Verification
Approval needed: verify release locally
```
