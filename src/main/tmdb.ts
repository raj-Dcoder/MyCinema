import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { app } from 'electron'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
// Using undici (built-in fetch engine) to override DNS lookups
const { fetch, Agent, setGlobalDispatcher } = require('undici')

// ─── DNS-over-HTTPS (DoH) Logic ──────────────────────────────────────────────

let cachedTmdbIp: string | null = null

/**
 * Resolves a hostname using Cloudflare's DNS-over-HTTPS API.
 * This bypasses poisoned/blocked local ISP DNS servers.
 */
async function resolveDnsDoH(hostname: string): Promise<string | null> {
  if (cachedTmdbIp) return cachedTmdbIp

  try {
    console.log(`[DNS] Resolving ${hostname} via Cloudflare DoH...`)
    const response = await fetch(`https://1.1.1.1/dns-query?name=${hostname}&type=A`, {
      headers: { 'Accept': 'application/dns-json' }
    })
    const data = await response.json() as any
    if (data.Answer && data.Answer.length > 0) {
      const ip = data.Answer[0].data
      console.log(`[DNS] Resolved ${hostname} to ${ip}`)
      cachedTmdbIp = ip
      return ip
    }
  } catch (err: any) {
    console.error(`[DNS] DoH resolution failed: ${err.message}`)
  }
  return null
}

/**
 * A custom network dispatcher that uses our DoH result for specific hosts
 */
const tmdbDispatcher = new Agent({
  connect: {
    lookup: (hostname: string, options: any, callback: (err: Error | null, addresses: any[]) => void) => {
      // If it's TMDB and we have a cached IP from DoH, use it!
      if ((hostname.includes('themoviedb.org') || hostname.includes('tmdb.org')) && cachedTmdbIp) {
        return callback(null, [{ address: cachedTmdbIp, family: 4 }])
      }
      // Otherwise use standard system DNS
      require('dns').lookup(hostname, options, callback)
    }
  }
})

// ─── Environment ─────────────────────────────────────────────────────────────

// electron-vite injects MAIN_VITE_* env vars at build time via import.meta.env
function getTmdbApiKey(): string {
  // Vite build-time injection (primary) → runtime fallback
  const env = (import.meta as any).env || {}
  return env.MAIN_VITE_TMDB_API_KEY || process.env.MAIN_VITE_TMDB_API_KEY || ''
}

const TMDB_BASE    = 'https://api.themoviedb.org/3'
const TMDB_IMG     = 'https://image.tmdb.org/t/p/w500'
const TMDB_BACKDROP = 'https://image.tmdb.org/t/p/w1280'
const TMDB_ORIGINAL = 'https://image.tmdb.org/t/p/original'
const YOUTUBE_EMBED_ORIGIN = 'https://mycinema.app'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TmdbResult {
  poster_path: string | null
  backdrop_path: string | null
  overview:    string | null
  tagline:     string | null
  genres:      string | null
  tmdb_id:     number | null
  vote_average: number | null
  release_year: number | null
}

