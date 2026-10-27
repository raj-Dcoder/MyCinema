import type { Video } from '../types'
import { getTorrentSourceHealthScore } from './torrentSources'

export const ONLINE_PROGRESS_STORAGE_KEY = 'mycinema_remember_online_progress'

/** Renderer fast-path gate. Source of truth lives in app-settings.json (main). */
export const isOnlineProgressEnabled = () => {
  try {
    return localStorage.getItem(ONLINE_PROGRESS_STORAGE_KEY) !== 'false'
  } catch {
    return true
  }
}

export const setOnlineProgressEnabledLocal = (enabled: boolean) => {
  try {
    localStorage.setItem(ONLINE_PROGRESS_STORAGE_KEY, enabled ? 'true' : 'false')
  } catch { /* ignore */ }
}

/**
 * Stale-preload guard: `npm run dev` hot-reloads the renderer but NOT the
 * preload bridge, so a freshly loaded screen can reference bridge functions
 * the running preload doesn't have yet (TypeError: not a function → full tree
 * crash). Every stream-progress bridge call goes through these safe wrappers.
 * Packaged builds bundle both together, so this is purely a safety net.
 */
const streamBridge = () => (window as any)?.api as any | undefined

export const safeGetStreamHistory = async (limit: number = 100): Promise<any[]> => {
  try {
    const fn = streamBridge()?.getStreamHistory
    if (typeof fn !== 'function') return []
    return (await fn.call(streamBridge(), limit)) || []
  } catch {
    return []
  }
}

export const safeGetStreamProgress = async (
  tmdbId: number, mediaType: string, season?: number | null, episode?: number | null
): Promise<any | null> => {
  try {
    const fn = streamBridge()?.getStreamProgress
    if (typeof fn !== 'function') return null
    return await fn.call(streamBridge(), tmdbId, mediaType, season ?? null, episode ?? null)
  } catch {
    return null
  }
}

export const safeUpdateStreamProgress = (entry: any) => {
  try {
    streamBridge()?.updateStreamProgress?.(entry)
  } catch { /* best-effort */ }
}

export const safePrioritizeTempFiles = (streamId: string, fileIndexes: number[]) => {
  try {
    void (streamBridge() as any)?.prioritizeTempFiles?.(streamId, fileIndexes)?.catch?.(() => {})
  } catch { /* best-effort pre-buffer hint */ }
}

export const safeDeleteStreamProgress = async (
  tmdbId: number, mediaType: string, season?: number | null, episode?: number | null
): Promise<void> => {
  try {
    await streamBridge()?.deleteStreamProgress?.(tmdbId, mediaType, season ?? null, episode ?? null)
  } catch { /* best-effort */ }
}

/** #3: follow + new-episode alerts. Main (app-settings.json) is source of truth. */
export const NOTIFY_NEW_EPISODES_KEY = 'mycinema_notify_new_episodes'
export const FOLLOW_CHECK_STORAGE_KEY = 'mycinema_follow_check_at'
export const FOLLOW_CHECK_THROTTLE_MS = 20 * 3600 * 1000
export const FOLLOW_TOAST_EVENT = 'mycinema-following-toast'

export const isNewEpisodeNotifyEnabled = () => {
  try {
    return localStorage.getItem(NOTIFY_NEW_EPISODES_KEY) !== 'false'
  } catch {
    return true
  }
}

export const setNewEpisodeNotifyLocal = (enabled: boolean) => {
  try {
    localStorage.setItem(NOTIFY_NEW_EPISODES_KEY, enabled ? 'true' : 'false')
  } catch { /* ignore */ }
}

export const safeFollowSeries = async (input: {
  tmdb_id: number; title?: string; poster_path?: string | null; backdrop_path?: string | null;
  overview?: string | null; season?: number | null; episode?: number | null
}): Promise<{ followed: boolean; isNew?: boolean; hasNewDrop?: boolean; dropSeason?: number; dropEpisode?: number }> => {
  try {
    const fn = streamBridge()?.followSeries
    if (typeof fn !== 'function') return { followed: false }
    return (await fn.call(streamBridge(), input)) || { followed: false }
  } catch {
    return { followed: false }
  }
}

