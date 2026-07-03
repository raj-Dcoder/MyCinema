import React, { useState, useEffect, useRef } from 'react'
import { Search, Download as DownloadIcon, Film, Tv, X, Loader2, HardDrive, CheckCircle2, AlertCircle, Pause, Play, FolderOpen, Bookmark, BookmarkCheck, ArrowLeft, Languages, RotateCcw, Share2, Copy, MessageCircle, Send, MoreVertical, Trash, ListMinus } from 'lucide-react'

import { Video } from '../types'
import { DownloadOptionsGuide } from '../components/FeatureGuides'
import { getTorrentSourceHealthScore, getTorrentSourceSpeedLabel } from '../utils/torrentSources'

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
  status: 'downloading' | 'done' | 'error' | 'paused' | 'connecting' | 'pending'
  size: string
  downloaded: string
  tmdbId?: number
  errorMessage?: string
  addedAt?: string
}

const hasEpisodeMarker = (source: TorrentSource) => (
  typeof source.parsedEpisode === 'number' ||
  /\bs\d{1,2}[\s._-]*e(?:p)?[\s._-]*\d{1,3}\b/i.test(source.title) ||
  /\b\d{1,2}x\d{1,3}\b/i.test(source.title) ||
  /\b(?:episode|ep)[\s._-]*\d{1,3}\b/i.test(source.title)
)

const isSeasonPackSource = (source: TorrentSource) => Boolean(source.isSeasonPack) && !hasEpisodeMarker(source)

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
  if (status === 'done') return 2
  return 1
}

const getDownloadSortTitle = (download: ActiveDownload) => (download.name || download.title || '').trim().toLowerCase()

