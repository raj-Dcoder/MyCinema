import { XMLParser } from 'fast-xml-parser'
import { net } from 'electron'
import https from 'https'
import dns from 'dns'
import * as focusTube from './focusTube'

// ─── Focus Tube: feed network layer ───────────────────────────────────────────
// Everything that talks to YouTube lives here. `focusTube.ts` owns storage; this
// module owns the wire.
//
// What YouTube actually lets us reach without credentials, established by
// probing the live endpoints rather than by assumption:
//
//   1. Channel Atom feed — youtube.com/feeds/videos.xml?channel_id=UC…
//      WORKS. Gives the latest ~15 uploads with title, publish date,
//      description, view count and a 4:3 thumbnail. Advertises
//      `Cache-Control: max-age=900` and sends neither ETag nor Last-Modified, so
//      conditional GET is impossible: we poll on an interval and diff video ids.
//      Notably it does NOT include duration, live state or embeddability.
//
//   2. The RSS feed is also the authority on channel *identity*. It echoes the
//      canonical channel id, so we use it to verify anything scraped from HTML.
//
//   3. The watch page — DOES NOT WORK for what we need. ytInitialPlayerResponse
//      comes back with playabilityStatus "LOGIN_REQUIRED" / "Sign in to confirm
//      you're not a bot" and contains no lengthSeconds, isLiveContent or
//      playableInEmbed. Scraping it for duration is not possible without
//      cookies, so duration is instead learned from the player at watch time.
//
// Consequence: duration, live state and embeddability are NOT known before
// playback. `ft_videos.embeddable` therefore defaults to optimistic (true) and
// the embed itself is treated as the authority — FocusTubePlayer watches for
// YouTube's own error 101/150 and flips the flag if embedding is refused.

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

const FEED_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id='
const CHANNEL_ID_PATTERN = /^UC[\w-]{22}$/
const BARE_ID_PATTERN = /^[\w-]{22}$/

// YouTube refreshes channel feeds roughly every 15 minutes; polling faster is
// both wasteful and a good way to get rate-limited.
export const FEED_MIN_POLL_MINUTES = 15

// Per-channel fetch concurrency. Deliberately modest.
const POLL_CONCURRENCY = 6

const FETCH_TIMEOUT_MS = 15_000

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  processEntities: true,
})

/**
 * Performs a GET over Electron's Chromium network stack rather than Node's
 * built-in fetch.
 *
 * This is not a cosmetic choice. Measured side by side against the same URL:
 *
 *   net.fetch  (Chromium) -> 200, 22 KB of Atom feed
 *   fetch      (undici)   -> 500/404, YouTube error page
 *
 * YouTube rejects undici's requests (different TLS/HTTP2 fingerprint) on the
 * feed, Shorts and watch-page endpoints, which silently breaks the whole
 * feature. net.fetch also routes through the app's session, so the user's proxy
 * settings and any YouTube sign-in cookies are honoured.
 *
 * Falls back to global fetch so the module stays testable outside Electron.
 */
function httpGet(url: string, init: RequestInit): Promise<Response> {
  if (net && typeof net.fetch === 'function') {
    return net.fetch(url, init as any) as unknown as Promise<Response>
  }
  return fetch(url, init)
}

// YouTube's edge answers the first request of a fresh Chromium network session
// with 404/500, and the request immediately following a *failed* one is
// typically rejected once as well before succeeding (reproduced: first request
// 500, feed-after-a-timed-out-request 404, same feed immediately after 200).
// The startup poll lands exactly in that window, so a few patient retries are
// the difference between a populated stack and an empty one on first launch.
const FETCH_ATTEMPTS = 4
const RETRY_DELAYS_MS = [700, 2000, 4000]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchTextOnce(url: string, timeoutMs: number): Promise<{ text: string; finalUrl: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await httpGet(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    } as RequestInit)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return { text: await response.text(), finalUrl: response.url || url }
  } finally {
    clearTimeout(timer)
  }
}

async function fetchText(url: string, timeoutMs = FETCH_TIMEOUT_MS, attempts = FETCH_ATTEMPTS): Promise<{ text: string; finalUrl: string }> {
  const tries = Math.min(Math.max(Number(attempts) || 1, 1), FETCH_ATTEMPTS)
  let lastError: unknown
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      return await fetchTextOnce(url, timeoutMs)
    } catch (err) {
      lastError = err
      // Retry 404 as well: on a cold network session YouTube's edge answers the
      // first feed request with 404/500 and serves 200 moments later, so
      // treating 404 as final left first launch with an empty stack. A genuinely
      // missing channel costs two extra requests and ~1.6s, which is far
      // cheaper than silently showing nothing.
      const message = err instanceof Error ? err.message : String(err)
      const status = Number(/HTTP (\d+)/.exec(message)?.[1] ?? 0)
      const retryable = status === 0 || status === 404 || status === 429 || status >= 500
      if (!retryable || attempt === tries) throw err
      console.warn(`[FocusTube] ${url.slice(0, 70)}… ${message} (attempt ${attempt}/${tries}), retrying`)
      await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 1500)
    }
  }
  throw lastError
}

/**
 * Per-call network budget. Background polls keep the patient defaults;
 * interactive search passes fewer attempts + shorter timeouts so the UI fails
 * fast into its fallbacks instead of spinning for a minute.
 */
export interface FetchOptions {
  timeoutMs?: number
  attempts?: number
}

function resolveFetchArgs(opts?: FetchOptions): { timeoutMs: number; attempts: number } {
  return {
    timeoutMs: opts?.timeoutMs ?? FETCH_TIMEOUT_MS,
    attempts: opts?.attempts ?? FETCH_ATTEMPTS,
  }
}

/** XML nodes are either a string, an array (repeated tags) or { '#text': … }. */
function textOf(node: any): string {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return textOf(node[0])
  if (typeof node === 'object' && '#text' in node) return textOf(node['#text'])
  return ''
}

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === null || value === undefined) return []
  return Array.isArray(value) ? value : [value]
}