export const safeUnfollowSeries = async (tmdbId: number): Promise<void> => {
  try {
    await streamBridge()?.unfollowSeries?.(tmdbId)
  } catch { /* best-effort */ }
}

export const safeGetFollowedSeries = async (): Promise<any[]> => {
  try {
    const fn = streamBridge()?.getFollowedSeries
    if (typeof fn !== 'function') return []
    return (await fn.call(streamBridge())) || []
  } catch {
    return []
  }
}

export const safeMarkFollowedSeen = async (tmdbId: number): Promise<void> => {
  try {
    await streamBridge()?.markFollowedSeen?.(tmdbId)
  } catch { /* best-effort */ }
}

export const safeCheckSeriesUpdates = async (
  tmdbId: number
): Promise<{ checked: boolean; hasNew?: boolean; season?: number; episode?: number }> => {
  try {
    const fn = streamBridge()?.checkSeriesUpdates
    if (typeof fn !== 'function') return { checked: false }
    return (await fn.call(streamBridge(), tmdbId)) || { checked: false }
  } catch {
    return { checked: false }
  }
}

export const safeCheckFollowedUpdates = async (): Promise<any[] | null> => {
  try {
    const fn = streamBridge()?.checkFollowedUpdates
    if (typeof fn !== 'function') return null
    return (await fn.call(streamBridge())) || []
  } catch {
    return null
  }
}

export const shouldRunFollowCheck = () => {
  try {
    const last = Number(localStorage.getItem(FOLLOW_CHECK_STORAGE_KEY) || 0)
    return Date.now() - last > FOLLOW_CHECK_THROTTLE_MS
  } catch {
    return true
  }
}

export const stampFollowCheck = () => {
  try {
    localStorage.setItem(FOLLOW_CHECK_STORAGE_KEY, String(Date.now()))
  } catch { /* ignore */ }
}

