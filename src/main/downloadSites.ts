import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import dns from 'dns'
import http from 'http'
import https from 'https'

// ─── Download-site registry ──────────────────────────────────────────────────
// These are portal pages that publish the current (unblocked) mirror domain.
// The app resolves the live domain at click-time so a banned/hardcoded domain
// never ships inside the build. Search itself always runs on the resolved
// domain with the full movie/series title.
//
// Resolution order (first hit wins):
//   1. Manual Settings override
//   2. Fresh local cache (< 24h)
//   3. Stale-while-revalidate: instant response with background refresh
//   4. Fast live mirror API / portal redirect scrape with DoH/Google DNS
//   5. GitHub-hosted links — `download-sites/sites.json`
//   6. Stale cache / verified fallback mirror (click never dead-ends)
export interface DownloadSiteConfig {
  id: 'hdmovies' | 'catmovies'
  name: string
  shortLabel: string
  portalUrl: string
  /** Appended after the resolved domain, `{query}` is the encoded title. */
  searchTemplate: string
  accent: string
  /** Substrings a genuine mirror domain usually contains (ranking only). */
  domainHints: string[]
  /** Matches the portal's main button (e.g. `?type=KatmovieHD`) for redirect follow. */
  portalButtonMatch?: string
}

export const DOWNLOAD_SITES: DownloadSiteConfig[] = [
  {
    id: 'hdmovies',
    name: 'HD Movies Hub',
    shortLabel: 'HD',
    portalUrl: 'https://hdhub4u.bi/',
    searchTemplate: '/search.html?q={query}',
    accent: '#f43f5e',
    domainHints: ['hdhub', 'hub4u', 'hdmovie'],
    portalButtonMatch: 'hdhub|hdmovies'
  },
  {
    id: 'catmovies',
    name: 'Cat Movies HD',
    shortLabel: 'CAT',
    portalUrl: 'https://katworld.net/',
    // SPA with JS-only inline search: URL query params are ignored, so open
    // the homepage and let the app auto-type the title into its search box.
    searchTemplate: '/',
    accent: '#22d3ee',
    domainHints: ['katmovie'],
    portalButtonMatch: 'katmoviehd'
  }
]

export const DEFAULT_FALLBACK_MIRRORS: Record<string, string> = {
  hdmovies: 'https://new8.hdhub4u.cl',
  catmovies: 'https://new.katmoviehd.top'
}

// Promo/app links some portals carry (e.g. an APK download button) — never a
// mirror, so they rank below everything and never win on their own.
const DOMAIN_ANTI_HINTS = ['apk', 'play.google', 'app-download']

// 24-hour cache: resolve the portal at most once a day per site.
export const DOWNLOAD_SITE_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 3500

// Custom DNS resolver using Google and Cloudflare DNS to bypass local ISP DNS poisoning
const customResolver = new dns.Resolver()
customResolver.setServers(['8.8.8.8', '1.1.1.1'])

function resolveHostIp(hostname: string, timeoutMs = 1500): Promise<string> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      dns.lookup(hostname, { family: 4 }, (_err, addr) => {
        resolve(addr || hostname)
      })
    }, timeoutMs)

    customResolver.resolve4(hostname, (err, addrs) => {
      clearTimeout(timer)
      if (!err && addrs && addrs.length > 0) {
        resolve(addrs[0])
      } else {
        dns.lookup(hostname, { family: 4 }, (_err2, addr) => {
          resolve(addr || hostname)
        })
      }
    })
  })
}

// Raw GitHub file refreshed by the update-download-sites Action. Override with
// the MYCINEMA_DOWNLOAD_SITES_URL env var (dev) to point at a fork/branch.
export const REMOTE_SITES_URL =
  process.env.MYCINEMA_DOWNLOAD_SITES_URL ||
  'https://raw.githubusercontent.com/raj-Dcoder/MyCinema/master/download-sites/sites.json'
const REMOTE_FETCH_TIMEOUT_MS = 3000
// A remote entry older than this is used only if live scraping fails.
const REMOTE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

interface DownloadSiteCacheEntry {
  domain: string
  updatedAt: string
  manual: boolean
  source: 'portal' | 'portal-fallback' | 'manual' | 'cache' | 'remote'
  /** False when the domain was never liveness-checked (network error at resolve). */
  verified: boolean
}

