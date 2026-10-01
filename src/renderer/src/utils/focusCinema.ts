// ─── Focus Cinema helpers ───────────────────────────────────────────────────
// Chapters are parsed from the video description (how creators define them on
// YouTube: lines starting with a timestamp). No API key needed.

export interface FtChapter {
  start: number
  title: string
}

export interface FtSponsorSegment {
  category: string
  start: number
  end: number
}

const TIMESTAMP_RE = /(?:^|[\s(\[])(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)(?=[\s)\].,;!?:-]|$)/

export function parseTimestampToSeconds(value: string): number | null {
  const match = /^\s*(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)\s*$/.exec(value)
  if (!match) return null
  const hours = match[1] ? Number(match[1]) : 0
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return null
  return hours * 3600 + minutes * 60 + seconds
}

export function formatChapterTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

/**
 * Parses YouTube-style chapters from a description. Rules mirror YouTube:
 * at least 3 timestamped lines, first starts near 0:00. Returns [] otherwise.
 */
export function parseChapters(description: string | null | undefined, duration: number | null): FtChapter[] {
  if (!description) return []
  const chapters: FtChapter[] = []
  for (const rawLine of description.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const tsMatch = TIMESTAMP_RE.exec(line)
    if (!tsMatch) continue
    const seconds = parseTimestampToSeconds(tsMatch[0].trim().replace(/^[(\[]/, ''))
    if (seconds === null) continue
    if (typeof duration === 'number' && duration > 0 && seconds >= duration) continue
    // Title = text after the timestamp, or before it if timestamp trails.
    const tsIndex = line.indexOf(tsMatch[0].trim())
    let title = (line.slice(tsIndex + tsMatch[0].trim().length) || '').replace(/^[\s\-–—:|.)\]]+/, '').trim()
    if (!title) {
      title = line.slice(0, tsIndex).replace(/[\s\-–—:|([\]]+$/, '').trim()
    }
    if (!title) title = formatChapterTime(seconds)
    // De-dupe identical starts, keep first title.
    if (chapters.some((c) => c.start === seconds)) continue
    chapters.push({ start: seconds, title: title.slice(0, 120) })
  }
  chapters.sort((a, b) => a.start - b.start)
  if (chapters.length < 3) return []
  if (chapters[0].start > 10) return []
  return chapters
}

export function getActiveChapterIndex(chapters: FtChapter[], currentTime: number): number {
  let index = 0
  for (let i = 0; i < chapters.length; i += 1) {
    if (currentTime >= chapters[i].start - 0.25) index = i
    else break
  }
  return index
}

const SPONSOR_LABELS: Record<string, string> = {
  sponsor: 'Sponsor',
  selfpromo: 'Self-promo',
  interaction: 'Subscribe ask',
  intro: 'Intro',
  outro: 'Outro',
  preview: 'Preview',
  music_offtopic: 'Off-topic music',
}

export function sponsorLabel(category: string): string {
  return SPONSOR_LABELS[category] || category
}

/** Splits description into renderable lines with clickable timestamps + links. */
export interface FtDescriptionPart {
  kind: 'text' | 'timestamp' | 'url' | 'newline'
  text: string
  seconds?: number
}

const URL_RE = /https?:\/\/[^\s)]+/y
const TS_RE = /(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)/y

export function splitDescription(description: string): FtDescriptionPart[] {
  const parts: FtDescriptionPart[] = []
  const lines = description.split('\n')
  lines.forEach((line, lineIdx) => {
    let i = 0
    while (i < line.length) {
      URL_RE.lastIndex = i
      const urlMatch = URL_RE.exec(line)
      TS_RE.lastIndex = i
      const tsMatch = TS_RE.exec(line)
      const nextUrl = urlMatch ? urlMatch.index : Infinity
      const nextTs = tsMatch ? tsMatch.index : Infinity
      if (nextUrl === Infinity && nextTs === Infinity) {
        parts.push({ kind: 'text', text: line.slice(i) })
        break
      }
      if (nextUrl < nextTs) {
        if (nextUrl > i) parts.push({ kind: 'text', text: line.slice(i, nextUrl) })
        parts.push({ kind: 'url', text: urlMatch![0] })
        i = nextUrl + urlMatch![0].length
      } else {
        if (nextTs > i) parts.push({ kind: 'text', text: line.slice(i, nextTs) })
        const seconds = parseTimestampToSeconds(tsMatch![0])
        if (seconds === null) {
          parts.push({ kind: 'text', text: tsMatch![0] })
        } else {
          parts.push({ kind: 'timestamp', text: tsMatch![0], seconds })
        }
        i = nextTs + tsMatch![0].length
      }
    }
    if (lineIdx < lines.length - 1) parts.push({ kind: 'newline', text: '\n' })
  })
  return parts
}
