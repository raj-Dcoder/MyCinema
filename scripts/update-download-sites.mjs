// Refreshes download-sites/sites.json with the current mirror domains.
// The GitHub Action runs this on a schedule; the app reads the raw JSON so
// users get updated links without an app update. Live portal scraping in the
// app remains as a fallback if this file goes stale.
//
// Usage:
//   node scripts/update-download-sites.mjs [--dry-run] [--check]
//   --dry-run   print what would change, don't write the file
//   --check     exit 1 if any site failed to refresh (keeps old domain)

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SITES_PATH = join(ROOT, 'download-sites', 'sites.json')

const PORTALS = {
  hdmovies: {
    url: 'https://hdhub4u.bi/',
    domainHints: ['hdhub', 'hub4u', 'hdmovie'],
    portalButtonMatch: 'hdhub|hdmovies'
  },
  catmovies: {
    url: 'https://katworld.net/',
    domainHints: ['katmovie'],
    portalButtonMatch: 'katmoviehd'
  }
}

const DOMAIN_ANTI_HINTS = ['apk', 'play.google', 'app-download']

const FETCH_TIMEOUT_MS = 15000

const IGNORED_HOSTS = new Set([
  'facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'youtube.com',
  't.me', 'telegram.me', 'telegram.org', 'whatsapp.com', 'discord.com',
  'google.com', 'wordpress.org', 'wordpress.com'
])

function normalizeDomain(value) {
  if (!value) return null
  const trimmed = String(value).trim().replace(/\/+$/, '')
  if (!/^https?:\/\//i.test(trimmed)) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return `${url.protocol}//${url.host}`
  } catch {
    return null
  }
}

function isIgnoredHost(host) {
  const lower = host.toLowerCase().replace(/^www\./, '')
  for (const ignored of IGNORED_HOSTS) {
    if (lower === ignored || lower.endsWith(`.${ignored}`)) return true
  }
  return false
}

