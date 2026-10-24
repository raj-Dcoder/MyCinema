export interface ParsedTorrentInfo {
  cleanTitle: string
  year?: string
  season?: number
  episode?: number
  quality?: string
  source?: string
  codec?: string
  audio?: string[]
  releaseGroup?: string
  rawTitle: string
}

const COMMON_AUDIO_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /\b(hindi[\s._-]*english|dual[\s._-]*audio)\b/i, label: 'Dual Audio' },
  { pattern: /\bmulti[\s._-]*audio\b/i, label: 'Multi Audio' },
  { pattern: /\bhindi\b/i, label: 'Hindi' },
  { pattern: /\benglish\b/i, label: 'English' },
  { pattern: /\bkorean\b/i, label: 'Korean' },
  { pattern: /\btamil\b/i, label: 'Tamil' },
  { pattern: /\btelugu\b/i, label: 'Telugu' },
  { pattern: /\b(ddp?[\s._-]*5\.?1|dd\+[\s._-]*5\.?1)\b/i, label: '5.1 Audio' },
  { pattern: /\batmos\b/i, label: 'Atmos' }
]

const COMMON_SOURCES: { pattern: RegExp; label: string }[] = [
  { pattern: /\b(web[\s._-]*dl|webrip|web)\b/i, label: 'WEB-DL' },
  { pattern: /\b(bluray|bdrip|brrip)\b/i, label: 'BluRay' },
  { pattern: /\bhdtc\b/i, label: 'HDTC' },
  { pattern: /\bhdrip\b/i, label: 'HDRip' },
  { pattern: /\bhdtv\b/i, label: 'HDTV' }
]

export function parseTorrentTitle(raw: string, knownTitle?: string | null): ParsedTorrentInfo {
  const original = (raw || '').trim()
  if (!original) {
    return { cleanTitle: knownTitle || 'Unknown', rawTitle: '' }
  }

  // Strip file extension (.mkv, .mp4, .avi)
  const working = original.replace(/\.(mkv|mp4|avi|webm|ts|mov)$/i, '')

  // Extract year (19xx or 20xx)
  let year: string | undefined
  const yearMatch = working.match(/\b(19\d\d|20\d\d)\b/)
  if (yearMatch) {
    year = yearMatch[1]
  }

  // Extract season & episode (S01E02 or S01)
  let season: number | undefined
  let episode: number | undefined
  const seMatch = working.match(/\bs(\d{1,2})[\s._-]*e(\d{1,3})\b/i)
  if (seMatch) {
    season = parseInt(seMatch[1], 10)
    episode = parseInt(seMatch[2], 10)
  } else {
    const sOnly = working.match(/\bs(\d{1,2})\b/i)
    if (sOnly) {
      season = parseInt(sOnly[1], 10)
    }
  }

  // Extract quality
  let quality: string | undefined
  if (/\b(2160p|4k|uhd)\b/i.test(working)) quality = '4K'
  else if (/\b1080p?\b/i.test(working)) quality = '1080p'
  else if (/\b720p?\b/i.test(working)) quality = '720p'
  else if (/\b480p?\b/i.test(working)) quality = '480p'

  // Extract source
  let source: string | undefined
  for (const s of COMMON_SOURCES) {
    if (s.pattern.test(working)) {
      source = s.label
      break
    }
  }

  // Extract codec
  let codec: string | undefined
  if (/\b(hevc|h\.?265|x265)\b/i.test(working)) codec = 'HEVC'
  else if (/\b(h\.?264|x264|avc)\b/i.test(working)) codec = 'x264'
  else if (/\b(av1)\b/i.test(working)) codec = 'AV1'

  // Extract audio tags
  const audio: string[] = []
  for (const a of COMMON_AUDIO_PATTERNS) {
    if (a.pattern.test(working)) {
      if (!audio.includes(a.label)) {
        if (a.label === 'Hindi' && audio.includes('Dual Audio')) continue
        audio.push(a.label)
      }
    }
  }

  // Check if knownTitle is already clean or if it contains raw release tags
  const isRawKnownTitle = knownTitle && (
    /\b(2160p|1080p|720p|480p|4k|web-?dl|bluray|hdtc|hdrip|yts|x264|x265|hevc)\b/i.test(knownTitle) ||
    /\.(mkv|mp4|avi|webm)$/i.test(knownTitle) ||
    knownTitle.includes('.20') ||
    knownTitle.includes('.19')
  )

  let cleanTitle = !isRawKnownTitle && knownTitle ? knownTitle.trim() : ''

  if (!cleanTitle) {
    // Cut off everything from year, season/episode, or quality markers
    const cutoffMatch = working.match(
      /^(.*?)(?=[._\s-]*(\[(?:19\d\d|20\d\d)\]|\((?:19\d\d|20\d\d)\)|(?:\b(?:19\d\d|20\d\d)\b)|s\d{1,2}|2160p|1080p|720p|480p|4k|web-?dl|bluray|hdtc|hdrip|yts))/i
    )

    if (cutoffMatch && cutoffMatch[1]?.trim()) {
      cleanTitle = cutoffMatch[1]
        .replace(/[._]/g, ' ')
        .replace(/[()[\]{}]/g, '')
        .trim()
    } else {
      cleanTitle = working
        .replace(/\[[^\]]*\]/g, '')
        .replace(/\([^)]*\)/g, '')
        .replace(/[._]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }
  }

  // Clean trailing punctuation and orphan parentheses
  cleanTitle = cleanTitle.replace(/[\s([{\-–—.]+$/, '').trim()

  return {
    cleanTitle: cleanTitle || original,
    year,
    season,
    episode,
    quality,
    source,
    codec,
    audio: audio.slice(0, 2),
    rawTitle: original
  }
}

export function parseSpeedToBytes(speedStr?: string): number {
  if (!speedStr) return 0
  const match = speedStr.trim().match(/^([\d.]+)\s*([KMGTP]?B)\/s$/i)
  if (!match) return 0
  const num = parseFloat(match[1])
  if (isNaN(num)) return 0
  const unit = match[2].toUpperCase()
  if (unit === 'KB') return num * 1024
  if (unit === 'MB') return num * 1024 * 1024
  if (unit === 'GB') return num * 1024 * 1024 * 1024
  return num
}

export function formatTransferSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '0 B/s'
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  const index = Math.min(Math.floor(Math.log(bytesPerSec) / Math.log(1024)), units.length - 1)
  const val = bytesPerSec / Math.pow(1024, index)
  return `${val >= 10 || index === 0 ? val.toFixed(0) : val.toFixed(1)} ${units[index]}`
}