export interface TmdbTrailer {
  key: string
  name: string
  site: 'YouTube'
  type: string
  official: boolean
  publishedAt: string | null
  thumbnailUrl: string
  watchUrl: string
  embedUrl: string
  source: 'movie' | 'series' | 'season'
  label: string
  seasonNumber: number | null
  availableSeasons: number[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCacheDir(): string {
  const dir = path.join(app.getPath('userData'), 'poster_cache')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function cacheKey(title: string, type: 'movie' | 'series'): string {
  return crypto.createHash('sha1').update(`${type}::${title.toLowerCase().trim()}`).digest('hex')
}

// ─── Trending Cache ──────────────────────────────────────────────────────────

const trendingCache: Record<string, { data: any[], timestamp: number }> = {}
const TRENDING_CACHE_TTL = 1000 * 60 * 60 * 6 // 6 hours

const INDIA_OTT_PROVIDER_NAMES = [
  'Netflix',
  'Amazon Prime Video',
  'Prime Video',
  'JioHotstar',
  'Hotstar',
  'Disney+ Hotstar'
]

let indiaOttProviderIdsCache: { ids: number[], timestamp: number } | null = null
const youtubePlayableCache = new Map<string, { playable: boolean, timestamp: number }>()
const YOUTUBE_PLAYABLE_CACHE_TTL = 1000 * 60 * 60 * 12
const tmdbTrailerCache = new Map<string, { trailer: TmdbTrailer | null, timestamp: number }>()
const TMDB_TRAILER_CACHE_TTL = 1000 * 60 * 30

function getTmdbListCacheDir(): string {
  const dir = path.join(app.getPath('userData'), 'tmdb_list_cache')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function getTmdbListCachePath(key: string): string {
  const safeKey = crypto.createHash('sha1').update(key).digest('hex')
  return path.join(getTmdbListCacheDir(), `${safeKey}.json`)
}

function readTmdbListCache(key: string, label: string): any[] | null {
  const now = Date.now()
  const memoryHit = trendingCache[key]
  if (memoryHit && (now - memoryHit.timestamp) < TRENDING_CACHE_TTL) {
    console.log(`[TMDB] Serving ${label} from memory cache (age: ${Math.round((now - memoryHit.timestamp) / 1000 / 60)} mins)`)
    return memoryHit.data
  }

  const cachePath = getTmdbListCachePath(key)
  if (!fs.existsSync(cachePath)) return null

  try {
    const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as { data?: unknown; timestamp?: unknown }
    if (!Array.isArray(cached.data) || typeof cached.timestamp !== 'number') return null

    const age = now - cached.timestamp
    if (age >= TRENDING_CACHE_TTL) {
      console.log(`[TMDB] ${label} disk cache expired (age: ${Math.round(age / 1000 / 60)} mins)`)
      return null
    }

    trendingCache[key] = { data: cached.data, timestamp: cached.timestamp }
    console.log(`[TMDB] Serving ${label} from disk cache (age: ${Math.round(age / 1000 / 60)} mins)`)
    return cached.data
  } catch (err: any) {
    console.warn(`[TMDB] Failed to read ${label} disk cache: ${err.message}`)
    return null
  }
}

function writeTmdbListCache(key: string, label: string, data: any[]): void {
  const entry = { data, timestamp: Date.now() }
  trendingCache[key] = entry

  try {
    fs.writeFileSync(getTmdbListCachePath(key), JSON.stringify(entry))
  } catch (err: any) {
    console.warn(`[TMDB] Failed to write ${label} disk cache: ${err.message}`)
  }
}

function formatTmdbDate(date: Date): string {
  return date.toISOString().substring(0, 10)
}

function normalizeProviderName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

async function isYoutubeVideoPlayable(videoKey: string): Promise<boolean> {
  const cached = youtubePlayableCache.get(videoKey)
  if (cached && Date.now() - cached.timestamp < YOUTUBE_PLAYABLE_CACHE_TTL) {
    return cached.playable
  }

  try {
    const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoKey)}&hl=en`
    const response = await fetch(watchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    })

    if (!response.ok) return true

    const html = await response.text()
    const statusMatch = html.match(/"playabilityStatus":\{"status":"([^"]+)"/)
    const embedMatch = html.match(/"playableInEmbed":(true|false)/)
    const status = statusMatch?.[1] || ''
    const playable = status === 'OK' && embedMatch?.[1] !== 'false'

    if (status) {
      youtubePlayableCache.set(videoKey, { playable, timestamp: Date.now() })
      return playable
    }
  } catch (err: any) {
    console.warn(`[YouTube] Could not verify trailer "${videoKey}": ${err.message}`)
  }

  return true
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/\\u0026/g, '&')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function normalizeYoutubeMatchText(value: string): string {
  return decodeHtmlEntities(value)
    .toLowerCase()
    .replace(/\+/g, ' plus ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function isEpisodeSpecificTrailerName(value: string): boolean {
  const normalized = normalizeYoutubeMatchText(value)
  return /\b(episode|ep)\s*\d+\b/.test(normalized) || /\be\d{1,2}\b/.test(normalized) || /\bs\d{1,2}\s*e\d{1,2}\b/.test(normalized)
}

async function fetchIndiaOttProviderIds(apiKey: string): Promise<number[]> {
  const now = Date.now()
  const providerCacheKey = 'providers:IN:movie:ott'
  if (indiaOttProviderIdsCache && (now - indiaOttProviderIdsCache.timestamp) < TRENDING_CACHE_TTL) {
    return indiaOttProviderIdsCache.ids
  }

  const cachedProviderIds = readTmdbListCache(providerCacheKey, 'India OTT provider ids')
  if (cachedProviderIds && cachedProviderIds.every((id) => typeof id === 'number')) {
    indiaOttProviderIdsCache = {
      ids: cachedProviderIds,
      timestamp: trendingCache[providerCacheKey]?.timestamp || now
    }
    return cachedProviderIds
  }

  if (!cachedTmdbIp) {
    await resolveDnsDoH('api.themoviedb.org')
  }

  const url = `${TMDB_BASE}/watch/providers/movie?api_key=${apiKey}&watch_region=IN`
  const response = await fetch(url, {
    dispatcher: tmdbDispatcher,
    headers: {
      'User-Agent': 'MyCinema/1.3.0',
      'Accept': 'application/json'
    }
  })

  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const data = await response.json() as any
  const targetNames = INDIA_OTT_PROVIDER_NAMES.map(normalizeProviderName)
  const ids = (data.results || [])
    .filter((provider: any) => targetNames.includes(normalizeProviderName(provider.provider_name || '')))
    .map((provider: any) => provider.provider_id)
    .filter((id: any): id is number => typeof id === 'number')

  console.log(`[TMDB] India OTT provider ids: ${ids.join(', ') || 'none found'}`)
  indiaOttProviderIdsCache = { ids, timestamp: Date.now() }
  writeTmdbListCache(providerCacheKey, 'India OTT provider ids', ids)
  return ids
}

async function fetchTitleLogo(
  endpoint: 'movie' | 'tv',
  tmdbId: number,
  apiKey: string
): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      include_image_language: 'en,null'
    })
    const url = `${TMDB_BASE}/${endpoint}/${tmdbId}/images?${params.toString()}`
    const response = await fetch(url, {
      dispatcher: tmdbDispatcher,
      headers: {
        'User-Agent': 'MyCinema/1.3.0',
        'Accept': 'application/json'
      }
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json() as any
    const logos = Array.isArray(data.logos) ? data.logos : []
    const selected = logos
      .filter((logo: any) => logo.file_path)
      .sort((a: any, b: any) => {
        const aEnglish = a.iso_639_1 === 'en' ? 1 : 0
        const bEnglish = b.iso_639_1 === 'en' ? 1 : 0
        if (aEnglish !== bEnglish) return bEnglish - aEnglish
        return (b.vote_average || 0) - (a.vote_average || 0) || (b.width || 0) - (a.width || 0)
      })[0]

    return selected ? `${TMDB_ORIGINAL}${selected.file_path}` : null
  } catch (err: any) {
    console.warn(`[TMDB] Logo fetch failed for ${endpoint}/${tmdbId}: ${err.message}`)
    return null
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function fetchTrending(type: 'movie' | 'series'): Promise<any[]> {
  const cacheKey = `trending:${type}:week`
  const cached = readTmdbListCache(cacheKey, `trending ${type}`)
  if (cached) return cached

  const apiKey = getTmdbApiKey()
  if (!apiKey) {
    console.warn('[TMDB] TMDB_API_KEY is not set — skipping trending fetch')
    return []
  }

  try {
    const endpoint = type === 'series' ? 'tv' : 'movie'
    const url = `${TMDB_BASE}/trending/${endpoint}/week?api_key=${apiKey}`
    console.log(`[TMDB] Fetching trending ${type} from: ${url.replace(apiKey, 'REDACTED')}`)
    
    if (!cachedTmdbIp) {
      await resolveDnsDoH('api.themoviedb.org')
    }

    const response = await fetch(url, { 
      dispatcher: tmdbDispatcher,
      headers: {
        'User-Agent': 'MyCinema/1.3.0',
        'Accept': 'application/json'
      }
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json() as any
    
    console.log(`[TMDB] Successfully fetched ${data.results?.length || 0} trending ${type}`)
    
    const results = await Promise.all((data.results || []).map(async (item: any) => ({
      id: item.id,
      tmdb_id: item.id,
      title: item.title || item.name,
      overview: item.overview,
      poster_path: item.poster_path ? `${TMDB_IMG}${item.poster_path}` : null,
      backdrop_path: item.backdrop_path ? `${TMDB_BACKDROP}${item.backdrop_path}` : null,
      logo_path: item.id ? await fetchTitleLogo(endpoint, item.id, apiKey) : null,
      vote_average: item.vote_average,
      release_year: (item.release_date || item.first_air_date || '').substring(0, 4),
      type: type,
      isExternal: true
    })))

    writeTmdbListCache(cacheKey, `trending ${type}`, results)

    return results
  } catch (err) {
    console.error(`[TMDB] Error fetching trending ${type}:`, err)
    return []
  }
}

export async function fetchTrendingInIndia(): Promise<any[]> {
  const cacheKey = 'trending:movie:IN:ott-recent'
  const cached = readTmdbListCache(cacheKey, 'India OTT trending movies')
  if (cached) return cached

  const apiKey = getTmdbApiKey()
  if (!apiKey) {
    console.warn('[TMDB] TMDB_API_KEY is not set — skipping India trending fetch')
    return []
  }

  try {
    const providerIds = await fetchIndiaOttProviderIds(apiKey)
    if (providerIds.length === 0) {
      console.warn('[TMDB] No India OTT provider ids found — skipping India trending fetch')
      return []
    }

    const today = new Date()
    const recentCutoff = new Date(today)
    recentCutoff.setMonth(recentCutoff.getMonth() - 18)

    const params = new URLSearchParams({
      api_key: apiKey,
      include_adult: 'false',
      include_video: 'false',
      language: 'en-US',
      page: '1',
      'primary_release_date.gte': formatTmdbDate(recentCutoff),
      'primary_release_date.lte': formatTmdbDate(today),
      region: 'IN',
      sort_by: 'popularity.desc',
      watch_region: 'IN',
      with_origin_country: 'IN',
      with_watch_monetization_types: 'flatrate',
      with_watch_providers: providerIds.join('|')
    })
    const url = `${TMDB_BASE}/discover/movie?${params.toString()}`
    console.log(`[TMDB] Fetching India OTT trending movies from: ${url.replace(apiKey, 'REDACTED')}`)

    if (!cachedTmdbIp) {
      await resolveDnsDoH('api.themoviedb.org')
    }

    const response = await fetch(url, {
      dispatcher: tmdbDispatcher,
      headers: {
        'User-Agent': 'MyCinema/1.3.0',
        'Accept': 'application/json'
      }
    })

    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json() as any

    console.log(`[TMDB] Successfully fetched ${data.results?.length || 0} India OTT trending movies`)

    const results = (data.results || []).map((item: any) => ({
      id: item.id,
      tmdb_id: item.id,
      title: item.title || item.name,
      overview: item.overview,
      poster_path: item.poster_path ? `${TMDB_IMG}${item.poster_path}` : null,
      backdrop_path: item.backdrop_path ? `${TMDB_BACKDROP}${item.backdrop_path}` : null,
      vote_average: item.vote_average,
      release_year: (item.release_date || '').substring(0, 4),
      type: 'movie',
      isExternal: true
    }))

    writeTmdbListCache(cacheKey, 'India OTT trending movies', results)

    return results
  } catch (err) {
    console.error('[TMDB] Error fetching India OTT trending movies:', err)
    return []
  }
}

export async function fetchTmdbMetadata(
  videoId: number,
  title: string,
  type: 'movie' | 'series',
  year?: number,
  existingTmdbId?: number
): Promise<TmdbResult> {
  const empty: TmdbResult = { poster_path: null, backdrop_path: null, overview: null, tagline: null, genres: null, tmdb_id: null, vote_average: null, release_year: null }
  const apiKey = getTmdbApiKey()

  if (!apiKey) {
    console.warn('[TMDB] TMDB_API_KEY is not set — skipping API fetch')
    return empty
  }

  const cacheDir  = getCacheDir()
  const key       = crypto.createHash('sha1').update(`${type}::${title.toLowerCase().trim()}::${year || ''}`).digest('hex')
  const cachePath = path.join(cacheDir, `${key}.jpg`)
  const backdropCachePath = path.join(cacheDir, `${key}-bg.jpg`)
  const sidecarPath = path.join(cacheDir, `${key}.json`)

  // 1. Cache HIT (Metadata Sidecar)
  if (fs.existsSync(sidecarPath)) {
    console.log(`[TMDB] Cache hit (metadata) for "${title}" ${year ? `(${year})` : ''}`)
    try {
      const sidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'))
      
      // Migration: if the sidecar exists but doesn't have tagline/genres, 
      // we ignore the cache hit to force a fresh fetch with full details.
      if (sidecar.tagline === undefined && sidecar.genres === undefined) {
        console.log(`[TMDB] Old cache entry missing tagline/genres — forcing re-fetch for "${title}"`)
        // Fall through to fetch section
      } else {
        // Case A: Poster exists on disk
        if (fs.existsSync(cachePath)) {
          return { 
            poster_path: cachePath, 
            backdrop_path: fs.existsSync(backdropCachePath) ? backdropCachePath : null,
            overview: sidecar.overview, 
            tagline: sidecar.tagline || null,
            genres: sidecar.genres || null,
            tmdb_id: sidecar.tmdb_id,
            vote_average: sidecar.vote_average || null,
            release_year: sidecar.release_year || null
          }
        }
        
        // Case B: We already searched and found NO results or NO poster
        // (Verified by the lack of a .jpg file but existence of a .json)
        return { 
          poster_path: null, 
          backdrop_path: null,
          overview: sidecar.overview, 
          tagline: sidecar.tagline || null,
          genres: sidecar.genres || null,
          tmdb_id: sidecar.tmdb_id,
          vote_average: sidecar.vote_average || null,
          release_year: sidecar.release_year || null
        }
      }
    } catch {
      // JSON corrupt? Fall through to fetch
    }
  }

  // 2. Fetch from TMDB using global fetch (available in Electron 29+)
  try {
    const endpoint = type === 'series' ? 'tv' : 'movie'
    const query = encodeURIComponent(title)
    
    // Bypass ISP DNS poisoning by resolving via Cloudflare DoH first
    if (!cachedTmdbIp) {
      await resolveDnsDoH('api.themoviedb.org')
    }

    let tmdb_id: number | null = existingTmdbId || null

    if (!tmdb_id) {
      // Add year to search if available for pinpoint accuracy
      let url = `${TMDB_BASE}/search/${endpoint}?api_key=${apiKey}&query=${query}&language=en-US&page=1`
      if (year) {
        url += type === 'series' ? `&first_air_date_year=${year}` : `&year=${year}`
      }

      console.log(`[TMDB] Fetching search results for "${title}" ${year ? `(${year})` : ''}…`)
      
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 30000)
      
      const response = await fetch(url, { 
        signal: controller.signal,
        dispatcher: tmdbDispatcher,
        headers: {
          'User-Agent': 'MyCinema/1.3.0 (Electron/29; Windows)',
          'Accept': 'application/json'
        }
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`)
      }

      const data = await response.json() as any

      if (!data.results || data.results.length === 0) {
        console.log(`[TMDB] No results for "${title}" ${year ? `(${year})` : ''}`)
        fs.writeFileSync(sidecarPath, JSON.stringify({ overview: null, tmdb_id: null, tagline: null, genres: null, vote_average: null, release_year: null }))
        return empty
      }

      const searchHit = data.results[0]
      tmdb_id = searchHit.id
    }

