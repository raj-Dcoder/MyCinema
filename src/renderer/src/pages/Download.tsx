import React, { useState, useEffect, useRef } from 'react'
import { Search, Download as DownloadIcon, Film, Tv, X, Loader2, HardDrive, CheckCircle2, AlertCircle, Pause, Play, FolderOpen, Bookmark, BookmarkCheck, ArrowLeft, Languages, RotateCcw } from 'lucide-react'

import { Video } from '../types'
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
  isHindi?: boolean
  parsedSeason?: number
  parsedEpisode?: number
  isSeasonPack?: boolean
}

interface ActiveDownload {
  id: string
  title: string
  quality: string
  progress: number
  downloadSpeed: string
  timeRemaining: string
  status: 'downloading' | 'done' | 'error' | 'paused' | 'connecting'
  size: string
  downloaded: string
  tmdbId?: number
  errorMessage?: string
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
  const [downloads, setDownloads] = useState<ActiveDownload[]>([])
  const [allVideos, setAllVideos] = useState<Video[]>([])
  const [showDownloads, setShowDownloads] = useState(false)
  const [downloadToRemove, setDownloadToRemove] = useState<string | null>(null)
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null)
  const [downloadsStorage, setDownloadsStorage] = useState<DownloadsStorage | null>(null)
  const removedIdsRef = useRef<Set<string>>(new Set())
  const searchCacheRef = useRef<Map<string, TMDBResult[]>>(new Map())
  const searchInputRef = useRef<HTMLInputElement>(null)

  const [selectedSeason, setSelectedSeason] = useState<string>('all')
  const [selectedEpisode, setSelectedEpisode] = useState<string>('all')
  const [hindiOnly, setHindiOnly] = useState<boolean>(false)

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
        
        // Only show by default if at least one is actively downloading (not paused/done/error)
        const hasActiveDownloading = active.some(a => a.status === 'downloading')
        if (hasActiveDownloading) {
          setShowDownloads(true)
        }
      }
    }).catch((err: any) => console.error('Failed to get active downloads:', err))

    const cleanup = window.api.onTorrentProgress((data: any) => {
      if (removedIdsRef.current.has(data.id)) return
      
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

  // ─── Fetch Torrent Sources ───────────────────────────────────────────────
  const handleSelectResult = async (item: TMDBResult) => {
    setSelectedItem(item)
    setLoadingSources(true)
    setSources([])
    setSelectedSeason('all')
    setSelectedEpisode('all')

    try {
      const title = item.title || item.name || ''
      const year = (item.release_date || item.first_air_date || '').slice(0, 4)
      const mediaType = item.media_type
      const result = await window.api.searchTorrentSources(title, year, mediaType, item.id)
      setSources(result || [])
    } catch (err) {
      console.error('[Download] Source fetch error:', err)
      setSources([])
    } finally {
      setLoadingSources(false)
    }
  }

  // ─── Start Download ──────────────────────────────────────────────────────
  const handleStartDownload = async (source: TorrentSource) => {
    const title = selectedItem?.title || selectedItem?.name || 'Unknown'
    try {
      await window.api.startTorrentDownload(source.magnet, `${title} (${source.quality})`, selectedItem?.id)
      setShowDownloads(true)
      refreshDownloadsStorage()
    } catch (err) {
      console.error('[Download] Start download error:', err)
    }
  }

  const handlePauseResume = async (id: string) => {
    const dl = downloads.find(d => d.id === id)
    if (!dl) return

    // Optimistic status update for speed
    const newStatus = dl.status === 'paused' ? 'downloading' : 'paused'
    setDownloads(prev => prev.map(d => d.id === id ? { ...d, status: newStatus as any } : d))
    
    try {
      await window.api.pauseResumeTorrent(id)
      if (newStatus === 'downloading') {
        setShowDownloads(true)
      }
    } catch (err) {
      console.error('[Download] Pause/Resume error:', err)
      // Note: progress handler will eventually sync the correct state if this fails
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
    setShowDownloads(true)

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

  const activeCount = downloads.filter(d => d.status === 'downloading').length
  const panelOpen = selectedItem !== null
  const storageUsedPercent = Math.round(downloadsStorage?.percentUsed || 0)

  const availableSeasons = React.useMemo(() => {
    const seasons = new Set<number>()
    sources.forEach(s => {
      if (s.parsedSeason !== undefined) seasons.add(s.parsedSeason)
    })
    return Array.from(seasons).sort((a, b) => a - b)
  }, [sources])

  const availableEpisodes = React.useMemo(() => {
    if (selectedSeason === 'all' || selectedSeason === 'packs') return []
    const eps = new Set<number>()
    sources.forEach(s => {
      if (s.parsedSeason === parseInt(selectedSeason) && s.parsedEpisode !== undefined) {
        eps.add(s.parsedEpisode)
      }
    })
    return Array.from(eps).sort((a, b) => a - b)
  }, [sources, selectedSeason])

  const filteredSources = React.useMemo(() => {
    return sources
      .filter(s => {
        // 1. Apply Hindi Only filter if active
        if (hindiOnly && !s.isHindi) return false

        // 2. TV Series specific filtering
        if (selectedItem?.media_type !== 'tv') return true
        if (selectedSeason === 'packs') return s.isSeasonPack
        if (selectedSeason !== 'all') {
          if (s.parsedSeason !== parseInt(selectedSeason) || s.isSeasonPack) return false
          if (selectedEpisode !== 'all') {
            if (s.parsedEpisode !== parseInt(selectedEpisode)) return false
          }
        }
        return true
      })
      .sort((a, b) => getTorrentSourceHealthScore(b) - getTorrentSourceHealthScore(a))
  }, [sources, selectedSeason, selectedEpisode, selectedItem, hindiOnly])

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
      {downloadToRemove && (
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
              <button
                onClick={() => handleRemoveDownload(downloadToRemove, false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 text-left transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-muted group-hover:text-primary transition-colors">
                  <X size={16} />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-text">Remove History</span>
                  <span className="text-[10px] text-muted">Keep files on disk</span>
                </div>
              </button>
              
              <div className="h-px bg-white/5 mx-2" />
              
              <button
                onClick={() => handleRemoveDownload(downloadToRemove, true)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-red-500/10 text-left transition-colors group"
              >
                <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400">
                  <AlertCircle size={16} />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-red-400">Delete Permanently</span>
                  <span className="text-[10px] text-red-400/60">Delete from disk</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className={`transition-all duration-300 ${panelOpen ? 'mr-[380px]' : ''}`}>
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold mb-1">Download</h1>
            <p className="text-sm text-muted">Search and download movies & series directly.</p>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-end gap-3">
            <button
              onClick={refreshDownloadsStorage}
              className="group flex min-w-[210px] items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-left transition-colors hover:bg-white/10"
              title={downloadsStorage?.path ? `Downloads storage: ${downloadsStorage.path}` : 'Refresh downloads storage'}
            >
              <HardDrive size={16} className="shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                {downloadsStorage?.error ? (
                  <>
                    <p className="text-xs font-semibold text-red-300">Storage unavailable</p>
                    <p className="truncate text-[10px] text-muted/70">Click to retry</p>
                  </>
                ) : downloadsStorage ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-semibold text-text">{formatBytes(downloadsStorage.free)} free</p>
                      <p className="text-[10px] text-muted">{formatBytes(downloadsStorage.total)} total</p>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full transition-[width] duration-500 ${
                          storageUsedPercent >= 90 ? 'bg-red-400' :
                          storageUsedPercent >= 75 ? 'bg-amber-400' :
                          'bg-primary'
                        }`}
                        style={{ width: `${storageUsedPercent}%` }}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-semibold text-text">Checking storage</p>
                    <p className="text-[10px] text-muted/70">Downloads folder</p>
                  </>
                )}
              </div>
            </button>

            {/* Open Downloads Folder */}
            <button
              onClick={() => window.api.openDownloadsFolder()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-muted hover:text-text hover:bg-white/10 transition-colors"
              title="Open downloads folder"
            >
              <FolderOpen size={16} />
              <span className="text-sm font-medium">Open Folder</span>
            </button>

            {downloads.length > 0 && (
              <button
                onClick={() => setShowDownloads(!showDownloads)}
                className="relative flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 transition-colors"
              >
                <DownloadIcon size={16} />
                <span className="text-sm font-medium">
                  {activeCount > 0 ? `${activeCount} Active` : 'Downloads'}
                </span>
                {activeCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                    {activeCount}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative mb-6 flex items-center gap-3">
          {results.length > 0 && (
            <button
              onClick={() => {
                setResults([])
                setQuery('')
                setSelectedItem(null)
              }}
              className="p-3.5 rounded-2xl bg-surface/80 backdrop-blur-xl border border-secondary text-muted hover:text-primary hover:border-primary/50 transition-all shadow-lg shadow-black/10 group"
              title="Back to Watchlist"
            >
              <ArrowLeft size={20} className="group-hover:-translate-x-0.5 transition-transform" />
            </button>
          )}
          <div className="flex-1 flex items-center bg-surface/80 backdrop-blur-xl border border-secondary rounded-2xl overflow-hidden focus-within:border-primary/50 transition-colors shadow-lg shadow-black/10">
            <Search size={18} className="ml-5 text-muted flex-shrink-0" />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search for a movie or series..."
              className="flex-1 px-4 py-4 bg-transparent text-text text-sm outline-none placeholder:text-muted/60"
            />
            <button
              onClick={handleSearch}
              disabled={searching || !query.trim()}
              className="px-6 py-4 bg-primary/10 hover:bg-primary/20 text-primary font-medium text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {searching ? <Loader2 size={16} className="animate-spin" /> : 'Search'}
            </button>
          </div>
        </div>

        {/* Active Downloads Panel - Moved here (Above Watchlist) */}
        {showDownloads && downloads.length > 0 && (
          <div className="bg-surface/90 backdrop-blur-xl border border-secondary rounded-2xl overflow-hidden mb-8 animate-in slide-in-from-top-4 duration-500">
            <div className="flex items-center justify-between px-5 py-3 border-b border-secondary">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <h3 className="text-sm font-semibold text-text">Active Downloads</h3>
              </div>
              <button onClick={() => setShowDownloads(false)} className="text-muted hover:text-text transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="divide-y divide-secondary/50">
              {downloads.map(dl => {
                // Optimized matching using memoized map
                const matchingVideo = (() => {
                  if (dl.tmdbId && videoMap.has(`tmdb-${dl.tmdbId}`)) {
                    return videoMap.get(`tmdb-${dl.tmdbId}`)
                  }
                  const cleanDlTitle = dl.title.replace(/\s*\([^)]*\)\s*$/, '').toLowerCase()
                  return videoMap.get(`title-${cleanDlTitle}`) || videoMap.get(`series-${cleanDlTitle}`)
                })()

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
                        <span className="text-sm font-medium text-text truncate" title={dl.title}>{dl.title}</span>
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
                          className="p-1 rounded-lg text-muted hover:text-primary hover:bg-primary/10 transition-colors"
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
                      className="p-1 rounded-lg text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                      title={(dl.status === 'downloading' || dl.status === 'connecting') ? 'Cancel & Remove' : 'Remove from List'}
                    >
                      <X size={14} />
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

        {/* Empty State */}
        {!searching && results.length === 0 && !selectedItem && (
          <div className="flex flex-col items-center justify-center py-24 text-muted space-y-4">
            <div className="w-20 h-20 rounded-full bg-surface border border-secondary flex items-center justify-center">
              <Search size={32} className="opacity-30" />
            </div>
            <p className="text-sm">Search for a movie or series to get started.</p>
            <p className="text-xs text-muted/50">Bookmark titles into the main <span className="text-amber-400/70">Watchlist</span> tab.</p>
            <p className="text-xs text-muted/50">Powered by TMDB • Downloads via P2P • Consider using a VPN for privacy</p>
          </div>
        )}
      </div>

      {/* ─── Right Side Panel ───────────────────────────────────────────────── */}
      <div
        className={`fixed top-0 right-0 h-full w-[380px] bg-surface/95 backdrop-blur-2xl border-l border-secondary z-50 transform transition-transform duration-300 ease-out ${
          panelOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {selectedItem && (
          <div className="flex flex-col h-full">
            {/* Panel Header with Backdrop */}
            <div className="relative h-44 flex-shrink-0 overflow-hidden">
              {selectedItem.backdrop_path && (
                <img
                  src={`${TMDB_IMG}/w780${selectedItem.backdrop_path}`}
                  className="absolute inset-0 w-full h-full object-cover opacity-40"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/80 to-transparent" />
              
              {/* Close Button */}
              <button
                onClick={() => { setSelectedItem(null); setSources([]) }}
                className="absolute top-4 right-4 z-20 p-2 rounded-full bg-black/40 backdrop-blur-sm text-white/80 hover:text-white hover:bg-black/60 transition-colors"
              >
                <X size={16} />
              </button>

              <div className="relative z-10 flex flex-col justify-end h-full px-5 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  {selectedItem.media_type === 'movie' ? <Film size={13} className="text-primary" /> : <Tv size={13} className="text-primary" />}
                  <span className="text-[10px] uppercase tracking-widest text-primary font-bold">
                    {selectedItem.media_type === 'movie' ? 'Movie' : 'TV Series'}
                  </span>
                  {selectedItem.vote_average > 0 && (
                    <span className="text-[10px] text-yellow-400 font-bold ml-auto">★ {selectedItem.vote_average.toFixed(1)}</span>
                  )}
                </div>
                <h2 className="text-base font-bold text-text leading-tight">{selectedItem.title || selectedItem.name}</h2>
                <p className="text-[11px] text-muted mt-1 line-clamp-2 leading-relaxed">{selectedItem.overview}</p>
              </div>
            </div>

            {/* Sources List */}
            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col w-full">
              {loadingSources ? (
                <div className="flex items-center justify-center py-12 gap-3 text-muted">
                  <Loader2 size={18} className="animate-spin" />
                  <span className="text-sm">Finding sources...</span>
                </div>
              ) : sources.length > 0 ? (
                <div className="space-y-3 flex-1 flex flex-col w-full">
                  <div className="flex items-center justify-between px-1 shrink-0">
                    <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                      {filteredSources.length} Source{filteredSources.length !== 1 ? 's' : ''} Available
                    </h3>
                    
                    <button 
                      onClick={() => setHindiOnly(!hindiOnly)}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold transition-all border ${
                        hindiOnly 
                          ? 'bg-[#FF9933]/20 text-[#FF9933] border-[#FF9933]/30 shadow-sm shadow-[#FF9933]/10' 
                          : 'bg-white/5 text-muted/60 border-white/10 hover:text-muted hover:bg-white/10'
                      }`}
                    >
                      <Languages size={10} />
                      {hindiOnly ? 'HINDI ONLY' : 'ALL AUDIO'}
                    </button>
                  </div>

                  {selectedItem?.media_type === 'tv' && (
                    <div className="flex items-center gap-2 pb-1 shrink-0">
                      <select 
                        value={selectedSeason} 
                        onChange={(e) => { setSelectedSeason(e.target.value); setSelectedEpisode('all'); }}
                        className="bg-surface border border-secondary text-text text-[11px] font-medium rounded px-2 py-1 outline-none hover:bg-white/[0.03] transition-colors cursor-pointer"
                      >
                        <option className="bg-surface text-text" value="all">All Seasons</option>
                        <option className="bg-surface text-text" value="packs">Full Season Packs (1080p+)</option>
                        {availableSeasons.map(s => <option className="bg-surface text-text" key={`season-${s}`} value={s.toString()}>Season {s}</option>)}
                      </select>
                      
                      {selectedSeason !== 'all' && selectedSeason !== 'packs' && availableEpisodes.length > 0 && (
                        <select 
                          value={selectedEpisode} 
                          onChange={(e) => setSelectedEpisode(e.target.value)}
                          className="bg-surface border border-secondary text-text text-[11px] font-medium rounded px-2 py-1 outline-none hover:bg-white/[0.03] transition-colors cursor-pointer"
                        >
                          <option className="bg-surface text-text" value="all">Any Episode</option>
                          {availableEpisodes.map(ep => <option className="bg-surface text-text" key={`ep-${ep}`} value={ep.toString()}>Episode {ep}</option>)}
                        </select>
                      )}
                    </div>
                  )}

                  <div className="space-y-2 pb-4 overflow-x-hidden">
                  {filteredSources.map((source, idx) => (
                    <div
                      key={idx}
                      className="flex flex-col gap-2 px-3.5 py-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-secondary/30 transition-colors group"
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
                <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted">
                  <HardDrive size={28} className="opacity-30" />
                  <p className="text-sm">No sources found.</p>
                  <p className="text-[11px] text-muted/50">Try a different title or check back later.</p>
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
