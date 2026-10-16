import { app } from 'electron'
import fs from 'fs'
import path from 'path'

// ─── Download-site registry ──────────────────────────────────────────────────
// These are portal pages that publish the current (unblocked) mirror domain.
// The app resolves the live domain at click-time so a banned/hardcoded domain
// never ships inside the build. Search itself always runs on the resolved
// domain with the full movie/series title.
//
// Resolution order (first hit wins):
//   1. Manual Settings override
//   2. Fresh local cache (< 12h)
//   3. GitHub-hosted links — `.github/workflows/update-download-sites.yml`
//      refreshes `download-sites/sites.json` every 6h; the app reads the raw
//      file, so users get updated links without an app update.
//   4. Live portal scrape (same extraction the Action runs)
//   5. Stale cache / portal's own search (click never dead-ends)
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

// Promo/app links some portals carry (e.g. an APK download button) — never a
// mirror, so they rank below everything and never win on their own.
const DOMAIN_ANTI_HINTS = ['apk', 'play.google', 'app-download']

// 12-hour cache: resolve the portal at most twice a day per site.
export const DOWNLOAD_SITE_CACHE_TTL_MS = 12 * 60 * 60 * 1000
const FETCH_TIMEOUT_MS = 10000

// Raw GitHub file refreshed by the update-download-sites Action. Override with
// the MYCINEMA_DOWNLOAD_SITES_URL env var (dev) to point at a fork/branch.
export const REMOTE_SITES_URL =
  process.env.MYCINEMA_DOWNLOAD_SITES_URL ||
  'https://raw.githubusercontent.com/raj-Dcoder/MyCinema/master/download-sites/sites.json'
const REMOTE_FETCH_TIMEOUT_MS = 8000
// A remote entry older than this is used only if live scraping fails.
const REMOTE_MAX_AGE_MS = 48 * 60 * 60 * 1000

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

async function fetchHdhubLiveMirror(html: string, timeoutMs: number): Promise<string | null> {
  const endpoints = extractHdhubEndpoints(html)
  const t = new Date()
  const v = 1e6 * t.getFullYear() + 1e4 * (t.getMonth() + 1) + 100 * t.getDate() + t.getHours() + 1
  for (const ep of endpoints) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      const res = await fetch(`${ep}?v=${v}`, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
          Accept: 'application/json'
        }
      })
      clearTimeout(timer)
      if (!res.ok) continue
      const data: any = await res.json()
      if (data?.c) {
        const decoded = Buffer.from(data.c, 'base64').toString('utf8')
        const norm = normalizeDomain(decoded)
        if (norm) {
          const status = await verifyMirrorAlive(norm, timeoutMs)
          if (status === 'alive' || status === 'unknown') return norm
        }
      }
    } catch {
      // try next endpoint
    }
  }
  return null
}

type MirrorLiveness = 'alive' | 'dead' | 'unknown'

/**
 * alive = loads and stays on its own host. dead = bounces elsewhere (usually
 * back to the portal — a parked/killed mirror). unknown = network error or a
 * bot-wall status; the in-app browser may still load it, so it stays usable.
 */
async function verifyMirrorAlive(domain: string, timeoutMs: number): Promise<MirrorLiveness> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(`${domain.replace(/\/+$/, '')}/`, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml'
        }
      })
      if (!res.ok) return 'unknown'
      const finalHost = new URL(res.url).host.toLowerCase()
      const wantHost = new URL(domain).host.toLowerCase()
      const same =
        finalHost === wantHost ||
        finalHost === `www.${wantHost}` ||
        wantHost === `www.${finalHost}`
      return same ? 'alive' : 'dead'
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    // Dead DNS / refused port = dead mirror. Timeouts and bot-walls stay
    // 'unknown' — the in-app browser may still load them.
    const code = (err as any)?.cause?.code || (err as any)?.code
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ECONNREFUSED' || code === 'EHOSTUNREACH') {
      return 'dead'
    }
    return 'unknown'
  }
}