function toInt(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * The Atom feed writes `<yt:channelId>` WITHOUT the leading "UC" (the feed id is
 * `yt:channel:sBjUR…`), so the value cannot be trusted as a channel id on its
 * own. The id we asked for is authoritative.
 */
function normalizeChannelId(value: string, fallback: string): string {
  const trimmed = String(value || '').trim()
  if (CHANNEL_ID_PATTERN.test(trimmed)) return trimmed
  if (BARE_ID_PATTERN.test(trimmed)) return `UC${trimmed}`
  return fallback
}

/** fast-xml-parser decodes named entities but not numeric character refs. */
function decodeNumericEntities(value: string): string {
  return value.replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
}

// ─── Channel feed ─────────────────────────────────────────────────────────────

export interface ParsedFeed {
  channelId: string
  title: string | null
  entries: focusTube.FtFeedEntry[]
}

export function parseChannelFeed(xml: string, fallbackChannelId: string): ParsedFeed {
  let parsed: any
  try {
    parsed = parser.parse(xml)
  } catch {
    return { channelId: fallbackChannelId, title: null, entries: [] }
  }

  const feed = parsed?.feed
  if (!feed) return { channelId: fallbackChannelId, title: null, entries: [] }

  const channelId = normalizeChannelId(textOf(feed['yt:channelId']), fallbackChannelId)
  const feedTitle = textOf(feed.title) || null

  const entries: focusTube.FtFeedEntry[] = []
  for (const entry of asArray<any>(feed.entry)) {
    const videoId = textOf(entry['yt:videoId'])
    if (!videoId) continue

    const group = entry['media:group'] || {}
    const community = group['media:community'] || {}
    const statistics = asArray<any>(community['media:statistics'])[0] || {}

    entries.push({
      videoId,
      channelId: normalizeChannelId(textOf(entry['yt:channelId']), channelId),
      title: decodeNumericEntities(textOf(entry.title) || textOf(group['media:title']) || 'Untitled'),
      publishedAt: textOf(entry.published) || textOf(entry.updated) || new Date().toISOString(),
      views: toInt(statistics['@_views']),
      description: decodeNumericEntities(textOf(group['media:description']) || '') || null,
    })
  }

  return { channelId, title: feedTitle, entries }
}

export async function fetchChannelFeed(channelId: string, opts?: FetchOptions): Promise<ParsedFeed> {
  const id = normalizeChannelId(channelId, channelId)
  const args = resolveFetchArgs(opts)
  const { text } = await fetchText(FEED_URL + encodeURIComponent(id), args.timeoutMs, args.attempts)
  return parseChannelFeed(text, id)
}

/**
 * Returns the video ids currently listed on a channel's Shorts tab. This is the
 * only reliable Shorts signal available to us: the Atom feed has no Shorts flag
 * and watch pages are bot-gated, so duration and page metadata are both out.
 * The tab shows roughly the latest 48 Shorts; anything it lists is positively a
 * Short (the links use /shorts/ playback URLs backed by reelWatchEndpoint).
 */
export async function fetchChannelShorts(channelId: string): Promise<string[]> {
  const id = normalizeChannelId(channelId, channelId)
  const { text } = await fetchText(`https://www.youtube.com/channel/${encodeURIComponent(id)}/shorts`)
  const ids = new Set<string>()
  const pattern = /\/shorts\/([A-Za-z0-9_-]{11})/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    ids.add(match[1])
  }
  return [...ids]
}

// ─── Channel resolution ───────────────────────────────────────────────────────

export interface ResolvedChannel {
  channelId: string
  title: string
  handle: string | null
  avatarUrl: string | null
  url: string
}

/**
 * Turns whatever the user pasted into a channel. Accepts a bare UC id, a bare
 * name or @handle, a channel/vanity/c/user URL, or even a single video URL (we
 * read the owning channel off the watch page).
 */
export function normalizeChannelInput(input: string): { kind: 'id' | 'url' | 'search'; value: string } {
  const raw = String(input || '').trim().replace(/\s+/g, ' ')
  if (!raw) throw new Error('Enter a channel name, @handle, or URL')

  if (CHANNEL_ID_PATTERN.test(raw)) return { kind: 'id', value: raw }

  // Multi-word names ("Tanmay Bhat") are keyword searches. Previously this
  // threw "does not look like a YouTube channel", dead-ending the Subscribe
  // button whenever live search had no options to offer.
  if (/\s/.test(raw)) return { kind: 'search', value: raw }

  // Bare name or handle typed without punctuation.
  if (/^@?[\w.-]{3,30}$/.test(raw)) {
    return { kind: 'url', value: `https://www.youtube.com/@${raw.replace(/^@/, '')}` }
  }

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  let parsed: URL
  try {
    parsed = new URL(withProtocol)
  } catch {
    throw new Error('That does not look like a YouTube channel')
  }

  if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/i.test(parsed.hostname)) {
    throw new Error('That does not look like a YouTube channel')
  }
  return { kind: 'url', value: parsed.toString() }
}

function pickChannelIds(html: string, isWatchPage: boolean): string[] {
  const ids: string[] = []
  const push = (value: string | null | undefined) => {
    if (value && CHANNEL_ID_PATTERN.test(value) && !ids.includes(value)) ids.push(value)
  }

  if (isWatchPage) {
    // On a watch page the first "channelId" is the owner. The authoritative
    // markers below also appear and are preferred when present.
    push(html.match(/"channelId":"(UC[\w-]{22})"/)?.[1])
  }

  // On a CHANNEL page these three are unique and correct, whereas a bare
  // "channelId" match belongs to unrelated channels in a shelf — verified
  // against a live channel page, which had 0 correct "channelId" hits.
  push(html.match(/<link[^>]+rel="canonical"[^>]+href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/)?.[1])
  push(html.match(/<meta[^>]+itemprop="identifier"[^>]+content="(UC[\w-]{22})"/)?.[1])
  push(html.match(/"externalId":"(UC[\w-]{22})"/)?.[1])

  if (!isWatchPage) {
    push(html.match(/"channelId":"(UC[\w-]{22})"/)?.[1])
  }
  return ids
}

function decodeEntities(value: string): string {
  return decodeNumericEntities(
    value
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>'),
  )
}

function pickChannelName(html: string, isWatchPage: boolean): string | null {
  if (isWatchPage) {
    const owner = html.match(/"ownerChannelName":"([^"]+)"/)
    if (owner) return decodeEntities(owner[1])
  }
  const itemprop = html.match(/<meta[^>]+itemprop="name"[^>]+content="([^"]+)"/)
  if (itemprop) return decodeEntities(itemprop[1])
  const og = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/)
  if (og) return decodeEntities(og[1])
  return null
}

