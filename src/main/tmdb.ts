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

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TmdbResult {
  poster_path: string | null
  overview:    string | null
  tagline:     string | null
  genres:      string | null
  tmdb_id:     number | null
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

// ─── Public API ──────────────────────────────────────────────────────────────

export async function fetchTmdbMetadata(
  videoId: number,
  title: string,
  type: 'movie' | 'series',
  year?: number,
  existingTmdbId?: number
): Promise<TmdbResult> {
  const empty: TmdbResult = { poster_path: null, overview: null, tagline: null, genres: null, tmdb_id: null }
  const apiKey = getTmdbApiKey()

  if (!apiKey) {
    console.warn('[TMDB] TMDB_API_KEY is not set — skipping API fetch')
    return empty
  }

  const cacheDir  = getCacheDir()
  const key       = crypto.createHash('sha1').update(`${type}::${title.toLowerCase().trim()}::${year || ''}`).digest('hex')
  const cachePath = path.join(cacheDir, `${key}.jpg`)
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
            overview: sidecar.overview, 
            tagline: sidecar.tagline || null,
            genres: sidecar.genres || null,
            tmdb_id: sidecar.tmdb_id 
          }
        }
        
        // Case B: We already searched and found NO results or NO poster
        // (Verified by the lack of a .jpg file but existence of a .json)
        return { 
          poster_path: null, 
          overview: sidecar.overview, 
          tagline: sidecar.tagline || null,
          genres: sidecar.genres || null,
          tmdb_id: sidecar.tmdb_id 
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

    let tmdb_id = existingTmdbId

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
        fs.writeFileSync(sidecarPath, JSON.stringify({ overview: null, tmdb_id: null, tagline: null, genres: null }))
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
    const overview = hit.overview || null
    const tagline = hit.tagline || null
    const genres = hit.genres ? hit.genres.map((g: any) => g.name).join(', ') : null

    // Save sidecar
    fs.writeFileSync(sidecarPath, JSON.stringify({ overview, tmdb_id, tagline, genres }))

    if (!remotePosterPath) {
      console.log(`[TMDB] Result found for "${title}" but no poster available`)
      return { poster_path: null, overview, tagline, genres, tmdb_id }
    }

    // 3. Download poster
    const posterUrl = `${TMDB_IMG}${remotePosterPath}`
    console.log(`[TMDB] Downloading poster for "${title}" from ${remotePosterPath}…`)
    
    const imgResponse = await fetch(posterUrl, {
      dispatcher: tmdbDispatcher,
      headers: { 'User-Agent': 'MyCinema/1.3.0' }
    })
    if (!imgResponse.ok) throw new Error(`Poster HTTP ${imgResponse.status}`)
    
    const arrayBuffer = await imgResponse.arrayBuffer()
    fs.writeFileSync(cachePath, Buffer.from(arrayBuffer))
    
    console.log(`[TMDB] Success! Poster cached for "${title}"`)
    return { poster_path: cachePath, overview, tagline, genres, tmdb_id }

  } catch (err: any) {
    console.error(`[TMDB] Error for "${title}" ${year ? `(${year})` : ''}:`, err.message)
    return empty
  }
}
