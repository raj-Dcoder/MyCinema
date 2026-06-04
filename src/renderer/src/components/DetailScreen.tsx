import React, { useEffect, useRef, useState } from 'react'
import { X, Play, Info, Calendar, Clock, Star, FolderOpen, Film, Music, Subtitles, HardDrive, ChevronDown, ChevronUp, Heart, Bookmark, Share2, Search, Zap, Users, Download, AlertTriangle, Clapperboard, Loader2, ExternalLink, Languages, CheckCircle2, Copy, MessageCircle, Send } from 'lucide-react'
import { Video } from '../types'
import { getTorrentSourceHealthScore, getTorrentSourceSpeedLabel } from '../utils/torrentSources'

interface DetailScreenProps {
  video: Video
  initialSharedSource?: any | null
  onClose: () => void
  onPlay: (video: Video) => void
  onWatchlistChange?: () => void
}

// ─── Media Info helpers ───────────────────────────────────────────────────────
const InfoSection: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div>
    <div className="flex items-center gap-2 mb-2.5">
      {icon}
      <h4 className="text-[12px] font-black text-white/40 uppercase tracking-[0.18em]">{title}</h4>
    </div>
    <div className="space-y-1.5 pl-1">{children}</div>
  </div>
)

const InfoRow: React.FC<{ label: string; value: string | null | undefined }> = ({ label, value }) => {
  if (!value) return null
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-[11px] font-bold text-white/30 uppercase tracking-wider shrink-0">{label}</span>
      <span className="text-[12px] font-semibold text-white/80 text-right break-all">{value}</span>
    </div>
  )
}
// ─────────────────────────────────────────────────────────────────────────────

type TrailerSeasonSelection = 'latest' | 'series' | number

type ActiveDownload = {
  id: string
  title?: string
  name?: string | null
  progress?: number
  status?: 'downloading' | 'paused' | 'completed' | 'error' | string
  downloadSpeed?: string
  timeRemaining?: string
  tmdbId?: number
}

const getTorrentStreamErrorMessage = (error?: string | null) => {
  if (!error) return 'Stream is not ready yet.'
  if (error.includes('No handler registered') || error.includes('prepare-torrent-stream')) {
    return 'Play While Downloading needs the updated app process. Restart MyCinema and try again.'
  }
  return error
}

type VibeRule = {
  label: string
  tokens: string[]
  genres?: string[]
}

const VIBE_RULES: VibeRule[] = [
  { label: 'Space Survival', genres: ['science fiction', 'adventure'], tokens: ['space', 'astronaut', 'mission', 'mars', 'moon', 'planet', 'nasa', 'survival', 'alien', 'galaxy', 'interstellar', 'spaceship'] },
  { label: 'Hard Sci-Fi', genres: ['science fiction', 'sci-fi'], tokens: ['science', 'scientist', 'physics', 'engineer', 'experiment', 'technology', 'future', 'astronaut', 'mission'] },
  { label: 'High Drama', genres: ['drama'], tokens: ['drama', 'trauma', 'betrayal', 'grief', 'emotional', 'relationship', 'relationships', 'family'] },
  { label: 'Teen Chaos', tokens: ['teen', 'teenage', 'high school', 'students', 'school', 'coming of age', 'adolescent', 'youth'] },
  { label: 'Romance Heat', genres: ['romance'], tokens: ['love', 'romance', 'desire', 'crush', 'relationship', 'dating', 'sex', 'intimacy'] },
  { label: 'Friend Group Energy', tokens: ['friends', 'friendship', 'group of', 'crew', 'classmates', 'social media'] },
  { label: 'Dark & Messy', tokens: ['dark', 'drugs', 'addiction', 'crime', 'violence', 'secret', 'scandal', 'obsession'] },
  { label: 'Mind Trip', genres: ['science fiction', 'sci-fi', 'mystery'], tokens: ['mind', 'reality', 'technology', 'future', 'dystopian', 'simulation', 'memory', 'experiment'] },
  { label: 'Mystery Pull', genres: ['mystery', 'thriller'], tokens: ['mystery', 'missing', 'investigate', 'secret', 'killer', 'truth', 'detective'] },
  { label: 'Crime Spiral', genres: ['crime'], tokens: ['crime', 'criminal', 'police', 'gang', 'murder', 'heist', 'drug dealer'] },
  { label: 'Bingeable', tokens: ['series', 'season', 'episode', 'episodes', 'friends', 'mystery', 'secret'] },
  { label: 'Comfort Watch', genres: ['comedy', 'family'], tokens: ['comedy', 'funny', 'warm', 'family', 'feel-good', 'friendship'] },
  { label: 'Action Rush', genres: ['action', 'adventure'], tokens: ['action', 'mission', 'fight', 'battle', 'war', 'survive', 'chase'] },
  { label: 'Supernatural', genres: ['fantasy', 'horror'], tokens: ['supernatural', 'ghost', 'monster', 'curse', 'witch', 'demon', 'haunted'] }
]

const splitGenres = (value?: string | null) => (
  value ? value.split(',').map(genre => genre.trim()).filter(Boolean) : []
)

const getTasteText = (video: Video) => [
  video.type,
  video.title,
  video.series_name,
  video.tagline,
  video.overview,
  video.genres
].filter(Boolean).join(' ').toLowerCase()

const getVibeTags = (video: Video, genres: string[]) => {
  const text = getTasteText(video)
  const normalizedGenres = genres.map(genre => genre.toLowerCase())

  const scored = VIBE_RULES.map(rule => {
    const tokenHits = rule.tokens.filter(token => text.includes(token)).length
    const genreHits = (rule.genres || []).filter(genre => normalizedGenres.includes(genre)).length
    return { label: rule.label, score: tokenHits + genreHits * 2 }
  })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(item => item.label)

  const fallback = genres.slice(0, 3)
  return Array.from(new Set([...scored, ...fallback])).slice(0, 5)
}

const hasSourceEpisodeMarker = (source: any) => (
  typeof source.parsedEpisode === 'number' ||
  /\bs\d{1,2}[\s._-]*e(?:p)?[\s._-]*\d{1,3}\b/i.test(source.title || '') ||
  /\b\d{1,2}x\d{1,3}\b/i.test(source.title || '') ||
  /\b(?:episode|ep)[\s._-]*\d{1,3}\b/i.test(source.title || '')
)

const isSourceSeasonPack = (source: any) => Boolean(source.isSeasonPack) && !hasSourceEpisodeMarker(source)

const getMoctaleUrl = (video: Video) => {
  const title = video.type === 'series' && video.series_name ? video.series_name : video.title
  const slug = title
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `https://www.moctale.in/content/${slug}${video.release_year ? `-${video.release_year}` : ''}`
}

