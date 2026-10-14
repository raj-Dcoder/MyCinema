import { session } from 'electron'

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
  'sharethis.com'
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

/** True when a URL is ad/tracker noise (used for popups + sub-resources). */
export function isBlockedAdUrl(url: string): boolean {
  if (!/^https?:/i.test(url)) return false
  return isBlockedHost(hostnameOf(url)) || hasBlockedPath(url)
}

/** Leftover ad containers / widgets hidden after each page loads. */
export const POPUP_COSMETIC_CSS = `
  ins.adsbygoogle, .adsbygoogle,
  [id^="div-gpt-ad"], [id^="ad-"], [id*="-ad-"],
  .popup-ad, #popup-ad, .popunder-backdrop,
  .ad-banner, .ads-banner, .advertisement,
  [id*="taboola"], .tbl-feed-container,
  [id*="outbrain"], .ob-widget,
  iframe[src*="ads"], iframe[src*="doubleclick"] { display: none !important; }
`

const wiredSessions = new WeakSet<Electron.Session>()

/** Attach request-level blocking to a popup session. Idempotent. */
export function registerPopupAdblock(target?: Electron.Session): void {
  const ses = target || session.fromPartition(POPUP_PARTITION)
  if (wiredSessions.has(ses)) return
  wiredSessions.add(ses)

  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    // Never block the page itself — only its ad sub-resources. Main-frame
    // navigations always pass so site flows can't break.
    if (details.resourceType !== 'mainFrame' && isBlockedAdUrl(details.url)) {
      callback({ cancel: true })
      return
    }
    callback({})
  })
}

export function getPopupSession(): Electron.Session {
  return session.fromPartition(POPUP_PARTITION)
}