const getDownloadTime = (download: ActiveDownload) => {
  const time = download.addedAt ? new Date(download.addedAt).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

const sortDownloads = (items: ActiveDownload[]) => {
  return [...items].sort((a, b) => {
    const statusDiff = getDownloadStatusRank(a.status) - getDownloadStatusRank(b.status)
    if (statusDiff !== 0) return statusDiff

    const timeDiff = getDownloadTime(b) - getDownloadTime(a)
    if (timeDiff !== 0) return timeDiff

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
  const [hindiOnly, setHindiOnly] = useState<boolean>(false)

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

  const [categorizingItem, setCategorizingItem] = useState<TMDBResult | null>(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [isCreatingCategory, setIsCreatingCategory] = useState(false)

  const fetchWatchlist = () => {
    window.api.getWatchlist().then(setWatchlist).catch(console.error)
  }

  const categories = React.useMemo(() => {
    return Array.from(new Set(watchlist.map(w => w.category || 'Watchlist'))).sort((a, b) => {
      if (a === 'Watchlist') return -1
      if (b === 'Watchlist') return 1
      return a.localeCompare(b)
    })
  }, [watchlist])

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

    setCategorizingItem(item)
    setIsCreatingCategory(false)
    setNewCategoryName('')
  }

  const addToWatchlist = async (item: TMDBResult, category: string = 'Watchlist') => {
    try {
      await window.api.addToWatchlistExternal(toExternalVideo(item, category))
      await fetchWatchlist()
      setCategorizingItem(null)
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
          legacyItems.map((item: TMDBResult) => window.api.addToWatchlistExternal(toExternalVideo(item, item.category || 'Watchlist')))
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
    return cleanup
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

    // Optimistic status update for speed
    const newStatus = dl.status === 'paused' ? 'downloading' : 'paused'
    pauseResumePendingRef.current.set(id, { status: newStatus as ActiveDownload['status'], expiresAt: Date.now() + 5000 })
    setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: newStatus as any } : d))
    
    try {
      const success = await window.api.pauseResumeTorrent(id)
      if (!success) {
        pauseResumePendingRef.current.delete(id)
        setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: dl.status } : d))
        return
      }
    } catch (err) {
      console.error('[Download] Pause/Resume error:', err)
      pauseResumePendingRef.current.delete(id)
      setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: dl.status } : d))
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
  const queueStatusText = activeCount > 0
    ? `${activeCount} active download${activeCount === 1 ? '' : 's'}`
    : downloads.length > 0
      ? `${downloads.length} saved download${downloads.length === 1 ? '' : 's'}`
      : 'Queue is empty'
  const panelOpen = selectedItem !== null
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

  const filteredSources = React.useMemo(() => {
    return sourceView
      .filter(s => {
        // 1. Apply Hindi Only filter if active
        if (hindiOnly && !s.isHindi) return false

        // 2. TV Series specific filtering
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
  }, [sourceView, selectedSeason, selectedPackSeason, selectedEpisode, selectedItem, hindiOnly])

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
      <div className={`transition-all duration-300 ${panelOpen ? 'mr-[500px]' : ''}`}>
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
                          'bg-primary'
                        }`}
                        style={{ width: `${Math.max(0, Math.min(100, dl.progress || 0))}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted w-10 text-right">{Math.round(dl.progress)}%</span>
                    {(dl.status === 'downloading' || dl.status === 'paused' || dl.status === 'connecting') && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handlePauseResume(dl.id)}
                          disabled={pauseResumePendingRef.current.has(dl.id)}
                          className="p-1 rounded-lg text-muted hover:text-primary hover:bg-primary/10 transition-colors disabled:cursor-wait disabled:opacity-50"
                          title={dl.status === 'paused' ? 'Resume' : 'Pause'}
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
        className={`fixed top-0 right-0 z-50 flex h-full w-full max-w-[560px] flex-col border-l border-white/10 bg-[#0B0F16] shadow-2xl transform transition-transform duration-300 ease-out ${
          panelOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {selectedItem && (
          <div className="flex flex-col h-full">
            <div className="border-b border-white/10 bg-[#0F141D]">
              <div className="flex items-start justify-between gap-4 px-5 py-5">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-primary">
                    <DownloadIcon size={14} />
                    Download Sources
                  </div>
                  <h2 className="truncate text-lg font-black text-white">
                    {selectedItem.title || selectedItem.name}
                  </h2>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold text-white/65">
                      {selectedItem.media_type === 'movie' ? 'Movie' : 'TV Series'}
                    </span>
                    {selectedItem.vote_average > 0 && (
                      <span className="rounded-md border border-yellow-400/20 bg-yellow-400/10 px-2.5 py-1 text-[10px] font-bold text-yellow-300">
                        ★ {selectedItem.vote_average.toFixed(1)}
                      </span>
                    )}
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
                    {loadingSources && sourceSearchStatus.total > 0 && (
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
                  onClick={() => { setSelectedItem(null); setSources([]) }}
                  className="shrink-0 rounded-lg border border-white/10 bg-white/[0.04] p-2 text-white/55 transition-colors hover:bg-white/[0.08] hover:text-white"
                  title="Close download sources"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex items-center gap-2 border-t border-white/10 px-4 py-3">
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                  <button
                    onClick={() => setHindiOnly(!hindiOnly)}
                    className={`flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[9px] font-black uppercase tracking-widest transition-all ${
                      hindiOnly
                        ? 'border-[#FF9933]/40 bg-[#FF9933]/16 text-[#FFB76B]'
                        : 'border-white/10 bg-[#151B25] text-white/55 hover:bg-[#1A2230] hover:text-white/80'
                    }`}
                  >
                    <Languages size={11} />
                    {hindiOnly ? 'Hindi Only' : 'All Audio'}
                  </button>

                  {selectedItem?.media_type === 'tv' && (
                    <>
                      <select
                        value={selectedSeason}
                        onChange={(e) => { setSelectedSeason(e.target.value); setSelectedPackSeason('all'); setSelectedEpisode('all'); }}
                        className="min-h-8 w-[122px] shrink-0 rounded-lg border border-white/10 bg-[#151B25] px-2 text-[9px] font-black uppercase tracking-widest text-white/70 outline-none transition-colors hover:bg-[#1A2230]"
                      >
                        <option className="bg-[#10141d] text-white" value="all">All Seasons</option>
                        <option className="bg-[#10141d] text-white" value="packs">Season Packs</option>
                        {availableSeasons.map(s => (
                          <option className="bg-[#10141d] text-white" key={`season-${s}`} value={s.toString()}>
                            Season {s}
                          </option>
                        ))}
                      </select>

                      {selectedSeason === 'packs' && availablePackSeasons.length > 0 && (
                        <select
                          value={selectedPackSeason}
                          onChange={(e) => setSelectedPackSeason(e.target.value)}
                          className="min-h-8 w-[96px] shrink-0 rounded-lg border border-white/10 bg-[#151B25] px-2 text-[9px] font-black uppercase tracking-widest text-white/70 outline-none transition-colors hover:bg-[#1A2230]"
                        >
                          <option className="bg-[#10141d] text-white" value="all">Any</option>
                          {availablePackSeasons.map(s => (
                            <option className="bg-[#10141d] text-white" key={`pack-season-${s}`} value={s.toString()}>
                              Season {s}
                            </option>
                          ))}
                        </select>
                      )}

                      {selectedSeason !== 'all' && selectedSeason !== 'packs' && availableEpisodes.length > 0 && (
                        <select
                          value={selectedEpisode}
                          onChange={(e) => setSelectedEpisode(e.target.value)}
                          className="min-h-8 w-[112px] shrink-0 rounded-lg border border-white/10 bg-[#151B25] px-2 text-[9px] font-black uppercase tracking-widest text-white/70 outline-none transition-colors hover:bg-[#1A2230]"
                        >
                          <option className="bg-[#10141d] text-white" value="all">Any Episode</option>
                          {availableEpisodes.map(ep => (
                            <option className="bg-[#10141d] text-white" key={`ep-${ep}`} value={ep.toString()}>
                              Episode {ep}
                            </option>
                          ))}
                        </select>
                      )}
                    </>
                  )}
                </div>

                <button
                  onClick={() => handleSelectResult(selectedItem)}
                  disabled={loadingSources}
                  className="flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-[#151B25] px-2.5 text-[9px] font-black uppercase tracking-widest text-white/55 transition-all hover:bg-[#1A2230] hover:text-white/80 disabled:opacity-50"
                  title="Refresh sources"
                >
                  {loadingSources ? <Loader2 size={11} className="animate-spin" /> : <Search size={11} />}
                  Refresh
                </button>
              </div>
            </div>

            {/* Sources List */}
            <div className="flex-1 overflow-y-auto bg-[#080B10] px-4 py-4 flex flex-col w-full scrollbar-thin">
              {(loadingSources || !sourceSearchStatus.done) && filteredSources.length === 0 ? (
                <div className="flex h-full min-h-[340px] flex-col items-center justify-center gap-4 text-center">
                  <div className="h-12 w-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                  <p className="text-xs font-black uppercase tracking-widest text-muted">
                    {sourceSearchStatus.total > 0
                      ? `Checking ${sourceSearchStatus.completed}/${sourceSearchStatus.total} providers...`
                      : 'Scanning sources...'}
                  </p>
                </div>
              ) : filteredSources.length > 0 ? (
                <div className="space-y-3 flex-1 flex flex-col w-full">
                  <div className="space-y-2 pb-4 overflow-x-hidden">
                  {loadingSources && (
                    <div className="rounded-lg border border-primary/15 bg-primary/10 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-primary">
                      {filteredSources.length} sources found. Still checking {Math.max(0, sourceSearchStatus.total - sourceSearchStatus.completed)} providers...
                    </div>
                  )}
                  {filteredSources.map((source, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col gap-2 px-3.5 py-3 rounded-xl border border-white/10 bg-white/[0.035] transition-colors hover:border-white/15 hover:bg-white/[0.065] group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-text truncate leading-relaxed" title={source.title}>{source.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">{source.quality}</span>
                            {source.isHindi && (
                              <span className="text-[10px] font-bold text-[#FF9933] bg-[#FF9933]/10 px-1.5 py-0.5 rounded border border-[#FF9933]/20">HINDI</span>
                            )}
                            <span className="text-[10px] text-muted">{source.size}</span>
                            <span className={`text-[10px] font-bold ${
                              getTorrentSourceSpeedLabel(source) === 'FAST' ? 'text-emerald-300' :
                              getTorrentSourceSpeedLabel(source) === 'GOOD' ? 'text-green-400' :
                              getTorrentSourceSpeedLabel(source) === 'OK' ? 'text-yellow-300' :
                              'text-red-300'
                            }`}>{getTorrentSourceSpeedLabel(source)}</span>
                            <span className="text-[10px] text-green-400/70">{source.seeds}↑</span>
                            <span className="text-[10px] text-muted/50">{source.peers}↓</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleStartDownload(source)}
                          className="flex-shrink-0 p-2 rounded-lg bg-primary/10 hover:bg-primary text-primary hover:text-white transition-all duration-200"
                          title={source.title}
                        >
                          <DownloadIcon size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  </div>
                </div>
              ) : (
                <div className="flex h-full min-h-[340px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 px-8 text-center">
                  <HardDrive size={34} className="text-muted/40" />
                  <p className="text-xs font-black uppercase tracking-widest text-muted">
                    {sources.length > 0 ? 'No sources match these filters.' : 'No sources found.'}
                  </p>
                  <p className="text-[11px] text-muted/50">
                    {sources.length > 0 ? 'Try All Audio or adjust the season filters.' : 'Try a different title or check back later.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── Category Selector Modal ───────────────────────────────────────── */}
      {categorizingItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-surface border border-secondary rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-secondary flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-text">Save to...</h3>
                <p className="text-[11px] text-muted mt-0.5 truncate max-w-[200px]">
                  {categorizingItem.title || categorizingItem.name}
                </p>
              </div>
              <button
                onClick={() => setCategorizingItem(null)}
                className="p-2 rounded-xl hover:bg-white/5 text-muted hover:text-text transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-1.5 max-h-[300px] overflow-y-auto">
              {/* Default Option */}
              <button
                onClick={() => addToWatchlist(categorizingItem, 'Watchlist')}
                className="w-full flex items-center gap-3 p-3 rounded-xl transition-all group hover:bg-amber-500/10 text-muted hover:text-amber-400"
              >
                <div className="w-8 h-8 rounded-lg bg-secondary/50 flex items-center justify-center transition-colors group-hover:bg-amber-500/20">
                  <Bookmark size={14} />
                </div>
                <span className="text-sm font-medium">Watchlist</span>
                <span className="ml-auto text-[10px] opacity-0 group-hover:opacity-100 uppercase tracking-widest font-bold">Default</span>
              </button>

              {/* Existing Categories */}
              {categories.filter(cat => cat !== 'Watchlist').map(category => (
                <button
                  key={category}
                  onClick={() => addToWatchlist(categorizingItem, category)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl transition-all group hover:bg-primary/10 text-muted hover:text-primary"
                >
                  <div className="w-8 h-8 rounded-lg bg-secondary/50 flex items-center justify-center transition-colors group-hover:bg-primary/20">
                    <Bookmark size={14} />
                  </div>
                  <span className="text-sm font-medium">{category}</span>
                </button>
              ))}
            </div>

            <div className="p-4 bg-secondary/20 border-t border-secondary">
              {!isCreatingCategory ? (
                <button
                  onClick={() => setIsCreatingCategory(true)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-muted/30 text-muted hover:text-text hover:border-primary/50 transition-all text-sm font-medium"
                >
                  <Bookmark size={14} className="opacity-50" />
                  Create New Category
                </button>
              ) : (
                <div className="space-y-3 animate-in slide-in-from-bottom-2 duration-200">
                  <input
                    autoFocus
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newCategoryName.trim()) {
                        addToWatchlist(categorizingItem, newCategoryName.trim())
                      }
                      if (e.key === 'Escape') setIsCreatingCategory(false)
                    }}
                    placeholder="Category name (e.g. Business Movies)"
                    className="w-full px-4 py-2.5 bg-surface border border-primary/30 rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted/40"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsCreatingCategory(false)}
                      className="flex-1 py-2 text-xs font-medium text-muted hover:text-text transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={!newCategoryName.trim()}
                      onClick={() => addToWatchlist(categorizingItem, newCategoryName.trim())}
                      className="flex-[2] py-2 bg-primary text-black font-bold text-xs rounded-lg disabled:opacity-50 transition-all"
                    >
                      Create & Save
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Download