    // Now fetch full details to get tagline and genres
    console.log(`[TMDB] Fetching full details for TMDB ID ${tmdb_id}…`)
    const detailsUrl = `${TMDB_BASE}/${endpoint}/${tmdb_id}?api_key=${apiKey}&language=en-US`
    
    const detailsResponse = await fetch(detailsUrl, {
      dispatcher: tmdbDispatcher,
      headers: {
        'User-Agent': 'MyCinema/1.3.0',
        'Accept': 'application/json'
      }
    })
    
    if (!detailsResponse.ok) {
      throw new Error(`HTTP ${detailsResponse.status} for ${detailsUrl}`)
    }
    
    const hit = await detailsResponse.json() as any
    const remotePosterPath = hit.poster_path
    const remoteBackdropPath = hit.backdrop_path || null
    const overview = hit.overview || null
    const tagline = hit.tagline || null
    const genres = hit.genres ? hit.genres.map((g: any) => g.name).join(', ') : null
    
    // Parse Real Rating & Real Release Year
    const vote_average = typeof hit.vote_average === 'number' ? Number(hit.vote_average.toFixed(1)) : null
    const releaseStr = hit.release_date || hit.first_air_date
    const release_year = releaseStr ? parseInt(releaseStr.substring(0, 4)) : null