function extractOutboundDomains(html, portalHost) {
  const found = []
  const seen = new Set()
  const linkRe = /<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["']/gi
  let match
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

async function fetchText(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml'
      }
    })
    if (!res.ok) throw new Error(`portal responded ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

function matchesAnyHint(host, hints) {
  const lower = String(host).toLowerCase()
  return hints.some(hint => lower.includes(String(hint).toLowerCase()))
}

function rankMirrorCandidates(domains, site) {
  const hinted = []
  const plain = []
  const promo = []
  for (const domain of domains) {
    let host = ''
    try {
      host = new URL(domain).host.toLowerCase()
    } catch {
      continue
    }
    if (matchesAnyHint(host, DOMAIN_ANTI_HINTS)) promo.push(domain)
    else if (matchesAnyHint(host, site.domainHints)) hinted.push(domain)
    else plain.push(domain)
  }
  return [...hinted, ...plain, ...promo]
}

function extractPortalRedirectLinks(html, portalUrl, site) {
  const found = []
  const seen = new Set()
  const linkRe = /<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi
  let match
  while ((match = linkRe.exec(html)) !== null) {
    const raw = match[1]
    if (!/\?[^"']*type=/i.test(raw)) continue
    let absolute
    try {
      absolute = new URL(raw, portalUrl).toString()
    } catch {
      continue
    }
    const portalHost = new URL(portalUrl).host.toLowerCase()
    if (new URL(absolute).host.toLowerCase() !== portalHost) continue
    if (seen.has(absolute)) continue
    seen.add(absolute)
    const isMain = site.portalButtonMatch
      ? new RegExp(site.portalButtonMatch, 'i').test(`${raw} ${match[0]}`.toLowerCase())
      : false
    if (isMain) found.unshift(absolute)
    else found.push(absolute)
  }
  return found.slice(0, 6)
}

async function fetchRedirectTarget(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
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
    return normalizeDomain(new URL(location, url).toString())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function extractObfuscatedMirrorUrls(html, requiredHints) {
  const found = []
  const blobRe = /atob\(\s*["']([^"']+)["']\s*\)/gi
  let blob
  while ((blob = blobRe.exec(html)) !== null) {
    try {
      const decoded = Buffer.from(blob[1], 'base64').toString('utf8')
      const urlRe = /https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(?:\/[^\s"'<>]*)?/gi
      let u
      while ((u = urlRe.exec(decoded)) !== null) {
        try {
          const parsed = new URL(u[0])
          if (parsed.pathname !== '/' && parsed.pathname !== '') continue
          if (!matchesAnyHint(parsed.host, requiredHints)) continue
          const domain = normalizeDomain(u[0])
          if (domain) found.push(domain)
        } catch { /* not usable */ }
      }
    } catch { /* not decodable */ }
  }
  return [...new Set(found)]
}

async function verifyMirrorAlive(domain, timeoutMs = FETCH_TIMEOUT_MS) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(domain.replace(/\/+$/, '') + '/', {
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
      return (finalHost === wantHost || finalHost === `www.${wantHost}` || wantHost === `www.${finalHost}`)
        ? 'alive'
        : 'dead'
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    const code = err?.cause?.code || err?.code
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ECONNREFUSED' || code === 'EHOSTUNREACH') {
      return 'dead'
    }
    return 'unknown'
  }
}

function extractHdhubEndpoints(html) {
  const list = [
    'https://h4.suncdn.org/host/',
    'https://points.topapii.com/host/',
    'https://ml.theapii.org/host/',
    'https://dns.pingora.fyi/v2/host',
    'https://cdn.hub4u.cloud/host/'
  ]
  const blobRe = /atob\(\s*["']([A-Za-z0-9+/=]+)["']\s*\)/gi
  let m
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

async function fetchHdhubLiveMirror(html, timeoutMs) {
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
      const data = await res.json()
      if (data?.c) {
        const decoded = Buffer.from(data.c, 'base64').toString('utf8')
        const norm = normalizeDomain(decoded)
        if (norm) {
          const status = await verifyMirrorAlive(norm, timeoutMs)
          if (status === 'alive' || status === 'unknown') return norm
        }
      }
    } catch {
      // try next
    }
  }
  return null
}

async function resolveSite(siteId, site) {
  if (siteId === 'hdmovies') {
    const live = await fetchHdhubLiveMirror('', FETCH_TIMEOUT_MS)
    if (live) return live
  }
  if (siteId === 'catmovies') {
    const directTarget = await fetchRedirectTarget(`${site.url}?type=KatmovieHD`)
    if (directTarget) {
      const status = await verifyMirrorAlive(directTarget, 5000)
      if (status !== 'dead') return directTarget
    }
  }
  const portalHost = new URL(site.url).host.toLowerCase()
  const html = await fetchText(site.url)
  if (siteId === 'hdmovies') {
    const live = await fetchHdhubLiveMirror(html, FETCH_TIMEOUT_MS)
    if (live) return live
  }
  const raw = [
    // Phase A: direct external anchors + obfuscated JS mirrors…
    ...extractOutboundDomains(html, portalHost).map(normalizeDomain),
    ...extractObfuscatedMirrorUrls(html, site.domainHints)
  ]
  // Phase B: same-host redirect buttons (`?type=X` → 302 → mirror).
  const redirectLinks = extractPortalRedirectLinks(html, site.url, site)
  const targets = await Promise.all(redirectLinks.map(fetchRedirectTarget))
  raw.push(...targets)

  // Sanitize: dedupe, drop portal/trackers/promo (APK buttons are never mirrors).
  const seen = new Set()
  const isIgnored = host => {
    const lower = host.toLowerCase().replace(/^www\./, '')
    for (const ignored of IGNORED_HOSTS) {
      if (lower === ignored || lower.endsWith(`.${ignored}`)) return true
    }
    return false
  }
  const candidates = rankMirrorCandidates(
    raw.filter(d => {
      if (!d || seen.has(d)) return false
      seen.add(d)
      try {
        const host = new URL(d).host.toLowerCase()
        if (host === portalHost || isIgnored(host)) return false
        if (matchesAnyHint(host, DOMAIN_ANTI_HINTS)) return false
        return true
      } catch {
        return false
      }
    }),
    site
  )
  if (candidates.length === 0) throw new Error('no mirror link found on portal page')

  // Phase C: hand out a mirror that is actually alive right now.
  let firstUnknown = null
  for (const candidate of candidates) {
    const status = await verifyMirrorAlive(candidate, 5000)
    if (status === 'alive') return candidate
    if (status === 'unknown') {
      if (!firstUnknown) firstUnknown = candidate
      const host = new URL(candidate).host.toLowerCase()
      if (matchesAnyHint(host, site.domainHints)) return candidate
    }
  }
  if (firstUnknown) return firstUnknown
  throw new Error('mirrors found but none are alive (all bounce to the portal)')
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const dryRun = args.has('--dry-run')
  const check = args.has('--check')

  const current = JSON.parse(readFileSync(SITES_PATH, 'utf8'))
  const now = new Date().toISOString()
  const next = {
    updatedAt: now,
    sites: { ...(current.sites || {}) }
  }

  let failures = 0
  for (const [siteId, site] of Object.entries(PORTALS)) {
    try {
      const domain = await resolveSite(siteId, site)
      const prev = next.sites[siteId]?.domain
      next.sites[siteId] = { domain, checkedAt: now }
      console.log(`[ok] ${siteId}: ${prev || '(none)'} -> ${domain}`)
    } catch (err) {
      failures += 1
      console.error(`[fail] ${siteId}: ${err.message} (keeping ${next.sites[siteId]?.domain || 'nothing'})`)
    }
  }

  if (!dryRun) {
    writeFileSync(SITES_PATH, JSON.stringify(next, null, 2) + '\n')
    console.log(`wrote ${SITES_PATH}`)
  } else {
    console.log('(dry run — file not written)')
  }

  if (check && failures > 0) process.exit(1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