function getCachePath(): string {
  // v2: entries are liveness-verified mirrors only. v1 could hold promo pages
  // (e.g. an APK site) or dead mirrors, so it is deliberately abandoned.
  return path.join(app.getPath('userData'), 'download-sites-v2.json')
}

function loadCache(): Record<string, DownloadSiteCacheEntry> {
  try {
    const raw = fs.readFileSync(getCachePath(), 'utf8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveCache(cache: Record<string, DownloadSiteCacheEntry>): void {
  try {
    fs.mkdirSync(path.dirname(getCachePath()), { recursive: true })
    fs.writeFileSync(getCachePath(), JSON.stringify(cache, null, 2))
  } catch (err) {
    console.error('[DownloadSites] Failed to persist cache:', err)
  }
}

function normalizeDomain(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(trimmed)) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return `${url.protocol}//${url.host}`
  } catch {
    return null
  }
}

const IGNORED_HOSTS = new Set([
  'facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'youtube.com',
  't.me', 'telegram.me', 'telegram.org', 'whatsapp.com', 'discord.com',
  'google.com', 'wordpress.org', 'wordpress.com'
])

function isIgnoredHost(host: string): boolean {
  const lower = host.toLowerCase().replace(/^www\./, '')
  for (const ignored of IGNORED_HOSTS) {
    if (lower === ignored || lower.endsWith(`.${ignored}`)) return true
  }
  return false
}

/** Pull every outbound http(s) link out of a portal page, in document order. */
function extractOutboundDomains(html: string, portalHost: string): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  const linkRe = /<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["']/gi
  let match: RegExpExecArray | null
  while ((match = linkRe.exec(html)) !== null) {
    const domain = normalizeDomain(match[1])
    if (!domain) continue
    let host = ''
    try {
      host = new URL(domain).host.toLowerCase()
    } catch {
      continue
    }
    if (host === portalHost || host.endsWith(`.${portalHost}`)) continue
    if (isIgnoredHost(host)) continue
    if (seen.has(domain)) continue
    seen.add(domain)
    found.push(domain)
  }
  return found
}

const matchesAnyHint = (host: string, hints: string[]): boolean => {
  const lower = host.toLowerCase()
  return hints.some(hint => lower.includes(hint.toLowerCase()))
}

/** Hint-matching mirrors first, promo links (APK etc.) last. */
function rankMirrorCandidates(domains: string[], config: DownloadSiteConfig): string[] {
  const hinted: string[] = []
  const plain: string[] = []
  const promo: string[] = []
  for (const domain of domains) {
    let host = ''
    try {
      host = new URL(domain).host.toLowerCase()
    } catch {
      continue
    }
    if (matchesAnyHint(host, DOMAIN_ANTI_HINTS)) promo.push(domain)
    else if (matchesAnyHint(host, config.domainHints)) hinted.push(domain)
    else plain.push(domain)
  }
  return [...hinted, ...plain, ...promo]
}

/**
 * Phase B: portals like katworld link mirrors via same-host redirect buttons
 * (`/?type=KatmovieHD` → 302 → live mirror). Collect those links, main-button
 * match first.
 */