    // Save sidecar
    fs.writeFileSync(sidecarPath, JSON.stringify({ overview, tmdb_id, tagline, genres, vote_average, release_year }))

    let cachedPoster: string | null = null
    let cachedBackdrop: string | null = null

    // 3. Download poster
    if (remotePosterPath) {
      const posterUrl = `${TMDB_IMG}${remotePosterPath}`
      console.log(`[TMDB] Downloading poster for "${title}" from ${remotePosterPath}…`)
      
      try {
        const imgResponse = await fetch(posterUrl, { dispatcher: tmdbDispatcher, headers: { 'User-Agent': 'MyCinema/1.3.0' } })
        if (imgResponse.ok) {
          const arrayBuffer = await imgResponse.arrayBuffer()
          fs.writeFileSync(cachePath, Buffer.from(arrayBuffer))
          cachedPoster = cachePath
          console.log(`[TMDB] Success! Poster cached for "${title}"`)
        }
      } catch (e: any) { console.error(`[TMDB] Failed to download poster: ${e.message}`) }
    }

    // Download backdrop
    if (remoteBackdropPath) {
      const backdropUrl = `${TMDB_BACKDROP}${remoteBackdropPath}`
      console.log(`[TMDB] Downloading backdrop for "${title}" from ${remoteBackdropPath}…`)
      
      try {
        const bgResponse = await fetch(backdropUrl, { dispatcher: tmdbDispatcher, headers: { 'User-Agent': 'MyCinema/1.3.0' } })
        if (bgResponse.ok) {
          const arrayBuffer = await bgResponse.arrayBuffer()
          fs.writeFileSync(backdropCachePath, Buffer.from(arrayBuffer))
          cachedBackdrop = backdropCachePath
          console.log(`[TMDB] Success! Backdrop cached for "${title}"`)
        }
      } catch (e: any) { console.error(`[TMDB] Failed to download backdrop: ${e.message}`) }
    }

