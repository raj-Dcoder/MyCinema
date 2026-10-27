import { app, session, webContents } from 'electron'
import { promises as fsp } from 'fs'
import path from 'path'
import { ElectronBlocker, NetworkFilter } from '@ghostery/adblocker-electron'
import { DOWNLOAD_SITES } from './downloadSites'

// ─── Lightweight popup adblocker ─────────────────────────────────────────────
// Same idea as uBlock Origin (block known ad/tracker hosts + hide leftover ad
// elements), but without shipping a full extension engine: the in-app popup is
// only used for movie-site browsing, so a curated host list + cosmetic CSS
// covers the ad networks those pages actually use (Propeller, Adsterra,
// PopAds, Monetag, Hilltop, Taboola/Outbrain widgets, etc.).
//
// It deliberately runs on a DEDICATED popup partition (`persist:webpopup`) so
// the main window session (YouTube embeds, TMDB API, streaming) is untouched.
// Main-frame navigations are never blocked — only sub-resources (scripts,
// iframes, XHRs, images, beacons) and popup windows — so a site's own
// "continue / download" flow can never dead-end; the worst case is the user
// sees the page and taps the existing back button.

export const POPUP_PARTITION = 'persist:webpopup'

const BLOCKED_HOST_SUFFIXES = [
  // Google / big-tech ads + analytics
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'google-analytics.com',
  'googletagmanager.com',
  'googletagservices.com',
  '2mdn.net',
  // Programmatic / RTB
  'adnxs.com',
  'criteo.com',
  'criteo.net',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'openx.com',
  'amazon-adsystem.com',
  'lijit.com',
  'mathtag.com',
  'bluekai.com',
  'agkn.com',
  'demdex.net',
  'moatads.com',
  'gumgum.com',
  // Native / widget ads
  'taboola.com',
  'outbrain.com',
  'revcontent.com',
  'mgid.com',
  'adblade.com',
  'runative.com',
  // Popunder / push networks (the bulk of movie-site ads)
  'propellerads.com',
  'propellerclick.com',
  'propellerpops.com',
  'adsterra.com',
  'popads.net',
  'popcash.net',
  'popmyads.com',
  'monetag.com',
  'hilltopads.net',
  'hilltopads.com',
  'adcash.com',
  'exoclick.com',
  'juicyads.com',
  'clickadu.com',
  'yllix.com',
  'adtraffic.com',
  'adsupply.com',
  'bidvertiser.com',
  'adnami.io',
  'inseon.io',
  // Misc trackers / counters
  'histats.com',
  'statcounter.com',
  'counter.yadro.ru',
  'mc.yandex.ru',
  'addthis.com',
  'sharethis.com',
  // Popunder / ad-network hosts observed on download mirrors
  'adsboosters.xyz',
  'agl002.online',
  'bonuscaf.com',
  'onclickalgo.com',
  'onclickmega.com',
  'alwingulla.com',
  'deloplen.com',
  'bidgear.com',
  'propush.me',
  'notix.io',
  'moraeirrupt.com',
  'cvt-s2.online',
  // Extra popunder / redirect networks
  'adhese.com',
  'adorika.com',
  'admixer.net',
  'adnami.io',
  'adplus.co.id',
  'adskeeper.com',
  'adsterrahub.com',
  'bumlam.com',
  'dable.io',
  'engageya.com',
  'gorgeousground.com',
  'inpagepush.com',
  'jsecoin.com',
  'kixer.com',
  'loxodo.com',
  'media.net',
  'native-ads.com',
  'olesondev.com',
  'oonel.com',
  'oplata.cyou',
  'porngraph.com',
  'propeller-tracking.com',
  'realdatingaccess.com',
  'richpays.com',
  'smrtb.com',
  'tacoda.net',
  'trafficjunky.net',
  'traffichaus.com',
  'trafmag.com',
  'videoadex.com',
  'voluum.com',
  'zedo.com',
  'zemanta.com'
]

const BLOCKED_PATH_SNIPPETS = ['/popunder', '/pop-up', 'popads', '/banner-ads/']

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function isBlockedHost(host: string): boolean {
  if (!host) return false
  const bare = host.replace(/^www\./, '')
  return BLOCKED_HOST_SUFFIXES.some(suffix => bare === suffix || bare.endsWith(`.${suffix}`))
}