function extractPortalRedirectLinks(html: string, portalUrl: string, config: DownloadSiteConfig): string[] {
  const found: string[] = []
  const seen = new Set<string>()
  const linkRe = /<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = linkRe.exec(html)) !== null) {
    const raw = match[1]
    const fullTag = match[0]
    if (!/\?[^"']*type=/i.test(raw)) continue
    let absolute: string
    try {
      absolute = new URL(raw, portalUrl).toString()
    } catch {
      continue
    }
    let host = ''
    try {
      host = new URL(absolute).host.toLowerCase()
    } catch {
      continue
    }
    let portalHost = ''
    try {
      portalHost = new URL(portalUrl).host.toLowerCase()
    } catch {
      continue
    }
    if (host !== portalHost) continue
    if (seen.has(absolute)) continue
    seen.add(absolute)
    const buttonText = `${raw} ${fullTag}`.toLowerCase()
    const isMain = config.portalButtonMatch
      ? new RegExp(config.portalButtonMatch, 'i').test(buttonText)
      : false
    if (isMain) found.unshift(absolute)
    else found.push(absolute)
  }
  return found.slice(0, 6)
}

/**
 * Portals obfuscate the live mirror in base64 JS blobs (e.g. the "View Full
 * Site" button target). Decode every blob and harvest any URLs inside.
 */
function extractObfuscatedMirrorUrls(html: string, requiredHints: string[]): string[] {
  const found: string[] = []
  const blobRe = /atob\(\s*["']([^"']+)["']\s*\)/gi
  let blob: RegExpExecArray | null
  while ((blob = blobRe.exec(html)) !== null) {
    try {
      const decoded = Buffer.from(blob[1], 'base64').toString('utf8')
      const urlRe = /https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:\/[^\s"'<>]*)?/gi
      let u: RegExpExecArray | null
      while ((u = urlRe.exec(decoded)) !== null) {
        try {
          const parsed = new URL(u[0])
          // API/helper endpoints (…/host, …/v2/…) are infrastructure, not the
          // site — only root URLs carrying a brand hint count as mirrors.
          if (parsed.pathname !== '/' && parsed.pathname !== '') continue
          if (!matchesAnyHint(parsed.host, requiredHints)) continue
          const domain = normalizeDomain(u[0])
          if (domain) found.push(domain)
        } catch {
          /* not a usable URL */
        }
      }
    } catch {
      /* not a decodable blob */
    }
  }
  return [...new Set(found)]
}

function extractHdhubEndpoints(html: string): string[] {
  const list = [
    'https://h4.suncdn.org/host/',
    'https://points.topapii.com/host/',
    'https://ml.theapii.org/host/',
    'https://dns.pingora.fyi/v2/host',
    'https://cdn.hub4u.cloud/host/'
  ]
  const blobRe = /atob\(\s*["']([A-Za-z0-9+/=]+)["']\s*\)/gi
  let m: RegExpExecArray | null
  while ((m = blobRe.exec(html)) !== null) {
    try {
      const decoded = Buffer.from(m[1], 'base64').toString('utf8')
      if (/^https?:\/\/[a-z0-9.-]+\/.*host/i.test(decoded)) {
        list.unshift(decoded)
      }
    } catch { /* ignore */ }
  }
  return [...new Set(list)]
}

async function fetchHdhubLiveMirror(html: string = '', timeoutMs: number = 3000): Promise<string | null> {
  const endpoints = extractHdhubEndpoints(html)
  const t = new Date()
  const v = 1e6 * t.getFullYear() + 1e4 * (t.getMonth() + 1) + 100 * t.getDate() + t.getHours() + 1

  const fetchSingle = async (ep: string): Promise<string> => {
    const urlStr = `${ep}?v=${v}`
    const parsed = new URL(urlStr)
    const ip = await resolveHostIp(parsed.hostname, 1500)
    return new Promise((resolve, reject) => {
      const isHttps = parsed.protocol === 'https:'
      const client = isHttps ? https : http
      const req = client.request({
        hostname: ip,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'Host': parsed.hostname,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        },
        servername: parsed.hostname,
        timeout: timeoutMs
      }, (res) => {
        let body = ''
        res.on('data', chunk => { body += chunk })
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              const data = JSON.parse(body)
              if (data?.c) {
                const decoded = Buffer.from(data.c, 'base64').toString('utf8')
                const norm = normalizeDomain(decoded)
                if (norm) return resolve(norm)
              }
            } catch {}
          }
          reject(new Error(`Endpoint ${ep} returned ${res.statusCode}`))
        })
      })
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
      req.on('error', reject)
      req.end()
    })
  }

  try {
    const candidate = await Promise.any(endpoints.map(ep => fetchSingle(ep)))
    if (candidate) {
      const status = await verifyMirrorAlive(candidate, 2500)
      if (status === 'alive' || status === 'unknown') return candidate
    }
  } catch {}
  return null
}

type MirrorLiveness = 'alive' | 'dead' | 'unknown'

/**
 * alive = loads and stays on its own host (or returns HTTP 200/403/503 Cloudflare challenge).
 * dead = bounces elsewhere (usually back to the portal) or refused connection.
 * unknown = bot-wall or timeout; browser popup will load it directly with full credentials.
 */