    return { poster_path: cachedPoster, backdrop_path: cachedBackdrop, overview, tagline, genres, tmdb_id, vote_average, release_year }

  } catch (err: any) {
    console.error(`[TMDB] Error for "${title}" ${year ? `(${year})` : ''}:`, err.message)
    return empty
  }
}

export async function fetchTmdbTrailer(params: {
  tmdbId?: number | null
  title: string
  type: 'movie' | 'series'
  year?: number | null
  seasonNumber?: number | null
  preferLatestSeason?: boolean
}): Promise<TmdbTrailer | null> {
  const cacheKey = JSON.stringify({
    tmdbId: params.tmdbId || null,
    title: params.title,
    type: params.type,
    year: params.year || null,
    seasonNumber: params.seasonNumber || null,
    preferLatestSeason: Boolean(params.preferLatestSeason)
  })
  const cachedTrailer = tmdbTrailerCache.get(cacheKey)
  if (cachedTrailer && Date.now() - cachedTrailer.timestamp < TMDB_TRAILER_CACHE_TTL) {
    return cachedTrailer.trailer
  }

  const apiKey = getTmdbApiKey()
  if (!apiKey) {
    console.warn('[TMDB] TMDB_API_KEY is not set — skipping trailer fetch')
    return null
  }

  try {
    if (!cachedTmdbIp) {
      await resolveDnsDoH('api.themoviedb.org')
    }

    const endpoint = params.type === 'series' ? 'tv' : 'movie'
    let tmdbId = params.tmdbId || null

    if (!tmdbId) {
      const queryParams = new URLSearchParams({
        api_key: apiKey,
        query: params.title,
        language: 'en-US',
        page: '1'
      })
      if (params.year) {
        queryParams.set(params.type === 'series' ? 'first_air_date_year' : 'year', String(params.year))
      }

      const searchUrl = `${TMDB_BASE}/search/${endpoint}?${queryParams.toString()}`
      const searchResponse = await fetch(searchUrl, {
        dispatcher: tmdbDispatcher,
        headers: {
          'User-Agent': 'MyCinema/1.16.0',
          'Accept': 'application/json'
        }
      })

      if (!searchResponse.ok) throw new Error(`HTTP ${searchResponse.status}`)
      const searchData = await searchResponse.json() as any
      tmdbId = searchData.results?.[0]?.id || null
    }

    if (!tmdbId) return null

    let tvNetworkNames: string[] = []

    const fetchTvSeasons = async () => {
      if (params.type !== 'series') return []
      try {
        const detailsParams = new URLSearchParams({
          api_key: apiKey,
          language: 'en-US'
        })
        const detailsUrl = `${TMDB_BASE}/tv/${tmdbId}?${detailsParams.toString()}`
        const response = await fetch(detailsUrl, {
          dispatcher: tmdbDispatcher,
          headers: {
            'User-Agent': 'MyCinema/1.16.0',
            'Accept': 'application/json'
          }
        })

        if (!response.ok) return []
        const data = await response.json() as any
        const today = Date.now()
        tvNetworkNames = (Array.isArray(data.networks) ? data.networks : [])
          .map((network: any) => String(network?.name || '').trim())
          .filter(Boolean)

        return (Array.isArray(data.seasons) ? data.seasons : [])
          .filter((season: any) => {
            if (!season || season.season_number <= 0) return false
            if (season.air_date && new Date(season.air_date).getTime() > today) return false
            return true
          })
          .map((season: any) => Number(season.season_number))
          .filter((seasonNumber: number) => Number.isFinite(seasonNumber))
          .sort((a: number, b: number) => a - b)
      } catch (err: any) {
        console.warn(`[TMDB] Season list fetch failed for "${params.title}": ${err.message}`)
        return []
      }
    }

    const availableSeasons = await fetchTvSeasons()
    const preferredSeason = params.type === 'series'
      ? (params.seasonNumber || (params.preferLatestSeason ? availableSeasons[availableSeasons.length - 1] : null) || null)
      : null

    const fetchVideos = async (language?: string, seasonNumber?: number | null) => {
      const videoParams = new URLSearchParams({ api_key: apiKey })
      if (language) videoParams.set('language', language)
      const seasonPath = params.type === 'series' && seasonNumber ? `/season/${seasonNumber}` : ''
      const videosUrl = `${TMDB_BASE}/${endpoint}/${tmdbId}${seasonPath}/videos?${videoParams.toString()}`
      const response = await fetch(videosUrl, {
        dispatcher: tmdbDispatcher,
        headers: {
          'User-Agent': 'MyCinema/1.16.0',
          'Accept': 'application/json'
        }
      })

      if (!response.ok) return []
      const data = await response.json() as any
      return Array.isArray(data.results) ? data.results : []
    }

    const searchYoutubeTrailer = async (seasonNumber?: number | null) => {
      const primaryNetwork = tvNetworkNames[0] || ''
      const query = [
        `"${params.title}"`,
        params.type === 'series' && seasonNumber ? `season ${seasonNumber}` : '',
        params.type === 'series' ? primaryNetwork : '',
        'official trailer'
      ].filter(Boolean).join(' ')
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en`

      const exactTitle = normalizeYoutubeMatchText(params.title)
      const normalizedNetworks = tvNetworkNames.map(normalizeYoutubeMatchText).filter(Boolean)
      const isShortOrGenericTitle = exactTitle.length <= 5

      const belongsToRequestedTitle = (name: string, channelName?: string) => {
        const normalizedName = normalizeYoutubeMatchText(name)
        const normalizedChannel = normalizeYoutubeMatchText(channelName || '')
        const seasonPattern = seasonNumber
          ? new RegExp(`\\b(season\\s*${seasonNumber}|s0?${seasonNumber})\\b`)
          : null

        if (isEpisodeSpecificTrailerName(name)) return false
        if (seasonPattern && !seasonPattern.test(normalizedName)) return false
        if (!/\b(trailer|teaser)\b/.test(normalizedName)) return false

        const startsWithTitle = normalizedName === exactTitle || normalizedName.startsWith(`${exactTitle} `)
        const containsTitlePhrase = normalizedName.includes(` ${exactTitle} `)
        const hasNetworkHint = normalizedNetworks.some(network => normalizedName.includes(network))
        const hasTrustedChannel = normalizedNetworks.some(network => normalizedChannel.includes(network)) ||
          /\b(mgm|mgm plus|epix|prime video|amazon prime video|netflix|hbo|max|disney|hulu|apple tv|paramount plus|peacock)\b/.test(normalizedChannel)

        // Short names like "FROM" are too ambiguous unless the result is title-led and from a trusted channel.
        if (isShortOrGenericTitle) {
          return startsWithTitle && (hasTrustedChannel || hasNetworkHint)
        }

        return startsWithTitle || containsTitlePhrase || hasNetworkHint
      }

      try {
        const response = await fetch(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        })

        if (!response.ok) return null

        const html = await response.text()
        const videos = new Map<string, any>()
        const videoRendererPattern = /"videoRenderer":\{"videoId":"([^"]+)".*?"title":\{"runs":\[\{"text":"([^"]+)"/gs
        let match: RegExpExecArray | null

        while ((match = videoRendererPattern.exec(html)) !== null && videos.size < 12) {
          const key = match[1]
          const name = decodeHtmlEntities(match[2])
          const rendererChunk = html.slice(match.index, match.index + 4500)
          const channelMatch = rendererChunk.match(/"ownerText":\{"runs":\[\{"text":"([^"]+)"/)
          const channelName = channelMatch ? decodeHtmlEntities(channelMatch[1]) : ''
          if (!videos.has(key)) {
            videos.set(key, {
              key,
              name,
              channelName,
              site: 'YouTube',
              type: /\bteaser\b/i.test(name) ? 'Teaser' : 'Trailer',
              official: /\bofficial\b/i.test(name),
              iso_639_1: 'en',
              published_at: null
            })
          }
        }

        const candidates = Array.from(videos.values())
          .filter((video: any) => belongsToRequestedTitle(video.name, video.channelName))
          .map((video: any) => ({ video, score: scoreTrailer(video) }))
          .filter(({ score }) => score > 120)
          .sort((a, b) => b.score - a.score)

        for (const candidate of candidates.slice(0, 6)) {
          if (await isYoutubeVideoPlayable(candidate.video.key)) {
            console.log(`[YouTube] Using search fallback trailer "${candidate.video.name}"`)
            return candidate.video
          }
        }
      } catch (err: any) {
        console.warn(`[YouTube] Search fallback failed for "${query}": ${err.message}`)
      }

      return null
    }

    const pickBestVideo = async (seasonNumber?: number | null) => {
      const englishVideos = await fetchVideos('en-US', seasonNumber)
      const allLanguageVideos = await fetchVideos(undefined, seasonNumber)
      const videosByKey = new Map<string, any>()
      for (const video of [...allLanguageVideos, ...englishVideos]) {
        if (video?.key) videosByKey.set(video.key, video)
      }

      const candidates = Array.from(videosByKey.values())
        .filter((video: any) => video.site === 'YouTube' && video.key)
        .filter((video: any) => !isEpisodeSpecificTrailerName(video.name || ''))
        .map((video: any) => ({ video, score: scoreTrailer(video) }))
        .sort((a, b) => b.score - a.score)

      for (const candidate of candidates.slice(0, 8)) {
        const playable = await isYoutubeVideoPlayable(candidate.video.key)
        if (playable) return candidate.video
        console.log(`[YouTube] Skipping blocked/unplayable trailer "${candidate.video.name || candidate.video.key}"`)
      }

      return await searchYoutubeTrailer(seasonNumber)
    }

    const scoreTrailer = (video: any) => {
      const name = String(video.name || '').toLowerCase()
      const type = String(video.type || '').toLowerCase()
      const publishedAt = video.published_at ? new Date(video.published_at).getTime() : 0
      let score = 0

      if (isEpisodeSpecificTrailerName(name)) score -= 300
      if (video.site === 'YouTube' && video.key) score += 100
      if (type === 'trailer') score += 80
      if (type === 'teaser') score -= 70
      if (type === 'clip') score -= 100
      if (video.official) score += 35
      if (video.iso_639_1 === 'en') score += 20

      if (/\bofficial\s+trailer\b/.test(name)) score += 80
      if (/\b(final|main|full|theatrical)\s+trailer\b/.test(name)) score += 55
      if (/\btrailer\b/.test(name)) score += 25
      if (/\bteaser\b|\bpromo\b|\bspot\b|\bannouncement\b|\bdate announcement\b|\bclip\b|\bsneak peek\b|\bsong\b|\blyrical\b|\bbehind the scenes\b|\bfeaturette\b/.test(name)) score -= 120
      if (/\btrailer\s*#?\s*2\b|\bofficial trailer 2\b/.test(name)) score += 10

      // Tiny tiebreaker for recency without letting new teasers beat real trailers.
      score += Math.min(10, publishedAt / 1000 / 60 / 60 / 24 / 365 / 10)

      return score
    }

    let selected = preferredSeason ? await pickBestVideo(preferredSeason) : null
    let selectedSeason = selected ? preferredSeason : null
    let source: TmdbTrailer['source'] = params.type === 'movie' ? 'movie' : 'series'

    if (!selected) {
      selected = await pickBestVideo(null)
      selectedSeason = null
      source = params.type === 'movie' ? 'movie' : 'series'
    } else {
      source = 'season'
    }

    if (!selected && preferredSeason) {
      for (const seasonNumber of [...availableSeasons].reverse()) {
        if (seasonNumber === preferredSeason) continue
        selected = await pickBestVideo(seasonNumber)
        if (selected) {
          selectedSeason = seasonNumber
          source = 'season'
          break
        }
      }
    }

    if (!selected) {
      tmdbTrailerCache.set(cacheKey, { trailer: null, timestamp: Date.now() })
      return null
    }

    const selectedLooksLikeFallback = String(selected.type || '').toLowerCase() !== 'trailer' ||
      /\bteaser\b|\bpromo\b|\bspot\b|\bannouncement\b|\bclip\b/.test(String(selected.name || '').toLowerCase())

    if (selectedLooksLikeFallback) {
      console.log(`[TMDB] No full trailer found for "${params.title}" — using best available video: ${selected.name || selected.type}`)
    }

    const label = source === 'season' && selectedSeason
      ? `Season ${selectedSeason} Trailer`
      : params.type === 'series'
        ? 'Series Trailer'
        : 'Movie Trailer'

    const embedParams = new URLSearchParams({
      autoplay: '1',
      rel: '0',
      modestbranding: '1',
      playsinline: '1',
      origin: YOUTUBE_EMBED_ORIGIN,
      widget_referrer: `${YOUTUBE_EMBED_ORIGIN}/`
    })

    const trailerResult: TmdbTrailer = {
      key: selected.key,
      name: selected.name || 'Official Trailer',
      site: 'YouTube',
      type: selected.type || 'Trailer',
      official: Boolean(selected.official),
      publishedAt: selected.published_at || null,
      thumbnailUrl: `https://img.youtube.com/vi/${selected.key}/hqdefault.jpg`,
      watchUrl: `https://www.youtube.com/watch?v=${selected.key}`,
      embedUrl: `https://www.youtube.com/embed/${selected.key}?${embedParams.toString()}`,
      source,
      label,
      seasonNumber: selectedSeason,
      availableSeasons
    }

    tmdbTrailerCache.set(cacheKey, { trailer: trailerResult, timestamp: Date.now() })
    return trailerResult
  } catch (err: any) {
    console.warn(`[TMDB] Trailer fetch failed for "${params.title}": ${err.message}`)
    return null
  }
}
