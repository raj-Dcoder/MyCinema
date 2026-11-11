import type { TmdbProvider } from '../types'

/**
 * Strips redundant channel/bundle suffixes and standardizes streaming platform brand names.
 */
export function cleanProviderName(rawName: string): string {
  if (!rawName) return ''
  let name = rawName.trim()
  name = name.replace(/\s+(with ads|amazon channel|roku premium channel|apple tv channel|apple tv|essential|premium|channel)$/i, '').trim()

  const lower = name.toLowerCase()
  if (lower === 'amazon prime video' || lower === 'amazon video' || lower.includes('prime video')) {
    return 'Prime Video'
  }
  if (lower === 'disney+ hotstar' || lower === 'disney hotstar' || lower === 'jiohotstar') {
    return 'Hotstar'
  }
  if (lower === 'apple tv plus' || lower === 'apple tv+') {
    return 'Apple TV+'
  }
  if (lower === 'hbo max' || lower === 'max') {
    return 'Max'
  }
  if (lower.startsWith('paramount')) {
    return 'Paramount+'
  }
  if (lower.startsWith('peacock')) {
    return 'Peacock'
  }
  if (lower.startsWith('discovery')) {
    return 'Discovery+'
  }
  if (lower.startsWith('lionsgate')) {
    return 'Lionsgate Play'
  }

  return name
}

/**
 * Returns a smart direct title page link (if resolved) or deep search link for a given streaming provider.
 */
export function getStreamingDeepLink(
  provider: TmdbProvider,
  title: string,
  justWatchFallback?: string | null
): string {
  // Direct title page on OTT platform if resolved from JustWatch
  if (provider.direct_url && typeof provider.direct_url === 'string' && provider.direct_url.startsWith('http')) {
    return provider.direct_url.replace(/&amp;/g, '&')
  }

  const cleanTitle = (title || '').trim()
  const name = (provider.provider_name || '').toLowerCase()
  const id = provider.provider_id

  // Netflix
  if (id === 8 || name.includes('netflix')) {
    return `https://www.netflix.com/search?q=${encodeURIComponent(cleanTitle)}`
  }

  // Amazon Prime Video / Amazon Video
  if (
    id === 119 ||
    id === 9 ||
    id === 10 ||
    id === 35 ||
    name.includes('prime') ||
    name.includes('amazon')
  ) {
    return `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${encodeURIComponent(cleanTitle)}`
  }

  // Disney+ / Disney+ Hotstar / JioHotstar / Hotstar
  if (
    id === 337 ||
    id === 122 ||
    id === 390 ||
    name.includes('hotstar') ||
    name.includes('disney')
  ) {
    return `https://www.hotstar.com/in/explore?search_query=${encodeURIComponent(cleanTitle)}`
  }

  // Apple TV+ / Apple TV
  if (id === 350 || id === 2 || name.includes('apple')) {
    return `https://tv.apple.com/search?term=${encodeURIComponent(cleanTitle)}`
  }

  // Max / HBO Max / HBO
  if (id === 384 || id === 1899 || name.includes('max') || name.includes('hbo')) {
    return `https://play.max.com/search?q=${encodeURIComponent(cleanTitle)}`
  }

  // Hulu
  if (id === 15 || name.includes('hulu')) {
    return `https://www.hulu.com/search?q=${encodeURIComponent(cleanTitle)}`
  }

  // Paramount+
  if (id === 531 || name.includes('paramount')) {
    return `https://www.paramountplus.com/search/?q=${encodeURIComponent(cleanTitle)}`
  }

  // Peacock / Peacock Premium
  if (id === 386 || name.includes('peacock')) {
    return `https://www.peacocktv.com/search?q=${encodeURIComponent(cleanTitle)}`
  }

  // Zee5
  if (id === 232 || name.includes('zee5') || name.includes('zee')) {
    return `https://www.zee5.com/search?q=${encodeURIComponent(cleanTitle)}`
  }

  // SonyLIV
  if (id === 237 || name.includes('sonyliv') || name.includes('sony liv')) {
    return `https://www.sonyliv.com/search/${encodeURIComponent(cleanTitle)}`
  }

  // JioCinema
  if (id === 220 || name.includes('jiocinema') || name.includes('jio cinema')) {
    return `https://www.jiocinema.com/search/${encodeURIComponent(cleanTitle)}`
  }

  // Crunchyroll
  if (id === 283 || name.includes('crunchyroll')) {
    return `https://www.crunchyroll.com/search?q=${encodeURIComponent(cleanTitle)}`
  }

  // YouTube / YouTube Premium
  if (id === 188 || id === 192 || name.includes('youtube')) {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanTitle)}`
  }

  // MUBI
  if (id === 11 || name.includes('mubi')) {
    return `https://mubi.com/search?query=${encodeURIComponent(cleanTitle)}`
  }

  // Discovery+
  if (id === 520 || name.includes('discovery')) {
    return `https://www.discoveryplus.com/search?q=${encodeURIComponent(cleanTitle)}`
  }

  // Lionsgate Play
  if (name.includes('lionsgate')) {
    return `https://www.lionsgateplay.com/search?q=${encodeURIComponent(cleanTitle)}`
  }

  // Aha
  if (id === 532 || name.includes('aha')) {
    return `https://www.aha.video/search?q=${encodeURIComponent(cleanTitle)}`
  }

  // Sun NXT
  if (id === 309 || name.includes('sun nxt')) {
    return `https://www.sunnxt.com/search/${encodeURIComponent(cleanTitle)}`
  }

  // Hoichoi
  if (id === 315 || name.includes('hoichoi')) {
    return `https://www.hoichoi.tv/search?q=${encodeURIComponent(cleanTitle)}`
  }

  // JustWatch regional fallback
  if (justWatchFallback) return justWatchFallback
  if (provider.link) return provider.link

  // Universal search fallback
  const providerLabel = provider.provider_name || 'streaming'
  const query = cleanTitle ? `watch "${cleanTitle}" on ${providerLabel}` : `watch on ${providerLabel}`
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`
}