async function verifyMirrorAlive(domain: string, timeoutMs: number = 2500): Promise<MirrorLiveness> {
  let parsed: URL
  try {
    parsed = new URL(domain.replace(/\/+$/, '') + '/')
  } catch {
    return 'dead'
  }
  const isHttps = parsed.protocol === 'https:'
  const client = isHttps ? https : http
  const ip = await resolveHostIp(parsed.hostname, 1500)

  return new Promise((resolve) => {
    let settled = false
    const finish = (result: MirrorLiveness) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    try {
      const req = client.request({
        hostname: ip,
        port: parsed.port || (isHttps ? 443 : 80),
        path: '/',
        method: 'GET',
        headers: {
          'Host': parsed.hostname,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        servername: parsed.hostname,
        timeout: timeoutMs
      }, (res) => {
        res.resume()
        const loc = res.headers.location
        if (loc && (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308)) {
          try {
            const finalHost = new URL(loc, domain).host.toLowerCase()
            const wantHost = parsed.host.toLowerCase()
            const same =
              finalHost === wantHost ||
              finalHost === `www.${wantHost}` ||
              wantHost === `www.${finalHost}`
            finish(same ? 'alive' : 'dead')
          } catch {
            finish('dead')
          }
          return
        }
        if (res.statusCode && (res.statusCode < 500 || res.statusCode === 503)) {
          finish('alive')
        } else {
          finish('unknown')
        }
      })

      req.on('timeout', () => {
        req.destroy()
        finish('unknown')
      })
      req.on('error', (err: any) => {
        const code = err?.code
        if (code === 'ENOTFOUND' || code === 'ECONNREFUSED' || code === 'EHOSTUNREACH') {
          finish('dead')
        } else {
          finish('unknown')
        }
      })
      req.end()
    } catch {
      finish('unknown')
    }
  })
}

/** Follow one redirect button without chasing it — the Location IS the mirror. */
async function fetchRedirectTarget(url: string, timeoutMs: number = 3000): Promise<string | null> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const isHttps = parsed.protocol === 'https:'
  const client = isHttps ? https : http
  const ip = await resolveHostIp(parsed.hostname, 1500)

  return new Promise((resolve) => {
    try {
      const req = client.request({
        hostname: ip,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'Host': parsed.hostname,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml'
        },
        servername: parsed.hostname,
        timeout: timeoutMs
      }, (res) => {
        res.resume()
        const location = res.headers.location
        if (!location) return resolve(null)
        try {
          const absolute = new URL(location, url).toString()
          resolve(normalizeDomain(absolute))
        } catch {
          resolve(null)
        }
      })
      req.on('timeout', () => { req.destroy(); resolve(null) })
      req.on('error', () => resolve(null))
      req.end()
    } catch {
      resolve(null)
    }
  })
}