const normalizeMatchText = (value?: string | null) => (
  (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
)

const MYCINEMA_SHARE_BASE_URL = (
  import.meta.env.VITE_MYCINEMA_SHARE_BASE_URL ||
  'https://mycinema-share.rajveersinghranaofficial.workers.dev'
).replace(/\/+$/, '')
const SHARE_HINT_STORAGE_KEY = 'mycinema_detail_share_hint_seen_v1'

const DetailScreen: React.FC<DetailScreenProps> = ({ video, initialSharedSource, onClose, onPlay, onWatchlistChange }) => {
  const [episodes, setEpisodes] = useState<Video[]>([])
  const [loading, setLoading] = useState(false)
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [showTrailerModal, setShowTrailerModal] = useState(false)
  const [mediaInfo, setMediaInfo] = useState<any>(null)
  const [infoLoading, setInfoLoading] = useState(false)
  const [trailer, setTrailer] = useState<any>(null)
  const [trailerLoading, setTrailerLoading] = useState(false)
  const [trailerSeasonSelection, setTrailerSeasonSelection] = useState<TrailerSeasonSelection>('latest')
  const [trailerSeasons, setTrailerSeasons] = useState<number[]>([])
  const [shouldLoadTrailer, setShouldLoadTrailer] = useState(false)
  const trailerCacheRef = useRef<Map<string, any>>(new Map())
  const [showAllAudio, setShowAllAudio] = useState(false)
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null)
  const [isFavorite, setIsFavorite] = useState(video.is_favorite)
  const [isWatchlist, setIsWatchlist] = useState(video.is_watchlist)
  const [showWatchlistCategoryPicker, setShowWatchlistCategoryPicker] = useState(false)
  const [watchlistCategories, setWatchlistCategories] = useState<string[]>(['Watchlist'])
  const [newWatchlistCategory, setNewWatchlistCategory] = useState('')
  const [isCreatingWatchlistCategory, setIsCreatingWatchlistCategory] = useState(false)
  const [watchlistBusy, setWatchlistBusy] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [showShareModal, setShowShareModal] = useState(false)
  const [shareFeedback, setShareFeedback] = useState<string | null>(null)
  const [showShareHint, setShowShareHint] = useState(() => localStorage.getItem(SHARE_HINT_STORAGE_KEY) !== 'true')

  // Torrent Search State
  const [sources, setSources] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [sourceSeasonFilter, setSourceSeasonFilter] = useState('all')
  const [sourcePackSeasonFilter, setSourcePackSeasonFilter] = useState('all')
  const [sourceEpisodeFilter, setSourceEpisodeFilter] = useState('all')
  const [hindiOnly, setHindiOnly] = useState(false)
  const [showDownloadOptions, setShowDownloadOptions] = useState(false)
  const [startingSourceMagnet, setStartingSourceMagnet] = useState<string | null>(null)
  const [startedSourceMagnet, setStartedSourceMagnet] = useState<string | null>(null)
  const [startingBestDownload, setStartingBestDownload] = useState(false)
  const [startingTorrentStream, setStartingTorrentStream] = useState(false)
  const [torrentStreamError, setTorrentStreamError] = useState<string | null>(null)
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownload[]>([])
  const [sourceSearchStatus, setSourceSearchStatus] = useState({ found: 0, completed: 0, total: 0, cached: false, done: false })
  const sourceSearchRequestRef = useRef<string | null>(null)
  const cancelActiveSourceSearch = (markDone = true) => {
    const requestId = sourceSearchRequestRef.current
    if (requestId) {
      void window.api.cancelTorrentSourceSearch(requestId).catch(() => {})
      sourceSearchRequestRef.current = null
    }
    setSearching(false)
    if (markDone) {
      setSourceSearchStatus(prev => ({ ...prev, done: true }))
    }
  }
  const isTmdbBacked = video.type === 'movie' || video.type === 'series'
  const isLocalMedia = !video.isExternal && Boolean(video.file_path)
  const displayTitle = video.type === 'series' && video.series_name ? video.series_name : video.title
  const normalizedDisplayTitle = normalizeMatchText(displayTitle)
  const matchingDownload = activeDownloads.find(download => {
    if (video.tmdb_id && download.tmdbId === video.tmdb_id) return true
    const downloadTitle = normalizeMatchText([download.title, download.name].filter(Boolean).join(' '))
    return Boolean(normalizedDisplayTitle && downloadTitle && (
      downloadTitle.includes(normalizedDisplayTitle) || normalizedDisplayTitle.includes(downloadTitle)
    ))
  })
  const downloadProgress = Math.max(0, Math.min(100, Number(matchingDownload?.progress || 0)))
  const roundedDownloadProgress = Math.round(downloadProgress)
  const isDownloadPaused = matchingDownload?.status === 'paused'
  const isDownloadConnecting = matchingDownload?.status === 'connecting' || matchingDownload?.status === 'pending'
  const isDownloadComplete = matchingDownload?.status === 'completed' || matchingDownload?.status === 'done' || downloadProgress >= 100
  const isDownloadActive = Boolean(matchingDownload && !isDownloadComplete)

  const handleToggleFavorite = async () => {
    const newValue = await window.api.toggleFavorite(video.id)
    setIsFavorite(!!newValue)
    video.is_favorite = !!newValue // Sync local object
  }

  const loadWatchlistCategories = async () => {
    try {
      const data = await window.api.getWatchlist()
      const categories = Array.from(new Set(
        (data || []).map((item: Video) => item.category || 'Watchlist')
      )).sort((a, b) => {
        if (a === 'Watchlist') return -1
        if (b === 'Watchlist') return 1
        return a.localeCompare(b)
      })
      setWatchlistCategories(categories.length > 0 ? categories : ['Watchlist'])
    } catch (err) {
      console.error('[DetailScreen] Failed to load watchlist categories:', err)
      setWatchlistCategories(['Watchlist'])
    }
  }

  const handleOpenWatchlistPicker = async () => {
    setWatchlistBusy(true)
    await loadWatchlistCategories()
    setIsCreatingWatchlistCategory(false)
    setNewWatchlistCategory('')
    setShowWatchlistCategoryPicker(true)
    setWatchlistBusy(false)
  }

  const handleAddToWatchlistCategory = async (category: string = 'Watchlist') => {
    const safeCategory = category.trim() || 'Watchlist'
    setWatchlistBusy(true)
    try {
      if (video.isExternal) {
        await window.api.addToWatchlistExternal({ ...video, category: safeCategory, is_watchlist: true })
      } else {
        await window.api.addLocalToWatchlist(video.id, safeCategory)
      }

      setIsWatchlist(true)
      video.is_watchlist = true
      video.category = safeCategory
      setShowWatchlistCategoryPicker(false)
      setIsCreatingWatchlistCategory(false)
      setNewWatchlistCategory('')
      onWatchlistChange?.()
    } catch (err) {
      console.error('[DetailScreen] Watchlist add error:', err)
    } finally {
      setWatchlistBusy(false)
    }
  }

  const handleToggleWatchlist = async () => {
    if (video.isExternal) {
      if (isWatchlist) {
        await window.api.removeFromWatchlistExternal(video.tmdb_id!)
        setIsWatchlist(false)
        video.is_watchlist = false
        onWatchlistChange?.()
      } else {
        await handleOpenWatchlistPicker()
      }
    } else {
      if (isWatchlist) {
        const newValue = await window.api.toggleWatchlist(video.id)
        setIsWatchlist(!!newValue)
        video.is_watchlist = !!newValue // Sync local object
        onWatchlistChange?.()
      } else {
        await handleOpenWatchlistPicker()
      }
    }
  }

  const handleSearchSources = async (forceRefresh: boolean = false): Promise<any[]> => {
    if (!isTmdbBacked || !video.tmdb_id || (searching && !forceRefresh)) return []
    const hasOnlySharedSource = Boolean(initialSharedSource?.magnet) && sources.length === 1 && sources[0]?.magnet === initialSharedSource.magnet
    if (!forceRefresh && hasSearched && sources.length > 0 && !hasOnlySharedSource) return sources

    if (sourceSearchRequestRef.current) {
      cancelActiveSourceSearch(false)
    }
    setSearching(true)
    setHasSearched(true)
    if (!initialSharedSource?.magnet) {
      setHindiOnly(false)
      setSourceSeasonFilter('all')
      setSourcePackSeasonFilter('all')
      setSourceEpisodeFilter('all')
    }
    setStartedSourceMagnet(null)
    setSourceSearchStatus(prev => ({ ...prev, completed: 0, total: 0, cached: false, done: false }))
    const requestId = `${video.tmdb_id}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    sourceSearchRequestRef.current = requestId
    try {
      const results = await window.api.searchTorrentSources(
        video.title, 
        video.release_year?.toString() || '', 
        video.type === 'series' ? 'tv' : 'movie', 
        video.tmdb_id!,
        requestId
      )
      if (sourceSearchRequestRef.current === requestId) {
        setSources(prev => {
          if (!initialSharedSource?.magnet) return results
          const sharedSource = prev.find(source => source.magnet === initialSharedSource.magnet) || {
            ...initialSharedSource,
            seeds: initialSharedSource.seeds || 0,
            peers: initialSharedSource.peers || 0,
            type: 'shared'
          }
          const matchedSource = results.find(source => source.magnet === initialSharedSource.magnet)
          const mergedSharedSource = matchedSource ? { ...sharedSource, ...matchedSource } : sharedSource
          const others = results.filter(source => source.magnet !== initialSharedSource.magnet)
          return [mergedSharedSource, ...others]
        })
        setSourceSearchStatus(prev => ({ ...prev, found: results.length + (initialSharedSource?.magnet ? 1 : 0), done: true }))
      }
      return results || []
    } catch (err) {
      console.error('Failed to search sources:', err)
      if (sourceSearchRequestRef.current === requestId) {
        setSourceSearchStatus(prev => ({ ...prev, done: true }))
      }
      return []
    } finally {
      if (sourceSearchRequestRef.current === requestId) {
        setSearching(false)
        sourceSearchRequestRef.current = null
      }
    }
  }

  const handleOpenDownloadOptions = async () => {
    setShowDownloadOptions(true)
    await handleSearchSources(false)
  }

  const handleCloseDownloadOptions = () => {
    setShowDownloadOptions(false)
    cancelActiveSourceSearch(true)
  }

  useEffect(() => {
    const cleanup = window.api.onTorrentSourcesProgress((data: any) => {
      if (!data || data.requestId !== sourceSearchRequestRef.current) return
      if (Array.isArray(data.sources)) {
        setSources(prev => {
          if (!initialSharedSource?.magnet) return data.sources
          const sharedSource = prev.find(source => source.magnet === initialSharedSource.magnet) || {
            ...initialSharedSource,
            seeds: initialSharedSource.seeds || 0,
            peers: initialSharedSource.peers || 0,
            type: 'shared'
          }
          const matchedSource = data.sources.find((source: any) => source.magnet === initialSharedSource.magnet)
          const mergedSharedSource = matchedSource ? { ...sharedSource, ...matchedSource } : sharedSource
          const others = data.sources.filter((source: any) => source.magnet !== initialSharedSource.magnet)
          return [mergedSharedSource, ...others]
        })
      }
      setSourceSearchStatus({
        found: Array.isArray(data.sources) ? data.sources.length : 0,
        completed: data.completedProviders || 0,
        total: data.totalProviders || 0,
        cached: Boolean(data.cached),
        done: Boolean(data.done)
      })
      if (data.done) {
        setSearching(false)
        sourceSearchRequestRef.current = null
      }
    })
    return cleanup
  }, [])

  useEffect(() => {
    let cancelled = false

    window.api.getActiveDownloads()
      .then((downloads: ActiveDownload[]) => {
        if (!cancelled) setActiveDownloads(downloads || [])
      })
      .catch(err => console.error('[DetailScreen] Failed to load active downloads:', err))

    const cleanup = window.api.onTorrentProgress((data: ActiveDownload) => {
      if (!data?.id) return
      setActiveDownloads(prev => {
        const index = prev.findIndex(download => download.id === data.id)
        if (index === -1) return [data, ...prev]
        const next = [...prev]
        next[index] = { ...next[index], ...data }
        return next
      })
    })

    return () => {
      cancelled = true
      cleanup()
    }
  }, [])

  const handleDownloadSource = async (source: any) => {
    setStartingSourceMagnet(source.magnet)
    try {
      const torrentId = await window.api.startTorrentDownload(source.magnet, video.title, video.tmdb_id, source.title)
      if (torrentId) {
        setStartedSourceMagnet(source.magnet)
        window.api.getActiveDownloads()
          .then((downloads: ActiveDownload[]) => setActiveDownloads(downloads || []))
          .catch(err => console.error('[DetailScreen] Failed to refresh downloads:', err))
      }
    } catch (err) {
      console.error('Failed to start download:', err)
    } finally {
      setStartingSourceMagnet(null)
    }
  }

  const handleDownloadBest = async () => {
    if (!isTmdbBacked || !video.tmdb_id || isDownloadActive || startingBestDownload) return

    setStartingBestDownload(true)
    try {
      const results = await handleSearchSources(true)
      const bestSource = [...results]
        .filter(source => source?.magnet)
        .sort((a, b) => getTorrentSourceHealthScore(b) - getTorrentSourceHealthScore(a))[0]

      if (bestSource) {
        await handleDownloadSource(bestSource)
      } else {
        setShowDownloadOptions(true)
      }
    } finally {
      setStartingBestDownload(false)
    }
  }

  const handleResumeDownload = async () => {
    if (!matchingDownload?.id) return
    const nextStatus = matchingDownload.status === 'paused' ? 'downloading' : 'paused'
    setActiveDownloads(prev => prev.map(download => (
      download.id === matchingDownload.id ? { ...download, status: nextStatus } : download
    )))
    try {
      await window.api.pauseResumeTorrent(matchingDownload.id)
    } catch (err) {
      console.error('[DetailScreen] Resume download failed:', err)
      window.api.getActiveDownloads()
        .then((downloads: ActiveDownload[]) => setActiveDownloads(downloads || []))
        .catch(refreshErr => console.error('[DetailScreen] Failed to refresh downloads:', refreshErr))
    }
  }

  const handlePlayTorrentStream = async () => {
    if (!matchingDownload?.id || isDownloadPaused || isDownloadConnecting) return

    setTorrentStreamError(null)
    setStartingTorrentStream(true)
    try {
      const result = await window.api.prepareTorrentStream(matchingDownload.id)
      if (!result?.url) {
        setTorrentStreamError(getTorrentStreamErrorMessage(result?.error))
        return
      }

      onPlay({
        ...video,
        id: -Math.abs(Date.now()),
        title: displayTitle,
        file_path: result.url,
        duration: 0,
        isExternal: false
      })
    } catch (err: any) {
      setTorrentStreamError(getTorrentStreamErrorMessage(err?.message))
    } finally {
      setStartingTorrentStream(false)
    }
  }

  const handleOpenFolder = () => {
    window.api.openFolder(video.file_path)
  }

  const handleOpenMoctale = () => {
    window.open(getMoctaleUrl(video), '_blank')
  }

  const getSharePayload = () => {
    if (!video.tmdb_id || (video.type !== 'movie' && video.type !== 'series')) return null

    const mediaTitle = video.type === 'series' && video.series_name ? video.series_name : video.title
    const appUrl = `mycinema://${video.type}/${video.tmdb_id}`
    const shareUrl = MYCINEMA_SHARE_BASE_URL
      ? `${MYCINEMA_SHARE_BASE_URL}/${video.type}/${video.tmdb_id}`
      : appUrl
    const shareTitle = `I found this on MyCinema: ${mediaTitle}${video.release_year ? ` (${video.release_year})` : ''}`
    const shareText = `${shareTitle}\n${shareUrl}`

    return { mediaTitle, shareUrl, shareTitle, shareText }
  }

  const showShareFeedback = (message: string) => {
    setShareFeedback(message)
    setShareCopied(true)
    window.setTimeout(() => {
      setShareFeedback(null)
      setShareCopied(false)
    }, 1800)
  }

  const copyShareText = async (text: string, message: string) => {
    await navigator.clipboard.writeText(text)
    showShareFeedback(message)
  }

  const openShareUrl = (url: string) => {
    window.open(url, '_blank')
  }

  const handleShare = () => {
    if (!getSharePayload()) return
    localStorage.setItem(SHARE_HINT_STORAGE_KEY, 'true')
    setShowShareHint(false)
    setShowShareModal(true)
  }

  const handleNativeShare = async () => {
    const payload = getSharePayload()
    if (!payload) return

    try {
      if (navigator.share) {
        try {
          await navigator.share({
            title: payload.mediaTitle,
            text: payload.shareTitle,
            url: payload.shareUrl
          })
          setShowShareModal(false)
        } catch (err) {
          if ((err as Error)?.name === 'AbortError') return
          await copyShareText(payload.shareText, 'Copied message')
        }
      } else {
        await copyShareText(payload.shareText, 'Copied message')
      }
    } catch (err) {
      console.error('[Share] Failed to share media link:', err)
    }
  }

  const handleShowInfo = async () => {
    if (!isLocalMedia) return
    setShowInfoModal(true)
    if (!mediaInfo) {
      setInfoLoading(true)
      const info = await window.api.getMediaInfo(video.file_path)
      setMediaInfo(info)
      setInfoLoading(false)
    }
  }

  const getTrailerCacheKey = (selection: TrailerSeasonSelection) => [
    video.tmdb_id || video.title,
    video.type,
    typeof selection === 'number' ? `season-${selection}` : selection
  ].join(':')

  const handleTrailerSeasonSelect = (seasonNumber: number) => {
    const key = getTrailerCacheKey(seasonNumber)
    const cachedTrailer = trailerCacheRef.current.get(key)
    setTrailerSeasonSelection(seasonNumber)

    if (cachedTrailer) {
      setTrailer(cachedTrailer)
      setTrailerLoading(false)
      return
    }

    setShouldLoadTrailer(true)
    setTrailer(null)
    setTrailerLoading(true)
  }

  useEffect(() => {
    let cancelled = false

    setTrailer(null)
    setShowTrailerModal(false)
    setTrailerSeasons([])
    setShouldLoadTrailer(false)
    trailerCacheRef.current.clear()
    setTrailerSeasonSelection(video.type === 'series' ? 'latest' : 'series')
    setSources([])
    setSearching(false)
    setHasSearched(false)
    setSourceSeasonFilter('all')
    setSourcePackSeasonFilter('all')
    setSourceEpisodeFilter('all')
    setHindiOnly(false)
    setShowDownloadOptions(false)
    setStartingSourceMagnet(null)
    setStartedSourceMagnet(null)
    setStartingBestDownload(false)
    setStartingTorrentStream(false)
    setTorrentStreamError(null)

    if (initialSharedSource?.magnet) {
      setSources([{ ...initialSharedSource, seeds: initialSharedSource.seeds || 0, peers: initialSharedSource.peers || 0, type: 'shared' }])
      setShowDownloadOptions(true)
      setHasSearched(true)
      setSourceSearchStatus({ found: 1, completed: 0, total: 0, cached: false, done: true })
      window.setTimeout(() => {
        if (!cancelled) handleSearchSources(false)
      }, 350)
    }

    const trailerTimer = isTmdbBacked
      ? window.setTimeout(() => {
          if (!cancelled) setShouldLoadTrailer(true)
        }, 650)
      : 0

    if (isLocalMedia && video.type === 'series' && video.series_name) {
      setLoading(true)
      window.api.getSeriesInfo(video.series_name).then(data => {
        if (cancelled) return
        setEpisodes(data)
        setLoading(false)
        
        // Auto-select the season of the current video, or the first available season
        if (data.length > 0) {
          const seasons = [...new Set(data.map(ep => ep.season || 1))].sort((a, b) => a - b)
          setSelectedSeason(video.season || seasons[0])
        }
      })
    } else {
      setEpisodes([])
      setSelectedSeason(null)
      setLoading(false)
    }

    return () => {
      cancelled = true
      cancelActiveSourceSearch(true)
      if (trailerTimer) window.clearTimeout(trailerTimer)
    }
  }, [video, initialSharedSource, isLocalMedia])

  useEffect(() => {
    let cancelled = false
    if (!isTmdbBacked || !shouldLoadTrailer) {
      setTrailerLoading(false)
      return () => {
        cancelled = true
      }
    }

    const cacheKey = getTrailerCacheKey(trailerSeasonSelection)
    const cachedTrailer = trailerCacheRef.current.get(cacheKey)

    if (cachedTrailer) {
      setTrailer(cachedTrailer)
      setTrailerLoading(false)
      return () => {
        cancelled = true
      }
    }

    setTrailerLoading(true)

    window.api.getTmdbTrailer({
      tmdbId: video.tmdb_id,
      title: video.type === 'series' && video.series_name ? video.series_name : video.title,
      type: video.type === 'series' ? 'series' : 'movie',
      year: video.release_year,
      seasonNumber: typeof trailerSeasonSelection === 'number' ? trailerSeasonSelection : null,
      preferLatestSeason: video.type === 'series' && trailerSeasonSelection === 'latest'
    }).then(result => {
      if (cancelled) return
      setTrailer(result)
      if (result) trailerCacheRef.current.set(cacheKey, result)
      if (video.type === 'series' && Array.isArray(result?.availableSeasons)) {
        setTrailerSeasons(result.availableSeasons)
      }
    }).catch(err => {
      console.error('Failed to fetch trailer:', err)
      if (!cancelled) setTrailer(null)
    }).finally(() => {
      if (!cancelled) setTrailerLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [video, trailerSeasonSelection, shouldLoadTrailer, isTmdbBacked])

  // Group episodes by season
  const episodesBySeason = episodes.reduce((acc, ep) => {
    const s = ep.season || 1
    if (!acc[s]) acc[s] = []
    acc[s].push(ep)
    return acc
  }, {} as Record<number, Video[]>)

  const seasons = Object.keys(episodesBySeason)
    .map(Number)
    .sort((a, b) => a - b)

  const sourceSeasons = React.useMemo(() => {
    const values = new Set<number>()
    sources.forEach(source => {
      if (!isSourceSeasonPack(source) && typeof source.parsedSeason === 'number') values.add(source.parsedSeason)
    })
    return Array.from(values).sort((a, b) => a - b)
  }, [sources])

  const sourcePackSeasons = React.useMemo(() => {
    const values = new Set<number>()
    sources.forEach(source => {
      if (isSourceSeasonPack(source) && typeof source.parsedSeason === 'number') values.add(source.parsedSeason)
    })
    return Array.from(values).sort((a, b) => a - b)
  }, [sources])

  const sourceEpisodes = React.useMemo(() => {
    if (sourceSeasonFilter === 'all' || sourceSeasonFilter === 'packs') return []
    const values = new Set<number>()
    sources.forEach(source => {
      if (
        source.parsedSeason === Number(sourceSeasonFilter) &&
        !isSourceSeasonPack(source) &&
        typeof source.parsedEpisode === 'number'
      ) {
        values.add(source.parsedEpisode)
      }
    })
    return Array.from(values).sort((a, b) => a - b)
  }, [sources, sourceSeasonFilter])

  const filteredSources = React.useMemo(() => {
    return sources
      .filter(source => {
        if (hindiOnly && !source.isHindi) return false

        if (video.type === 'series') {
          if (sourceSeasonFilter === 'packs') {
            if (!isSourceSeasonPack(source)) return false
            if (sourcePackSeasonFilter !== 'all') return source.parsedSeason === Number(sourcePackSeasonFilter)
            return true
          }
          if (sourceSeasonFilter !== 'all') {
            if (source.parsedSeason !== Number(sourceSeasonFilter) || isSourceSeasonPack(source)) return false
            if (sourceEpisodeFilter !== 'all') return source.parsedEpisode === Number(sourceEpisodeFilter)
          }
        }

        return true
      })
      .sort((a, b) => getTorrentSourceHealthScore(b) - getTorrentSourceHealthScore(a))
  }, [sources, hindiOnly, sourceSeasonFilter, sourcePackSeasonFilter, sourceEpisodeFilter, video.type])

  const trailerSeasonOptions = video.type === 'series'
    ? [...new Set([...seasons, ...trailerSeasons])].sort((a, b) => a - b)
    : []
  const activeTrailerSeason = typeof trailerSeasonSelection === 'number'
    ? trailerSeasonSelection
    : trailer?.seasonNumber || null

  useEffect(() => {
    const handleGlobalMouseDown = (e: MouseEvent) => {
      // Mouse button 3 is the standard "Back" button, 4 is "Forward"
      if (e.button === 3 || e.button === 4) {
        onClose()
      }
    }
    window.addEventListener('mousedown', handleGlobalMouseDown)
    return () => window.removeEventListener('mousedown', handleGlobalMouseDown)
  }, [onClose])


  const getArtworkUrl = (artworkPath?: string, remoteSize: 'w780' | 'original' = 'w780') => {
    if (!artworkPath) return null
    if (artworkPath.startsWith('http')) {
      return artworkPath
        .replace(/\/t\/p\/(w342|w500|w780|w1280|original)\//, `/t/p/${remoteSize}/`)
    }
    return `media://file/${encodeURIComponent(artworkPath)}`
  }

  const posterUrl = getArtworkUrl(video.poster_path, 'w780')
  const logoUrl = getArtworkUrl(video.logo_path, 'original')

  const formatDuration = (seconds?: number) => {
    if (!seconds) return null
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }

  const genres = splitGenres(video.genres)
  const visibleVibes = getVibeTags(video, genres)
  const sharePayload = getSharePayload()
  const downloadPrimaryLabel = isDownloadActive
    ? isDownloadPaused
      ? `Resume ${roundedDownloadProgress}%`
      : isDownloadConnecting
        ? `Connecting ${roundedDownloadProgress}%`
        : 'Play While Downloading'
    : startingBestDownload
      ? 'Finding Best...'
      : 'Download Best'
  const canUseDownloadPrimary = Boolean(video.tmdb_id) && !isDownloadComplete && (!isDownloadActive || isDownloadPaused || !isDownloadConnecting)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-full max-w-6xl h-[90vh] bg-surface rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/10 flex flex-col md:flex-row">
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 z-30 p-2 bg-black/40 hover:bg-red-600 rounded-full text-white transition-all border border-white/10 glass-effect"
        >
          <X size={24} />
        </button>

        {/* Poster Section (Left on Desktop, Top on Mobile) */}
        <div className="w-full md:w-[40%] h-[300px] md:h-full relative overflow-hidden shrink-0">
          {posterUrl ? (
            <img 
              src={posterUrl} 
              alt={video.title} 
              loading="eager"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full bg-secondary flex items-center justify-center text-muted italic">
              No Poster Available
            </div>
          )}
          {/* Gradients to blend poster with content */}
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent md:hidden" />
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-surface hidden md:block" />
          
          {/* Subtle overlay on poster for depth */}
          <div className="absolute inset-0 bg-black/20" />
        </div>

        {/* Content Section */}
        <div className="flex-1 p-6 md:p-10 lg:p-12 overflow-y-auto scrollbar-hide flex flex-col relative bg-surface/95">
          <div className="space-y-6">
            {/* Title & Tagline */}
            <div className="space-y-3">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={displayTitle}
                  loading="eager"
                  decoding="async"
                  className="max-h-20 md:max-h-24 w-auto max-w-[min(100%,420px)] object-contain object-left drop-shadow-[0_10px_28px_rgba(0,0,0,0.75)]"
                />
              ) : (
                <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-white uppercase italic leading-[0.9] drop-shadow-lg">
                  {displayTitle}
                </h2>
              )}
              {video.tagline && (
                <p className="text-primary font-black italic tracking-[0.2em] text-xs md:text-sm uppercase opacity-90 pl-1">
                  {video.tagline}
                </p>
              )}
            </div>

            {/* Meta Info Row */}
            <div className="flex flex-wrap items-center gap-2.5 text-[10px] font-black text-white/70 uppercase tracking-[0.13em]">
              {video.vote_average ? (
                <div className="flex items-center gap-1.5 bg-white/[0.06] px-3 py-1.5 rounded-full border border-white/10 text-white">
                  <Star size={12} className="text-yellow-500 fill-yellow-500" />
                  <span className="text-white/45">IMDb</span>
                  <span>{video.vote_average.toFixed(1)}</span>
                </div>
              ) : null}
              {video.release_year ? (
                <div className="flex items-center gap-1.5 bg-white/[0.06] px-3 py-1.5 rounded-full border border-white/10">
                  <Calendar size={12} className="text-white/45" />
                  <span>{video.release_year}</span>
                </div>
              ) : null}
              {video.duration && (
                <div className="flex items-center gap-1.5 bg-white/[0.06] px-3 py-1.5 rounded-full border border-white/10">
                  <Clock size={12} className="text-white/45" />
                  <span>{formatDuration(video.duration)}</span>
                </div>
              )}
            </div>

            {/* Vibe Tags */}
            {visibleVibes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {visibleVibes.map((vibe, idx) => (
                <span 
                  key={idx} 
                  className="px-4 py-1.5 bg-white/5 text-white/75 text-[9px] font-black uppercase tracking-widest rounded-full border border-white/10 hover:bg-primary/20 hover:text-primary hover:border-primary/30 transition-all cursor-default"
                >
                  {vibe}
                </span>
              ))}
            </div>
            )}

            {/* Overview */}
            <div className="max-w-2xl rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3.5">
              <p className="text-white/[0.72] text-sm md:text-[15px] leading-7 font-semibold italic">
                {video.overview || 'No overview available for this title.'}
              </p>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {isLocalMedia ? (
                <button 
                  onClick={() => onPlay(video)}
                  className="flex min-h-14 items-center gap-3 bg-red-600 hover:bg-red-700 text-white px-8 rounded-2xl font-black text-sm tracking-widest transition-all shadow-[0_10px_30px_rgba(220,38,38,0.4)] hover:scale-105 active:scale-95 group uppercase italic"
                >
                  <Play fill="white" size={20} className="group-hover:scale-110 transition-transform" />
                  Play Now
                </button>
              ) : (
                <>
                  <button
                    onClick={isDownloadPaused ? handleResumeDownload : isDownloadActive ? handlePlayTorrentStream : handleDownloadBest}
                    disabled={!canUseDownloadPrimary || startingBestDownload || startingTorrentStream || (searching && !isDownloadPaused)}
                    className={`flex min-h-14 items-center gap-3 px-8 rounded-2xl font-black text-sm tracking-widest transition-all shadow-[0_10px_30px_rgba(229,9,20,0.34)] hover:scale-105 active:scale-95 group uppercase italic disabled:cursor-not-allowed ${
                      isDownloadActive && !isDownloadPaused
                        ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-300/20 hover:bg-emerald-500/22 disabled:opacity-60'
                        : 'bg-primary hover:bg-primary/80 text-white disabled:opacity-55'
                    }`}
                  >
                    {startingBestDownload || startingTorrentStream ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : isDownloadActive ? (
                      isDownloadPaused || isDownloadConnecting ? (
                        <Download size={20} className={isDownloadPaused ? 'group-hover:scale-110 transition-transform' : ''} />
                      ) : (
                        <Play fill="currentColor" size={20} className="group-hover:scale-110 transition-transform" />
                      )
                    ) : (
                      <Zap size={20} className="group-hover:scale-110 transition-transform" />
                    )}
                    {downloadPrimaryLabel}
                  </button>

                  <button
                    onClick={handleOpenDownloadOptions}
                    disabled={searching && sources.length === 0}
                    className="flex min-h-14 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.055] px-6 text-sm font-black uppercase italic tracking-widest text-white/70 transition-all hover:scale-105 hover:bg-white/[0.09] hover:text-white active:scale-95 disabled:cursor-wait disabled:opacity-55"
                  >
                    {searching && sources.length === 0 ? <Loader2 size={19} className="animate-spin" /> : <Download size={19} />}
                    Choose Source
                  </button>

                  {isDownloadActive && (
                    <div className="basis-full text-[11px] font-bold text-white/42">
                      {torrentStreamError || `${roundedDownloadProgress}% downloaded${matchingDownload?.downloadSpeed ? ` / ${matchingDownload.downloadSpeed}` : ''}`}
                    </div>
                  )}
                </>
              )}
              
              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggleWatchlist}
                  disabled={watchlistBusy}
                  className={`p-4 rounded-2xl border transition-all hover:scale-105 active:scale-95 glass-effect ${
                    isWatchlist ? 'bg-primary/20 border-primary text-primary' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'
                  } disabled:opacity-50 disabled:cursor-wait`}
                  title={isWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist'}
                >
                  {watchlistBusy ? <Loader2 size={20} className="animate-spin" /> : <Bookmark size={20} fill={isWatchlist ? "currentColor" : "none"} />}
                </button>
                <button
                  onClick={handleToggleFavorite}
                  className={`p-4 rounded-2xl border transition-all hover:scale-105 active:scale-95 glass-effect ${
                    isFavorite ? 'bg-red-500/20 border-red-500 text-red-500' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'
                  }`}
                  title="Mark as Favorite"
                >
                  <Heart size={20} fill={isFavorite ? "currentColor" : "none"} />
                </button>
                {isLocalMedia && (
                  <button
                    onClick={handleShowInfo}
                    className="p-4 bg-white/5 border border-white/10 rounded-2xl text-white/40 hover:text-white transition-all hover:scale-105 active:scale-95 glass-effect"
                    title="View Media Info"
                  >
                    <Info size={20} />
                  </button>
                )}
                {video.tmdb_id && (video.type === 'movie' || video.type === 'series') && (
                  <div className="relative">
                    <button
                      onClick={handleShare}
                      className={`flex items-center gap-2 px-4 py-4 border rounded-2xl transition-all hover:scale-105 active:scale-95 glass-effect ${
                        shareCopied
                          ? 'bg-emerald-500/15 border-emerald-400/35 text-emerald-300'
                          : 'bg-white/5 border-white/10 text-white/45 hover:text-white hover:border-cyan-400/30 hover:bg-cyan-400/10'
                      }`}
                      title={shareCopied ? 'Copied share link' : 'Share MyCinema link'}
                    >
                      {shareCopied ? <CheckCircle2 size={18} /> : <Share2 size={18} />}
                      <span className="text-[10px] font-black uppercase tracking-widest">{shareCopied ? 'Copied' : 'Share'}</span>
                    </button>
                    {showShareHint && (
                      <div className="absolute left-1/2 top-full z-40 mt-3 w-[245px] -translate-x-1/2 rounded-xl border border-cyan-300/20 bg-[#07111c] p-3 text-left shadow-2xl shadow-black/45 ring-1 ring-white/5 animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="absolute left-1/2 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-l border-t border-cyan-300/20 bg-[#07111c]" />
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-300/12 text-cyan-200">
                            <Share2 size={14} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100">New sharing</p>
                            <p className="mt-1 text-[11px] font-semibold leading-relaxed text-white/58">
                              Send this title to friends through WhatsApp, Telegram, or a copy link.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              localStorage.setItem(SHARE_HINT_STORAGE_KEY, 'true')
                              setShowShareHint(false)
                            }}
                            className="rounded-md p-1 text-white/35 transition-colors hover:bg-white/10 hover:text-white"
                            title="Dismiss hint"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {isTmdbBacked && (
                  <button
                    onClick={handleOpenMoctale}
                    className="flex items-center gap-2 px-4 py-4 bg-white/5 border border-white/10 rounded-2xl text-white/45 hover:text-white hover:border-red-500/30 hover:bg-red-600/10 transition-all hover:scale-105 active:scale-95 glass-effect"
                    title="Open reviews on Moctale"
                  >
                    <ExternalLink size={18} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Moctale</span>
                  </button>
                )}
                {!video.isExternal && (
                  <button
                    onClick={handleOpenFolder}
                    className="p-4 bg-white/5 border border-white/10 rounded-2xl text-white/40 hover:text-white transition-all hover:scale-105 active:scale-95 glass-effect"
                    title="Open Folder"
                  >
                    <FolderOpen size={20} />
                  </button>
                )}
              </div>
            </div>

            {isTmdbBacked && (
            <div className="max-w-2xl">
              {trailerLoading || !shouldLoadTrailer ? (
                <div className="h-28 rounded-2xl border border-white/8 bg-white/[0.03] overflow-hidden flex items-center gap-4 px-4">
                  <div className="h-20 w-32 rounded-xl bg-white/5 animate-pulse" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3 w-28 rounded-full bg-white/8 animate-pulse" />
                    <div className="h-4 w-56 max-w-full rounded-full bg-white/8 animate-pulse" />
                    <div className="h-3 w-36 rounded-full bg-white/5 animate-pulse" />
                  </div>
                  <Loader2 size={20} className="text-primary animate-spin" />
                </div>
              ) : trailer ? (
                <button
                  onClick={() => setShowTrailerModal(true)}
                  className="group/trailer relative w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] text-left transition-all duration-300 hover:border-red-500/35 hover:bg-white/[0.07] hover:-translate-y-0.5 hover:shadow-[0_18px_45px_rgba(0,0,0,0.35)]"
                >
                  <div className="flex items-stretch">
                    <div className="relative h-28 w-40 shrink-0 overflow-hidden bg-black">
                      <img
                        src={trailer.thumbnailUrl}
                        alt=""
                        className="h-full w-full object-cover opacity-80 transition-transform duration-500 group-hover/trailer:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-r from-black/10 to-black/55" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-white shadow-[0_10px_30px_rgba(220,38,38,0.45)] transition-transform duration-300 group-hover/trailer:scale-110">
                          <Play size={18} fill="currentColor" />
                        </div>
                      </div>
                    </div>

                    <div className="min-w-0 flex-1 p-4 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="mb-1.5 flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-red-400">
                          <Clapperboard size={14} />
                          <span>{trailer.label || `${trailer.official ? 'Official' : 'YouTube'} ${trailer.type || 'Trailer'}`}</span>
                        </div>
                        <h3 className="truncate text-sm md:text-base font-black text-white tracking-tight">
                          {trailer.name || 'Watch Trailer'}
                        </h3>
                        <p className="mt-1 line-clamp-1 text-[11px] font-semibold text-white/35">
                          {video.type === 'series' && trailer.seasonNumber ? `${video.series_name || video.title} • Season ${trailer.seasonNumber}` : video.type === 'series' && video.series_name ? video.series_name : video.title}
                        </p>
                      </div>
                      <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/25 text-white/45 transition-all group-hover/trailer:text-white group-hover/trailer:border-red-500/30 group-hover/trailer:bg-red-600/15">
                        <Play size={16} fill="currentColor" />
                      </div>
                    </div>
                  </div>
                </button>
              ) : (
                <div className="h-28 rounded-2xl border border-white/8 bg-white/[0.03] overflow-hidden flex items-center gap-4 px-4">
                  <div className="flex h-20 w-32 shrink-0 items-center justify-center rounded-xl bg-black/25 border border-white/8 text-white/25">
                    <Clapperboard size={24} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-white/35">
                      <Clapperboard size={14} />
                      <span>Trailer</span>
                    </div>
                    <h3 className="truncate text-sm md:text-base font-black text-white/70 tracking-tight">
                      Trailer unavailable
                    </h3>
                    <p className="mt-1 line-clamp-1 text-[11px] font-semibold text-white/30">
                      No playable trailer was found right now.
                    </p>
                  </div>
                </div>
              )}
            </div>
            )}

            {/* Share Modal */}
            {showShareModal && sharePayload && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowShareModal(false)}>
                <div
                  className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#0f141d] shadow-2xl animate-in slide-in-from-bottom-4 duration-300"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300">
                        <Share2 size={18} />
                      </div>
                      <div>
                        <h3 className="text-[13px] font-black text-white uppercase tracking-widest leading-none">Share Title</h3>
                        <p className="mt-1 max-w-[260px] truncate text-[11px] font-medium text-white/35">{sharePayload.mediaTitle}</p>
                      </div>
                    </div>
                    <button onClick={() => setShowShareModal(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-all">
                      <X size={18} />
                    </button>
                  </div>

                  <div className="p-5 space-y-4">
                    <div className="rounded-xl border border-white/10 bg-black/25 p-3">
                      <p className="line-clamp-2 text-sm font-semibold text-white/80">{sharePayload.shareTitle}</p>
                      <p className="mt-2 break-all text-xs font-medium text-cyan-200/75">{sharePayload.shareUrl}</p>
                    </div>

                    {shareFeedback && (
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-black uppercase tracking-widest text-emerald-300">
                        <CheckCircle2 size={15} />
                        {shareFeedback}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => openShareUrl(`https://wa.me/?text=${encodeURIComponent(sharePayload.shareText)}`)}
                        className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-white/75 transition-all hover:border-emerald-400/35 hover:bg-emerald-400/10 hover:text-white"
                      >
                        <MessageCircle size={22} className="text-emerald-300" />
                        <span className="text-[11px] font-black uppercase tracking-widest">WhatsApp</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openShareUrl(`https://t.me/share/url?url=${encodeURIComponent(sharePayload.shareUrl)}&text=${encodeURIComponent(sharePayload.shareTitle)}`)}
                        className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-white/75 transition-all hover:border-sky-400/35 hover:bg-sky-400/10 hover:text-white"
                      >
                        <Send size={22} className="text-sky-300" />
                        <span className="text-[11px] font-black uppercase tracking-widest">Telegram</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => copyShareText(sharePayload.shareUrl, 'Copied link')}
                        className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-white/75 transition-all hover:border-cyan-400/35 hover:bg-cyan-400/10 hover:text-white"
                      >
                        <Copy size={22} className="text-cyan-300" />
                        <span className="text-[11px] font-black uppercase tracking-widest">Copy Link</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => copyShareText(sharePayload.shareText, 'Copied message')}
                        className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-white/75 transition-all hover:border-violet-400/35 hover:bg-violet-400/10 hover:text-white"
                      >
                        <Share2 size={22} className="text-violet-300" />
                        <span className="text-[11px] font-black uppercase tracking-widest">Copy Text</span>
                      </button>
                    </div>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={handleNativeShare}
                        className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-xs font-black uppercase tracking-widest text-white transition-all hover:bg-red-500"
                      >
                        <Share2 size={16} />
                        More Options
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          copyShareText(sharePayload.shareUrl, 'Copied link')
                          openShareUrl('https://www.instagram.com/direct/inbox/')
                        }}
                        className="flex min-h-11 flex-1 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-xs font-black uppercase tracking-widest text-white/70 transition-all hover:bg-white/[0.08] hover:text-white"
                      >
                        Instagram
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Media Info Modal */}
            {showInfoModal && (
              <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setShowInfoModal(false)}>
                <div
                  className="relative w-full max-w-lg bg-[#0f0f0f] border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
                  onClick={e => e.stopPropagation()}
                >
                  {/* Modal Header */}
                  <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                        <Info size={18} className="text-red-500" />
                      </div>
                      <div>
                        <h3 className="text-[13px] font-black text-white uppercase tracking-widest leading-none">Media Information</h3>
                        <p className="text-[11px] text-white/30 font-medium tracking-wide mt-1 truncate max-w-[260px]">{mediaInfo?.file?.name || video.title}</p>
                      </div>
                    </div>
                    <button onClick={() => setShowInfoModal(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-all">
                      <X size={18} />
                    </button>
                  </div>

                  {/* Modal Body */}
                  <div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto scrollbar-thin">
                    {infoLoading ? (
                      <div className="flex flex-col items-center justify-center py-12 gap-3">
                        <div className="w-10 h-10 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                        <p className="text-white/30 text-[12px] font-bold uppercase tracking-widest">Analyzing file...</p>
                      </div>
                    ) : mediaInfo?.error ? (
                      <p className="text-red-400 text-sm font-medium text-center py-8">{mediaInfo.error}</p>
                    ) : mediaInfo ? (
                      <>
                        {/* File */}
                        <InfoSection icon={<HardDrive size={16} className="text-blue-400" />} title="File">
                          <InfoRow label="Size" value={mediaInfo.file?.size} />
                          <InfoRow label="Format" value={mediaInfo.container?.format} />
                          <InfoRow label="Duration" value={mediaInfo.container?.duration ? formatDuration(mediaInfo.container.duration) : null} />
                          <InfoRow label="Bitrate" value={mediaInfo.container?.bitrate} />
                        </InfoSection>

                        {/* Video */}
                        {mediaInfo.video && (
                          <InfoSection icon={<Film size={16} className="text-purple-400" />} title="Video">
                            <InfoRow label="Codec" value={mediaInfo.video.codec} />
                            {mediaInfo.video.profile && <InfoRow label="Profile" value={mediaInfo.video.profile} />}
                            <InfoRow label="Resolution" value={mediaInfo.video.resolution} />
                            <InfoRow label="Frame Rate" value={mediaInfo.video.frameRate} />
                            {mediaInfo.video.bitDepth && <InfoRow label="Bit Depth" value={mediaInfo.video.bitDepth} />}
                            {mediaInfo.video.bitrate && <InfoRow label="Video Bitrate" value={mediaInfo.video.bitrate} />}
                          </InfoSection>
                        )}

                        {/* Audio */}
                        {mediaInfo.audio?.length > 0 && (
                          <InfoSection icon={<Music size={16} className="text-green-400" />} title={`Audio (${mediaInfo.audio.length} track${mediaInfo.audio.length > 1 ? 's' : ''})` }>
                            {(showAllAudio ? mediaInfo.audio : mediaInfo.audio.slice(0, 2)).map((track: any, i: number) => (
                              <div key={i} className={`${i > 0 ? 'border-t border-white/5 pt-2 mt-2' : ''}`}>
                                {mediaInfo.audio.length > 1 && <p className="text-[11px] font-black text-white/30 uppercase tracking-widest mb-1.5">Track {track.index}{track.language ? ` — ${track.language.toUpperCase()}` : ''}{track.title ? ` (${track.title})` : ''}</p>}
                                <InfoRow label="Codec" value={track.codec} />
                                <InfoRow label="Channels" value={track.channels} />
                                <InfoRow label="Sample Rate" value={track.sampleRate} />
                                {track.bitrate && <InfoRow label="Bitrate" value={track.bitrate} />}
                              </div>
                            ))}
                            {mediaInfo.audio.length > 2 && (
                              <button onClick={() => setShowAllAudio(p => !p)} className="mt-2.5 flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/70 font-black uppercase tracking-widest transition-colors">
                                {showAllAudio ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                {showAllAudio ? 'Show less' : `+${mediaInfo.audio.length - 2} more tracks`}
                              </button>
                            )}
                          </InfoSection>
                        )}

                        {/* Subtitles */}
                        {mediaInfo.subtitles?.length > 0 && (
                          <InfoSection icon={<Subtitles size={16} className="text-yellow-400" />} title={`Subtitles (${mediaInfo.subtitles.length})`}>
                            <div className="flex flex-wrap gap-2">
                              {mediaInfo.subtitles.map((s: any, i: number) => (
                                <span key={i} className="px-2.5 py-1 bg-white/5 border border-white/10 rounded text-[11px] font-bold text-white/60 uppercase tracking-widest">
                                  {s.language || s.codec || `Track ${s.index}`}
                                </span>
                              ))}
                            </div>
                          </InfoSection>
                        )}
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {showTrailerModal && (
              <div
                className="fixed inset-0 z-[65] flex items-center justify-center p-4 md:p-8 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
                onClick={() => setShowTrailerModal(false)}
              >
                <div
                  className="relative w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-[#080808] shadow-[0_30px_90px_rgba(0,0,0,0.75)] animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between gap-4 border-b border-white/8 bg-white/[0.03] px-5 py-4">
                    <div className="min-w-0 flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-600/15 text-red-500 ring-1 ring-red-500/20">
                        <Clapperboard size={20} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-black uppercase tracking-[0.16em] text-white">
                          {trailer?.label || (activeTrailerSeason ? `Season ${activeTrailerSeason} Trailer` : 'Trailer')} {trailerLoading ? 'Loading' : 'Playing'}
                        </h3>
                        <p className="truncate text-[12px] font-semibold text-white/35">{trailer?.name || 'Finding the best playable trailer...'}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {video.type === 'series' && trailerSeasonOptions.length > 0 && (
                        <div className="hidden md:flex max-w-[520px] items-center gap-1 overflow-x-auto rounded-xl border border-white/10 bg-black/25 p-1 scrollbar-thin">
                          {trailerSeasonOptions.map(seasonNumber => (
                            <button
                              key={seasonNumber}
                              onClick={() => handleTrailerSeasonSelect(seasonNumber)}
                              className={`h-7 shrink-0 rounded-lg px-3 text-[9px] font-black uppercase tracking-widest transition-all ${
                                activeTrailerSeason === seasonNumber
                                  ? 'bg-red-600 text-white'
                                  : 'text-white/45 hover:bg-white/8 hover:text-white'
                              }`}
                            >
                              Season {seasonNumber}
                            </button>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => trailer?.watchUrl && window.open(trailer.watchUrl, '_blank')}
                        disabled={!trailer?.watchUrl}
                        className="hidden sm:flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[10px] font-black uppercase tracking-widest text-white/45 transition-all hover:text-white hover:bg-white/[0.08]"
                      >
                        <ExternalLink size={13} />
                        YouTube
                      </button>
                      <button
                        onClick={() => setShowTrailerModal(false)}
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white/50 transition-all hover:bg-red-600 hover:text-white hover:border-red-600"
                      >
                        <X size={17} />
                      </button>
                    </div>
                  </div>

                  {video.type === 'series' && trailerSeasonOptions.length > 0 && (
                    <div className="flex md:hidden gap-1 overflow-x-auto border-b border-white/8 bg-black/30 px-4 py-3 scrollbar-thin">
                      {trailerSeasonOptions.map(seasonNumber => (
                        <button
                          key={seasonNumber}
                          onClick={() => handleTrailerSeasonSelect(seasonNumber)}
                          className={`h-8 shrink-0 rounded-lg px-3 text-[9px] font-black uppercase tracking-widest transition-all ${
                            activeTrailerSeason === seasonNumber
                              ? 'bg-red-600 text-white'
                              : 'border border-white/10 bg-white/[0.04] text-white/45'
                          }`}
                        >
                          Season {seasonNumber}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="relative aspect-video bg-black">
                    {trailer && !trailerLoading ? (
                      <iframe
                        key={trailer.embedUrl}
                        src={trailer.embedUrl}
                        title={trailer.name || 'Trailer'}
                        className="absolute inset-0 h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        referrerPolicy="no-referrer-when-downgrade"
                        allowFullScreen
                      />
                    ) : trailerLoading ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/45">
                        <Loader2 size={28} className="animate-spin text-red-500" />
                        <span className="text-[10px] font-black uppercase tracking-[0.22em]">Loading Trailer</span>
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white/45">
                        <Clapperboard size={30} className="text-white/25" />
                        <span className="text-[11px] font-black uppercase tracking-[0.22em]">No playable trailer found</span>
                        <p className="max-w-sm text-[12px] font-semibold text-white/30">
                          This season does not have a trusted playable trailer available right now.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Episodes Section (for downloaded series) */}
            {isLocalMedia && video.type === 'series' && (loading || episodes.length > 0) && (
              <div className="pt-10 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/5 pb-4 gap-4">
                  <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter">
                    Episodes
                  </h3>
                  
                  {/* Season Selector */}
                  {seasons.length > 1 && (
                    <div className="flex flex-wrap gap-2">
                      {seasons.map(s => (
                        <button
                          key={s}
                          onClick={() => setSelectedSeason(s)}
                          className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${
                            selectedSeason === s 
                              ? 'bg-red-600 border-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.4)]' 
                              : 'bg-white/5 border-white/10 text-muted hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          Season {s}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-4">
                    <span className="text-[10px] text-muted font-black uppercase tracking-widest bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
                      {episodesBySeason[selectedSeason || 1]?.length || 0} Episodes
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
                  {loading ? (
                    <div className="col-span-full py-16 text-center">
                      <div className="inline-block w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
                      <div className="text-muted font-black uppercase tracking-widest text-[10px]">Fetching episodes...</div>
                    </div>
                  ) : (
                    (episodesBySeason[selectedSeason || 1] || []).map((ep, idx) => (
                      <button
                        key={ep.id}
                        onClick={() => onPlay(ep)}
                        className={`flex items-center p-4 rounded-2xl transition-all border group text-left relative overflow-hidden ${
                          ep.id === video.id 
                            ? 'bg-red-600/10 border-red-600/40 translate-x-2' 
                            : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10 hover:-translate-y-1'
                        }`}
                      >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mr-5 transition-all text-sm font-black italic ${
                          ep.id === video.id ? 'bg-red-600 text-white' : 'bg-black/40 text-muted group-hover:bg-red-600 group-hover:text-white'
                        }`}>
                          {(idx + 1).toString().padStart(2, '0')}
                        </div>
                        <div className="flex-1 truncate">
                          <div className="text-sm font-bold text-white truncate mb-0.5">
                            S{ep.season?.toString().padStart(2, '0')} E{ep.episode?.toString().padStart(2, '0')}
                          </div>
                          <div className="text-[9px] text-muted font-black uppercase tracking-[0.1em] truncate opacity-60">
                            {ep.title}
                          </div>
                        </div>
                        <div className="ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Play size={16} className="text-red-600" fill="currentColor" />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showDownloadOptions && (
        <>
          <div
            className="fixed inset-0 z-[70] bg-black/25 animate-in fade-in duration-150"
            onClick={handleCloseDownloadOptions}
          />
          <aside className="fixed inset-y-0 right-0 z-[80] flex w-full max-w-[560px] flex-col border-l border-white/10 bg-[#0B0F16] shadow-2xl animate-in slide-in-from-right duration-300">
            <div className="border-b border-white/10 bg-[#0F141D]">
              <div className="flex items-start justify-between gap-4 px-5 py-5">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                    <Download size={14} />
                    Download Sources
                  </div>
                  <h3 className="truncate text-lg font-black text-white">
                    {video.type === 'series' && video.series_name ? video.series_name : video.title}
                  </h3>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold text-white/65">
                      {filteredSources.length} shown
                    </span>
                    <span className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold text-white/65">
                      {sources.length} total
                    </span>
                    {filteredSources[0] && (
                      <span className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-bold text-emerald-300">
                        Best: {getTorrentSourceSpeedLabel(filteredSources[0])}
                      </span>
                    )}
                    {searching && sourceSearchStatus.total > 0 && (
                      <span className="rounded-md border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-bold text-primary">
                        Checking {sourceSearchStatus.completed}/{sourceSearchStatus.total}
                      </span>
                    )}
                    {sourceSearchStatus.cached && (
                      <span className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold text-white/45">
                        Cached first
                      </span>
                    )}
                    {(() => {
                      const hindiCount = sources.filter(s => s.isHindi).length
                      return hindiCount > 0 ? (
                        <span className="rounded-md border border-[#FF9933]/25 bg-[#FF9933]/10 px-2.5 py-1 text-[10px] font-bold text-[#FFB76B]">
                          🇮🇳 {hindiCount} Hindi
                        </span>
                      ) : null
                    })()}
                  </div>
                </div>
                <button
                  onClick={handleCloseDownloadOptions}
                  className="shrink-0 rounded-lg border border-white/10 bg-white/[0.04] p-2 text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white"
                  title="Close download options"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex items-center gap-2 border-t border-white/10 px-4 py-3">
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                  <button
                    onClick={() => setHindiOnly(value => !value)}
                    className={`flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[9px] font-black uppercase tracking-widest transition-all ${
                      hindiOnly
                        ? 'border-[#FF9933]/40 bg-[#FF9933]/16 text-[#FFB76B]'
                        : 'border-white/10 bg-[#151B25] text-white/55 hover:bg-[#1A2230] hover:text-white/80'
                    }`}
                  >
                    <Languages size={11} />
                    {hindiOnly ? 'Hindi Only' : 'All Audio'}
                  </button>

                  {video.type === 'series' && (
                    <>
                      <select
                        value={sourceSeasonFilter}
                        onChange={(event) => {
                          setSourceSeasonFilter(event.target.value)
                          setSourcePackSeasonFilter('all')
                          setSourceEpisodeFilter('all')
                        }}
                        className="min-h-8 w-[122px] shrink-0 rounded-lg border border-white/10 bg-[#151B25] px-2 text-[9px] font-black uppercase tracking-widest text-white/70 outline-none transition-colors hover:bg-[#1A2230]"
                      >
                        <option className="bg-[#10141d] text-white" value="all">All Seasons</option>
                        <option className="bg-[#10141d] text-white" value="packs">Season Packs</option>
                        {sourceSeasons.map(season => (
                          <option className="bg-[#10141d] text-white" key={season} value={season.toString()}>
                            Season {season}
                          </option>
                        ))}
                      </select>

                      {sourceSeasonFilter === 'packs' && sourcePackSeasons.length > 0 && (
                        <select
                          value={sourcePackSeasonFilter}
                          onChange={(event) => setSourcePackSeasonFilter(event.target.value)}
                          className="min-h-8 w-[96px] shrink-0 rounded-lg border border-white/10 bg-[#151B25] px-2 text-[9px] font-black uppercase tracking-widest text-white/70 outline-none transition-colors hover:bg-[#1A2230]"
                        >
                          <option className="bg-[#10141d] text-white" value="all">Any</option>
                          {sourcePackSeasons.map(season => (
                            <option className="bg-[#10141d] text-white" key={`pack-season-${season}`} value={season.toString()}>
                              Season {season}
                            </option>
                          ))}
                        </select>
                      )}

                      {sourceSeasonFilter !== 'all' && sourceSeasonFilter !== 'packs' && sourceEpisodes.length > 0 && (
                        <select
                          value={sourceEpisodeFilter}
                          onChange={(event) => setSourceEpisodeFilter(event.target.value)}
                          className="min-h-8 w-[112px] shrink-0 rounded-lg border border-white/10 bg-[#151B25] px-2 text-[9px] font-black uppercase tracking-widest text-white/70 outline-none transition-colors hover:bg-[#1A2230]"
                        >
                          <option className="bg-[#10141d] text-white" value="all">Any Episode</option>
                          {sourceEpisodes.map(episode => (
                            <option className="bg-[#10141d] text-white" key={episode} value={episode.toString()}>
                              Episode {episode}
                            </option>
                          ))}
                        </select>
                      )}
                    </>
                  )}
                </div>

                <button
                  onClick={() => handleSearchSources(true)}
                  disabled={searching || !video.tmdb_id}
                  className="flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-[#151B25] px-2.5 text-[9px] font-black uppercase tracking-widest text-white/55 transition-all hover:bg-[#1A2230] hover:text-white/80 disabled:opacity-50"
                  title="Refresh sources"
                >
                  {searching ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
                  Refresh
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-[#080B10] px-4 py-4 scrollbar-thin">
              {(searching || !sourceSearchStatus.done) && filteredSources.length === 0 ? (
                <div className="flex h-full min-h-[340px] flex-col items-center justify-center gap-4 text-center">
                  <div className="h-12 w-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                  <p className="text-xs font-black uppercase tracking-widest text-muted">
                    {sourceSearchStatus.total > 0
                      ? `Checking ${sourceSearchStatus.completed}/${sourceSearchStatus.total} providers...`
                      : 'Scanning sources...'}
                  </p>
                </div>
              ) : filteredSources.length > 0 ? (
                <div className="space-y-2.5">
                  {searching && (
                    <div className="rounded-lg border border-primary/15 bg-primary/10 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-primary">
                      {filteredSources.length} sources found. Still checking {Math.max(0, sourceSearchStatus.total - sourceSearchStatus.completed)} providers...
                    </div>
                  )}
                  {filteredSources.map((src, idx) => {
                    const speedLabel = getTorrentSourceSpeedLabel(src)
                    const isStarting = startingSourceMagnet === src.magnet
                    const isStarted = startedSourceMagnet === src.magnet
                    const isSharedSource = initialSharedSource?.magnet && src.magnet === initialSharedSource.magnet
                    const sharedSourceHasLiveStats = isSharedSource && ((Number(src.seeds) || 0) > 0 || (Number(src.peers) || 0) > 0)

                    return (
                      <div
                        key={`${src.magnet || src.title}-${idx}`}
                        className={`group rounded-xl border px-3.5 py-3 transition-colors ${
                          isSharedSource
                            ? 'border-cyan-400/35 bg-cyan-400/10 shadow-[0_0_28px_rgba(34,211,238,0.08)]'
                            : 'border-white/10 bg-white/[0.035] hover:border-white/15 hover:bg-white/[0.065]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            {isSharedSource && (
                              <div className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-cyan-300/25 bg-cyan-300/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-cyan-200">
                                <Share2 size={11} />
                                {sharedSourceHasLiveStats ? 'Shared source matched' : searching ? 'Shared source, checking stats' : 'Shared source'}
                              </div>
                            )}
                            <p className="truncate text-xs font-semibold leading-relaxed text-white" title={src.title}>
                              {src.title}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                                {src.quality || 'HD'}
                              </span>
                              {src.isHindi && (
                                <span className="rounded border border-[#FF9933]/20 bg-[#FF9933]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#FF9933]">
                                  HINDI
                                </span>
                              )}
                              <span className="text-[10px] text-muted">{src.size}</span>
                              <span className={`text-[10px] font-bold ${
                                speedLabel === 'FAST' ? 'text-emerald-300' :
                                speedLabel === 'GOOD' ? 'text-green-400' :
                                speedLabel === 'OK' ? 'text-yellow-300' :
                                'text-red-300'
                              }`}>
                                {speedLabel}
                              </span>
                              <span className="flex items-center gap-1 text-[10px] text-green-400/75">
                                <Zap size={10} fill="currentColor" />
                                {src.seeds} seeds
                              </span>
                              <span className="flex items-center gap-1 text-[10px] text-white/35">
                                <Users size={10} />
                                {src.peers} peers
                              </span>
                            </div>
                          </div>

                          <button
                            onClick={() => handleDownloadSource(src)}
                            disabled={isStarting}
                            className={`shrink-0 rounded-lg p-2 transition-all ${
                              isStarted
                                ? 'bg-green-500/15 text-green-300'
                                : 'bg-primary/10 text-primary hover:bg-primary hover:text-white'
                            } disabled:opacity-60`}
                            title={isStarted ? 'Download started' : 'Start download'}
                          >
                            {isStarting ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : isStarted ? (
                              <CheckCircle2 size={15} />
                            ) : (
                              <Download size={15} />
                            )}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex h-full min-h-[340px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 px-8 text-center">
                  <AlertTriangle className="text-amber-500/60" size={34} />
                  <p className="text-xs font-black uppercase tracking-widest text-muted">
                    {sources.length > 0 ? 'No sources match these filters.' : 'No sources found for this title.'}
                  </p>
                </div>
              )}
            </div>
          </aside>
        </>
      )}

      {showWatchlistCategoryPicker && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-surface border border-secondary rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-secondary flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-text">Save to...</h3>
                <p className="text-[11px] text-muted mt-0.5 truncate max-w-[220px]">{video.title}</p>
              </div>
              <button
                onClick={() => setShowWatchlistCategoryPicker(false)}
                disabled={watchlistBusy}
                className="p-2 rounded-xl hover:bg-white/5 text-muted hover:text-text transition-colors disabled:opacity-50"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-1.5 max-h-[300px] overflow-y-auto">
              {watchlistCategories.map(category => (
                <button
                  key={category}
                  onClick={() => handleAddToWatchlistCategory(category)}
                  disabled={watchlistBusy}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-primary/10 text-muted hover:text-primary group transition-all disabled:opacity-50"
                >
                  <div className="w-8 h-8 rounded-lg bg-secondary/50 flex items-center justify-center group-hover:bg-primary/20">
                    <Bookmark size={14} />
                  </div>
                  <span className="text-sm font-medium">{category}</span>
                  {category === 'Watchlist' && (
                    <span className="ml-auto text-[10px] opacity-60 uppercase tracking-widest font-bold">Default</span>
                  )}
                </button>
              ))}
            </div>

            <div className="p-4 bg-secondary/20 border-t border-secondary">
              {!isCreatingWatchlistCategory ? (
                <button
                  onClick={() => setIsCreatingWatchlistCategory(true)}
                  disabled={watchlistBusy}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-muted/30 text-muted hover:text-text hover:border-primary/50 transition-all text-sm font-medium disabled:opacity-50"
                >
                  <Bookmark size={14} className="opacity-50" />
                  Create New Category
                </button>
              ) : (
                <div className="space-y-3">
                  <input
                    autoFocus
                    type="text"
                    value={newWatchlistCategory}
                    onChange={(e) => setNewWatchlistCategory(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newWatchlistCategory.trim()) {
                        handleAddToWatchlistCategory(newWatchlistCategory)
                      }
                      if (e.key === 'Escape') setIsCreatingWatchlistCategory(false)
                    }}
                    placeholder="Category name"
                    className="w-full px-4 py-2.5 bg-surface border border-primary/30 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted/40"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsCreatingWatchlistCategory(false)}
                      disabled={watchlistBusy}
                      className="flex-1 py-2 text-xs font-medium text-muted hover:text-text transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={!newWatchlistCategory.trim() || watchlistBusy}
                      onClick={() => handleAddToWatchlistCategory(newWatchlistCategory)}
                      className="flex-[2] py-2 bg-primary text-black font-bold text-xs rounded-lg disabled:opacity-50 transition-all"
                    >
                      {watchlistBusy ? <Loader2 size={14} className="mx-auto animate-spin" /> : 'Create & Save'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .glass-effect {
          backdrop-filter: blur(8px);
          background: rgba(255, 255, 255, 0.05);
        }
        .scrollbar-thin::-webkit-scrollbar {
          width: 4px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: rgba(229, 9, 20, 0.3);
          border-radius: 10px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: rgba(229, 9, 20, 0.5);
        }
      `}} />
    </div>
  )
}

export default DetailScreen
