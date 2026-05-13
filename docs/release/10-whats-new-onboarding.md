# 10 What's New Onboarding

Use this gate to draft and apply the in-app What's New content.

The goal is to make the first-launch popup accurate before the user sees it in the packaged release.

## File To Update

```text
src/renderer/src/components/WhatsNewOnboarding.tsx
```

Update the `LATEST_RELEASE` object only unless the release genuinely needs a new visual metaphor.

## Required Updates

1. Set `LATEST_RELEASE.version` to `X.Y.Z`.
2. Update `slides` from the same real changes described in `RELEASE_NOTES.md`.
3. Include a security/privacy slide when `09-release-notes.md` required one.
4. Keep the existing `WhatsNewOnboarding` component architecture, interactions, and visual system.

The dialog appears once per version through `getWhatsNewStorageKey(LATEST_RELEASE.version)`, so changing the version is required.

## Experience Direction

The What's New experience is a premium Gen Z streaming/media onboarding reveal.

Keep:

1. full-screen dark cinematic reveal
2. neon/glassmorphism mood per slide
3. distinct layouts using the existing `layout` values
4. animated progress indicators
5. cursor-follow glow, particles, floating visuals, and motion cues
6. one emotional message per slide
7. energetic CTA labels

Do not replace it with alerts, native dialogs, plain text lists, corporate changelog modals, or the older `steps` object in `App.tsx`.

## Analysis Rules

1. Analyze release notes and local diff context first.
2. Group updates into emotional categories: speed, sharing, discovery, reliability, personalization, quality of life, fixes, and community requests.
3. Prioritize meaningful user-visible improvements.
4. Ignore low-impact technical changes unless they remove a visible user problem.
5. Convert every technical detail into a user benefit.

Benefit-first examples:

```text
Bad: TMDB validation added.
Good: No more broken links.

Bad: Season filters improved.
Good: Finding episodes is cleaner now.
```

## Slide Fields

For every slide, decide:

1. `layout`: one of `reveal`, `share`, `discovery`, `downloads`, `security`, or `celebrate`
2. `kicker`: tiny category label, 1 to 3 words
3. `headline`: primary headline, 3 to 8 words
4. `highlight`: exact word or phrase from `headline` that should receive gradient emphasis
5. `support`: supporting text, 8 to 16 words
6. `signal`: tiny status/progress label, 1 to 3 words
7. `cta`: energetic action label
8. `icon`: a matching `lucide-react` icon already imported or deliberately added
9. `mood`: emotional color system with `name`, `gradient`, `text`, `border`, `shadow`, `backdrop`, and `cursor`

## Content Rules

1. Use 3 slides for small patch releases.
2. Use 4 to 6 slides for feature releases with distinct user-visible stories.
3. Do not force filler slides.
4. Every slide needs one dominant focal point and one emotional message.
5. Primary headline must be 3 to 8 words.
6. Supporting copy must be 8 to 16 words.
7. Never lead with implementation details, APIs, validation names, storage keys, IPC, refactors, or internal services.
8. Ask what problem was removed, what became faster, what became smoother, or what feels cooler now.

## Visual And Layout Rules

1. Every slide should feel different.
2. Never repeat the same layout energy more than twice consecutively.
3. Favor 1-second comprehension: oversized typography, bold focal visuals, high contrast, glows, cinematic lighting, glassmorphism, particles, stickers, doodle arrows, holographic accents, and animated indicators.
4. Use characters selectively when they add emotion: stylized mascots, anime-inspired characters, cyberpunk avatars, expressive illustrated personas, or playful 3D figures.
5. Do not use generic stock-model character direction.
6. Keep the modal compact and stable in height even when copy has launch energy.

## CTA Rules

Avoid boring CTA labels like:

- `Next`
- `Continue`
- `Get Started`

Prefer energetic labels such as:

- `Let's go`
- `Watch now`
- `Try it`
- `I'm in`
- `Nice`
- `Show me`
- `Cool`

Match CTA energy to the slide emotion.

## Reference Shape

```ts
const LATEST_RELEASE = {
  version: 'X.Y.Z',
  eyebrow: 'What\'s New',
  slides: [
    {
      id: 'share',
      layout: 'share',
      icon: Sparkles,
      kicker: 'Sharing',
      headline: 'Share the EXACT source.',
      highlight: 'EXACT',
      support: 'Send the same movie, series, or source without making friends search.',
      signal: 'Source locked',
      cta: 'Send it',
      mood: {
        name: 'sharing',
        gradient: 'from-blue-400 via-cyan-300 to-teal-300',
        text: 'text-cyan-200',
        border: 'border-cyan-300/30',
        shadow: 'shadow-[0_0_72px_rgba(34,211,238,0.32)]',
        backdrop: 'linear-gradient(120deg, rgba(37,99,235,0.24), transparent 36%)',
        cursor: 'rgba(34,211,238,0.24)'
      }
    }
  ]
}
```

## Approval Gate

Show the final slide data before release packaging.

Report:

```text
Completed gate: 10 What's New Onboarding
Version:
Slides:
Files changed:
Risks:
Next suggested gate: 11 Local Release Verification
Approval needed: verify release locally
```
