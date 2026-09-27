import { XMLParser } from 'fast-xml-parser'
import { net } from 'electron'
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

async function fetchText(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<{ text: string; finalUrl: string }> {
  let lastError: unknown
  for (let attempt = 1; attempt <= FETCH_ATTEMPTS; attempt += 1) {
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
      if (!retryable || attempt === FETCH_ATTEMPTS) throw err
      console.warn(`[FocusTube] ${url.slice(0, 70)}… ${message} (attempt ${attempt}/${FETCH_ATTEMPTS}), retrying`)
      await sleep(RETRY_DELAYS_MS[attempt - 1] ?? 1500)
    }
  }
  throw lastError
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

export async function fetchChannelFeed(channelId: string): Promise<ParsedFeed> {
  const id = normalizeChannelId(channelId, channelId)
  const { text } = await fetchText(FEED_URL + encodeURIComponent(id))
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
export function normalizeChannelInput(input: string): { kind: 'id' | 'url'; value: string } {
  const raw = String(input || '').trim()
  if (!raw) throw new Error('Enter a channel URL or @handle')
  if (/\s/.test(raw)) throw new Error('That does not look like a YouTube channel')

  if (CHANNEL_ID_PATTERN.test(raw)) return { kind: 'id', value: raw }

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
  if (avatar) return decodeEntities(avatar[1])
  // og:image on a channel page is the channel avatar. On a watch page it is the
  // video thumbnail, so callers must not use it there.
  const og = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/)
  return og ? decodeEntities(og[1]) : null
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
export async function resolveChannel(input: string): Promise<ResolvedChannel> {
  const normalized = normalizeChannelInput(input)

  if (normalized.kind === 'id') {
    return verifyByFeed(normalized.value, {
      handle: null,
      avatarUrl: null,
    })
  }

  const { text, finalUrl } = await fetchText(normalized.value)
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
      return await verifyByFeed(candidate, { handle, avatarUrl })
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
): Promise<ResolvedChannel> {
  const feed = await fetchChannelFeed(channelId)
  if (!feed.entries.length && !feed.title) {
    throw new Error(`No feed available for ${channelId}`)
  }
  return {
    channelId: feed.channelId,
    title: feed.title || channelId,
    handle: extra.handle,
    avatarUrl: extra.avatarUrl,
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
