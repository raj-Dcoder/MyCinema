import { net } from 'electron'

// ─── Focus Tube: SponsorBlock (in-video sponsor / intro / outro skip) ───────
// Uses the public SponsorBlock API (https://sponsor.ajay.app) — the same
// crowd-sourced database behind the browser extension. No API key needed.
//
// Privacy: only a videoId hash-prefix lookup is sent, never watch history.
// Failure is always silent (empty list) so playback never depends on it.

export interface FtSponsorSegment {
  category: string
  start: number
  end: number
}

const API_BASE = 'https://sponsor.ajay.app/api/skipSegments'
const CATEGORIES = ['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'preview', 'music_offtopic']
const TIMEOUT_MS = 8000
const CACHE_TTL_MS = 30 * 60_000
const MAX_CACHE_ENTRIES = 200

const cache = new Map<string, { at: number; segments: FtSponsorSegment[] }>()

function httpGet(url: string, timeoutMs: number): Promise<Response> {
  if (net && typeof (net as any).fetch === 'function') {
    return (net as any).fetch(url, { redirect: 'follow' }) as unknown as Promise<Response>
  }
  return fetch(url, { redirect: 'follow' })
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    // net.fetch honours AbortSignal in recent Electron; global fetch always does.
    const signal = controller.signal as any
    if (net && typeof (net as any).fetch === 'function') {
      return await (net as any).fetch(url, { signal, redirect: 'follow' })
    }
    return await fetch(url, { signal, redirect: 'follow' })
  } finally {
    clearTimeout(timer)
  }
}

function pruneCache(): void {
  if (cache.size <= MAX_CACHE_ENTRIES) return
  const entries = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)
  for (const [key] of entries.slice(0, cache.size - MAX_CACHE_ENTRIES)) {
    cache.delete(key)
  }
}

export async function getSponsorSegments(videoId: string): Promise<FtSponsorSegment[]> {
  const id = String(videoId || '').trim()
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return []

  const cached = cache.get(id)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.segments

  const params = new URLSearchParams({ videoID: id })
  for (const category of CATEGORIES) params.append('category', category)
  const url = `${API_BASE}?${params.toString()}`

  try {
    const response = await fetchWithTimeout(url, TIMEOUT_MS)
    // 404 = no community submissions for this video — the normal case.
    if (response.status === 404) {
      cache.set(id, { at: Date.now(), segments: [] })
      pruneCache()
      return []
    }
    if (!response.ok) return []
    const data = (await response.json()) as any[]
    if (!Array.isArray(data)) return []
    const segments: FtSponsorSegment[] = []
    for (const entry of data) {
      const seg = Array.isArray(entry?.segment) ? entry.segment : null
      const start = Number(seg?.[0])
      const end = Number(seg?.[1])
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < 0) continue
      segments.push({ category: String(entry?.category || 'sponsor'), start, end })
    }
    segments.sort((a, b) => a.start - b.start)
    cache.set(id, { at: Date.now(), segments })
    pruneCache()
    return segments
  } catch {
    // Offline / blocked / rate-limited — playback continues without skipping.
    return cached?.segments ?? []
  }
}