export const formatResumeTime = (seconds?: number | null) => {
  const s = Math.max(0, Math.floor(Number(seconds) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

const getMagnetInfoHash = (magnet?: string | null) => {
  if (!magnet) return null
  const match = magnet.match(/btih:([a-zA-Z0-9]+)/i)
  return match ? match[1].toLowerCase() : null
}

const sourceMatchesEpisode = (source: any, season?: number | null, episode?: number | null) => {
  if (season == null && episode == null) return true
  if (typeof source.parsedSeason === 'number' && season != null && source.parsedSeason !== season) return false
  if (typeof source.parsedEpisode === 'number' && episode != null && source.parsedEpisode !== episode) return false
  if (typeof source.parsedEpisode !== 'number' && episode != null && source.title) {
    // No parsed marker — accept season packs / generic season matches, reject
    // obvious wrong-episode singles like "S01E05" when we want E02.
    const m = String(source.title).match(/\bE(?:p)?[\s._-]*(\d{1,3})\b/i) || String(source.title).match(/\b\d{1,2}x(\d{1,3})\b/i)
    if (m && Number(m[1]) !== episode) return false
  }
  return true
}

const pickBestSource = (sources: any[], season?: number | null, episode?: number | null) => {
  const matching = (sources || []).filter(s => s?.magnet && sourceMatchesEpisode(s, season, episode))
  const pool = matching.length > 0 ? matching : (sources || []).filter(s => s?.magnet)
  if (pool.length === 0) return null
  return [...pool].sort((a, b) => getTorrentSourceHealthScore(b) - getTorrentSourceHealthScore(a))[0]
}

export interface StreamResumeTarget {
  tmdb_id: number
  media_type: 'movie' | 'series'
  season?: number | null
  episode?: number | null
  title: string
  release_year?: number | null
  position: number
  poster_path?: string | null
  backdrop_path?: string | null
  overview?: string | null
  source_magnet?: string | null
  file_index?: number | null
}

/** Stable key identifying one resumable unit (used for pending UI state). */
export const getOnlineResumeKey = (video: { type: string; tmdb_id?: number | null; season?: number | null; episode?: number | null }) =>
  `${video.type}:${video.tmdb_id ?? 0}:${video.season ?? 0}:${video.episode ?? 0}`

/** Original torrent file position from a `torrent://stream/<id>?file=<i>` URL. */
export const getTorrentFileQueryIndex = (filePath?: string | null): number | null => {
  const m = (filePath || '').match(/[?&]file=(\d+)/)
  return m ? Number(m[1]) : null
}

const withTimeout = async <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>(resolve => { timer = setTimeout(() => resolve(fallback), ms) })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export const formatSeasonEpisode = (season?: number | null, episode?: number | null) => {
  if (season != null && episode != null) return `S${season} E${episode}`
  if (episode != null) return `E${episode}`
  return ''
}

export interface OnlineSeriesGroup {
  tmdb_id: number
  title: string
  rows: any[]
  maxSeason: number
  maxEpisode: number
  /** Most recently updated in-progress row, if any. */
  activeRow: any | null
  latestUpdate: string
  poster_path?: string | null
  backdrop_path?: string | null
  overview?: string | null
  release_year?: number | null
}

/** Split stream_history rows into movie rows + per-series groups. */
export const groupOnlineStreamRows = (rows: any[]): { movieRows: any[]; seriesGroups: OnlineSeriesGroup[] } => {
  const movieRows: any[] = []
  const bySeries = new Map<number, any[]>()
  for (const row of rows || []) {
    if (!row?.tmdb_id) continue
    if (row.media_type === 'series') {
      const list = bySeries.get(Number(row.tmdb_id)) || []
      list.push(row)
      bySeries.set(Number(row.tmdb_id), list)
    } else {
      movieRows.push(row)
    }
  }
  const seriesGroups: OnlineSeriesGroup[] = []
  for (const [tmdbId, list] of bySeries) {
    const sorted = [...list].sort((a, b) => (
      Number(a.season || 0) - Number(b.season || 0) || Number(a.episode || 0) - Number(b.episode || 0)
    ))
    const top = sorted[sorted.length - 1]
    const activeRow = [...list]
      .filter(r => !r.completed)
      .sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime())[0] || null
    const latestUpdate = [...list]
      .map(r => new Date(r.updated_at || 0).getTime())
      .reduce((m, t) => Math.max(m, t), 0)
    const freshest = [...list].sort((a, b) => (
      new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()
    ))[0]
    seriesGroups.push({
      tmdb_id: tmdbId,
      title: freshest?.title || top?.title || 'Unknown Title',
      rows: sorted,
      maxSeason: Number(top?.season || 0),
      maxEpisode: Number(top?.episode || 0),
      activeRow,
      latestUpdate: new Date(latestUpdate || 0).toISOString(),
      poster_path: freshest?.poster_path ?? top?.poster_path ?? null,
      backdrop_path: freshest?.backdrop_path ?? top?.backdrop_path ?? null,
      overview: freshest?.overview ?? top?.overview ?? null,
      release_year: freshest?.release_year ?? top?.release_year ?? null
    })
  }
  return { movieRows, seriesGroups }
}

/** First released catalog episode after (maxSeason, maxEpisode). Null = caught up / unknown. */
export const resolveOnlineNextEpisode = async (
  tmdbId: number, maxSeason: number, maxEpisode: number
): Promise<{ season: number; episode: number; name?: string } | null> => {
  try {
    const catalog = await window.api.getTmdbSeriesCatalog(tmdbId)
    const released = (catalog || [])
      .filter(e => e?.released)
      .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber)
    const next = released.find(e => (
      e.seasonNumber > maxSeason || (e.seasonNumber === maxSeason && e.episodeNumber > maxEpisode)
    ))
    return next ? { season: next.seasonNumber, episode: next.episodeNumber, name: next.name } : null
  } catch {
    return null
  }
}

/**
 * One Hero card per online series:
 * - in-progress episode? Resume it (with "up next" hint when known).
 * - all watched? Jump to the next released episode.
 * - caught up / next unknown? Null (nothing to continue).
 */
export const buildOnlineSeriesCard = (
  group: OnlineSeriesGroup,
  next: { season: number; episode: number; name?: string } | null
): Video | null => {
  const base = {
    id: -Math.abs(group.tmdb_id),
    title: group.title,
    series_name: group.title,
    file_path: '',
    type: 'series' as const,
    duration: 0,
    poster_path: group.poster_path || undefined,
    backdrop_path: group.backdrop_path || undefined,
    overview: group.overview || undefined,
    release_year: group.release_year ?? undefined,
    tmdb_id: group.tmdb_id,
    media_type: 'tv' as const,
    completed: false,
    isOnlineResume: true
  }
  const watchedTill = `Watched till ${formatSeasonEpisode(group.maxSeason, group.maxEpisode)}`
  if (group.activeRow) {
    return {
      ...base,
      id: -Math.abs(group.tmdb_id * 100000 + Number(group.activeRow.season || 0) * 1000 + Number(group.activeRow.episode || 0)),
      season: group.activeRow.season ?? undefined,
      episode: group.activeRow.episode ?? undefined,
      duration: Number(group.activeRow.duration) || 0,
      last_watched_time: Number(group.activeRow.position) || 0,
      updated_at: group.activeRow.updated_at,
      sourceMagnet: group.activeRow.source_magnet || undefined,
      tagline: next ? `${watchedTill} · ${formatSeasonEpisode(next.season, next.episode)} up next` : watchedTill
    }
  }
  if (next) {
    return {
      ...base,
      id: -Math.abs(group.tmdb_id * 100000 + next.season * 1000 + next.episode),
      season: next.season,
      episode: next.episode,
      duration: 0,
      last_watched_time: 0,
      updated_at: group.latestUpdate,
      onlineNextEpisode: true,
      tagline: watchedTill
    }
  }
  return null
}

/** Convert a stream_progress DB row into a Hero-friendly Video. */
export const streamRowToVideo = (row: any): Video => {
  const mediaType = row.media_type === 'series' ? 'series' : 'movie'
  const title = row.title || 'Unknown Title'
  return {
    id: -Math.abs(Number(row.tmdb_id) || Date.now()),
    title,
    series_name: mediaType === 'series' ? title : undefined,
    file_path: '',
    type: mediaType,
    season: row.season ?? undefined,
    episode: row.episode ?? undefined,
    duration: Number(row.duration) || 0,
    poster_path: row.poster_path || undefined,
    backdrop_path: row.backdrop_path || undefined,
    overview: row.overview || undefined,
    release_year: row.release_year ?? undefined,
    tmdb_id: Number(row.tmdb_id),
    media_type: mediaType === 'series' ? 'tv' : 'movie',
    last_watched_time: Number(row.position) || 0,
    completed: false,
    updated_at: row.updated_at,
    isOnlineResume: true,
    sourceMagnet: row.source_magnet || undefined,
    fileIndex: Number.isFinite(Number(row.file_index)) ? Number(row.file_index) : undefined
  }
}

/**
 * One-click OTT resume: try the cached magnet first (instant), else re-search
 * and play the healthiest source at the saved position. Throws when unplayable.
 */
export const resumeOnlineStream = async (target: StreamResumeTarget): Promise<Video> => {
  if (!target.tmdb_id) throw new Error('Missing TMDB id for resume')
  const season = target.season ?? null
  const episode = target.episode ?? null
  const episodeHint = target.media_type === 'series'
    ? { season: season ?? undefined, episode: episode ?? undefined }
    : undefined

  // Title logo for the player loading overlay (same pipeline as DetailScreen:
  // disk-cached in main, so this is cheap after first load). Kicked off early
  // so it resolves concurrently with the stream startup below.
  const logoPromise: Promise<string | null> = (async () => {
    try {
      return await window.api.getTmdbTitleLogo(target.media_type, target.tmdb_id)
    } catch {
      return null
    }
  })()

  const baseVideo: Video = {
    id: -Math.abs(Date.now()),
    title: target.title,
    series_name: target.media_type === 'series' ? target.title : undefined,
    file_path: '',
    type: target.media_type,
    season: season ?? undefined,
    episode: episode ?? undefined,
    duration: 0,
    poster_path: target.poster_path || undefined,
    backdrop_path: target.backdrop_path || undefined,
    overview: target.overview || undefined,
    release_year: target.release_year ?? undefined,
    tmdb_id: target.tmdb_id,
    media_type: target.media_type === 'series' ? 'tv' : 'movie',
    isExternal: false
  }

  const searchMediaType = target.media_type === 'series' ? 'tv' : 'movie'
  // Logo must not gate playback: disk-cached after first load, but a cold
  // fetch can take seconds — cap the wait, player falls back to title text.
  const fastLogo = () => withTimeout(logoPromise, 1200, null)

  const finish = async (
    started: any,
    magnet: string,
    sources: any[] | undefined,
    refreshed: boolean,
    seasonOverride?: number | null,
    episodeOverride?: number | null
  ): Promise<Video> => ({
    ...baseVideo,
    title: target.title,
    season: seasonOverride ?? season ?? undefined,
    episode: episodeOverride ?? episode ?? undefined,
    file_path: started.url,
    streamSourceId: (started as any).streamId,
    sourceMagnet: magnet,
    fetchedSources: sources && sources.length > 0 ? sources : undefined,
    logo_path: (await fastLogo()) || undefined,
    resumeFrom: Math.max(0, Number(target.position) || 0),
    sourceRefreshed: refreshed
  })

  // Kick off a provider search in the background. If the cached magnet wins
  // we cancel it; if the cache is dead the search is already in flight instead
  // of starting only after the ~25s metadata timeout.
  const warmSearch = () => {
    const requestId = `resume-${target.tmdb_id}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const pending = (window.api.searchTorrentSources(
      target.title,
      String(target.release_year || ''),
      searchMediaType,
      target.tmdb_id,
      requestId
    ) as Promise<any[]>).catch(() => null)
    return {
      promise: pending,
      cancel: () => {
        try {
          void (window.api as any)?.cancelTorrentSourceSearch?.(requestId)?.catch?.(() => {})
        } catch { /* ignore */ }
      }
    }
  }

  const playBest = async (sources: any[]): Promise<Video> => {
    const best = pickBestSource(sources || [], season, episode)
    if (!best?.magnet) throw new Error('No working source found for this title right now.')
    const result = await window.api.startTempStream(best.magnet, target.title, {
      ...(episodeHint || {}),
    } as any)
    if (!result?.url) throw new Error((result as any)?.error || 'Stream failed to start.')
    const cachedHash = getMagnetInfoHash(target.source_magnet)
    const bestHash = getMagnetInfoHash(best.magnet)
    return finish(
      result,
      best.magnet,
      sources,
      !cachedHash || cachedHash !== bestHash,
      (result as any).parsedSeason ?? best.parsedSeason ?? season,
      (result as any).parsedEpisode ?? best.parsedEpisode ?? episode
    )
  }

  // Exact-file start: same torrent + known file position beats hints.
  const hasFileIndex = target.file_index != null && Number.isFinite(Number(target.file_index))
  const startOpts = hasFileIndex ? { fileIndex: Number(target.file_index) } : (episodeHint as any)

  // 1. Fast path: cached magnet still works.
  if (target.source_magnet) {
    const bg = warmSearch()
    try {
      const fast = await window.api.startTempStream(target.source_magnet, target.title, startOpts)
      if (fast?.url) {
        bg.cancel()
        void bg.promise.catch(() => {})
        return finish(
          fast,
          target.source_magnet,
          undefined,
          false,
          (fast as any).parsedSeason ?? season,
          (fast as any).parsedEpisode ?? episode
        )
      }
    } catch (err) {
      console.warn('[StreamResume] cached magnet failed, using warmed-up search:', err)
    }
    // Cache dead — the search above is already in flight.
    return playBest((await bg.promise) || [])
  }

  // 2. Slow path: no cache, search then play the healthiest match.
  const solo = warmSearch()
  return playBest((await solo.promise) || [])
}