function hasBlockedPath(url: string): boolean {
  const lower = url.toLowerCase()
  return BLOCKED_PATH_SNIPPETS.some(snippet => lower.includes(snippet))
}

// ─── Strict third-party script policy (download-site pages only) ────────────
// Ad loaders on these pages rotate random domains (see ly.* hosts) that no
// list can catch by name. So on mirror/portal pages, third-party <script>s are
// guilty-until-allowlisted: only big public CDNs pass; the site's own scripts
// always pass. File hosts and research pages (Moctale etc.) are unaffected —
// the rule only applies while the page itself is a download-site host.
const SCRIPT_ALLOWLIST = [
  'ajax.googleapis.com',
  'code.jquery.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
  'unpkg.com',
  'stackpath.bootstrapcdn.com',
  'maxcdn.bootstrapcdn.com',
  'use.fontawesome.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
]

function isDownloadSiteHost(host: string): boolean {
  if (!host) return false
  const lower = host.toLowerCase().replace(/^www\./, '')
  for (const site of DOWNLOAD_SITES) {
    try {
      const portalHost = new URL(site.portalUrl).host.toLowerCase().replace(/^www\./, '')
      if (lower === portalHost || lower.endsWith(`.${portalHost}`)) return true
    } catch {
      /* ignore */
    }
    if (site.domainHints.some(hint => lower.includes(hint.toLowerCase()))) return true
  }
  return false
}

function sameSite(a: string, b: string): boolean {
  return a === b || a === `www.${b}` || b === `www.${a}`
}

/** True when a script load should die under the strict policy. */
export function isStrictScriptBlock(scriptUrl: string, referrer: string): boolean {
  if (!/^https?:/i.test(scriptUrl)) return false
  const urlHost = hostnameOf(scriptUrl)
  const pageHost = hostnameOf(referrer || '').replace(/^www\./, '')
  if (!pageHost || !isDownloadSiteHost(pageHost)) return false
  if (sameSite(urlHost, pageHost)) return false
  if (SCRIPT_ALLOWLIST.some(allowed => urlHost === allowed || urlHost.endsWith(`.${allowed}`))) {
    return false
  }
  return true
}

// Site-specific network rules the public lists miss (rotating ad-loader hosts
// observed on these mirrors). Applied to the engine when it loads.
const CUSTOM_NETWORK_FILTERS = [
  '||moraeirrupt.com^',
  '||agl002.online^',
  '||adsboosters.xyz^',
  '||bonuscaf.com^',
  '||onclickalgo.com^',
  '||deloplen.com^'
]

function applyCustomEngineFilters(engine: ElectronBlocker): void {
  try {
    const parsed = CUSTOM_NETWORK_FILTERS.map(rule => NetworkFilter.parse(rule)).filter(
      (filter): filter is NetworkFilter => filter !== null
    )
    if (parsed.length > 0) {
      engine.update({ newNetworkFilters: parsed })
    }
  } catch (err) {
    console.error('[PopupAdblock] Custom filters failed (engine lists still active):', err)
  }
}

/** True when a URL is ad/tracker noise (used for popups + sub-resources). */
export function isBlockedAdUrl(url: string): boolean {
  if (!/^https?:/i.test(url)) return false
  const host = hostnameOf(url)
  if (isBlockedHost(host)) return true
  if (hasBlockedPath(url)) return true
  const lower = url.toLowerCase()
  if (
    (lower.includes('/go/') && (host.includes('bonus') || host.includes('track') || host.includes('click') || host.includes('aff'))) ||
    host.includes('adsboosters') ||
    host.includes('agl002') ||
    host.includes('moraeirrupt') ||
    host.includes('bonuscaf') ||
    host.includes('onclickalgo') ||
    host.includes('onclickmega') ||
    host.includes('deloplen') ||
    host.includes('bidgear') ||
    host.includes('propush') ||
    host.includes('notix')
  ) {
    return true
  }
  return false
}