async function fetchText(url: string, timeoutMs: number = 3500): Promise<string> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch (e) {
    throw e
  }
  const isHttps = parsed.protocol === 'https:'
  const client = isHttps ? https : http
  const ip = await resolveHostIp(parsed.hostname, 1500)

  return new Promise((resolve, reject) => {
    try {
      const req = client.request({
        hostname: ip,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'Host': parsed.hostname,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/json,*/*'
        },
        servername: parsed.hostname,
        timeout: timeoutMs
      }, (res) => {
        let body = ''
        res.on('data', chunk => { body += chunk })
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
            resolve(body)
          } else {
            reject(new Error(`Portal responded ${res.statusCode}`))
          }
        })
      })
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
      req.on('error', reject)
      req.end()
    } catch (e) {
      reject(e)
    }
  })
}

export interface DownloadSiteResolveResult {
  siteId: string
  domain: string
  searchUrl: string
  source: DownloadSiteCacheEntry['source']
  updatedAt: string | null
  stale: boolean
}

function buildSearchUrl(domain: string, template: string, title: string, year?: string | number | null): string {
  const queryText = `${title} ${year || ''}`.trim().replace(/\s+/g, ' ')
  const encoded = encodeURIComponent(queryText)
  return `${domain.replace(/\/+$/, '')}${template.replace('{query}', encoded)}`
}

function getConfig(siteId: string): DownloadSiteConfig | null {
  return DOWNLOAD_SITES.find(s => s.id === siteId) || null
}

interface RemoteSiteEntry {
  domain: string
  checkedAt: string | null
}

/** Fetch the Action-maintained link file. Returns null on any failure. */
async function fetchRemoteDomains(): Promise<{ updatedAt: string | null; sites: Record<string, RemoteSiteEntry> } | null> {
  try {
    const text = await fetchText(REMOTE_SITES_URL, REMOTE_FETCH_TIMEOUT_MS)
    const data = JSON.parse(text)
    const sites: Record<string, RemoteSiteEntry> = {}
    for (const [id, entry] of Object.entries((data?.sites || {}) as Record<string, any>)) {
      const domain = normalizeDomain(entry?.domain)
      if (domain) sites[id] = { domain, checkedAt: entry?.checkedAt || data?.updatedAt || null }
    }
    return { updatedAt: data?.updatedAt || null, sites }
  } catch (err) {
    console.error('[DownloadSites] Remote links fetch failed:', err)
    return null
  }
}

function isRemoteFresh(entry: RemoteSiteEntry | undefined): boolean {
  if (!entry?.checkedAt) return false
  const age = Date.now() - new Date(entry.checkedAt).getTime()
  return Number.isFinite(age) && age >= 0 && age < REMOTE_MAX_AGE_MS
}

function rememberResolvedDomain(
  siteId: string,
  domain: string,
  source: DownloadSiteCacheEntry['source'],
  verified = true
): DownloadSiteCacheEntry {
  const entry: DownloadSiteCacheEntry = {
    domain,
    updatedAt: new Date().toISOString(),
    manual: false,
    source,
    verified
  }
  saveCache({ ...loadCache(), [siteId]: entry })
  return entry
}

function isFresh(entry: DownloadSiteCacheEntry | undefined): boolean {
  if (!entry?.updatedAt) return false
  const age = Date.now() - new Date(entry.updatedAt).getTime()
  return Number.isFinite(age) && age >= 0 && age < DOWNLOAD_SITE_CACHE_TTL_MS
}

async function scrapePortal(config: DownloadSiteConfig): Promise<{ domain: string; verified: boolean }> {
  // Phase 0: For HDHub4u, try fast live host endpoints directly (takes ~300ms)
  if (config.id === 'hdmovies') {
    const live = await fetchHdhubLiveMirror('', 3000)
    if (live) return { domain: live, verified: true }
  }

  // Phase 0 for KatMovieHD: try direct redirect button (?type=KatmovieHD) on portal
  if (config.id === 'catmovies') {
    try {
      const directTarget = await fetchRedirectTarget(`${config.portalUrl}?type=KatmovieHD`, 3000)
      if (directTarget) {
        const liveness = await verifyMirrorAlive(directTarget, 2500)
        if (liveness !== 'dead') {
          return { domain: directTarget, verified: true }
        }
      }
    } catch {}
  }

  const portalHost = new URL(config.portalUrl).host.toLowerCase()
  let html = ''
  try {
    html = await fetchText(config.portalUrl, FETCH_TIMEOUT_MS)
  } catch {
    const fallback = DEFAULT_FALLBACK_MIRRORS[config.id]
    if (fallback) {
      return { domain: fallback, verified: true }
    }
    throw new Error('Failed to reach portal page')
  }

  if (config.id === 'hdmovies') {
    const live = await fetchHdhubLiveMirror(html, 3000)
    if (live) return { domain: live, verified: true }
  }

  const rawCandidates: Array<string | null> = [
    ...extractOutboundDomains(html, portalHost).map(normalizeDomain),
    ...extractObfuscatedMirrorUrls(html, config.domainHints)
  ]

  const redirectLinks = extractPortalRedirectLinks(html, config.portalUrl, config)
  const targets = await Promise.all(
    redirectLinks.map(link => fetchRedirectTarget(link, 3000))
  )
  rawCandidates.push(...targets)

  const seen = new Set<string>()
  const candidates = rankMirrorCandidates(
    rawCandidates.filter((d): d is string => {
      if (!d || seen.has(d)) return false
      seen.add(d)
      try {
        const host = new URL(d).host.toLowerCase()
        if (host === portalHost || isIgnoredHost(host)) return false
        if (matchesAnyHint(host, DOMAIN_ANTI_HINTS)) return false
        return true
      } catch {
        return false
      }
    }),
    config
  )

  if (candidates.length === 0) {
    const fallback = DEFAULT_FALLBACK_MIRRORS[config.id]
    if (fallback) return { domain: fallback, verified: true }
    throw new Error('No mirror link found on portal page')
  }

  let firstUnknown: string | null = null
  for (const candidate of candidates) {
    const status = await verifyMirrorAlive(candidate, 2500)
    if (status === 'alive') return { domain: candidate, verified: true }
    if (status === 'unknown') {
      if (!firstUnknown) firstUnknown = candidate
      const host = new URL(candidate).host.toLowerCase()
      if (matchesAnyHint(host, config.domainHints)) {
        return { domain: candidate, verified: true }
      }
    }
  }

  if (firstUnknown) return { domain: firstUnknown, verified: true }
  const fallback = DEFAULT_FALLBACK_MIRRORS[config.id]
  if (fallback) return { domain: fallback, verified: true }
  throw new Error('NO_LIVE_MIRROR')
}

const inFlightResolutions = new Map<string, Promise<DownloadSiteCacheEntry>>()

async function doResolveDomain(
  siteId: string,
  options: { forceRefresh?: boolean } = {}
): Promise<DownloadSiteCacheEntry> {
  const config = getConfig(siteId)
  if (!config) throw new Error(`Unknown download site: ${siteId}`)

  // 1. Try remote links first (quick-verified with 2.5s timeout)
  if (!options.forceRefresh) {
    try {
      const remote = await fetchRemoteDomains()
      const remoteEntry = remote?.sites[siteId]
      if (remoteEntry?.domain && isRemoteFresh(remoteEntry)) {
        const liveness = await verifyMirrorAlive(remoteEntry.domain, 2500)
        if (liveness !== 'dead') {
          return rememberResolvedDomain(siteId, remoteEntry.domain, 'remote', liveness === 'alive')
        }
      }
    } catch {}
  }

  // 2. Live scrape
  try {
    const { domain: live, verified } = await scrapePortal(config)
    return rememberResolvedDomain(siteId, live, 'portal', verified)
  } catch (err) {
    console.error(`[DownloadSites] Portal resolve failed for ${siteId}:`, err)
  }

  // 3. Fallback to cached entry if present
  const cache = loadCache()
  if (cache[siteId]?.domain) {
    return cache[siteId]
  }

  // 4. Fallback to known default working mirror
  const fallback = DEFAULT_FALLBACK_MIRRORS[siteId]
  if (fallback) {
    return rememberResolvedDomain(siteId, fallback, 'portal-fallback', true)
  }

  throw new Error('Is site ka koi working link abhi live nahi lag raha. Thodi der baad retry karo ya dusri site try karo.')
}

function resolveDomain(siteId: string, options: { forceRefresh?: boolean } = {}): Promise<DownloadSiteCacheEntry> {
  const existing = inFlightResolutions.get(siteId)
  if (existing && !options.forceRefresh) return existing

  const promise = doResolveDomain(siteId, options).finally(() => {
    inFlightResolutions.delete(siteId)
  })
  inFlightResolutions.set(siteId, promise)
  return promise
}

const inFlightRefreshes = new Set<string>()

function refreshInBackground(siteId: string): void {
  if (inFlightRefreshes.has(siteId)) return
  inFlightRefreshes.add(siteId)
  doResolveDomain(siteId, { forceRefresh: true })
    .catch((err) => {
      console.warn(`[DownloadSites] Background refresh for ${siteId} failed:`, err)
    })
    .finally(() => {
      inFlightRefreshes.delete(siteId)
    })
}

/**
 * Resolve a site's live domain:
 * 1. Manual Settings override wins unconditionally
 * 2. Fresh local cache (< 24h) returns INSTANTLY (0 ms)
 * 3. Stale-while-revalidate: returns existing cache immediately, refreshes in background
 * 4. Cold resolve: fast live endpoint / portal check with custom DNS (< 1s)
 */
export async function resolveDownloadSiteUrl(
  siteId: string,
  title: string,
  year?: string | number | null,
  options: { forceRefresh?: boolean } = {}
): Promise<DownloadSiteResolveResult> {
  const config = getConfig(siteId)
  if (!config) throw new Error(`Unknown download site: ${siteId}`)
  const cleanTitle = (title || '').trim()
  if (!cleanTitle) throw new Error('Missing title for download-site search')

  const cache = loadCache()
  const cached = cache[siteId]

  // 1. Manual override wins unconditionally
  if (cached?.manual && cached.domain) {
    return {
      siteId,
      domain: cached.domain,
      searchUrl: buildSearchUrl(cached.domain, config.searchTemplate, cleanTitle, year),
      source: 'manual',
      updatedAt: cached.updatedAt,
      stale: false
    }
  }

  // 2. Fresh cache (< 24h) returns INSTANTLY (0 ms)
  const cacheAge = cached?.updatedAt ? Date.now() - new Date(cached.updatedAt).getTime() : Infinity
  const isFreshCache = !options.forceRefresh && Boolean(cached?.domain) && cacheAge < DOWNLOAD_SITE_CACHE_TTL_MS

  if (isFreshCache && cached?.domain) {
    // If older than 6h, refresh silently in background so user is never blocked
    if (cacheAge > 6 * 60 * 60 * 1000) {
      refreshInBackground(siteId)
    }
    return {
      siteId,
      domain: cached.domain,
      searchUrl: buildSearchUrl(cached.domain, config.searchTemplate, cleanTitle, year),
      source: 'cache',
      updatedAt: cached.updatedAt,
      stale: false
    }
  }

  // 3. Stale-While-Revalidate: If we have an existing cached domain within 7 days and not force-refreshing,
  // return immediately to avoid blocking user interaction, and update in background!
  if (!options.forceRefresh && cached?.domain && cacheAge < 7 * 24 * 60 * 60 * 1000) {
    refreshInBackground(siteId)
    return {
      siteId,
      domain: cached.domain,
      searchUrl: buildSearchUrl(cached.domain, config.searchTemplate, cleanTitle, year),
      source: 'cache',
      updatedAt: cached.updatedAt,
      stale: false
    }
  }

  // 4. No cache / force refresh: resolve fast
  const resolved = await resolveDomain(siteId, options)
  return {
    siteId,
    domain: resolved.domain,
    searchUrl: buildSearchUrl(resolved.domain, config.searchTemplate, cleanTitle, year),
    source: resolved.source,
    updatedAt: resolved.updatedAt,
    stale: !resolved.verified
  }
}

/** Pre-warm download site mirrors in background so button clicks are always instant */
export async function prewarmDownloadSites(): Promise<void> {
  const cache = loadCache()
  for (const site of DOWNLOAD_SITES) {
    const entry = cache[site.id]
    if (entry?.manual) continue
    const age = entry?.updatedAt ? Date.now() - new Date(entry.updatedAt).getTime() : Infinity
    if (!entry?.domain || age > 6 * 60 * 60 * 1000) {
      try {
        console.log(`[DownloadSites] Pre-warming ${site.id} in background…`)
        await resolveDomain(site.id)
      } catch (e) {
        console.warn(`[DownloadSites] Pre-warming ${site.id} failed:`, e)
      }
    }
  }
}

/**
 * Force a fresh resolution (used by the Settings Refresh button): drops any
 * auto-resolved cache entry — manual overrides are kept — and resolves again.
 */
export async function refreshDownloadSiteDomain(siteId: string): Promise<DownloadSiteResolveResult> {
  const config = getConfig(siteId)
  if (!config) throw new Error(`Unknown download site: ${siteId}`)
  const cache = loadCache()
  if (cache[siteId] && !cache[siteId].manual) {
    delete cache[siteId]
    saveCache(cache)
  }
  return resolveDownloadSiteUrl(siteId, config.name, '')
}

export interface DownloadSiteStatus extends DownloadSiteResolveResult {
  name: string
  shortLabel: string
  portalUrl: string
  accent: string
  title: string
  manual: boolean
}

export function getDownloadSitesStatus(): Array<{
  id: string
  name: string
  shortLabel: string
  portalUrl: string
  accent: string
  domain: string | null
  updatedAt: string | null
  manual: boolean
  stale: boolean
}> {
  const cache = loadCache()
  return DOWNLOAD_SITES.map(site => {
    const entry = cache[site.id]
    return {
      id: site.id,
      name: site.name,
      shortLabel: site.shortLabel,
      portalUrl: site.portalUrl,
      accent: site.accent,
      domain: entry?.domain || null,
      updatedAt: entry?.updatedAt || null,
      manual: Boolean(entry?.manual),
      stale: entry ? !isFresh(entry) && !entry.manual : true
    }
  })
}

export function setDownloadSiteDomain(siteId: string, domain: string): DownloadSiteCacheEntry {
  const normalized = normalizeDomain(domain)
  if (!normalized) throw new Error('Please paste a valid http(s) site address')
  const entry: DownloadSiteCacheEntry = {
    domain: normalized,
    updatedAt: new Date().toISOString(),
    manual: true,
    source: 'manual',
    verified: true
  }
  saveCache({ ...loadCache(), [siteId]: entry })
  return entry
}

export function resetDownloadSiteDomain(siteId: string): void {
  const cache = loadCache()
  delete cache[siteId]
  saveCache(cache)
}
