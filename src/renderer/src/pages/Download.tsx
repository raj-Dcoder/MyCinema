import React, { useState, useEffect, useRef } from 'react'
import { Search, Download as DownloadIcon, Film, Tv, X, Loader2, HardDrive, CheckCircle2, AlertCircle, Pause, Play, FolderOpen, Bookmark, BookmarkCheck, ArrowLeft, Languages, RotateCcw, Share2, Copy, MessageCircle, Send, MoreVertical, Trash, ListMinus, Star, Users, Zap } from 'lucide-react'

import { Video } from '../types'
import { DownloadOptionsGuide, ConcurrentDownloadsGuide } from '../components/FeatureGuides'
import { getTorrentSourceHealthScore, getTorrentSourceSpeedLabel, isHevcSource } from '../utils/torrentSources'

// ─── Types ───────────────────────────────────────────────────────────────────
interface TMDBResult {
  id: number
  title?: string
  name?: string
  media_type: 'movie' | 'tv'
  poster_path: string | null
  backdrop_path: string | null
  overview: string
  release_date?: string
  first_air_date?: string
  vote_average: number
  category?: string
}

interface TorrentSource {
  title: string
  quality: string
  size: string
  magnet: string
  seeds: number
  peers: number
  type: string
  provider?: string
  isHindi?: boolean
  parsedSeason?: number
  parsedEpisode?: number
  isSeasonPack?: boolean
}

interface ActiveDownload {
  id: string
  title: string
  name?: string | null
  magnet: string
  quality: string
  progress: number
  downloadSpeed: string
  timeRemaining: string
  status: 'downloading' | 'done' | 'error' | 'paused' | 'connecting' | 'pending' | 'queued'
  size: string
  downloaded: string
  tmdbId?: number
  errorMessage?: string
  addedAt?: string
  // Monotonic FIFO position from the main process (queue ordering).
  queueOrder?: number | null
}

// Simultaneous-download options shown in the queue header. 0 = Unlimited.
const CONCURRENT_OPTIONS = [1, 2, 3, 5, 0]

const hasEpisodeMarker = (source: TorrentSource) => (
  typeof source.parsedEpisode === 'number' ||
  /\bs\d{1,2}[\s._-]*e(?:p)?[\s._-]*\d{1,3}\b/i.test(source.title) ||
  /\b\d{1,2}x\d{1,3}\b/i.test(source.title) ||
  /\b(?:episode|ep)[\s._-]*\d{1,3}\b/i.test(source.title)
)

const isSeasonPackSource = (source: TorrentSource) => Boolean(source.isSeasonPack) && !hasEpisodeMarker(source)

const normalizeSourceQualityKey = (source: TorrentSource): '2160p' | '1080p' | '720p' | '480p' => {
  const text = `${source?.quality || ''} ${source?.title || ''}`.toLowerCase()
  if (/\b(2160p|4k|uhd)\b/.test(text)) return '2160p'
  if (/\b1080p?\b/.test(text)) return '1080p'
  if (/\b720p?\b/.test(text)) return '720p'
  return '480p'
}

const MYCINEMA_SHARE_BASE_URL = (
  import.meta.env.VITE_MYCINEMA_SHARE_BASE_URL ||
  'https://mycinema-share.rajveersinghranaofficial.workers.dev'
).replace(/\/+$/, '')

const encodeShareSource = (source: any) => {
  const json = JSON.stringify(source)
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

interface DownloadsStorage {
  path: string
  free: number
  total: number
  used: number
  percentUsed: number
  error?: string
}

const TMDB_IMG = 'https://image.tmdb.org/t/p'
const WATCHLIST_KEY = 'mycinema_watchlist'

const formatBytes = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, index)
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
}

const getDownloadStatusRank = (status: ActiveDownload['status'] | 'pending') => {
  if (status === 'downloading' || status === 'connecting') return 0
  if (status === 'queued') return 1
  if (status === 'done') return 3
  return 2
}

const getDownloadSortTitle = (download: ActiveDownload) => (download.name || download.title || '').trim().toLowerCase()