function pickAvatar(html: string): string | null {
  const avatar = html.match(/"avatar":\{"thumbnails":\[\{"url":"([^"]+)"/)
  if (avatar) return normalizeAvatarUrl(avatar[1])
  // Newer channel markup nests the avatar under channelThumbnailWithLinkRenderer.
  const linked = html.match(/"channelThumbnailWithLinkRenderer":\{"thumbnail":\{"thumbnails":\[\{"url":"([^"]+)"/)
  if (linked) return normalizeAvatarUrl(linked[1])
  // og:image on a channel page is the channel avatar. On a watch page it is the
  // video thumbnail, so callers must not use it there.
  const og = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/)
  return og ? normalizeAvatarUrl(og[1]) : null
}

/**
 * Scope-embedded JSON in YouTube pages escapes `&` as `\u0026` and `/` as
 * `\/` — neither is an HTML entity, so decodeEntities leaves them behind and
 * avatar URLs come out broken. Unescape those first.
 */
function unescapeJsString(value: string): string {
  return value
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\\//g, '/')
}

/**
 * Avatars scraped from YouTube pages are often protocol-relative
 * (`//yt3.ggpht.com/…`), which never loads from a file:// Electron page.
 * Normalizes to an absolute https URL; returns null when unusable.
 */
export function normalizeAvatarUrl(url: string | null | undefined): string | null {
  if (url === null || url === undefined) return null
  let cleaned = unescapeJsString(String(url)).trim()
  if (!cleaned) return null
  cleaned = decodeEntities(cleaned)
  if (cleaned.startsWith('//')) cleaned = `https:${cleaned}`
  if (!/^https?:\/\//i.test(cleaned)) return null
  return cleaned
}

function pickHandle(html: string): string | null {
  const canonical = html.match(/"canonicalBaseUrl":"\/@([^"]+)"/)
  if (canonical) return `@${canonical[1]}`
  const link = html.match(/<link[^>]+rel="canonical"[^>]+href="https:\/\/www\.youtube\.com\/@([^"]+)"/)
  if (link) return `@${link[1]}`
  return null
}

/**
 * Resolves a pasted link to a channel and verifies it against the channel's own
 * RSS feed. The feed is the authority: it echoes the canonical channel id and
 * the true channel title, which removes the whole class of "scraped the wrong
 * channel id out of a shelf of recommendations" bugs. If verification fails we
 * still fall back to the best scraped candidate rather than refusing outright.
 */
export async function resolveChannel(input: string, opts?: FetchOptions): Promise<ResolvedChannel> {
  const normalized = normalizeChannelInput(input)
  const args = resolveFetchArgs(opts)

  // Plain names resolve through keyword search: top result wins, verified
  // against its feed when reachable, search metadata otherwise. Subscribing
  // must not fail just because verification did — videos backfill on poll.
  if (normalized.kind === 'search') {
    const options = await searchChannels(normalized.value, 5, opts)
    const top = options[0]
    if (!top) throw new Error(`No channels found for "${String(input).trim()}". Try the @handle or paste the channel URL.`)
    try {
      return await verifyByFeed(top.channelId, { handle: top.handle, avatarUrl: top.avatarUrl }, opts)
    } catch {
      console.warn(`[FocusTube] Feed verify failed for search pick ${top.channelId}; subscribing from search metadata`)
      return {
        channelId: top.channelId,
        title: top.title,
        handle: top.handle,
        avatarUrl: top.avatarUrl,
        url: `https://www.youtube.com/channel/${top.channelId}`,
      }
    }
  }

  if (normalized.kind === 'id') {
    try {
      return await verifyByFeed(normalized.value, {
        handle: null,
        avatarUrl: null,
      }, opts)
    } catch (feedErr) {
      // The feed edge flakes (cold-session 404/500s). Fall back to the channel
      // page for identity; videos backfill on the next poll.
      console.warn(`[FocusTube] Feed verify failed for ${normalized.value}; falling back to page metadata`)
      try {
        const { text } = await fetchText(
          `https://www.youtube.com/channel/${encodeURIComponent(normalized.value)}`,
          args.timeoutMs,
          args.attempts,
        )
        return {
          channelId: normalized.value,
          title: pickChannelName(text, false) || normalized.value,
          handle: pickHandle(text),
          avatarUrl: pickAvatar(text),
          url: `https://www.youtube.com/channel/${normalized.value}`,
        }
      } catch {
        throw feedErr
      }
    }
  }

  const { text, finalUrl } = await fetchText(normalized.value, args.timeoutMs, args.attempts)
  const isWatchPage = /[?&]v=/.test(normalized.value) || /\/watch(\?|$)/.test(normalized.value)
  const scrapedName = pickChannelName(text, isWatchPage)
  const handle = pickHandle(text)
  const avatarUrl = pickAvatar(text)

  const candidates = pickChannelIds(text, isWatchPage)

  // Legacy /c/ and /user/ vanity URLs redirect to /channel/UC…, so the final URL
  // is often the cleanest source of the id.
  const fromRedirect = finalUrl.match(/\/channel\/(UC[\w-]{22})/)
  if (fromRedirect && !candidates.includes(fromRedirect[1])) candidates.unshift(fromRedirect[1])

  if (!candidates.length) {
    throw new Error('Could not find a channel at that link. Try pasting the @handle or the channel URL.')
  }

  for (const candidate of candidates.slice(0, 3)) {
    try {
      return await verifyByFeed(candidate, { handle, avatarUrl }, opts)
    } catch {
      // Wrong candidate — try the next one.
    }
  }

  // Nothing verified. Return the first candidate with scraped metadata so the
  // user can see what would be added and correct it themselves.
  const channelId = candidates[0]
  return {
    channelId,
    title: scrapedName || channelId,
    handle,
    avatarUrl,
    url: `https://www.youtube.com/channel/${channelId}`,
  }
}

/** Confirms a channel id by reading its feed, and prefers the feed's own title. */
async function verifyByFeed(
  channelId: string,
  extra: { handle: string | null; avatarUrl: string | null },
  opts?: FetchOptions,
): Promise<ResolvedChannel> {
  const feed = await fetchChannelFeed(channelId, opts)
  if (!feed.entries.length && !feed.title) {
    throw new Error(`No feed available for ${channelId}`)
  }
  // The feed carries no avatar/handle, and the bare-ID path never scraped a
  // page — so without this the subscribed list shows a blank placeholder logo.
  // One channel-page fetch fills both; failure keeps the feed data.
  let handle = extra.handle
  let avatarUrl = normalizeAvatarUrl(extra.avatarUrl)
  if (!avatarUrl || !handle) {
    try {
      const args = resolveFetchArgs(opts)
      const { text } = await fetchText(
        `https://www.youtube.com/channel/${encodeURIComponent(feed.channelId)}`,
        args.timeoutMs,
        args.attempts,
      )
      if (!avatarUrl) avatarUrl = pickAvatar(text)
      if (!handle) handle = pickHandle(text)
    } catch {
      // Keep feed data; avatar refreshes on the next poll that scrapes it.
    }
  }
  return {
    channelId: feed.channelId,
    title: feed.title || channelId,
    handle,
    avatarUrl,
    url: `https://www.youtube.com/channel/${feed.channelId}`,
  }
}

/** A cheap, always-available probe for a video's channel (no auth, no bot gate). */
export async function fetchOembed(videoId: string): Promise<{ title: string; authorName: string; authorUrl: string } | null> {
  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`
    const { text } = await fetchText(url)
    const data = JSON.parse(text)
    return {
      title: String(data.title || ''),
      authorName: String(data.author_name || ''),
      authorUrl: String(data.author_url || ''),
    }
  } catch {
    return null
  }
}

// ─── Channel search ─────────────────────────────────────────────────────────

export interface FtChannelSearchResult {
  channelId: string
  title: string
  handle: string | null
  avatarUrl: string | null
  subscriberText: string | null
  videoCountText: string | null
  descriptionSnippet: string | null
}

/** `ytInitialData` is a giant JSON blob assigned in a script tag. Extracts it
 * with brace balancing (string-aware, double-quote strings only — tracking
 * single quotes misfires on apostrophes in prose). */
function extractYtInitialData(html: string): any | null {
  const marker = html.indexOf('ytInitialData')
  if (marker < 0) return null
  const start = html.indexOf('{', marker)
  if (start < 0) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < html.length; i += 1) {
    const ch = html[i]
    if (inStr) {
      if (esc) { esc = false; continue }
      if (ch === '\\') { esc = true; continue }
      if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') { inStr = true; continue }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1))
        } catch {
          return null
        }
      }
    }
  }
  return null
}

/** Walks the parsed blob and collects every channelRenderer node. */
function collectChannelRenderers(node: unknown, out: any[], depth = 0): void {
  if (!node || typeof node !== 'object' || depth > 40 || out.length >= 25) return
  if (Array.isArray(node)) {
    for (const item of node) collectChannelRenderers(item, out, depth + 1)
    return
  }
  const record = node as Record<string, unknown>
  if (record.channelRenderer && typeof record.channelRenderer === 'object') {
    out.push(record.channelRenderer)
  }
  for (const key of Object.keys(record)) {
    const value = record[key]
    if (value && typeof value === 'object') collectChannelRenderers(value, out, depth + 1)
  }
}

function textFromTextContainer(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.simpleText === 'string' && record.simpleText.trim()) {
    return record.simpleText.trim()
  }
  if (Array.isArray(record.runs)) {
    const joined = record.runs
      .map((run) => (run && typeof run === 'object' && typeof (run as any).text === 'string' ? (run as any).text : ''))
      .join('')
      .trim()
    if (joined) return joined
  }
  return null
}

/** Best thumbnail is the largest — YouTube sorts them ascending. */
function pickBestThumbnail(value: unknown): string | null {
  const thumbs = (value as any)?.thumbnails
  if (!Array.isArray(thumbs) || !thumbs.length) return null
  for (let i = thumbs.length - 1; i >= 0; i -= 1) {
    const url = thumbs[i]?.url
    if (typeof url === 'string' && url) return normalizeAvatarUrl(url)
  }
  return null
}

function parseChannelRenderer(renderer: any): FtChannelSearchResult | null {
  const channelId = typeof renderer?.channelId === 'string' ? renderer.channelId : null
  if (!channelId || !CHANNEL_ID_PATTERN.test(channelId)) return null
  const title = textFromTextContainer(renderer.title) || channelId
  const browse = renderer?.navigationEndpoint?.browseEndpoint
  let handle: string | null = null
  const canonical = typeof browse?.canonicalBaseUrl === 'string' ? browse.canonicalBaseUrl : null
  if (canonical && canonical.startsWith('/@')) handle = canonical.slice(1)
  if (!handle) {
    const byline = textFromTextContainer(renderer.shortBylineText)
    if (byline && byline.startsWith('@')) handle = byline.split(/\s/)[0]
  }
  return {
    channelId,
    title,
    handle,
    avatarUrl: pickBestThumbnail(renderer.thumbnail),
    subscriberText: textFromTextContainer(renderer.subscriberCountText),
    videoCountText: textFromTextContainer(renderer.videoCountText),
    descriptionSnippet: textFromTextContainer(renderer.descriptionSnippet),
  }
}

/** Regex fallback when the JSON blob cannot be parsed: channelRenderer blocks
 * start with the channel id, with title and avatar following within a few KB. */
function fallbackScanChannelRenderers(html: string): FtChannelSearchResult[] {
  const results: FtChannelSearchResult[] = []
  const seen = new Set<string>()
  const headPattern = /"channelRenderer":\{"channelId":"(UC[\w-]{22})"/g
  let head: RegExpExecArray | null
  while ((head = headPattern.exec(html)) !== null && results.length < 10) {
    const channelId = head[1]
    if (seen.has(channelId)) continue
    seen.add(channelId)
    const windowText = html.slice(head.index, head.index + 6000)
    const simpleTitle = windowText.match(/"title":\{"simpleText":"((?:[^"\\]|\\.)*)"\}/)
    const runsTitleMatch: RegExpMatchArray | null = !simpleTitle
      ? windowText.match(/"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/)
      : null
    const rawTitle = simpleTitle?.[1] ?? runsTitleMatch?.[1] ?? null
    const avatarMatch = windowText.match(/"thumbnails":\[.*?{"url":"(https?:[^"]+|[^"]*yt3[^"]*)"/)
    const handleMatch = windowText.match(/"canonicalBaseUrl":"\/@([^"]+)"/)
    const subsMatch = windowText.match(/"subscriberCountText":\{"simpleText":"((?:[^"\\]|\\.)*)"\}/)
    results.push({
      channelId,
      title: rawTitle ? decodeEntities(unescapeJsString(rawTitle)) : channelId,
      handle: handleMatch ? `@${handleMatch[1]}` : null,
      avatarUrl: normalizeAvatarUrl(avatarMatch?.[1] ?? null),
      subscriberText: subsMatch?.[1] ? decodeEntities(unescapeJsString(subsMatch[1])) : null,
      videoCountText: null,
      descriptionSnippet: null,
    })
  }
  return results
}

/**
 * Detects YouTube's bot/consent wall on a 200 response. These pages carry no
 * usable search data, so recognizing them lets us skip straight to the
 * Invidious fallback instead of reporting a misleading "no channels found".
 */
function detectSearchBlock(text: string, finalUrl: string): 'consent' | 'bot-check' | null {
  if (/consent\.youtube\.com/i.test(finalUrl || '')) return 'consent'
  if (/not a bot/i.test(text)) return 'bot-check'
  return null
}

/** Scrapes YouTube's own results page (channel filter). Throws on HTTP errors. */
async function searchYouTubeScrape(
  query: string,
  capped: number,
  opts?: FetchOptions,
): Promise<{ results: FtChannelSearchResult[]; blocked: 'consent' | 'bot-check' | null }> {
  const args = resolveFetchArgs(opts)
  const { text, finalUrl } = await fetchText(
    `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAg%3D%3D`,
    args.timeoutMs,
    args.attempts,
  )

  const blocked = detectSearchBlock(text, finalUrl)
  if (blocked) return { results: [], blocked }

  const merged: FtChannelSearchResult[] = []
  const seen = new Set<string>()
  const push = (item: FtChannelSearchResult | null) => {
    if (!item || seen.has(item.channelId) || merged.length >= capped) return
    seen.add(item.channelId)
    merged.push(item)
  }

  const data = extractYtInitialData(text)
  if (data) {
    const renderers: any[] = []
    collectChannelRenderers(data, renderers)
    for (const renderer of renderers) push(parseChannelRenderer(renderer))
  }
  if (!merged.length) {
    for (const item of fallbackScanChannelRenderers(text)) push(item)
  }
  return { results: merged, blocked: null }
}

// Public Invidious instances backing the no-key JSON search fallback AND the
// comments section. Tried in order with a short per-instance timeout — a dead
// instance costs seconds, never the whole feature. The list is intentionally
// redundant: instances come and go, the rotation absorbs that. Verified alive
// 2026-09-30; keep alive-first when editing.
const INVIDIOUS_INSTANCES = [
  'https://invidious.nerdvpn.de',
  'https://invidious.f5.si',
  'https://inv.nadeko.net',
  'https://iv.melmac.space',
]
const INVIDIOUS_TIMEOUT_MS = 7000

function formatCount(value: unknown, word: string): string | null {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n) || n < 0) return null
  const compact = n >= 1_000_000_000
    ? `${(n / 1_000_000_000).toFixed(1)}B`
    : n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}M`
      : n >= 1000
        ? `${(n / 1000).toFixed(1)}K`
        : `${Math.floor(n)}`
  return `${compact.replace(/\.0$/, '')} ${word}${n === 1 ? '' : 's'}`
}

function mapInvidiousChannel(item: any): FtChannelSearchResult | null {
  const channelId = typeof item?.authorId === 'string' ? item.authorId : null
  if (!channelId || !CHANNEL_ID_PATTERN.test(channelId)) return null
  // Thumbnails arrive ascending; the last usable URL is the largest.
  let avatar: string | null = null
  for (const thumb of Array.isArray(item?.authorThumbnails) ? item.authorThumbnails : []) {
    if (typeof thumb?.url === 'string' && thumb.url) avatar = thumb.url
  }
  const author = typeof item?.author === 'string' && item.author.trim() ? item.author.trim() : channelId
  return {
    channelId,
    title: author,
    handle: null,
    avatarUrl: normalizeAvatarUrl(avatar),
    subscriberText: formatCount(item?.subCount, 'subscriber'),
    videoCountText: formatCount(item?.videoCount, 'video'),
    descriptionSnippet:
      typeof item?.description === 'string' && item.description.trim()
        ? item.description.trim().slice(0, 140)
        : null,
  }
}

async function fetchJsonWithFetcher(
  fetcher: (url: string, init: RequestInit) => Promise<Response>,
  url: string,
  timeoutMs: number,
): Promise<any> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetcher(url, {
      signal: controller.signal,
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/json' },
    } as RequestInit)
    if (!response.ok) {
      let detail = ''
      try {
        const text = await response.text()
        try {
          const parsed = JSON.parse(text)
          if (typeof parsed?.error === 'string') detail = parsed.error
        } catch {
          detail = text.slice(0, 200)
        }
      } catch { /* body unreadable — status alone will do */ }
      throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ''}`)
    }
    return JSON.parse(await response.text())
  } finally {
    clearTimeout(timer)
  }
}

// Custom DNS (Google/Cloudflare) to bypass ISP blocks — same approach as the
// main-process HTTP helper. Last resort for mirrors whose TLS gets intercepted
// (ERR_CERT_COMMON_NAME_INVALID from an ISP block page): resolving over public
// DNS reaches the real host instead of the hijacked IP.
const publicCommentDns = new dns.Resolver()
try {
  publicCommentDns.setServers(['8.8.8.8', '1.1.1.1'])
} catch { /* keep system DNS */ }

function lookupViaPublicDns(
  hostname: string,
  _options: unknown,
  callback: (err: unknown, address: string, family: number) => void,
): void {
  publicCommentDns.resolve4(hostname, (err, addresses) => {
    if (!err && addresses?.length) {
      callback(null, addresses[0], 4)
      return
    }
    dns.lookup(hostname, (err2, address, family) => callback(err2, String(address || ''), Number(family || 4)))
  })
}

function fetchJsonViaNodeHttps(url: string, timeoutMs: number): Promise<any> {
  return new Promise((resolve, reject) => {
    let settled = false
    let req: any = null
    const timer = setTimeout(() => {
      try { req?.destroy() } catch { /* ignore */ }
      if (!settled) {
        settled = true
        reject(new Error('Timed out reaching the comments service'))
      }
    }, timeoutMs)
    const fail = (err: unknown) => {
      clearTimeout(timer)
      if (!settled) {
        settled = true
        reject(err)
      }
    }
    try {
      req = https.get(url, {
        lookup: lookupViaPublicDns as any,
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      } as any, (res: any) => {
        const status = Number(res?.statusCode || 0)
        let body = ''
        res.on('data', (chunk: any) => { body += String(chunk) })
        res.on('end', () => {
          clearTimeout(timer)
          if (settled) return
          if (status < 200 || status >= 300) {
            let detail = body.slice(0, 200)
            try {
              const parsed = JSON.parse(body)
              if (typeof parsed?.error === 'string') detail = parsed.error
            } catch { /* keep raw slice */ }
            settled = true
            reject(new Error(`HTTP ${status}${detail ? `: ${detail}` : ''}`))
            return
          }
          try {
            settled = true
            resolve(JSON.parse(body))
          } catch {
            settled = true
            reject(new Error('Unexpected comments response'))
          }
        })
      })
      req.on('error', fail)
    } catch (err) {
      fail(err)
    }
  })
}

async function fetchJson(url: string, timeoutMs: number): Promise<any> {
  try {
    return await fetchJsonWithFetcher(httpGet, url, timeoutMs)
  } catch (chromiumErr) {
    // Chromium's stack (net.fetch) can fail on TLS/proxy quirks that Node's
    // own stack sails through — retry the SAME mirror over undici, then over
    // Node https with public-DNS resolution, before moving to the next mirror.
    try {
      return await fetchJsonWithFetcher(fetch, url, timeoutMs)
    } catch {
      try {
        return await fetchJsonViaNodeHttps(url, Math.max(timeoutMs, 10000))
      } catch {
        throw chromiumErr
      }
    }
  }
}

/** Raw network failures become something a user can act on. Never leaks net:: codes. */
function friendlyCommentsError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err)
  if (/CERT|certificate|SSL|TLS/i.test(message)) {
    return new Error('The comments service is blocked on this network (certificate mismatch). Try a VPN, or open the video on YouTube for comments.')
  }
  if (/abort|timed out|timeout|ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|network|fetch failed|HTTP 429|HTTP 5\d\d/i.test(message)) {
    return new Error('Could not reach the comments service. Check your connection and retry.')
  }
  return err instanceof Error ? err : new Error(String(err))
}

/**
 * Channel search through the public Invidious API (no key, stable JSON).
 * Exists so a YouTube-side block on the scraped results page degrades into
 * slightly sparser options instead of a dead search.
 */
export async function searchChannelsInvidious(query: string, limit = 8): Promise<FtChannelSearchResult[]> {
  const capped = Math.min(Math.max(limit, 1), 12)
  let lastError: unknown = new Error('No search mirrors reachable')
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const data = await fetchJson(
        `${base}/api/v1/search?q=${encodeURIComponent(query)}&type=channel`,
        INVIDIOUS_TIMEOUT_MS,
      )
      if (!Array.isArray(data)) throw new Error('Unexpected search response')
      const out: FtChannelSearchResult[] = []
      const seen = new Set<string>()
      for (const item of data) {
        if (item?.type !== 'channel') continue
        const mapped = mapInvidiousChannel(item)
        if (!mapped || seen.has(mapped.channelId) || out.length >= capped) continue
        seen.add(mapped.channelId)
        out.push(mapped)
      }
      // A valid-but-empty page can be instance staleness; keep looking.
      if (out.length) return out
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

/** Technical failure → actionable message. Never leaks bare HTTP codes alone. */
function friendlySearchError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err)
  if (/HTTP 429/.test(message)) {
    return new Error('YouTube is rate-limiting search right now. Wait a minute, or paste the channel URL — that path is more reliable.')
  }
  if (/HTTP 403/.test(message)) {
    return new Error('YouTube refused the search request. Paste the channel URL or @handle instead — that still works.')
  }
  if (/abort|timed out|timeout|ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|network|fetch failed/i.test(message)) {
    return new Error('Search timed out. Check your connection and try again, or paste the channel URL.')
  }
  return err instanceof Error ? err : new Error(String(err))
}

/**
 * Searches YouTube for channels by name, handle or keywords and returns the
 * options list (deduped, best first). A bare UC id or a pasted
 * channel/video URL resolves to its single exact channel instead.
 *
 * Resilience design — every layer degrades into the next, so the search only
 * hard-fails when there is genuinely nothing to offer:
 *   1. YouTube results-page scrape + public Invidious API run IN PARALLEL and
 *      merge (YouTube first), so one blocked source never sinks the search.
 *   2. Block/consent pages are detected and treated as "source down", never
 *      misreported as "no channels match".
 *   3. Single-token handles get an exact-resolve pin attempt (best effort).
 *   4. Technical errors are translated into actionable messages.
 */
export async function searchChannels(
  query: string,
  limit = 8,
  opts?: FetchOptions,
): Promise<FtChannelSearchResult[]> {
  const trimmed = String(query || '').trim().replace(/\s+/g, ' ')
  if (!trimmed || trimmed.length < 2) return []
  const capped = Math.min(Math.max(limit, 1), 12)

  // Exact identifiers need no search page: one verified result.
  if (CHANNEL_ID_PATTERN.test(trimmed) || /youtube\.com|youtu\.be/i.test(trimmed)) {
    try {
      const resolved = await resolveChannel(trimmed, opts)
      return [{
        channelId: resolved.channelId,
        title: resolved.title,
        handle: resolved.handle,
        avatarUrl: normalizeAvatarUrl(resolved.avatarUrl),
        subscriberText: null,
        videoCountText: null,
        descriptionSnippet: null,
      }]
    } catch (err) {
      throw friendlySearchError(err)
    }
  }

  // Interactive budget: fail fast into fallbacks instead of spinning through
  // four 15s attempts per request. Background callers can pass their own.
  const interactive: FetchOptions = {
    timeoutMs: opts?.timeoutMs ?? 10_000,
    attempts: opts?.attempts ?? 2,
  }
  const [yt, iv] = await Promise.allSettled([
    searchYouTubeScrape(trimmed, capped, interactive),
    searchChannelsInvidious(trimmed, capped),
  ])

  const merged: FtChannelSearchResult[] = []
  const seen = new Set<string>()
  const push = (item: FtChannelSearchResult | null) => {
    if (!item || seen.has(item.channelId) || merged.length >= capped) return
    seen.add(item.channelId)
    merged.push(item)
  }
  if (yt.status === 'fulfilled') {
    for (const item of yt.value.results) push(item)
  }
  if (iv.status === 'fulfilled') {
    for (const item of iv.value) push(item)
  }
  const blocked = yt.status === 'fulfilled' ? yt.value.blocked : null

  // A single-token name/handle may also be an exact @handle: resolve it and
  // pin it on top so "@mkbhd" finds its channel first, then the alternatives.
  // Single attempt, short timeout — best effort, never delays failure.
  if (/^@?[\w.-]{3,30}$/.test(trimmed)) {
    try {
      const exact = await resolveChannel(trimmed.startsWith('@') ? trimmed : `@${trimmed}`, {
        timeoutMs: 8000,
        attempts: 1,
      })
      if (!seen.has(exact.channelId)) {
        merged.unshift({
          channelId: exact.channelId,
          title: exact.title,
          handle: exact.handle,
          avatarUrl: normalizeAvatarUrl(exact.avatarUrl),
          subscriberText: null,
          videoCountText: null,
          descriptionSnippet: null,
        })
      }
    } catch {
      // Not an exact handle — the scraped options stand on their own.
    }
  }

  if (!merged.length) {
    const youtubeDown = blocked !== null || yt.status === 'rejected'
    const mirrorsDown = iv.status === 'rejected'
    if (youtubeDown && mirrorsDown) {
      const detail = yt.status === 'rejected'
        ? (yt.reason instanceof Error ? yt.reason.message : String(yt.reason))
        : null
      console.warn(`[FocusTube] Channel search fully blocked for "${trimmed.slice(0, 60)}"${detail ? `: ${detail}` : ''}`)
      throw new Error('Search is throttled right now. Paste the channel URL or @handle above and press Subscribe — that path is more reliable.')
    }
    if (youtubeDown) {
      throw new Error('YouTube blocked this search. Try again in a bit, or paste the channel URL — that still works.')
    }
    throw new Error('No channels found for that search. Try the @handle or paste the channel URL.')
  }
  return merged.slice(0, capped)
}

// ─── Comments (keyless, via Invidious mirrors) ───────────────────────────────
// The watch page is bot-gated and there is no YouTube Data API key in the app,
// so top-level comments + replies come from the public Invidious JSON API,
// rotating the same mirrors the channel search already uses. One instance down
// costs a few seconds, never the whole section.
//
// Invidious `GET /api/v1/comments/:id?sort_by=top|new&continuation=…` answers:
//   { comments: [{ author, authorId, authorUrl, authorThumbnails[],
//                  content, published, publishedText, likeCount,
//                  replyCount, replies: { continuation } }],
//     continuation, commentCount }
// or `{ error: "…" }` (e.g. "Comments disabled"). The same endpoint serves
// reply pages when called with a reply continuation.

export interface FtComment {
  commentId: string | null
  author: string
  authorId: string | null
  avatarUrl: string | null
  content: string
  publishedText: string | null
  likeCount: number | null
  replyCount: number
  replyContinuation: string | null
}

export interface FtCommentsResult {
  comments: FtComment[]
  continuation: string | null
  commentCount: number | null
  disabled: boolean
}

function mapInvidiousComment(item: any): FtComment | null {
  if (!item || typeof item !== 'object') return null
  const rawContent = typeof item.content === 'string' ? item.content.trim() : ''
  const author = typeof item.author === 'string' && item.author.trim() ? item.author.trim() : 'Unknown'
  if (!rawContent) return null
  // `content` is plain text but still carries entities (&#39;) on some builds.
  const content = decodeEntities(rawContent)
  // Current builds send `authorThumbnail` (singular string); older ones sent an
  // `authorThumbnails` array. Accept both so avatars don't silently vanish.
  let avatar: string | null = null
  if (typeof item.authorThumbnail === 'string' && item.authorThumbnail) {
    avatar = item.authorThumbnail
  } else {
    for (const thumb of Array.isArray(item.authorThumbnails) ? item.authorThumbnails : []) {
      if (typeof thumb?.url === 'string' && thumb.url) avatar = thumb.url
    }
  }
  const replies = item.replies && typeof item.replies === 'object' ? item.replies : null
  const replyContinuation = replies && typeof replies.continuation === 'string' && replies.continuation
    ? replies.continuation
    : null
  const likeCount = typeof item.likeCount === 'number' && Number.isFinite(item.likeCount) ? item.likeCount : null
  const replyCount = typeof item.replyCount === 'number' && Number.isFinite(item.replyCount)
    ? item.replyCount
    : (typeof replies?.replyCount === 'number' && Number.isFinite(replies.replyCount) ? replies.replyCount : 0)
  return {
    commentId: typeof item.commentId === 'string' ? item.commentId : null,
    author,
    authorId: typeof item.authorId === 'string' ? item.authorId : null,
    avatarUrl: normalizeAvatarUrl(avatar),
    content,
    publishedText: typeof item.publishedText === 'string' && item.publishedText.trim() ? item.publishedText.trim() : null,
    likeCount,
    replyCount,
    replyContinuation,
  }
}

export async function fetchVideoComments(
  videoId: string,
  opts?: { sortBy?: 'top' | 'new'; continuation?: string | null },
): Promise<FtCommentsResult> {
  const id = String(videoId || '').trim()
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error('Invalid video id')
  const sortBy = opts?.sortBy === 'new' ? 'new' : 'top'
  const continuation = opts?.continuation ? String(opts.continuation) : null

  let lastError: unknown = new Error('No comment mirrors reachable')
  for (const base of INVIDIOUS_INSTANCES) {
    try {
      const params = new URLSearchParams({ sort_by: sortBy })
      if (continuation) params.set('continuation', continuation)
      const data = await fetchJson(
        `${base}/api/v1/comments/${encodeURIComponent(id)}?${params.toString()}`,
        INVIDIOUS_TIMEOUT_MS,
      )
      if (data && typeof data === 'object' && typeof (data as any).error === 'string') {
        const message = String((data as any).error)
        if (/disabled/i.test(message)) {
          return { comments: [], continuation: null, commentCount: null, disabled: true }
        }
        throw new Error(message)
      }
      const raw = Array.isArray((data as any)?.comments) ? (data as any).comments : []
      const comments: FtComment[] = []
      for (const item of raw) {
        const mapped = mapInvidiousComment(item)
        if (mapped) comments.push(mapped)
      }
      return {
        comments,
        continuation:
          typeof (data as any)?.continuation === 'string' && (data as any).continuation
            ? String((data as any).continuation)
            : null,
        commentCount:
          typeof (data as any)?.commentCount === 'number' && Number.isFinite((data as any).commentCount)
            ? Number((data as any).commentCount)
            : null,
        disabled: false,
      }
    } catch (err) {
      // Disabled-comments failures are definitive (every mirror agrees) — report
      // the state instead of burning through the rotation into a scary error.
      const message = err instanceof Error ? err.message : String(err)
      if (/disabled/i.test(message)) {
        return { comments: [], continuation: null, commentCount: null, disabled: true }
      }
      lastError = err
    }
  }
  console.warn(`[FocusTube] Comments unreachable for ${id}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
  throw friendlyCommentsError(lastError)
}

// ─── Playback-time reporting ──────────────────────────────────────────────────

/**
 * Records what the player actually observed. The feed cannot tell us duration,
 * so `getDuration` from the embed is the only reliable source — meaning cards
 * learn their runtime the first time a video is played.
 */
export function recordPlaybackObservation(videoId: string, observation: { duration?: number | null; ended?: boolean }): void {
  if (typeof observation.duration === 'number' && observation.duration > 0) {
    focusTube.setVideoEnrichment(videoId, { duration: observation.duration })
  }
  if (observation.ended) {
    focusTube.setVideoSeen(videoId, true)
  }
}

/** Flips the embeddable flag when YouTube itself refuses playback (error 101/150). */
export function markNotEmbeddable(videoId: string): void {
  focusTube.setVideoEnrichment(videoId, { embeddable: false })
  console.warn(`[FocusTube] ${videoId} refused embedding (YouTube error 101/150)`)
}

// ─── Avatar backfill ────────────────────────────────────────────────────────

/**
 * Channels subscribed before logos existed (or via a bare ID) sit in the DB
 * with avatar_url NULL and show a letter placeholder forever — nothing ever
 * rewrote them. Refreshes one channel's logo + handle from its channel page.
 * Returns true when an avatar was stored.
 */
export async function refreshChannelAvatar(channelId: string): Promise<boolean> {
  const id = normalizeChannelId(channelId, channelId)
  try {
    const { text } = await fetchText(`https://www.youtube.com/channel/${encodeURIComponent(id)}`)
    const avatarUrl = pickAvatar(text)
    const handle = pickHandle(text)
    if (!avatarUrl && !handle) return false
    focusTube.upsertChannel({
      channelId: id,
      title: focusTube.getChannel(id)?.title || id,
      handle,
      avatarUrl,
    })
    return avatarUrl !== null
  } catch (err: any) {
    console.warn(`[FocusTube] Avatar refresh failed for ${id}: ${err?.message}`)
    return false
  }
}

/**
 * Backfills logos for every subscribed channel still missing one.
 * Failure-isolated per channel; only touches rows with no avatar stored.
 */
export async function refreshMissingAvatars(): Promise<{ checked: number; updated: number }> {
  const missing = focusTube.listChannels(null).filter((c) => !c.avatarUrl)
  if (!missing.length) return { checked: 0, updated: 0 }
  const done = await withConcurrency(missing, 3, async (channel) => refreshChannelAvatar(channel.channelId))
  const updated = done.filter(Boolean).length
  console.log(`[FocusTube] Avatar backfill: ${updated}/${missing.length} logos restored`)
  return { checked: missing.length, updated }
}

// ─── Polling ──────────────────────────────────────────────────────────────────

export interface PollResult {
  added: number
  channelIds: string[]
  failed: string[]
}

async function withConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index])
    }
  })

  await Promise.all(runners)
  return results
}

