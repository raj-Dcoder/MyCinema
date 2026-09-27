// ─── Focus Tube helpers ───────────────────────────────────────────────────────
// Pure presentation helpers. Kept out of the page so the card, the player and
// the empty states format values identically.

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) return ''
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

export function formatViews(views: number | null): string {
  if (views === null || !Number.isFinite(views) || views <= 0) return ''
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1).replace(/\.0$/, '')}M views`
  if (views >= 1_000) return `${(views / 1_000).toFixed(1).replace(/\.0$/, '')}K views`
  return `${views} views`
}

function parseDate(value: string): number {
  if (!value) return NaN
  // SQLite CURRENT_TIMESTAMP yields "YYYY-MM-DD HH:MM:SS" (UTC, no zone).
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)
    ? value.replace(' ', 'T') + 'Z'
    : value
  return Date.parse(normalized)
}

export function formatRelativeTime(value: string | null): string {
  if (!value) return ''
  const time = parseDate(value)
  if (!Number.isFinite(time)) return ''

  const seconds = Math.max(0, (Date.now() - time) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = seconds / 60
  if (minutes < 60) return `${Math.floor(minutes)}m ago`
  const hours = minutes / 60
  if (hours < 24) return `${Math.floor(hours)}h ago`
  const days = hours / 24
  if (days < 7) return `${Math.floor(days)}d ago`
  const weeks = days / 7
  if (weeks < 5) return `${Math.floor(weeks)}w ago`
  const months = days / 30
  if (months < 12) return `${Math.floor(months)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

/** "3d ago" style freshness used by the caught-up empty state. */
export function formatAgo(value: string | null): string {
  const relative = formatRelativeTime(value)
  return relative ? relative.replace(' ago', '') : ''
}

export function formatPublishedExact(value: string | null): string {
  if (!value) return ''
  const time = parseDate(value)
  if (!Number.isFinite(time)) return ''
  return new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * YouTube has no 16:9 thumbnail guarantee at every size. maxresdefault is 16:9
 * but only exists for HD uploads, so the card walks the fallbacks on error.
 */
export const THUMBNAIL_FALLBACKS = [
  'maxresdefault.jpg',
  'sddefault.jpg',
  'hqdefault.jpg',
  'mqdefault.jpg',
]

export function thumbnailUrl(videoId: string, variant = 0): string {
  const file = THUMBNAIL_FALLBACKS[Math.min(variant, THUMBNAIL_FALLBACKS.length - 1)]
  return `https://i.ytimg.com/vi/${videoId}/${file}`
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

/**
 * Must stay in step with the trailer embed built in tmdb.ts — except for the
 * two deliberate differences below.
 *
 * Since late 2025 YouTube's embedded player refuses to initialise unless the
 * request identifies its embedding origin, and surfaces that refusal as
 * "Sign in to confirm you're not a bot" rather than as an error code. A
 * file:// page has an opaque origin and therefore no Referer to send, so the
 * identity comes from `widget_referrer` plus the Referer/Origin headers that
 * setupYoutubeEmbedHeaders injects in the main process.
 *
 * The `origin` param is deliberately OMITTED even though the docs call it
 * "optional but recommended". Verified empirically (Jan-2026 probe): with
 * `origin=https://mycinema.app` the player renders but the postMessage bridge
 * is dead in both directions — commands are ignored and no events arrive,
 * because our real origin (opaque `null`) never matches the declared one.
 * Without the param, YouTube falls back to the message event's own origin and
 * the full bridge works: commands, playerState, currentTime, duration.
 *
 * `controls=0` hides YouTube's chrome because MyCinema renders its own control
 * bar (FocusTubeControls) over the video. Click-to-toggle and the player's own
 * keyboard shortcuts keep working as a fallback if the bridge ever breaks.
 */
export const FOCUS_TUBE_EMBED_ORIGIN = 'https://mycinema.app'

/**
 * The embed is rendered with YouTube's own control bar (controls=1).
 *
 * That is deliberate. A chromeless embed (`controls=0`) was tried so MyCinema
 * could draw its own bar, but YouTube still surfaces its own controls on hover
 * regardless — verified by reading the live iframe src and observing the
 * rendered bar — which left two competing control bars. YouTube's bar is also
 * strictly better than anything worth reimplementing: quality selection,
 * playback speed, Picture-in-Picture, captions, chapters, playback stats, and
 * keyboard shortcuts, all maintained upstream.
 *
 * `cc_load_policy=0` means "do not force captions", which is NOT the same as
 * off. FocusTubePlayer additionally unloads the captions module on ready so
 * captions genuinely start off.
 *
 * The `origin` param is deliberately omitted even though Google's docs call it
 * "optional but recommended": with it set, our real (opaque) origin never
 * matches the declared one and the postMessage bridge is dead in both
 * directions. Without it, YouTube falls back to the message event's own origin
 * and the bridge works — which is how FocusTubePlayer tracks progress,
 * duration, end-of-video and keyboard shortcuts.
 */
export function embedUrl(videoId: string, startSeconds = 0): string {
  const params = new URLSearchParams({
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    fs: '1',
    controls: '1',
    enablejsapi: '1',
    // No annotation overlays; they fight with our own overlays.
    iv_load_policy: '3',
    cc_load_policy: '0',
    widget_referrer: `${FOCUS_TUBE_EMBED_ORIGIN}/`,
  })
  if (startSeconds > 0) params.set('start', String(Math.floor(startSeconds)))
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`
}