/** Follow one redirect button without chasing it — the Location IS the mirror. */
async function fetchRedirectTarget(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml'
      }
    })
    const location = res.headers.get('location')
    if (!location) return null
    const absolute = new URL(location, url).toString()
    return normalizeDomain(absolute)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function fetchText(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml'
      }
    })
    if (!res.ok) throw new Error(`Portal responded ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
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
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS)
    try {
      const res = await fetch(REMOTE_SITES_URL, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { Accept: 'application/json' }
      })
      if (!res.ok) throw new Error(`remote links responded ${res.status}`)
      const data = await res.json()
      const sites: Record<string, RemoteSiteEntry> = {}
      for (const [id, entry] of Object.entries((data?.sites || {}) as Record<string, any>)) {
        const domain = normalizeDomain(entry?.domain)
        if (domain) sites[id] = { domain, checkedAt: entry?.checkedAt || data?.updatedAt || null }
      }
      return { updatedAt: data?.updatedAt || null, sites }
    } finally {
      clearTimeout(timer)
    }
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

/**
 * Resolve a site's live domain: manual override wins, then fresh cache, then
 * GitHub-hosted links, then a live portal scrape (mirrors are liveness-checked
 * — dead ones bouncing to the portal are skipped), then stale cache, then the
 * portal's own search as a last resort so the click never dead-ends.
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

  // Unverified cache entries get one quick re-check; a mirror that has since
  // died falls through to remote/scrape instead of opening a dead page.
  let useCached = !options.forceRefresh && Boolean(cached?.domain) && isFresh(cached)
  if (useCached && cached && cached.verified === false) {
    const liveness = await verifyMirrorAlive(cached.domain, 5000)
    if (liveness === 'dead') useCached = false
  }
  if (useCached && cached?.domain) {
    return {
      siteId,
      domain: cached.domain,
      searchUrl: buildSearchUrl(cached.domain, config.searchTemplate, cleanTitle, year),
      source: 'cache',
      updatedAt: cached.updatedAt,
      stale: false
    }
  }

  const portalDomain = normalizeDomain(config.portalUrl)
  let portalHost = ''
  try {
    portalHost = new URL(config.portalUrl).host.toLowerCase()
  } catch {
    portalHost = ''
  }

  const NO_LIVE_MIRROR = 'NO_LIVE_MIRROR'

  const scrapePortal = async (): Promise<{ domain: string; verified: boolean }> => {
    const html = await fetchText(config.portalUrl, FETCH_TIMEOUT_MS)
    if (config.id === 'hdmovies') {
      const live = await fetchHdhubLiveMirror(html, FETCH_TIMEOUT_MS)
      if (live) return { domain: live, verified: true }
    }
    const rawCandidates: Array<string | null> = [
      // Phase A: direct external mirror anchors…
      ...extractOutboundDomains(html, portalHost).map(normalizeDomain),
      // …plus mirrors hidden in obfuscated JS (base64 "View Full Site" links).
      ...extractObfuscatedMirrorUrls(html, config.domainHints)
    ]
    // Phase B: same-host redirect buttons (`?type=X` → 302 → mirror).
    const redirectLinks = extractPortalRedirectLinks(html, config.portalUrl, config)
    const targets = await Promise.all(
      redirectLinks.map(link => fetchRedirectTarget(link, FETCH_TIMEOUT_MS))
    )
    rawCandidates.push(...targets)

    // Sanitize: dedupe, drop the portal itself, trackers, and promo/app links
    // (an APK button is never a mirror — it must never win).
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
    if (candidates.length === 0) throw new Error('No mirror link found on portal page')

    // Phase C: only hand out a mirror that is actually alive right now.
    let firstUnknown: string | null = null
    for (const candidate of candidates) {
      const status = await verifyMirrorAlive(candidate, FETCH_TIMEOUT_MS)
      if (status === 'alive') return { domain: candidate, verified: true }
      if (status === 'unknown' && !firstUnknown) firstUnknown = candidate
      // 'dead' (bounces to the portal etc.) → try the next candidate.
    }
    if (firstUnknown) return { domain: firstUnknown, verified: false }
    const err: any = new Error('NO_LIVE_MIRROR')
    err.code = NO_LIVE_MIRROR
    throw err
  }

  const noLiveMirrorError = () =>
    new Error('Is site ka koi working link abhi live nahi lag raha. Thodi der baad retry karo ya dusri site try karo.')

  // 3. GitHub-hosted links (refreshed by Action every 6h). A fresh remote is
  // quick-verified first — a mirror that died since the last Action run falls
  // through to a live scrape instead of opening a dead page.
  if (!options.forceRefresh) {
    const remote = await fetchRemoteDomains()
    const remoteEntry = remote?.sites[siteId]
    if (remoteEntry && isRemoteFresh(remoteEntry)) {
      const liveness = await verifyMirrorAlive(remoteEntry.domain, 5000)
      if (liveness !== 'dead') {
        const entry = rememberResolvedDomain(siteId, remoteEntry.domain, 'remote', liveness === 'alive')
        return {
          siteId,
          domain: remoteEntry.domain,
          searchUrl: buildSearchUrl(remoteEntry.domain, config.searchTemplate, cleanTitle, year),
          source: 'remote',
          updatedAt: entry.updatedAt,
          stale: false
        }
      }
      console.warn(`[DownloadSites] Remote mirror dead for ${siteId}, scraping portal…`)
    } else if (remoteEntry) {
      try {
        const { domain: live, verified } = await scrapePortal()
        const entry = rememberResolvedDomain(siteId, live, 'portal', verified)
        return {
          siteId,
          domain: live,
          searchUrl: buildSearchUrl(live, config.searchTemplate, cleanTitle, year),
          source: 'portal',
          updatedAt: entry.updatedAt,
          stale: !verified
        }
      } catch (err) {
        if ((err as any)?.code === NO_LIVE_MIRROR) {
          const liveness = await verifyMirrorAlive(remoteEntry.domain, 5000)
          if (liveness !== 'dead') {
            return {
              siteId,
              domain: remoteEntry.domain,
              searchUrl: buildSearchUrl(remoteEntry.domain, config.searchTemplate, cleanTitle, year),
              source: 'remote',
              updatedAt: remoteEntry.checkedAt,
              stale: true
            }
          }
          throw noLiveMirrorError()
        }
        console.error(`[DownloadSites] Portal resolve failed for ${siteId}, using stale remote:`, err)
        return {
          siteId,
          domain: remoteEntry.domain,
          searchUrl: buildSearchUrl(remoteEntry.domain, config.searchTemplate, cleanTitle, year),
          source: 'remote',
          updatedAt: remoteEntry.checkedAt,
          stale: true
        }
      }
    }
  }

  // 4. No usable remote — scrape the portal live.
  try {
    const { domain: live, verified } = await scrapePortal()
    const entry = rememberResolvedDomain(siteId, live, 'portal', verified)
    return {
      siteId,
      domain: live,
      searchUrl: buildSearchUrl(live, config.searchTemplate, cleanTitle, year),
      source: 'portal',
      updatedAt: entry.updatedAt,
      stale: !verified
    }
  } catch (err) {
    if ((err as any)?.code === NO_LIVE_MIRROR) throw noLiveMirrorError()
    console.error(`[DownloadSites] Portal resolve failed for ${siteId}:`, err)
  }

  // 5. Fallbacks, in order: stale cache → portal's own search page.
  if (cached?.domain) {
    return {
      siteId,
      domain: cached.domain,
      searchUrl: buildSearchUrl(cached.domain, config.searchTemplate, cleanTitle, year),
      source: 'cache',
      updatedAt: cached.updatedAt,
      stale: true
    }
  }
  if (portalDomain) {
    return {
      siteId,
      domain: portalDomain,
      searchUrl: buildSearchUrl(portalDomain, config.searchTemplate, cleanTitle, year),
      source: 'portal-fallback',
      updatedAt: null,
      stale: true
    }
  }
  throw noLiveMirrorError()
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