const getDownloadTime = (download: ActiveDownload) => {
  const time = download.addedAt ? new Date(download.addedAt).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

// Monotonic FIFO position assigned by the main process. Falls back to the
// timestamp for legacy rows.
const getQueueOrder = (download: ActiveDownload) => {
  const order = Number(download.queueOrder)
  return Number.isFinite(order) && order > 0 ? order : Number.MAX_SAFE_INTEGER
}

// Chronological, oldest first — a real queue, not a stack.
const compareQueueOrder = (a: ActiveDownload, b: ActiveDownload) => {
  const orderDiff = getQueueOrder(a) - getQueueOrder(b)
  if (orderDiff !== 0) return orderDiff
  return getDownloadTime(a) - getDownloadTime(b)
}

const sortDownloads = (items: ActiveDownload[]) => {
  return [...items].sort((a, b) => {
    const statusDiff = getDownloadStatusRank(a.status) - getDownloadStatusRank(b.status)
    if (statusDiff !== 0) return statusDiff

    // Waiting items run oldest-first (FIFO). Everything else keeps the
    // existing newest-first recency order.
    if (a.status === 'queued' && b.status === 'queued') {
      const queueDiff = compareQueueOrder(a, b)
      if (queueDiff !== 0) return queueDiff
    } else {
      const timeDiff = getDownloadTime(b) - getDownloadTime(a)
      if (timeDiff !== 0) return timeDiff
    }

    return getDownloadSortTitle(a).localeCompare(getDownloadSortTitle(b), undefined, {
      numeric: true,
      sensitivity: 'base'
    })
  })
}

interface DownloadProps {
  onShowDetail?: (video: Video) => void
}

const Download: React.FC<DownloadProps> = ({ onShowDetail }) => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TMDBResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedItem, setSelectedItem] = useState<TMDBResult | null>(null)
  const [sources, setSources] = useState<TorrentSource[]>([])
  const [loadingSources, setLoadingSources] = useState(false)
  const [sourceSearchStatus, setSourceSearchStatus] = useState({ found: 0, completed: 0, total: 0, cached: false, done: false })
  const [downloads, setDownloads] = useState<ActiveDownload[]>([])
  const [allVideos, setAllVideos] = useState<Video[]>([])
  const [downloadToRemove, setDownloadToRemove] = useState<string | null>(null)
  const [downloadToShare, setDownloadToShare] = useState<ActiveDownload | null>(null)
  const [shareFeedback, setShareFeedback] = useState<string | null>(null)
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null)
  const [downloadsStorage, setDownloadsStorage] = useState<DownloadsStorage | null>(null)
  // Max simultaneous downloads (0 = Unlimited). Extras queue and auto-start.
  const [maxConcurrent, setMaxConcurrent] = useState<number>(0)
  const removedIdsRef = useRef<Set<string>>(new Set())
  const pauseResumePendingRef = useRef<Map<string, { status: ActiveDownload['status']; expiresAt: number }>>(new Map())
  const searchCacheRef = useRef<Map<string, TMDBResult[]>>(new Map())
  const searchInputRef = useRef<HTMLInputElement>(null)
  const sourceSearchRequestRef = useRef<string | null>(null)
  const pendingSourceProgressRef = useRef<any | null>(null)
  const sourceProgressTimerRef = useRef<number | null>(null)
  const [, startSourceTransition] = React.useTransition()

  const cancelActiveSourceSearch = (markDone = true) => {
    const requestId = sourceSearchRequestRef.current
    if (requestId) {
      void window.api.cancelTorrentSourceSearch(requestId).catch(() => {})
      sourceSearchRequestRef.current = null
    }
    setLoadingSources(false)
    pendingSourceProgressRef.current = null
    if (sourceProgressTimerRef.current) {
      window.clearTimeout(sourceProgressTimerRef.current)
      sourceProgressTimerRef.current = null
    }
    if (markDone) {
      setSourceSearchStatus(prev => ({ ...prev, done: true }))
    }
  }

  const [selectedSeason, setSelectedSeason] = useState<string>('all')
  const [selectedPackSeason, setSelectedPackSeason] = useState<string>('all')
  const [selectedEpisode, setSelectedEpisode] = useState<string>('all')
  const [sourceLanguageFilter, setSourceLanguageFilter] = useState<'all' | 'hindi'>('all')
  const [sourceQualityFilter, setSourceQualityFilter] = useState<'all' | '2160p' | '1080p' | '720p' | '480p'>('all')

  useEffect(() => {
    return () => {
      const requestId = sourceSearchRequestRef.current
      if (requestId) {
        void window.api.cancelTorrentSourceSearch(requestId).catch(() => {})
        sourceSearchRequestRef.current = null
      }
      if (sourceProgressTimerRef.current) {
        window.clearTimeout(sourceProgressTimerRef.current)
        sourceProgressTimerRef.current = null
      }
      pendingSourceProgressRef.current = null
    }
  }, [])

  // ─── Unified Watchlist State ─────────────────────────────────────────────
  const [watchlist, setWatchlist] = useState<Video[]>([])

  const fetchWatchlist = () => {
    window.api.getWatchlist().then(setWatchlist).catch(console.error)
  }

  const toExternalVideo = (item: TMDBResult, category: string = 'Watchlist'): Video => {
    const title = item.title || item.name || 'Untitled'
    const type = item.media_type === 'tv' ? 'series' : 'movie'
    const releaseYear = (item.release_date || item.first_air_date || '').slice(0, 4)

    return {
      id: item.id,
      tmdb_id: item.id,
      title,
      file_path: '',
      type,
      poster_path: item.poster_path ? `${TMDB_IMG}/w780${item.poster_path}` : undefined,
      backdrop_path: item.backdrop_path ? `${TMDB_IMG}/w1280${item.backdrop_path}` : undefined,
      overview: item.overview,
      vote_average: item.vote_average,
      release_year: releaseYear ? Number(releaseYear) : undefined,
      isExternal: true,
      is_watchlist: true,
      category
    }
  }

  const isInWatchlist = (id: number, media_type: string) => 
    watchlist.some(w => w.tmdb_id === id && w.type === (media_type === 'tv' ? 'series' : 'movie'))

  const getDownloadSharePayload = (download: ActiveDownload) => {
    if (!download.tmdbId || !download.magnet) return null
    const source = {
      title: download.name || download.title,
      quality: download.quality || '',
      size: download.size || '',
      magnet: download.magnet,
      seeds: 0,
      peers: 0
    }
    const mediaType = allVideos.find(video => video.tmdb_id === download.tmdbId)?.type === 'series' ? 'series' : 'movie'
    const sourceParam = encodeShareSource(source)
    const shareUrl = `${MYCINEMA_SHARE_BASE_URL}/${mediaType}/${download.tmdbId}?source=${sourceParam}`
    const shareTitle = `I found this exact source on MyCinema: ${download.name || download.title}`
    return {
      source,
      shareUrl,
      shareTitle,
      shareText: `${shareTitle}\n${shareUrl}`
    }
  }

  const showShareFeedback = (message: string) => {
    setShareFeedback(message)
    window.setTimeout(() => setShareFeedback(null), 1800)
  }

  const copyShareText = async (text: string, message: string) => {
    await navigator.clipboard.writeText(text)
    showShareFeedback(message)
  }

  const openShareUrl = (url: string) => window.open(url, '_blank')

  const toggleWatchlist = (item: TMDBResult, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (isInWatchlist(item.id, item.media_type)) {
      window.api.removeFromWatchlistExternal(item.id).then(fetchWatchlist).catch(console.error)
      return
    }

    addToWatchlist(item)
  }

  const addToWatchlist = async (item: TMDBResult) => {
    try {
      await window.api.addToWatchlistExternal(toExternalVideo(item, 'Watchlist'))
      await fetchWatchlist()
    } catch (err) {
      console.error('[Download] Watchlist add error:', err)
    }
  }

  // Fetch all videos for matching
  const fetchVideos = () => {
    window.api.getVideos().then(setAllVideos).catch(console.error)
  }

  const refreshDownloadsStorage = () => {
    window.api.getDownloadsStorage()
      .then(setDownloadsStorage)
      .catch((err: any) => console.error('[Download] Storage read failed:', err))
  }

  useEffect(() => {
    fetchVideos()
    fetchWatchlist()
    refreshDownloadsStorage()

    try {
      const stored = localStorage.getItem(WATCHLIST_KEY)
      const legacyItems = stored ? JSON.parse(stored) : []
      if (Array.isArray(legacyItems) && legacyItems.length > 0) {
        Promise.all(
          legacyItems.map((item: TMDBResult) => window.api.addToWatchlistExternal(toExternalVideo(item, 'Watchlist')))
        )
          .then(() => {
            localStorage.removeItem(WATCHLIST_KEY)
            fetchWatchlist()
          })
          .catch((err) => console.error('[Download] Legacy watchlist migration failed:', err))
      }
    } catch (err) {
      console.error('[Download] Legacy watchlist read failed:', err)
    }

    // Refresh videos every 30 seconds to catch new scans
    const interval = setInterval(fetchVideos, 30000)
    const storageInterval = setInterval(refreshDownloadsStorage, 30000)
    return () => {
      clearInterval(interval)
      clearInterval(storageInterval)
    }
  }, [])

  // Listen for torrent progress from main process
  useEffect(() => {
    window.api.getMaxConcurrentDownloads().then((v: number) => {
      if (Number.isFinite(Number(v))) setMaxConcurrent(Number(v))
    }).catch(() => {})
    // Reconnect to existing downloads on mount
    window.api.getActiveDownloads().then((active: ActiveDownload[]) => {
      if (active && active.length > 0) {
        setDownloads(prev => {
          const filteredActive = active.filter(a => !removedIdsRef.current.has(a.id))
          const newDownloads = [...prev]
          filteredActive.forEach(a => {
            const index = newDownloads.findIndex(d => d.id === a.id)
            if (index === -1) {
              newDownloads.push(a)
            } else {
              newDownloads[index] = { ...newDownloads[index], ...a }
            }
          })
          return newDownloads
        })
        
      }
    }).catch((err: any) => console.error('Failed to get active downloads:', err))

    const cleanup = window.api.onTorrentProgress((data: any) => {
      if (removedIdsRef.current.has(data.id)) return
      const pending = pauseResumePendingRef.current.get(data.id)
      if (pending) {
        const reachedExpectedStatus = data.status === pending.status ||
          (pending.status === 'downloading' && data.status === 'connecting')
        if (!reachedExpectedStatus && Date.now() < pending.expiresAt) return
        pauseResumePendingRef.current.delete(data.id)
      }
      
      setDownloads(prev => {
        const existing = prev.find(d => d.id === data.id)
        if (existing) {
          return prev.map(d => d.id === data.id ? { ...d, ...data } : d)
        }
        return [...prev, data]
      })
    })

    // Authoritative reconcile: the DB is the source of truth for status, so a
    // row can never be left displaying "downloading" (0 B/s • —) while main
    // actually has it queued. Also picks up rows whose event was missed.
    const reconcile = () => {
      window.api.getActiveDownloads().then((active: ActiveDownload[]) => {
        if (!Array.isArray(active)) return
        setDownloads(prev => {
          const next = [...prev]
          let changed = false
          active.forEach(a => {
            if (removedIdsRef.current.has(a.id)) return
            const index = next.findIndex(d => d.id === a.id)
            if (index === -1) {
              next.push(a)
              changed = true
            } else if (next[index].status !== a.status) {
              next[index] = { ...next[index], ...a }
              changed = true
            }
          })
          return changed ? next : prev
        })
      }).catch(() => {})
    }
    const reconcileInterval = setInterval(reconcile, 2000)

    return () => {
      clearInterval(reconcileInterval)
      cleanup()
    }
  }, [])

  // ─── Search TMDB ─────────────────────────────────────────────────────────
  const handleSearch = async () => {
    const trimmed = query.trim()
    if (!trimmed) return
    setSearching(true)
    setSelectedItem(null)
    setSources([])
    setSelectedPackSeason('all')

    try {
      const filtered = await window.api.searchTMDB(trimmed)
      setResults((filtered || []).slice(0, 12))
    } catch (err) {
      console.error('[Download] TMDB search error:', err)
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  useEffect(() => {
    const trimmed = query.trim()

    if (!trimmed) {
      setResults([])
      setSearching(false)
      return
    }

    setSelectedItem(null)
    setSources([])
    setSelectedPackSeason('all')

    const cacheKey = trimmed.toLowerCase()
    const cached = searchCacheRef.current.get(cacheKey)
    if (cached) {
      setResults(cached)
      setSearching(false)
      return
    }

    let cancelled = false
    setSearching(true)

    const timer = window.setTimeout(async () => {
      try {
        const data = await window.api.searchTMDB(trimmed)
        if (cancelled) return

        const filtered = (data || [])
          .filter((item: TMDBResult) => item.media_type === 'movie' || item.media_type === 'tv')
          .slice(0, 12)

        searchCacheRef.current.set(cacheKey, filtered)
        setResults(filtered)
      } catch (err) {
        console.error('[Download] TMDB search error:', err)
        if (!cancelled) setResults([])
      } finally {
        if (!cancelled) setSearching(false)
      }
    }, 180)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query])

  useEffect(() => {
    const flushSourceProgress = () => {
      sourceProgressTimerRef.current = null
      const data = pendingSourceProgressRef.current
      pendingSourceProgressRef.current = null
      if (!data || data.requestId !== sourceSearchRequestRef.current) return

      const nextStatus = {
        found: Array.isArray(data.sources) ? data.sources.length : 0,
        completed: data.completedProviders || 0,
        total: data.totalProviders || 0,
        cached: Boolean(data.cached),
        done: Boolean(data.done)
      }

      startSourceTransition(() => {
        if (Array.isArray(data.sources)) {
          setSources(data.sources)
        }
        setSourceSearchStatus(nextStatus)
        if (data.done) {
          setLoadingSources(false)
          sourceSearchRequestRef.current = null
        }
      })
    }

    const cleanup = window.api.onTorrentSourcesProgress((data: any) => {
      if (!data || data.requestId !== sourceSearchRequestRef.current) return
      pendingSourceProgressRef.current = data
      if (data.done) {
        if (sourceProgressTimerRef.current) {
          window.clearTimeout(sourceProgressTimerRef.current)
          sourceProgressTimerRef.current = null
        }
        flushSourceProgress()
        return
      }
      if (!sourceProgressTimerRef.current) {
        sourceProgressTimerRef.current = window.setTimeout(flushSourceProgress, 120)
      }
    })
    return () => {
      cleanup()
      if (sourceProgressTimerRef.current) {
        window.clearTimeout(sourceProgressTimerRef.current)
        sourceProgressTimerRef.current = null
      }
      pendingSourceProgressRef.current = null
    }
  }, [startSourceTransition])

  // ─── Fetch Torrent Sources ───────────────────────────────────────────────
  const handleSelectResult = async (item: TMDBResult) => {
    if (sourceSearchRequestRef.current) {
      cancelActiveSourceSearch(false)
    }
    setSelectedItem(item)
    setLoadingSources(true)
    setSources([])
    pendingSourceProgressRef.current = null
    if (sourceProgressTimerRef.current) {
      window.clearTimeout(sourceProgressTimerRef.current)
      sourceProgressTimerRef.current = null
    }
    setSourceSearchStatus({ found: 0, completed: 0, total: 0, cached: false, done: false })
    setSelectedSeason('all')
    setSelectedPackSeason('all')
    setSelectedEpisode('all')
    setSourceLanguageFilter('all')
    setSourceQualityFilter('all')
    const requestId = `${item.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    sourceSearchRequestRef.current = requestId

    try {
      const title = item.title || item.name || ''
      const year = (item.release_date || item.first_air_date || '').slice(0, 4)
      const mediaType = item.media_type
      const result = await window.api.searchTorrentSources(title, year, mediaType, item.id, requestId)
      if (sourceSearchRequestRef.current === requestId) {
        startSourceTransition(() => {
          setSources(result || [])
          setSourceSearchStatus(prev => ({ ...prev, found: (result || []).length, done: true }))
        })
      }
    } catch (err) {
      console.error('[Download] Source fetch error:', err)
      if (sourceSearchRequestRef.current === requestId) {
        setSources([])
        setSourceSearchStatus(prev => ({ ...prev, done: true }))
      }
    } finally {
      if (sourceSearchRequestRef.current === requestId) {
        setLoadingSources(false)
        sourceSearchRequestRef.current = null
      }
    }
  }

  // ─── Start Download ──────────────────────────────────────────────────────
  const handleStartDownload = async (source: TorrentSource) => {
    const title = selectedItem?.title || selectedItem?.name || 'Unknown'
    try {
      await window.api.startTorrentDownload(
        source.magnet,
        `${title} (${source.quality})`,
        selectedItem?.id,
        source.title,
        {
          mediaType: selectedItem?.media_type === 'tv' ? 'series' : 'movie',
          season: source.parsedSeason,
          episode: source.parsedEpisode
        }
      )
      refreshDownloadsStorage()
    } catch (err) {
      console.error('[Download] Start download error:', err)
    }
  }

  const handlePauseResume = async (id: string) => {
    if (pauseResumePendingRef.current.has(id)) return

    const dl = downloads.find(d => d.id === id)
    if (!dl) return

    // Optimistic status update for speed (queued + button = dequeue to paused)
    const newStatus = dl.status === 'paused' ? 'downloading' : 'paused'
    pauseResumePendingRef.current.set(id, { status: newStatus as ActiveDownload['status'], expiresAt: Date.now() + 5000 })
    setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: newStatus as any } : d))
    
    try {
      const success = await window.api.pauseResumeTorrent(id)
      // Let the authoritative main-process event win immediately (it may have
      // queued instead of started when slots are full).
      pauseResumePendingRef.current.delete(id)
      if (!success) {
        setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: dl.status } : d))
        return
      }
    } catch (err) {
      console.error('[Download] Pause/Resume error:', err)
      pauseResumePendingRef.current.delete(id)
      setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: dl.status } : d))
    }
  }

  const handleMaxConcurrentChange = async (value: number) => {
    const prev = maxConcurrent
    setMaxConcurrent(value)
    try {
      const saved = await window.api.setMaxConcurrentDownloads(value)
      setMaxConcurrent(Number(saved) || 0)
      // Queue states may have changed — pull the authoritative list.
      const active = await window.api.getActiveDownloads().catch(() => null)
      if (Array.isArray(active)) {
        setDownloads(prevDownloads => {
          const next = [...prevDownloads]
          active.forEach((a: ActiveDownload) => {
            const index = next.findIndex(d => d.id === a.id)
            if (index === -1) {
              if (!removedIdsRef.current.has(a.id)) next.push(a)
            } else {
              next[index] = { ...next[index], ...a }
            }
          })
          return next
        })
      }
    } catch (err) {
      console.error('[Download] Set max concurrent error:', err)
      setMaxConcurrent(prev)
    }
  }

  const handleRetryDownload = async (id: string) => {
    setDownloads(prev => prev.map(d => d.id === id ? {
      ...d,
      status: 'connecting',
      downloadSpeed: '0 B/s',
      timeRemaining: '—',
      errorMessage: undefined
    } : d))

    try {
      const success = await window.api.retryTorrentDownload(id)
      if (!success) {
        setDownloads(prev => prev.map(d => d.id === id ? {
          ...d,
          status: 'error',
          errorMessage: 'Retry failed. Please try again.'
        } : d))
      }
    } catch (err) {
      console.error('[Download] Retry error:', err)
      setDownloads(prev => prev.map(d => d.id === id ? {
        ...d,
        status: 'error',
        errorMessage: 'Retry failed. Please try again.'
      } : d))
    }
  }

  const handleRemoveDownload = async (id: string | null, deleteFile: boolean = false) => {
    if (!id) return
    const targetId = id
    
    // Optimistic UI update
    removedIdsRef.current.add(targetId)
    setDownloads(prev => prev.filter(d => d.id !== targetId))
    setDownloadToRemove(null)

    try {
      const success = await window.api.removeDownload(targetId, deleteFile)
      if (!success) {
        // If it failed, we might want to re-add it or just log
        // For now, just log and allow the user to try again if it reappears on refresh
        console.error('[Download] Remove failed in main process')
        removedIdsRef.current.delete(targetId)
      } else if (deleteFile) {
        fetchVideos()
        refreshDownloadsStorage()
      }
    } catch (err) {
      console.error('[Download] Remove error:', err)
      removedIdsRef.current.delete(targetId)
    }
  }

  const sortedDownloads = React.useMemo(() => sortDownloads(downloads), [downloads])
  const activeCount = downloads.filter(d => d.status === 'downloading' || d.status === 'connecting').length
  const completedCount = downloads.filter(d => d.status === 'done').length
  const pausedCount = downloads.filter(d => d.status === 'paused').length
  const failedCount = downloads.filter(d => d.status === 'error').length
  const queuedCount = downloads.filter(d => d.status === 'queued').length
  // Queue position (#1 starts next) — chronological FIFO, matching main.
  const queuePositions = React.useMemo(() => {
    const ordered = downloads
      .filter(d => d.status === 'queued')
      .sort(compareQueueOrder)
    const map = new Map<string, number>()
    ordered.forEach((d, i) => map.set(d.id, i + 1))
    return map
  }, [downloads])
  const queueStatusText = activeCount > 0
    ? `${activeCount} active download${activeCount === 1 ? '' : 's'}${queuedCount > 0 ? ` · ${queuedCount} queued` : ''}${maxConcurrent > 0 ? ` · ${maxConcurrent} at once` : ''}`
    : queuedCount > 0
      ? `${queuedCount} queued download${queuedCount === 1 ? '' : 's'}`
      : downloads.length > 0
        ? `${downloads.length} saved download${downloads.length === 1 ? '' : 's'}`
        : 'Queue is empty'
  const panelOpen = selectedItem !== null
  const selectedYear = (selectedItem?.release_date || selectedItem?.first_air_date || '').slice(0, 4)
  const selectedPosterUrl = selectedItem?.poster_path ? `${TMDB_IMG}/w342${selectedItem.poster_path}` : null
  const storageUsedPercent = Math.round(downloadsStorage?.percentUsed || 0)
  const deferredSources = React.useDeferredValue(sources)
  const sourceView = loadingSources ? deferredSources : sources

  const availableSeasons = React.useMemo(() => {
    const seasons = new Set<number>()
    sourceView.forEach(s => {
      if (!isSeasonPackSource(s) && s.parsedSeason !== undefined) seasons.add(s.parsedSeason)
    })
    return Array.from(seasons).sort((a, b) => a - b)
  }, [sourceView])

  const availablePackSeasons = React.useMemo(() => {
    const seasons = new Set<number>()
    sourceView.forEach(s => {
      if (isSeasonPackSource(s) && s.parsedSeason !== undefined) seasons.add(s.parsedSeason)
    })
    return Array.from(seasons).sort((a, b) => a - b)
  }, [sourceView])

  const availableEpisodes = React.useMemo(() => {
    if (selectedSeason === 'all' || selectedSeason === 'packs') return []
    const eps = new Set<number>()
    sourceView.forEach(s => {
      if (!isSeasonPackSource(s) && s.parsedSeason === parseInt(selectedSeason) && s.parsedEpisode !== undefined) {
        eps.add(s.parsedEpisode)
      }
    })
    return Array.from(eps).sort((a, b) => a - b)
  }, [sourceView, selectedSeason])

  const sourceQualityCounts = React.useMemo(() => {
    const counts: Record<'2160p' | '1080p' | '720p' | '480p', number> = { '2160p': 0, '1080p': 0, '720p': 0, '480p': 0 }
    sourceView.forEach(source => {
      counts[normalizeSourceQualityKey(source)] += 1
    })
    return counts
  }, [sourceView])

  const sourceHindiCount = React.useMemo(() => sourceView.filter(s => s.isHindi).length, [sourceView])

  const hasActiveSourceFilters = sourceLanguageFilter !== 'all' || sourceQualityFilter !== 'all' || selectedSeason !== 'all' || selectedPackSeason !== 'all' || selectedEpisode !== 'all'

  const clearSourceFilters = () => {
    setSourceLanguageFilter('all')
    setSourceQualityFilter('all')
    setSelectedSeason('all')
    setSelectedPackSeason('all')
    setSelectedEpisode('all')
  }

  const filteredSources = React.useMemo(() => {
    return sourceView
      .filter(s => {
        if (sourceLanguageFilter === 'hindi' && !s.isHindi) return false
        if (sourceQualityFilter !== 'all' && normalizeSourceQualityKey(s) !== sourceQualityFilter) return false

        // TV Series specific filtering
        if (selectedItem?.media_type !== 'tv') return true
        if (selectedSeason === 'packs') {
          if (!isSeasonPackSource(s)) return false
          if (selectedPackSeason !== 'all') return s.parsedSeason === parseInt(selectedPackSeason)
          return true
        }
        if (selectedSeason !== 'all') {
          if (s.parsedSeason !== parseInt(selectedSeason) || isSeasonPackSource(s)) return false
          if (selectedEpisode !== 'all') {
            if (s.parsedEpisode !== parseInt(selectedEpisode)) return false
          }
        }
        return true
      })
      .sort((a, b) => getTorrentSourceHealthScore(b) - getTorrentSourceHealthScore(a))
  }, [sourceView, selectedSeason, selectedPackSeason, selectedEpisode, selectedItem, sourceLanguageFilter, sourceQualityFilter])

  // Optimization: Memoize a video map for O(1) lookup during render
  const videoMap = React.useMemo(() => {
    const map = new Map<string, Video>()
    allVideos.forEach(v => {
      if (v.tmdb_id) map.set(`tmdb-${v.tmdb_id}`, v)
      map.set(`title-${v.title.toLowerCase()}`, v)
      if (v.series_name) map.set(`series-${v.series_name.toLowerCase()}`, v)
    })
    return map
  }, [allVideos])

  return (
    <div className="relative">
      {/* Compact Removal Tooltip/Menu */}
      {downloadToRemove && (() => {
        const dlItem = downloads.find(d => d.id === downloadToRemove);
        const matchingVideo = (() => {
          if (!dlItem) return null;
          if (dlItem.tmdbId && videoMap.has(`tmdb-${dlItem.tmdbId}`)) {
            return videoMap.get(`tmdb-${dlItem.tmdbId}`);
          }
          const cleanDlTitle = dlItem.title.replace(/\s*\([^)]*\)\s*$/, '').toLowerCase();
          return videoMap.get(`title-${cleanDlTitle}`) || videoMap.get(`series-${cleanDlTitle}`);
        })();
        const isShareEligible = Boolean((dlItem?.tmdbId || matchingVideo?.tmdb_id) && dlItem?.magnet);

        return (
          <div 
            className="fixed inset-0 z-[100]" 
            onClick={() => setDownloadToRemove(null)}
          >
            <div 
              className="absolute bg-surface/95 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl overflow-hidden min-w-[180px] animate-in fade-in zoom-in duration-200"
              style={{ 
                top: window.innerHeight - 200 > (document.getElementById(`dl-btn-${downloadToRemove}`)?.getBoundingClientRect().bottom || 0) 
                  ? (document.getElementById(`dl-btn-${downloadToRemove}`)?.getBoundingClientRect().bottom || 0) + 8 
                  : (document.getElementById(`dl-btn-${downloadToRemove}`)?.getBoundingClientRect().top || 0) - 100,
                left: Math.max(20, (document.getElementById(`dl-btn-${downloadToRemove}`)?.getBoundingClientRect().right || 0) - 180)
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-1.5 flex flex-col gap-1">
                {isShareEligible && dlItem && (
                  <>
                    <button
                      onClick={() => {
                        setDownloadToShare({ ...dlItem, tmdbId: dlItem.tmdbId || matchingVideo?.tmdb_id })
                        setShareFeedback(null)
                        setDownloadToRemove(null)
                      }}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-cyan-500/10 text-left transition-colors group"
                    >
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-500 group-hover:scale-110 transition-transform">
                        <Share2 size={16} />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-cyan-400">Share source</span>
                        <span className="text-[10px] text-cyan-400/60">Share download link</span>
                      </div>
                    </button>
                    <div className="h-px bg-white/5 mx-2" />
                  </>
                )}
                
                <button
                  onClick={() => handleRemoveDownload(downloadToRemove, false)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 text-left transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-muted group-hover:text-primary transition-colors">
                    <ListMinus size={16} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-text">Remove from list</span>
                    <span className="text-[10px] text-muted">Keep files on disk</span>
                  </div>
                </button>
                
                <div className="h-px bg-white/5 mx-2" />
                
                <button
                  onClick={() => handleRemoveDownload(downloadToRemove, true)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-red-500/10 text-left transition-colors group"
                >
                  <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400">
                    <Trash size={16} />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-red-400">Delete from disk</span>
                    <span className="text-[10px] text-red-400/60">Delete permanently</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {downloadToShare && (() => {
        const payload = getDownloadSharePayload(downloadToShare)
        if (!payload) return null
        return (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setDownloadToShare(null)}>
            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-secondary bg-surface shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-secondary px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
                    <Share2 size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-text">Share Source</h3>
                    <p className="mt-0.5 max-w-[250px] truncate text-xs text-muted">{downloadToShare.name || downloadToShare.title}</p>
                  </div>
                </div>
                <button onClick={() => setDownloadToShare(null)} className="rounded-lg p-1.5 text-muted transition-colors hover:bg-white/5 hover:text-text">
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-4 p-5">
                <div className="rounded-xl border border-secondary bg-black/20 p-3">
                  <p className="line-clamp-2 text-sm font-semibold text-text">{payload.source.title}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {payload.source.quality && <span className="rounded bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">{payload.source.quality}</span>}
                    {payload.source.size && <span className="rounded bg-white/5 px-2 py-1 text-[10px] font-bold text-muted">{payload.source.size}</span>}
                  </div>
                  <p className="mt-3 break-all text-[11px] font-medium text-cyan-200/70">{payload.shareUrl}</p>
                </div>
                {shareFeedback && (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-black uppercase tracking-widest text-emerald-300">
                    <CheckCircle2 size={15} />
                    {shareFeedback}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => openShareUrl(`https://wa.me/?text=${encodeURIComponent(payload.shareText)}`)} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-secondary bg-white/[0.03] text-muted transition-all hover:border-emerald-400/35 hover:bg-emerald-400/10 hover:text-text">
                    <MessageCircle size={22} className="text-emerald-300" />
                    <span className="text-[11px] font-black uppercase tracking-widest">WhatsApp</span>
                  </button>
                  <button onClick={() => openShareUrl(`https://t.me/share/url?url=${encodeURIComponent(payload.shareUrl)}&text=${encodeURIComponent(payload.shareTitle)}`)} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-secondary bg-white/[0.03] text-muted transition-all hover:border-sky-400/35 hover:bg-sky-400/10 hover:text-text">
                    <Send size={22} className="text-sky-300" />
                    <span className="text-[11px] font-black uppercase tracking-widest">Telegram</span>
                  </button>
                  <button onClick={() => copyShareText(payload.shareUrl, 'Copied link')} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-secondary bg-white/[0.03] text-muted transition-all hover:border-cyan-400/35 hover:bg-cyan-400/10 hover:text-text">
                    <Copy size={22} className="text-cyan-300" />
                    <span className="text-[11px] font-black uppercase tracking-widest">Copy Link</span>
                  </button>
                  <button onClick={() => copyShareText(payload.shareText, 'Copied message')} className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border border-secondary bg-white/[0.03] text-muted transition-all hover:border-violet-400/35 hover:bg-violet-400/10 hover:text-text">
                    <Share2 size={22} className="text-violet-300" />
                    <span className="text-[11px] font-black uppercase tracking-widest">Copy Text</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Main Content Area */}
      <div className={`transition-all duration-300 ${panelOpen ? 'mr-[580px]' : ''}`}>
        {/* Unified Header */}
        <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex flex-1 items-center gap-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Downloads</h1>
            </div>
            
            <div className="relative flex-1 max-w-md flex items-center bg-white/[0.035] border border-white/10 rounded-2xl overflow-hidden focus-within:border-white/20 focus-within:bg-white/[0.055] transition-all shadow-sm">
              <div className="pl-4 text-muted">
                {searching ? <Loader2 size={16} className="animate-spin text-white" /> : <Search size={16} />}
              </div>
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search movies & TV shows..."
                className="w-full bg-transparent border-none px-3 py-2.5 text-sm text-white placeholder:text-muted/50 focus:outline-none focus:ring-0"
              />
              {query && (
                <button onClick={() => setQuery('')} className="pr-4 text-muted hover:text-white transition-colors shrink-0">
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={refreshDownloadsStorage}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 hover:bg-white/10 transition-colors"
              title={downloadsStorage?.path || 'Refresh storage'}
            >
              <HardDrive size={15} className="text-primary" />
              <div className="flex flex-col min-w-[100px]">
                <div className="flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-widest mb-1">
                  <span className="text-white">{downloadsStorage ? formatBytes(downloadsStorage.free) : '--'} free</span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      storageUsedPercent >= 90 ? 'bg-red-400' :
                      storageUsedPercent >= 75 ? 'bg-amber-400' :
                      'bg-primary'
                    }`}
                    style={{ width: `${storageUsedPercent}%` }}
                  />
                </div>
              </div>
            </button>

            <button
              onClick={() => window.api.openDownloadsFolder()}
              className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-muted hover:text-white hover:bg-white/10 transition-colors"
              title="Open downloads folder"
            >
              <FolderOpen size={16} />
            </button>
          </div>
        </div>

        {/* Download Queue */}
        {downloads.length > 0 && (
          <div className="bg-surface/90 backdrop-blur-xl border border-secondary rounded-2xl overflow-hidden mb-8 animate-in slide-in-from-top-4 duration-500">
            <div className="flex items-center justify-between px-5 py-3 border-b border-secondary">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${activeCount > 0 ? 'animate-pulse bg-primary' : 'bg-white/25'}`} />
                  <h3 className="text-sm font-semibold text-text">Download Queue</h3>
                </div>
                <p className="mt-1 text-[11px] text-muted">{queueStatusText}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-[10px] font-black uppercase tracking-widest text-white/40">
                {activeCount > 0 && <span className="text-primary">{activeCount} active</span>}
                {completedCount > 0 && <span className="text-emerald-400">{completedCount} complete</span>}
                {pausedCount > 0 && <span className="text-amber-400">{pausedCount} paused</span>}
                {failedCount > 0 && <span className="text-red-400">{failedCount} failed</span>}
                {queuedCount > 0 && <span className="text-sky-300">{queuedCount} queued</span>}
                <label className="relative flex items-center gap-1.5 normal-case tracking-normal">
                  <span className="text-white/40">At once</span>
                  <select
                    value={maxConcurrent}
                    onChange={(e) => void handleMaxConcurrentChange(Number(e.target.value))}
                    className="rounded-lg border border-white/10 bg-black/40 px-1.5 py-1 text-[10px] font-bold text-white outline-none hover:border-white/25 focus:border-primary"
                    aria-label="Maximum simultaneous downloads"
                  >
                    {CONCURRENT_OPTIONS.map(n => (
                      <option key={n} value={n}>{n === 0 ? 'Unlimited' : n}</option>
                    ))}
                  </select>
                  <ConcurrentDownloadsGuide />
                </label>
              </div>
            </div>
          <div className="divide-y divide-secondary/50">
              {sortedDownloads.map((dl, idx) => {
                // Optimized matching using memoized map
                const matchingVideo = (() => {
                  if (dl.tmdbId && videoMap.has(`tmdb-${dl.tmdbId}`)) {
                    return videoMap.get(`tmdb-${dl.tmdbId}`)
                  }
                  const cleanDlTitle = dl.title.replace(/\s*\([^)]*\)\s*$/, '').toLowerCase()
                  return videoMap.get(`title-${cleanDlTitle}`) || videoMap.get(`series-${cleanDlTitle}`)
                })()
                const isShareEligible = Boolean((dl.tmdbId || matchingVideo?.tmdb_id) && dl.magnet)

                const handleShowDetailWithDelay = (video: Video) => {
                  setLoadingDetailId(dl.id)
                  setTimeout(() => {
                    onShowDetail?.(video)
                    setLoadingDetailId(null)
                  }, 800)
                }

                return (
                  <div key={dl.id} className="px-5 py-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0 mr-4">
                        <button
                          disabled={!matchingVideo || loadingDetailId === dl.id}
                          onClick={() => matchingVideo && handleShowDetailWithDelay(matchingVideo)}
                          className={`flex-shrink-0 p-1.5 rounded-lg transition-all group ${
                            matchingVideo 
                              ? 'bg-primary/20 text-primary hover:bg-primary/30 cursor-pointer shadow-lg shadow-primary/10' 
                              : 'bg-white/5 text-muted/20 cursor-not-allowed'
                          } ${loadingDetailId === dl.id ? 'animate-pulse' : ''}`}
                          title={matchingVideo ? "View Details & Play" : "Fetching Movie Metadata..."}
                        >
                          {loadingDetailId === dl.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Play 
                              size={14} 
                              fill={matchingVideo ? "currentColor" : "none"} 
                              className={matchingVideo ? "group-hover:scale-110 transition-transform" : ""} 
                            />
                          )}
                        </button>
                        <span className="text-sm font-medium text-text truncate" title={dl.name || dl.title}>{dl.name || dl.title}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {dl.status === 'downloading' && (
                        <>
                          <span className="text-xs text-muted">{dl.downloadSpeed}</span>
                          <span className="text-xs text-muted">•</span>
                          <span className="text-xs text-muted">{dl.timeRemaining}</span>
                        </>
                      )}
                      {dl.status === 'connecting' && (
                        <span className="flex items-center gap-1.5 text-xs text-amber-400">
                          <Loader2 size={12} className="animate-spin" /> Resolving Metadata...
                        </span>
                      )}
                      {dl.status === 'paused' && (
                        <span className="flex items-center gap-1 text-xs text-muted">
                          <Pause size={14} /> Paused
                        </span>
                      )}
                      {dl.status === 'queued' && (
                        <span className="flex items-center gap-1 text-xs text-sky-300" title="Waiting for a free download slot — starts oldest-first">
                          <Loader2 size={12} className="animate-spin" /> Queued{queuePositions.get(dl.id) ? ` #${queuePositions.get(dl.id)}` : ''}
                        </span>
                      )}
                      {dl.status === 'pending' && (
                        <span className="flex items-center gap-1 text-xs text-amber-400">
                          <AlertCircle size={14} /> Pending
                        </span>
                      )}
                        {dl.status === 'done' && (
                        <span className="flex items-center gap-1 text-xs text-green-400">
                          <CheckCircle2 size={14} /> Complete
                        </span>
                      )}
                      {dl.status === 'error' && (
                        <span className="flex items-center gap-1 text-xs text-red-400">
                          <AlertCircle size={14} /> Failed
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-[width] duration-500 ${
                          dl.status === 'done' ? 'bg-green-400' :
                          dl.status === 'error' ? 'bg-red-400' :
                          dl.status === 'connecting' ? 'bg-amber-400' :
                          dl.status === 'queued' ? 'bg-sky-300/60' :
                          'bg-primary'
                        }`}
                        style={{ width: `${Math.max(0, Math.min(100, dl.progress || 0))}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted w-10 text-right">{Math.round(dl.progress)}%</span>
                    {(dl.status === 'downloading' || dl.status === 'paused' || dl.status === 'connecting' || dl.status === 'queued') && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handlePauseResume(dl.id)}
                          disabled={pauseResumePendingRef.current.has(dl.id)}
                          className="p-1 rounded-lg text-muted hover:text-primary hover:bg-primary/10 transition-colors disabled:cursor-wait disabled:opacity-50"
                          title={dl.status === 'paused' ? 'Resume' : dl.status === 'queued' ? 'Remove from queue (pause)' : 'Pause'}
                        >
                          {dl.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}
                        </button>
                      </div>
                    )}
                    {dl.status === 'error' && (
                      <button
                        onClick={() => handleRetryDownload(dl.id)}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold text-red-300 bg-red-400/10 hover:bg-red-400/20 hover:text-red-200 transition-colors"
                        title="Retry this download"
                      >
                        <RotateCcw size={13} />
                        Retry
                      </button>
                    )}
                    <button
                      id={`dl-btn-${dl.id}`}
                      onClick={() => setDownloadToRemove(dl.id)}
                      className="p-1 rounded-lg text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors relative"
                      title="More Options"
                    >
                      <MoreVertical size={14} />
                      {idx === 0 && <DownloadOptionsGuide />}
                    </button>
                  </div>
                  {dl.status !== 'done' && dl.downloaded && dl.size && (
                    <p className="text-[11px] text-muted/70">{dl.downloaded} / {dl.size}</p>
                  )}
                  {dl.status === 'error' && dl.errorMessage && (
                    <p className="text-[11px] text-red-300/70">{dl.errorMessage}</p>
                  )}
                </div>
              )
            })}
            </div>
          </div>
        )}

        {/* Search Results Grid */}
        {results.length > 0 && (
          <div className={`grid gap-4 ${panelOpen ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6'}`}>
            {results.map(item => (
              <button
                key={`${item.media_type}-${item.id}`}
                onClick={() => handleSelectResult(item)}
                className={`group relative flex flex-col rounded-xl overflow-hidden border transition-all duration-300 ${
                  selectedItem?.id === item.id
                    ? 'border-primary ring-2 ring-primary/30 scale-[1.02]'
                    : 'border-secondary/50 hover:border-primary/40 hover:scale-[1.03]'
                }`}
              >
                <div className="aspect-[2/3] bg-surface relative overflow-hidden">
                  {item.poster_path ? (
                    <img
                      src={`${TMDB_IMG}/w342${item.poster_path}`}
                      alt={item.title || item.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted/30">
                      <Film size={40} />
                    </div>
                  )}
                  <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-black/60 backdrop-blur-sm text-white/90">
                    {item.media_type === 'movie' ? 'Movie' : 'Series'}
                  </div>
                  {item.vote_average > 0 && (
                    <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-primary/80 backdrop-blur-sm text-white">
                      ★ {item.vote_average.toFixed(1)}
                    </div>
                  )}
                  {/* Add/Remove Watchlist Button */}
                  <button
                    onClick={(e) => toggleWatchlist(item, e)}
                    className={`absolute bottom-2 right-2 p-1.5 rounded-full backdrop-blur-sm transition-all duration-200 z-10 ${
                      isInWatchlist(item.id, item.media_type)
                        ? 'bg-amber-500/20 text-amber-400 opacity-100'
                        : 'bg-black/50 text-white/70 hover:text-amber-400 hover:bg-amber-500/20 opacity-0 group-hover:opacity-100'
                    }`}
                    title={isInWatchlist(item.id, item.media_type) ? 'Remove from Watchlist' : 'Add to Watchlist'}
                  >
                    {isInWatchlist(item.id, item.media_type) ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                  </button>
                </div>
                <div className="p-2.5 bg-surface">
                  <p className="text-xs font-medium text-text truncate">{item.title || item.name}</p>
                  <p className="text-[10px] text-muted mt-0.5">
                    {(item.release_date || item.first_air_date || '—').slice(0, 4)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Empty Queue */}
        {!searching && results.length === 0 && !selectedItem && downloads.length === 0 && (
          <div className="flex flex-col items-center justify-center min-h-[400px] rounded-3xl border border-white/5 bg-white/[0.015] p-10 text-center animate-in fade-in zoom-in-95 duration-500">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-muted">
              <DownloadIcon size={28} />
            </div>
            <h2 className="text-2xl font-black italic tracking-tight text-white">No downloads yet</h2>
            <p className="mt-2 max-w-md text-sm font-medium leading-relaxed text-muted">
              Search for a movie or TV show above, or browse the catalog to start building your offline library.
            </p>
          </div>
        )}
      </div>

      {/* ─── Right Side Panel ───────────────────────────────────────────────── */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[580px] flex-col border-l border-white/10 bg-[#0C1017] shadow-[-32px_0_80px_rgba(0,0,0,0.65)] transform transition-transform duration-300 ease-out ${
          panelOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {selectedItem && (
          <div className="flex flex-col h-full">
            <div className="relative border-b border-white/10 bg-[#0C1017]">
              {/* scan progress */}
              <div className="absolute inset-x-0 top-0 h-[2px] bg-white/5">
                {loadingSources && sourceSearchStatus.total > 0 ? (
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${Math.min(100, (sourceSearchStatus.completed / Math.max(1, sourceSearchStatus.total)) * 100)}%` }}
                  />
                ) : loadingSources ? (
                  <div className="h-full w-1/3 animate-pulse bg-primary/70" />
                ) : null}
              </div>
              <div className="flex items-start gap-4 px-5 pt-5 pb-4">
                {selectedPosterUrl ? (
                  <img
                    src={selectedPosterUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-[68px] w-[48px] shrink-0 rounded-lg object-cover ring-1 ring-white/15"
                  />
                ) : (
                  <div className="flex h-[68px] w-[48px] shrink-0 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10">
                    <Film size={18} className="text-white/30" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/40">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-primary/15 text-primary">
                      <DownloadIcon size={12} />
                    </span>
                    Download Sources
                    {sourceSearchStatus.cached && (
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-[9px] font-bold tracking-widest text-white/40">
                        Cached
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1.5 truncate text-[17px] font-extrabold tracking-tight text-white">
                    {selectedItem.title || selectedItem.name}
                  </h3>
                  <p className="mt-1 text-[11px] font-medium text-white/40">
                    {selectedYear ? `${selectedYear} · ` : ''}{filteredSources.length} of {sourceView.length} sources
                    {loadingSources && sourceSearchStatus.total > 0
                      ? ` · scanning ${sourceSearchStatus.completed}/${sourceSearchStatus.total}`
                      : loadingSources ? ' · scanning…' : ''}
                  </p>
                  <div className="mt-2.5 flex items-center gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 font-semibold text-white/60 ring-1 ring-white/10">
                      <DownloadIcon size={11} />
                      Save — download
                    </span>
                    {sourceHindiCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#FF9933]/10 px-2.5 py-1 font-bold text-[#FFB76B] ring-1 ring-[#FF9933]/25">
                        {sourceHindiCount} Hindi
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => { setSelectedItem(null); setSources([]) }}
                  className="shrink-0 rounded-full bg-white/5 p-2.5 text-white/60 ring-1 ring-white/10 transition-colors hover:bg-white/10 hover:text-white"
                  title="Close download sources"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-2 border-t border-white/[0.07] bg-white/[0.015] px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-0.5 scrollbar-hide">
                    {/* Language: fixed two-option segmented control — labels never change, only the active state does */}
                    <div className="flex h-7 shrink-0 items-center gap-0.5 rounded-full bg-white/5 p-0.5 ring-1 ring-white/10" role="group" aria-label="Language filter">
                      <button
                        onClick={() => setSourceLanguageFilter('all')}
                        title={`Show all languages (${sourceView.length})`}
                        className={`flex h-6 items-center gap-1 rounded-full px-2.5 text-[10px] font-bold tracking-wide transition-all ${
                          sourceLanguageFilter === 'all'
                            ? 'bg-white text-black'
                            : 'text-white/55 hover:text-white'
                        }`}
                      >
                        All
                        <span className={`rounded-full px-1.5 py-px text-[9px] font-black ${sourceLanguageFilter === 'all' ? 'bg-black/10 text-black/70' : 'bg-white/10 text-white/45'}`}>
                          {sourceView.length}
                        </span>
                      </button>
                      <button
                        onClick={() => setSourceLanguageFilter('hindi')}
                        title="Show Hindi / dual-audio only"
                        className={`flex h-6 items-center gap-1 rounded-full px-2.5 text-[10px] font-bold tracking-wide transition-all ${
                          sourceLanguageFilter === 'hindi'
                            ? 'bg-[#FF9933] text-black'
                            : 'text-white/55 hover:text-white'
                        }`}
                      >
                        <Languages size={12} />
                        Hindi
                        <span className={`rounded-full px-1.5 py-px text-[9px] font-black ${sourceLanguageFilter === 'hindi' ? 'bg-black/10 text-black/70' : 'bg-[#FF9933]/15 text-[#FFB76B]'}`}>
                          {sourceHindiCount}
                        </span>
                      </button>
                    </div>
                  </div>

                  {hasActiveSourceFilters && (
                    <button
                      onClick={clearSourceFilters}
                      className="flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[10px] font-bold tracking-wide text-white/45 transition-colors hover:bg-white/5 hover:text-white"
                      title="Clear all filters"
                    >
                      <X size={12} />
                      Clear
                    </button>
                  )}
                  <button
                    onClick={() => handleSelectResult(selectedItem)}
                    disabled={loadingSources}
                    className="flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-white/5 px-3 text-[10px] font-bold tracking-wide text-white/60 ring-1 ring-white/10 transition-all hover:bg-white/10 hover:text-white disabled:opacity-50"
                    title="Refresh sources"
                  >
                    {loadingSources ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                    Refresh
                  </button>
                </div>

                {/* Resolution: desired quality filter with live counts */}
                <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-hide">
                  <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.16em] text-white/35">Quality</span>
                  {(['all', '2160p', '1080p', '720p'] as const).map(quality => {
                    const isActive = sourceQualityFilter === quality
                    const count = quality === 'all' ? sourceView.length : sourceQualityCounts[quality]
                    const label = quality === 'all' ? 'All' : quality === '2160p' ? '4K' : quality
                    return (
                      <button
                        key={quality}
                        onClick={() => setSourceQualityFilter(quality)}
                        title={quality === 'all' ? `All qualities (${sourceView.length})` : `${quality === '2160p' ? '2160p / 4K' : quality} (${count})`}
                        className={`flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-bold tracking-wide ring-1 transition-all ${
                          isActive
                            ? 'bg-white text-black ring-white'
                            : count === 0 && sourceView.length > 0
                              ? 'bg-transparent text-white/25 ring-white/[0.07]'
                              : 'bg-white/5 text-white/55 ring-white/10 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {label}
                        <span className={`rounded-full px-1 py-px text-[9px] font-black ${isActive ? 'bg-black/10 text-black/70' : 'bg-white/10 text-white/40'}`}>
                          {count}
                        </span>
                      </button>
                    )
                  })}
                </div>

                {selectedItem?.media_type === 'tv' && (
                  <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-hide">
                    <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.16em] text-white/35">Season</span>
                    {(() => {
                      const packCount = sourceView.filter(s => isSeasonPackSource(s)).length
                      const seasonOptions: { value: string; label: string; count: number }[] = [
                        { value: 'all', label: 'All', count: sourceView.length },
                        { value: 'packs', label: 'Packs', count: packCount },
                        ...availableSeasons.map(season => ({
                          value: season.toString(),
                          label: `S${season}`,
                          count: sourceView.filter(s => !isSeasonPackSource(s) && s.parsedSeason === season).length
                        }))
                      ]
                      return seasonOptions.map(option => {
                        const isActive = selectedSeason === option.value
                        return (
                          <button
                            key={option.value}
                            onClick={() => {
                              setSelectedSeason(option.value)
                              setSelectedPackSeason('all')
                              setSelectedEpisode('all')
                            }}
                            title={option.value === 'all' ? `All seasons (${option.count})` : option.value === 'packs' ? `Season packs (${option.count})` : `Season ${option.value} (${option.count})`}
                            className={`flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-bold tracking-wide ring-1 transition-all ${
                              isActive
                                ? 'bg-white text-black ring-white'
                                : option.count === 0 && sourceView.length > 0
                                  ? 'bg-transparent text-white/25 ring-white/[0.07]'
                                  : 'bg-white/5 text-white/55 ring-white/10 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            {option.label}
                            <span className={`rounded-full px-1 py-px text-[9px] font-black ${isActive ? 'bg-black/10 text-black/70' : 'bg-white/10 text-white/40'}`}>
                              {option.count}
                            </span>
                          </button>
                        )
                      })
                    })()}
                  </div>
                )}

                {selectedItem?.media_type === 'tv' && selectedSeason === 'packs' && availablePackSeasons.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-hide">
                    <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.16em] text-white/35">Pack</span>
                    {['all', ...availablePackSeasons.map(String)].map(value => {
                      const isActive = selectedPackSeason === value
                      const count = value === 'all'
                        ? sourceView.filter(s => isSeasonPackSource(s)).length
                        : sourceView.filter(s => isSeasonPackSource(s) && s.parsedSeason === Number(value)).length
                      return (
                        <button
                          key={value}
                          onClick={() => setSelectedPackSeason(value)}
                          title={value === 'all' ? `Any pack (${count})` : `Season ${value} pack (${count})`}
                          className={`flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-bold tracking-wide ring-1 transition-all ${
                            isActive
                              ? 'bg-white text-black ring-white'
                              : 'bg-white/5 text-white/55 ring-white/10 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {value === 'all' ? 'Any' : `S${value}`}
                          <span className={`rounded-full px-1 py-px text-[9px] font-black ${isActive ? 'bg-black/10 text-black/70' : 'bg-white/10 text-white/40'}`}>
                            {count}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {selectedItem?.media_type === 'tv' && selectedSeason !== 'all' && selectedSeason !== 'packs' && availableEpisodes.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto py-0.5 scrollbar-hide">
                    <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.16em] text-white/35">Episode</span>
                    {['all', ...availableEpisodes.map(String)].map(value => {
                      const isActive = selectedEpisode === value
                      const count = value === 'all'
                        ? sourceView.filter(s => !isSeasonPackSource(s) && s.parsedSeason === Number(selectedSeason)).length
                        : sourceView.filter(s => !isSeasonPackSource(s) && s.parsedSeason === Number(selectedSeason) && s.parsedEpisode === Number(value)).length
                      return (
                        <button
                          key={value}
                          onClick={() => setSelectedEpisode(value)}
                          title={value === 'all' ? `All episodes (${count})` : `Episode ${value} (${count})`}
                          className={`flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-bold tracking-wide ring-1 transition-all ${
                            isActive
                              ? 'bg-white text-black ring-white'
                              : 'bg-white/5 text-white/55 ring-white/10 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {value === 'all' ? 'All' : `E${value}`}
                          <span className={`rounded-full px-1 py-px text-[9px] font-black ${isActive ? 'bg-black/10 text-black/70' : 'bg-white/10 text-white/40'}`}>
                            {count}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Sources List */}
            <div className="flex-1 overflow-y-auto bg-[#080B10] px-4 py-4 scrollbar-thin">
              {(loadingSources || !sourceSearchStatus.done) && filteredSources.length === 0 ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3 rounded-2xl bg-white/[0.03] px-4 py-3.5 ring-1 ring-white/[0.07]">
                    <div className="h-8 w-8 shrink-0 animate-spin rounded-full border-2 border-white/10 border-t-primary" />
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-white">
                        {sourceSearchStatus.total > 0
                          ? `Checking ${sourceSearchStatus.completed} of ${sourceSearchStatus.total} providers`
                          : 'Finding the best sources'}
                      </p>
                      <p className="text-[11px] text-white/40">High-seed results appear first — you can start before it finishes.</p>
                    </div>
                  </div>
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="animate-pulse rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/[0.06]">
                      <div className="flex items-center gap-2.5">
                        <div className="h-11 w-[54px] shrink-0 rounded-lg bg-white/[0.06]" />
                        <div className="flex-1 space-y-1.5 py-0.5">
                          <div className="h-3 w-11/12 rounded bg-white/[0.07]" />
                          <div className="flex gap-1.5">
                            <div className="h-4 w-12 rounded-full bg-white/[0.06]" />
                            <div className="h-4 w-14 rounded-full bg-white/[0.06]" />
                            <div className="h-4 w-10 rounded-full bg-white/[0.06]" />
                          </div>
                        </div>
                        <div className="h-8 w-[76px] shrink-0 rounded-lg bg-white/[0.06]" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredSources.length > 0 ? (
                <div className="space-y-2">
                  {filteredSources.map((source, idx) => {
                    const speedLabel = getTorrentSourceSpeedLabel(source)
                    const isHevc = isHevcSource(source)
                    const quality = String(source.quality || 'HD').toUpperCase()
                    const qualityStyle = quality.includes('2160') || quality.includes('4K') || quality.includes('UHD')
                      ? 'bg-amber-400/12 text-amber-300 ring-amber-400/30'
                      : quality.includes('1080')
                        ? 'bg-sky-400/12 text-sky-300 ring-sky-400/30'
                        : quality.includes('720')
                          ? 'bg-emerald-400/12 text-emerald-300 ring-emerald-400/30'
                          : 'bg-white/[0.05] text-white/70 ring-white/15'
                    const seedCount = Number(source.seeds) || 0
                    const seedDot = seedCount >= 100 ? 'bg-emerald-400' : seedCount >= 25 ? 'bg-green-400' : seedCount >= 5 ? 'bg-amber-400' : 'bg-red-400'
                    const speedStyle = speedLabel === 'FAST' ? 'text-emerald-300' : speedLabel === 'GOOD' ? 'text-green-300' : speedLabel === 'OK' ? 'text-amber-300' : 'text-red-300'
                    const episodeBadge = selectedItem?.media_type === 'tv' && (typeof source.parsedSeason === 'number' || typeof source.parsedEpisode === 'number')
                      ? isSeasonPackSource(source)
                        ? `S${source.parsedSeason} Pack`
                        : `S${source.parsedSeason ?? '?'} E${source.parsedEpisode ?? '?'}`
                      : null

                    return (
                      <div
                        key={idx}
                        className={`rounded-xl px-3 py-2.5 ring-1 transition-colors ${
                          idx === 0
                            ? 'bg-[#131A26] ring-white/15'
                            : 'bg-[#111823] ring-white/[0.07] hover:bg-[#141C2A] hover:ring-white/15'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`flex h-11 w-[54px] shrink-0 flex-col items-center justify-center gap-px rounded-lg ring-1 ${qualityStyle}`}>
                            <span className="text-[12px] font-black leading-none">{quality}</span>
                            {source.size && <span className="max-w-[48px] truncate text-[8px] font-bold opacity-70" title={source.size}>{source.size}</span>}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {idx === 0 && (
                                <Star size={11} className="shrink-0 text-amber-300" fill="currentColor" />
                              )}
                              <p className="truncate text-[12px] font-semibold text-white/90" title={source.title}>
                                {source.title}
                              </p>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-medium text-white/45">
                              <span className="inline-flex items-center gap-1">
                                <span className={`h-1.5 w-1.5 rounded-full ${seedDot}`} />
                                {source.seeds}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Users size={10} />
                                {source.peers}
                              </span>
                              <span className={`font-black tracking-wide ${speedStyle}`}>
                                {speedLabel}
                              </span>
                              {episodeBadge && (
                                <span className="font-bold text-white/50">{episodeBadge}</span>
                              )}
                              {isHevc && (
                                <span
                                  className="inline-flex items-center gap-0.5 rounded-full bg-violet-400/15 px-1.5 py-px text-[9px] font-bold text-violet-200 ring-1 ring-violet-400/30"
                                  title="HEVC / H.265 — recommended for smooth streaming"
                                >
                                  <Zap size={8} fill="currentColor" />
                                  HEVC
                                </span>
                              )}
                              {source.isHindi && (
                                <span className="rounded-full bg-[#FF9933]/12 px-1.5 py-px text-[9px] font-bold text-[#FFB76B] ring-1 ring-[#FF9933]/30">
                                  Hindi
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleStartDownload(source)}
                          className="mt-2.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500 text-[12px] font-bold text-white transition-all hover:bg-emerald-400 active:scale-[0.99]"
                          title={source.title}
                        >
                          <DownloadIcon size={13} />
                          Download
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="flex min-h-[340px] flex-col items-center justify-center gap-3 rounded-2xl bg-white/[0.02] px-8 text-center ring-1 ring-dashed ring-white/10">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-400/10 text-amber-300 ring-1 ring-amber-400/25">
                    <HardDrive size={20} />
                  </span>
                  <p className="text-[13px] font-bold text-white">
                    {sources.length > 0 ? 'No sources match these filters.' : 'No sources found.'}
                  </p>
                  <p className="max-w-[280px] text-[11px] leading-relaxed text-white/40">
                    {sources.length > 0
                      ? 'Try clearing the quality, language, season or episode filters to see more results.'
                      : 'Try a different title or check back later.'}
                  </p>
                  {sources.length > 0 ? (
                    <button
                      onClick={clearSourceFilters}
                      className="mt-1 h-9 rounded-full bg-white/5 px-4 text-[11px] font-bold text-white/70 ring-1 ring-white/10 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      Clear filters
                    </button>
                  ) : (
                    <button
                      onClick={() => selectedItem && handleSelectResult(selectedItem)}
                      className="mt-1 flex h-9 items-center gap-2 rounded-full bg-white/5 px-4 text-[11px] font-bold text-white/70 ring-1 ring-white/10 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <Search size={12} />
                      Try again
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}

export default Download