/** Leftover ad containers / widgets hidden after each page loads. */
export const POPUP_COSMETIC_CSS = `
  ins.adsbygoogle, .adsbygoogle,
  [id^="div-gpt-ad"], [id^="ad-"], [id*="-ad-"],
  .popup-ad, #popup-ad, #popunder, [id*="popunder"], .popunder-backdrop,
  .ad-banner, .ads-banner, .advertisement, .sticky-ad, .bottom-ad,
  #interstitial, .interstitial, .overlay-ad, .fullpage-ad,
  [id*="taboola"], .tbl-feed-container,
  [id*="outbrain"], .ob-widget,
  [class*="sponsored-post"],
  #bb-overlay-x7m4q2, .bb-overlay-x7m4q2,
  #banner-container, .banner-container,
  [class*="code-block"], [class*="ai-viewport"],
  iframe[src*="agl002"], iframe[src*="ads"], iframe[src*="doubleclick"], iframe[src*="popads"],
  a[href*="bonuscaf"], a[href*="adsboosters"] { display: none !important; pointer-events: none !important; }
`

// ─── Full filter-list engine (EasyList + EasyPrivacy grade) ──────────────────
// The curated host list below is only the offline fallback. Whenever possible
// the real engine — tens of thousands of network + cosmetic rules, cached on
// disk and refreshed every few days — does the blocking instead.
const ENGINE_CACHE_FILE = 'adblocker-engine.bin'
const ENGINE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000

let enginePromise: Promise<ElectronBlocker | null> | null = null

function getEngineCachePath(): string {
  return path.join(app.getPath('userData'), ENGINE_CACHE_FILE)
}

async function loadEngine(): Promise<ElectronBlocker | null> {
  const cachePath = getEngineCachePath()
  try {
    try {
      const [stat, buf] = await Promise.all([fsp.stat(cachePath), fsp.readFile(cachePath)])
      const engine = ElectronBlocker.deserialize(
        new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
      )
      console.log('[PopupAdblock] Engine loaded from disk cache')
      if (Date.now() - stat.mtimeMs > ENGINE_MAX_AGE_MS) {
        void refreshEngineCache(cachePath)
      }
      return engine
    } catch {
      /* no usable cache — fetch fresh below */
    }
    const fresh = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch)
    try {
      await fsp.mkdir(path.dirname(cachePath), { recursive: true })
      await fsp.writeFile(cachePath, Buffer.from(fresh.serialize()))
    } catch {
      /* cache write is best-effort */
    }
    console.log('[PopupAdblock] Engine fetched fresh (ads + tracking lists)')
    return fresh
  } catch (err) {
    console.error('[PopupAdblock] Engine unavailable, host-list fallback active:', err)
    return null
  }
}

async function refreshEngineCache(cachePath: string): Promise<void> {
  try {
    const fresh = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch)
    await fsp.writeFile(cachePath, Buffer.from(fresh.serialize()))
    console.log('[PopupAdblock] Engine cache refreshed for next launch')
  } catch {
    /* next launch retries */
  }
}

function getEngine(): Promise<ElectronBlocker | null> {
  if (!enginePromise) enginePromise = loadEngine()
  return enginePromise
}

const wiredSessions = new WeakSet<Electron.Session>()

/** Attach request-level blocking to a popup session. Idempotent. */
export function registerPopupAdblock(target?: Electron.Session): void {
  const ses = target || session.fromPartition(POPUP_PARTITION)
  if (wiredSessions.has(ses)) return
  wiredSessions.add(ses)

  // Layer 1 (always on): curated host list — works offline from first launch.
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    // Never block the page itself — only its ad sub-resources. Main-frame
    // navigations always pass here (the navigation guards below handle those),
    // so site flows can't break.
    if (details.resourceType !== 'mainFrame' && isBlockedAdUrl(details.url)) {
      callback({ cancel: true })
      return
    }
    // Strict script policy on download-site pages (kills rotating ad loaders).
    if (details.resourceType === 'script') {
      let pageRef = details.referrer
      if (!pageRef && details.webContentsId) {
        try {
          const wc = webContents.fromId(details.webContentsId)
          if (wc && !wc.isDestroyed()) pageRef = wc.getURL()
        } catch {}
      }
      if (isStrictScriptBlock(details.url, pageRef)) {
        callback({ cancel: true })
        return
      }
    }
    callback({})
  })

  // Layer 2 (when available): full EasyList-grade engine on the same session.
  void getEngine()
    .then(engine => {
      if (engine) {
        applyCustomEngineFilters(engine)
        engine.enableBlockingInSession(ses)
        console.log('[PopupAdblock] Full filter engine active on popup session')
      }
    })
    .catch(() => {
      /* fallback layer already active */
    })
}

export function getPopupSession(): Electron.Session {
  return session.fromPartition(POPUP_PARTITION)
}
