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
    searchTemplate: '/?s={query}',
    accent: '#f43f5e',
    domainHints: ['hdhub', 'hdmovie'],
    portalButtonMatch: 'hdhub|hdmovies'
  },
  {
    id: 'catmovies',
    name: 'Cat Movies HD',
    shortLabel: 'CAT',
    portalUrl: 'https://katworld.net/',
    searchTemplate: '/?s={query}',
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
}

function getCachePath(): string {
  return path.join(app.getPath('userData'), 'download-sites.json')
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

function rememberResolvedDomain(siteId: string, domain: string, source: DownloadSiteCacheEntry['source']): DownloadSiteCacheEntry {
  const entry: DownloadSiteCacheEntry = {
    domain,
    updatedAt: new Date().toISOString(),
    manual: false,
    source
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
 * the portal page, then stale cache, then the portal's own search as a last
 * resort so the click never dead-ends.
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

  if (!options.forceRefresh && cached?.domain && isFresh(cached)) {
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

  const scrapePortal = async (): Promise<string> => {
    const html = await fetchText(config.portalUrl, FETCH_TIMEOUT_MS)
    // Phase A: direct external mirror anchors (hint-matching first).
    const direct = rankMirrorCandidates(
      extractOutboundDomains(html, portalHost)
        .map(normalizeDomain)
        .filter((d): d is string => Boolean(d)),
      config
    )
    // Promo links only count if nothing else exists — a lone APK button must
    // not beat the redirect-button pass below.
    const nonPromo = direct.filter(domain => {
      try {
        return !matchesAnyHint(new URL(domain).host, DOMAIN_ANTI_HINTS)
      } catch {
        return false
      }
    })
    if (nonPromo.length > 0) return nonPromo[0]

    // Phase B: same-host redirect buttons (`?type=X` → 302 → mirror).
    const redirectLinks = extractPortalRedirectLinks(html, config.portalUrl, config)
    const targets = await Promise.all(
      redirectLinks.map(link => fetchRedirectTarget(link, FETCH_TIMEOUT_MS))
    )
    const ranked = rankMirrorCandidates(
      targets.filter((t): t is string => Boolean(t)),
      config
    ).filter(domain => {
      try {
        return !matchesAnyHint(new URL(domain).host, DOMAIN_ANTI_HINTS)
      } catch {
        return false
      }
    })
    if (ranked.length > 0) return ranked[0]
    if (direct.length > 0) return direct[0]
    throw new Error('No mirror link found on portal page')
  }

  // 3. GitHub-hosted links (refreshed by Action every 6h). Fresh remote wins
  // outright — no portal hit needed, and it works even where portals are ISP
  // blocked. A stale remote is only a fallback after a live scrape attempt.
  if (!options.forceRefresh) {
    const remote = await fetchRemoteDomains()
    const remoteEntry = remote?.sites[siteId]
    if (remoteEntry && isRemoteFresh(remoteEntry)) {
      const entry = rememberResolvedDomain(siteId, remoteEntry.domain, 'remote')
      return {
        siteId,
        domain: remoteEntry.domain,
        searchUrl: buildSearchUrl(remoteEntry.domain, config.searchTemplate, cleanTitle, year),
        source: 'remote',
        updatedAt: entry.updatedAt,
        stale: false
      }
    }
    if (remoteEntry) {
      try {
        const live = await scrapePortal()
        const entry = rememberResolvedDomain(siteId, live, 'portal')
        return {
          siteId,
          domain: live,
          searchUrl: buildSearchUrl(live, config.searchTemplate, cleanTitle, year),
          source: 'portal',
          updatedAt: entry.updatedAt,
          stale: false
        }
      } catch (err) {
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
    const live = await scrapePortal()
    const entry = rememberResolvedDomain(siteId, live, 'portal')
    return {
      siteId,
      domain: live,
      searchUrl: buildSearchUrl(live, config.searchTemplate, cleanTitle, year),
      source: 'portal',
      updatedAt: entry.updatedAt,
      stale: false
    }
  } catch (err) {
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
  throw new Error('Could not resolve a working link for this site right now')
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
    source: 'manual'
  }
  saveCache({ ...loadCache(), [siteId]: entry })
  return entry
}

export function resetDownloadSiteDomain(siteId: string): void {
  const cache = loadCache()
  delete cache[siteId]
  saveCache(cache)
}