/**
 * Refreshes every due channel and diffs in whatever is new. One channel failing
 * never blocks the others — a dead feed leaves its last_error set and the stack
 * keeps serving whatever was stored before.
 */
export async function pollFeeds(options?: { force?: boolean }): Promise<PollResult> {
  const force = options?.force ?? false
  const due = focusTube.getChannelsDueForFetch(FEED_MIN_POLL_MINUTES, force)
  const result: PollResult = { added: 0, channelIds: [], failed: [] }

  if (!due.length) return result

  await withConcurrency(due, POLL_CONCURRENCY, async (channel) => {
    try {
      const feed = await fetchChannelFeed(channel.channelId)
      const upsert = focusTube.upsertFeedEntries(channel.channelId, feed.entries)
      focusTube.setChannelLastFetched(channel.channelId, null)

      if (upsert.inserted > 0) {
        result.added += upsert.inserted
        result.channelIds.push(channel.channelId)
      }
      // The feed is authoritative for the channel's own name.
      if (feed.title && feed.title !== channel.title) {
        focusTube.upsertChannel({ channelId: channel.channelId, title: feed.title, url: channel.url })
      }

      // Shorts classification rides on the same cycle: one extra page fetch per
      // channel, failure-isolated so a blocked/broken tab never fails the feed.
      let shortsMarked = 0
      try {
        const shortIds = await fetchChannelShorts(channel.channelId)
        shortsMarked = focusTube.setVideosShort(shortIds)
      } catch (shortsErr: any) {
        console.warn(`[FocusTube] Shorts tab failed for ${channel.title}: ${shortsErr?.message}`)
      }

      console.log(`[FocusTube] ${channel.title}: +${upsert.inserted} new (${upsert.existing} existing), ${shortsMarked} flagged as Shorts`)
    } catch (err: any) {
      const message = err?.message || 'Unknown error'
      focusTube.setChannelLastFetched(channel.channelId, message)
      result.failed.push(channel.channelId)
      console.warn(`[FocusTube] Feed failed for ${channel.title} (${channel.channelId}): ${message}`)
    }
  })

  return result
}
