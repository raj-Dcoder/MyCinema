import React, { useState, useMemo } from 'react'
import {
  Play,
  Pause,
  RotateCcw,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  Loader2,
  MoreVertical,
  Download as DownloadIcon,
  Check,
  Search,
  X,
  Info
} from 'lucide-react'
import { Video } from '../types'
import { DownloadOptionsGuide, ConcurrentDownloadsGuide } from './FeatureGuides'
import { parseTorrentTitle, parseSpeedToBytes, formatTransferSpeed } from '../utils/torrentTitleParser'

export interface ActiveDownload {
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
  downloadPath?: string
  errorMessage?: string
  addedAt?: string
  queueOrder?: number | null
  fileExists?: boolean
}

export interface DownloadsStorage {
  path: string
  free: number
  total: number
  used: number
  percentUsed: number
  error?: string
}

interface DownloadQueueProps {
  downloads: ActiveDownload[]
  allVideos: Video[]
  maxConcurrent: number
  downloadsStorage: DownloadsStorage | null
  storageUsedPercent: number
  onMaxConcurrentChange: (value: number) => void
  onPauseResume: (id: string) => void
  onRetry: (id: string) => void
  onPlay?: (video: Video) => void
  onShowDetail?: (video: Video) => void
  onRequestRemove: (id: string) => void
  onOpenFolder: (targetPath?: string) => void
  refreshDownloadsStorage: () => void
  loadingDetailId: string | null
  setLoadingDetailId: (id: string | null) => void
  pauseResumePendingRef: React.MutableRefObject<Map<string, { status: ActiveDownload['status']; expiresAt: number }>>
  setDownloads: React.Dispatch<React.SetStateAction<ActiveDownload[]>>
  removedIdsRef: React.MutableRefObject<Set<string>>
}

const CONCURRENT_OPTIONS = [1, 2, 3, 5, 0]

const getDownloadStatusRank = (status: ActiveDownload['status'] | 'pending') => {
  if (status === 'downloading' || status === 'connecting') return 0
  if (status === 'queued') return 1
  if (status === 'paused' || status === 'error') return 2
  return 3 // 'done'
}

const getQueueOrder = (download: ActiveDownload) => {
  const order = Number(download.queueOrder)
  return Number.isFinite(order) && order > 0 ? order : Number.MAX_SAFE_INTEGER
}

const getDownloadTime = (download: ActiveDownload) => {
  const time = download.addedAt ? new Date(download.addedAt).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

const compareQueueOrder = (a: ActiveDownload, b: ActiveDownload) => {
  const orderDiff = getQueueOrder(a) - getQueueOrder(b)
  if (orderDiff !== 0) return orderDiff
  return getDownloadTime(a) - getDownloadTime(b)
}

export const DownloadQueue: React.FC<DownloadQueueProps> = ({
  downloads,
  allVideos,
  maxConcurrent,
  onMaxConcurrentChange,
  onPauseResume,
  onRetry,
  onPlay,
  onShowDetail,
  onRequestRemove,
  onOpenFolder,
  pauseResumePendingRef,
  setDownloads,
  removedIdsRef
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'downloading' | 'queued' | 'completed' | 'paused'>('all')
  const [filterQuery, setFilterQuery] = useState('')

  // Video map for instant metadata matching
  const videoMap = useMemo(() => {
    const map = new Map<string, Video>()
    for (const v of allVideos) {
      if (v.tmdb_id) map.set(`tmdb-${v.tmdb_id}`, v)
      if (v.title) {
        const cleanTitle = v.title.replace(/\s*\([^)]*\)\s*$/, '').toLowerCase()
        map.set(`title-${cleanTitle}`, v)
      }
      if (v.series_name) {
        const cleanSeries = v.series_name.replace(/\s*\([^)]*\)\s*$/, '').toLowerCase()
        map.set(`series-${cleanSeries}`, v)
      }
    }
    return map
  }, [allVideos])

  // Aggregate transfer speed
  const aggregateSpeed = useMemo(() => {
    const totalBytes = downloads
      .filter(d => d.status === 'downloading')
      .reduce((acc, d) => acc + parseSpeedToBytes(d.downloadSpeed), 0)
    return formatTransferSpeed(totalBytes)
  }, [downloads])

  // Status counts
  const activeCount = useMemo(() => downloads.filter(d => d.status === 'downloading' || d.status === 'connecting').length, [downloads])
  const completedCount = useMemo(() => downloads.filter(d => d.status === 'done').length, [downloads])
  const pausedCount = useMemo(() => downloads.filter(d => d.status === 'paused').length, [downloads])
  const queuedCount = useMemo(() => downloads.filter(d => d.status === 'queued' || d.status === 'pending').length, [downloads])

  // Queue positions map
  const queuePositions = useMemo(() => {
    const ordered = downloads
      .filter(d => d.status === 'queued')
      .sort(compareQueueOrder)
    const map = new Map<string, number>()
    ordered.forEach((d, i) => map.set(d.id, i + 1))
    return map
  }, [downloads])

  // Filtered & Sorted downloads
  const displayedDownloads = useMemo(() => {
    return [...downloads]
      .filter(dl => {
        // Tab filtering
        if (activeTab === 'downloading') return dl.status === 'downloading' || dl.status === 'connecting'
        if (activeTab === 'queued') return dl.status === 'queued' || dl.status === 'pending'
        if (activeTab === 'completed') return dl.status === 'done'
        if (activeTab === 'paused') return dl.status === 'paused' || dl.status === 'error'
        return true
      })
      .filter(dl => {
        // Search query filtering within queue
        if (!filterQuery.trim()) return true
        const query = filterQuery.toLowerCase()
        const titleMatch = (dl.name || dl.title || '').toLowerCase().includes(query)
        return titleMatch
      })
      .sort((a, b) => {
        const statusDiff = getDownloadStatusRank(a.status) - getDownloadStatusRank(b.status)
        if (statusDiff !== 0) return statusDiff
        if (a.status === 'queued' && b.status === 'queued') {
          return compareQueueOrder(a, b)
        }
        return getDownloadTime(b) - getDownloadTime(a)
      })
  }, [downloads, activeTab, filterQuery])

  // Batch actions
  const handlePauseAll = async () => {
    const toPause = downloads.filter(d => d.status === 'downloading' || d.status === 'connecting' || d.status === 'queued')
    for (const item of toPause) {
      await window.api.pauseResumeTorrent(item.id).catch(() => {})
    }
  }

  const handleResumeAll = async () => {
    const toResume = downloads.filter(d => d.status === 'paused')
    for (const item of toResume) {
      await window.api.pauseResumeTorrent(item.id).catch(() => {})
    }
  }

  const handleClearCompleted = async () => {
    const doneItems = downloads.filter(d => d.status === 'done')
    if (doneItems.length === 0) return
    const doneIds = new Set(doneItems.map(d => d.id))
    doneIds.forEach(id => removedIdsRef.current.add(id))
    setDownloads(prev => prev.filter(d => !doneIds.has(d.id)))
    for (const item of doneItems) {
      await window.api.removeDownload(item.id, false).catch(() => {})
    }
  }

  // Robust Retry with immediate 0% state sync
  const handleRetryDownload = (id: string) => {
    setDownloads(prev => prev.map(d => d.id === id ? {
      ...d,
      progress: 0,
      downloaded: '0 B',
      downloadSpeed: '0 B/s',
      timeRemaining: '—',
      status: 'queued'
    } : d))
    onRetry(id)
  }

  // Direct video playback: starts movie or series (Episode 1)
  const handleDirectPlay = (dl: ActiveDownload, matchingVideo?: Video, parsedTitle?: { cleanTitle: string }) => {
    if (matchingVideo) {
      // If this is a TV series, find all episodes and start Episode 1 (or earliest episode)
      if (matchingVideo.type === 'series' || matchingVideo.series_name) {
        const seriesEpisodes = allVideos
          .filter(v => (v.tmdb_id && v.tmdb_id === matchingVideo.tmdb_id) || (v.series_name && v.series_name.toLowerCase() === matchingVideo.series_name?.toLowerCase()))
          .sort((a, b) => {
            const sDiff = (a.season || 1) - (b.season || 1)
            if (sDiff !== 0) return sDiff
            return (a.episode || 1) - (b.episode || 1)
          })
        if (seriesEpisodes.length > 0) {
          onPlay?.(seriesEpisodes[0])
          return
        }
      }
      onPlay?.(matchingVideo)
      return
    }

    // Direct playback fallback if file is still on disk but not yet indexed in library DB
    if (dl.downloadPath) {
      const fallbackVideo: Video = {
        id: -Date.now(),
        title: parsedTitle?.cleanTitle || dl.title || 'Downloaded Video',
        file_path: dl.downloadPath,
        type: 'movie',
        category: 'Movies',
        duration: 0,
        is_favorite: false,
        is_watchlist: false,
        updated_at: new Date().toISOString()
      }
      onPlay?.(fallbackVideo)
    }
  }

  return (
    <div className="download-queue-container bg-[#12161F]/90 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden mb-8 shadow-2xl transition-all duration-300">
      {/* ─── Top Telemetry & Control Bar: Guaranteed Single-Row (No Wrapping) ───── */}
      <div className="download-queue-header flex items-center justify-between gap-3 px-5 py-3 border-b border-white/[0.08] bg-white/[0.015] whitespace-nowrap overflow-x-auto scrollbar-none">
        {/* Left: Queue Title, Sub-Navigation Tabs & Live Speed Telemetry */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 mr-1 shrink-0">
            <span
              className={`h-2.5 w-2.5 rounded-full transition-all duration-500 ${
                activeCount > 0 ? 'bg-primary ring-4 ring-primary/20 animate-pulse' : 'bg-white/20'
              }`}
            />
            <h3 className="text-sm font-bold text-white tracking-wide">Downloads</h3>
          </div>

          {/* Sub-Navigation Tabs */}
          <div className="download-queue-tabs flex items-center bg-black/40 p-1 rounded-xl border border-white/10 text-xs font-semibold shrink-0">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1 rounded-lg transition-all ${
                activeTab === 'all'
                  ? 'active-all bg-white/15 text-white shadow-sm'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              All <span className="text-[10px] opacity-60 ml-0.5">{downloads.length}</span>
            </button>
            <button
              onClick={() => setActiveTab('downloading')}
              className={`px-3 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'downloading'
                  ? 'active-downloading bg-primary/20 text-primary border border-primary/30 shadow-sm'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              Downloading
              {activeCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-primary text-white text-[9px] font-bold">
                  {activeCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('queued')}
              className={`px-3 py-1 rounded-lg transition-all ${
                activeTab === 'queued'
                  ? 'active-queued bg-sky-500/20 text-sky-300 border border-sky-500/30 shadow-sm'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              Queued <span className="text-[10px] opacity-60 ml-0.5">{queuedCount}</span>
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={`px-3 py-1 rounded-lg transition-all ${
                activeTab === 'completed'
                  ? 'active-completed bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                  : 'text-white/50 hover:text-white/80'
              }`}
            >
              Completed <span className="text-[10px] opacity-60 ml-0.5">{completedCount}</span>
            </button>
            {pausedCount > 0 && (
              <button
                onClick={() => setActiveTab('paused')}
                className={`px-3 py-1 rounded-lg transition-all ${
                  activeTab === 'paused'
                    ? 'active-paused bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm'
                    : 'text-white/50 hover:text-white/80'
                }`}
              >
                Paused <span className="text-[10px] opacity-60 ml-0.5">{pausedCount}</span>
              </button>
            )}
          </div>

          {/* Speed Telemetry Tag placed right of the Tabs */}
          {activeCount > 0 && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/25 text-xs font-bold text-primary shadow-sm shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              <span>↓ {aggregateSpeed}</span>
            </div>
          )}
        </div>

        {/* Right: Search Filter, Batch Actions & Concurrency Selector */}
        <div className="flex items-center gap-2 text-xs shrink-0">
          {/* Quick Search within queue (if more than 3 items) */}
          {downloads.length > 3 && (
            <div className="download-queue-search relative flex items-center bg-black/30 border border-white/10 rounded-lg px-2.5 py-1 text-white/70 focus-within:border-white/25 focus-within:text-white shrink-0">
              <Search size={12} className="mr-1.5 opacity-50" />
              <input
                type="text"
                placeholder="Filter items..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-[11px] text-white placeholder:text-white/30 w-24 focus:w-32 transition-all"
              />
              {filterQuery && (
                <button onClick={() => setFilterQuery('')} className="opacity-50 hover:opacity-100">
                  <X size={11} />
                </button>
              )}
            </div>
          )}

          {/* Smart Batch Actions */}
          {activeCount > 0 && (
            <button
              onClick={handlePauseAll}
              className="download-queue-btn flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white transition-colors shrink-0"
              title="Pause all active downloads"
            >
              <Pause size={12} />
              <span>Pause All</span>
            </button>
          )}

          {activeCount === 0 && pausedCount > 0 && (
            <button
              onClick={handleResumeAll}
              className="download-queue-btn flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors shrink-0"
              title="Resume all paused downloads"
            >
              <Play size={12} fill="currentColor" />
              <span>Resume All</span>
            </button>
          )}

          {completedCount > 0 && (
            <button
              onClick={handleClearCompleted}
              className="download-queue-btn flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-colors shrink-0"
              title="Remove finished downloads from this list"
            >
              <Check size={12} />
              <span>Clear Done</span>
            </button>
          )}

          {/* Concurrency Selector */}
          <div className="flex items-center gap-1.5 pl-1 text-[11px] font-medium text-white/60 shrink-0">
            <span>At once:</span>
            <select
              value={maxConcurrent}
              onChange={(e) => void onMaxConcurrentChange(Number(e.target.value))}
              className="download-queue-select rounded-lg border border-white/10 bg-black/50 px-2 py-1 text-[11px] font-bold text-white outline-none hover:border-white/25 focus:border-primary cursor-pointer"
              aria-label="Maximum simultaneous downloads"
            >
              {CONCURRENT_OPTIONS.map(n => (
                <option key={n} value={n}>{n === 0 ? 'Unlimited' : n}</option>
              ))}
            </select>
            <ConcurrentDownloadsGuide />
          </div>
        </div>
      </div>

      {/* ─── Downloads List ──────────────────────────────────────────────────── */}
      {displayedDownloads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
          <DownloadIcon size={24} className="text-white/20 mb-2" />
          <p className="text-sm font-semibold text-white/60">
            {filterQuery ? `No downloads match "${filterQuery}"` : `No ${activeTab} downloads`}
          </p>
          {activeTab !== 'all' && (
            <button
              onClick={() => { setActiveTab('all'); setFilterQuery('') }}
              className="mt-2 text-xs text-primary hover:underline"
            >
              View all downloads ({downloads.length})
            </button>
          )}
        </div>
      ) : (
        <div className="download-queue-list divide-y divide-white/[0.05]">
          {displayedDownloads.map((dl, idx) => {
            const parsed = parseTorrentTitle(dl.name || dl.title || '', dl.title)
            const matchingVideo = (() => {
              if (dl.tmdbId && videoMap.has(`tmdb-${dl.tmdbId}`)) {
                return videoMap.get(`tmdb-${dl.tmdbId}`)
              }
              const cleanDlTitle = (parsed.cleanTitle || dl.title || '').toLowerCase().trim()
              if (videoMap.has(`title-${cleanDlTitle}`)) return videoMap.get(`title-${cleanDlTitle}`)
              if (videoMap.has(`series-${cleanDlTitle}`)) return videoMap.get(`series-${cleanDlTitle}`)

              // Match by prefix or contains in library
              for (const v of allVideos) {
                const vTitle = (v.title || '').toLowerCase().trim()
                if (vTitle && (vTitle === cleanDlTitle || cleanDlTitle.startsWith(vTitle) || vTitle.startsWith(cleanDlTitle))) {
                  return v
                }
              }
              return undefined
            })()

            const targetVideo: Video = matchingVideo || {
              id: -Date.now(),
              title: parsed.cleanTitle || dl.title || 'Movie',
              file_path: dl.downloadPath || '',
              tmdb_id: dl.tmdbId,
              type: 'movie',
              category: 'Movies',
              duration: 0,
              is_favorite: false,
              is_watchlist: false,
              updated_at: new Date().toISOString()
            }

            const isDownloading = dl.status === 'downloading'
            const isConnecting = dl.status === 'connecting'
            const isQueued = dl.status === 'queued'
            const isDone = dl.status === 'done'
            const isPaused = dl.status === 'paused'
            const isError = dl.status === 'error'

            return (
              <div
                key={dl.id}
                className={`download-queue-row group px-5 py-3.5 transition-colors ${
                  isDownloading
                    ? 'is-downloading bg-primary/[0.015] hover:bg-primary/[0.03]'
                    : isDone
                      ? 'hover:bg-white/[0.02]'
                      : 'hover:bg-white/[0.015]'
                }`}
              >
                {/* Top line: Status Icon (Clean semantic indicator), Title, Badges, and Stats */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Far Left: Status Icon (NO duplicate green play button!) */}
                    {isDone ? (
                      <div
                        className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                        title="Download Complete • Ready to play"
                      >
                        <CheckCircle2 size={15} />
                      </div>
                    ) : isDownloading ? (
                      <div className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-xl bg-primary/10 text-primary border border-primary/20">
                        <DownloadIcon size={14} className="animate-bounce" />
                      </div>
                    ) : isConnecting ? (
                      <div className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        <Loader2 size={14} className="animate-spin" />
                      </div>
                    ) : isQueued ? (
                      <div className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-xl bg-sky-500/10 text-sky-300 border border-sky-500/20 text-[11px] font-black">
                        #{queuePositions.get(dl.id) || 'Q'}
                      </div>
                    ) : isPaused ? (
                      <button
                        onClick={() => onPauseResume(dl.id)}
                        disabled={pauseResumePendingRef.current.has(dl.id)}
                        className="download-queue-resume-btn flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-xl bg-white/5 text-amber-400 hover:bg-amber-400/20 transition-all"
                        title="Resume download"
                      >
                        <Play size={13} fill="currentColor" className="ml-0.5" />
                      </button>
                    ) : isError ? (
                      <button
                        onClick={() => handleRetryDownload(dl.id)}
                        className="download-queue-retry-btn flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
                        title="Retry download"
                      >
                        <RotateCcw size={13} />
                      </button>
                    ) : (
                      <div className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-xl bg-white/5 text-white/40">
                        <DownloadIcon size={14} />
                      </div>
                    )}

                    {/* Title & Metadata Badges */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="download-queue-title text-sm font-semibold truncate max-w-md transition-colors cursor-pointer hover:text-primary text-white"
                          title={dl.name || dl.title}
                          onClick={() => onShowDetail?.(targetVideo)}
                        >
                          {parsed.cleanTitle}
                          {parsed.year && (
                            <span className="text-white/45 font-medium ml-1.5">({parsed.year})</span>
                          )}
                        </span>

                        {/* Format & Quality Badges */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {parsed.quality && (
                            <span className="download-badge download-badge-quality px-1.5 py-0.2 rounded bg-sky-500/15 border border-sky-500/25 text-[10px] font-bold text-sky-300">
                              {parsed.quality}
                            </span>
                          )}
                          {parsed.source && (
                            <span className="download-badge download-badge-source px-1.5 py-0.2 rounded bg-white/5 border border-white/10 text-[10px] font-medium text-white/70">
                              {parsed.source}
                            </span>
                          )}
                          {parsed.codec && (
                            <span className="download-badge download-badge-codec px-1.5 py-0.2 rounded bg-violet-500/10 border border-violet-500/20 text-[10px] font-medium text-violet-300">
                              {parsed.codec}
                            </span>
                          )}
                          {parsed.audio && parsed.audio.map((aud, i) => (
                            <span key={i} className="download-badge download-badge-audio px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-medium text-emerald-300">
                              {aud}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Subtitle details: Status message & Raw release hint */}
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-white/40">
                        {isDone ? (
                          <span className="text-white/50 font-medium">
                            {dl.size || 'Downloaded'} • Ready to watch
                          </span>
                        ) : isDownloading ? (
                          <span className="text-white/60 font-medium">
                            {dl.downloaded || '0 B'} of {dl.size || '--'}
                          </span>
                        ) : isQueued ? (
                          <span className="text-sky-300/80 font-medium">
                            {dl.size ? `${dl.size} • ` : ''}Waiting for download slot (FIFO)
                          </span>
                        ) : isPaused ? (
                          <span className="text-amber-400/80 font-medium">
                            {dl.downloaded ? `${dl.downloaded} of ${dl.size} • ` : ''}Paused
                          </span>
                        ) : isConnecting ? (
                          <span className="text-amber-400/80 font-medium">
                            Resolving torrent metadata...
                          </span>
                        ) : isError ? (
                          <span className="text-red-400/90 font-medium">
                            {dl.errorMessage || 'Download interrupted'}
                          </span>
                        ) : null}

                        {/* Raw filename tooltip helper */}
                        <span className="hidden sm:inline-block max-w-[200px] truncate opacity-30 text-[10px]" title={dl.name || dl.title}>
                          • {dl.name || dl.title}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right side: Telemetry stats and Action Buttons */}
                  <div className="flex items-center gap-3 shrink-0">
                    {/* Live Speed / ETA */}
                    {isDownloading && (
                      <div className="flex flex-col items-end text-right">
                        <span className="text-xs font-bold text-primary flex items-center gap-1">
                          ↓ {dl.downloadSpeed}
                        </span>
                        <span className="text-[10px] text-white/40 font-medium">
                          {dl.timeRemaining && dl.timeRemaining !== '-' ? `ETA ${dl.timeRemaining}` : 'calculating...'}
                        </span>
                      </div>
                    )}

                    {isConnecting && (
                      <span className="text-xs font-semibold text-amber-400">
                        Connecting...
                      </span>
                    )}

                    {isQueued && (
                      <span className="text-xs font-medium text-sky-300/80">
                        Queued
                      </span>
                    )}

                    {isDone && (
                      <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                        <CheckCircle2 size={14} />
                        <span>Complete</span>
                      </div>
                    )}

                    {/* Quick Inline Actions */}
                    <div className="flex items-center gap-1.5 pl-2">
                      {isDone && (
                        <>
                          {/* Direct Play button: starts playback instantly! */}
                          <button
                            onClick={() => handleDirectPlay(dl, matchingVideo, parsed)}
                            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary hover:bg-primary/90 text-white text-xs font-bold transition-all shadow-sm shadow-primary/20 hover:scale-[1.02]"
                            title={matchingVideo?.type === 'series' || matchingVideo?.series_name ? "Play Episode 1" : "Play Movie"}
                          >
                            <Play size={11} fill="currentColor" />
                            <span>Play</span>
                          </button>

                          {/* Info button to open detail screen - ALWAYS visible for all completed titles */}
                          <button
                            onClick={() => onShowDetail?.(targetVideo)}
                            className="download-queue-icon-btn p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                            title="View Details"
                          >
                            <Info size={14} />
                          </button>

                          {/* Open Folder shortcut (sole folder button - non-redundant!) */}
                          <button
                            onClick={() => onOpenFolder(dl.downloadPath)}
                            className="download-queue-icon-btn p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                            title="Show file in folder"
                          >
                            <FolderOpen size={14} />
                          </button>
                        </>
                      )}

                      {/* Pause / Resume button */}
                      {(isDownloading || isPaused || isConnecting || isQueued) && (
                        <button
                          onClick={() => onPauseResume(dl.id)}
                          disabled={pauseResumePendingRef.current.has(dl.id)}
                          className="download-queue-icon-btn p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors disabled:opacity-40"
                          title={isPaused ? 'Resume' : isQueued ? 'Remove from queue (pause)' : 'Pause'}
                        >
                          {isPaused ? <Play size={13} fill="currentColor" /> : <Pause size={13} />}
                        </button>
                      )}

                      {/* Retry button for error */}
                      {isError && (
                        <button
                          onClick={() => handleRetryDownload(dl.id)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold text-red-300 bg-red-500/10 hover:bg-red-500/20 transition-colors"
                          title="Retry download"
                        >
                          <RotateCcw size={12} />
                          <span>Retry</span>
                        </button>
                      )}

                      {/* More Options Dropdown Button (Share & Remove) */}
                      <button
                        id={`dl-btn-${dl.id}`}
                        onClick={() => onRequestRemove(dl.id)}
                        className="download-queue-icon-btn p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors relative"
                        title="More Options"
                      >
                        <MoreVertical size={14} />
                        {idx === 0 && <DownloadOptionsGuide />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Bottom line: Progress Bar (Only for active or non-completed downloads) */}
                {(!isDone || isDownloading || isConnecting) && (
                  <div className="mt-2.5 flex items-center gap-3">
                    <div className="download-queue-progress-track flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-[width] duration-300 ease-out ${
                          isDone ? 'bg-emerald-400' :
                          isError ? 'bg-red-400' :
                          isConnecting ? 'bg-amber-400' :
                          isQueued ? 'bg-sky-400/50' :
                          isPaused ? 'bg-amber-400/70' :
                          'bg-primary'
                        }`}
                        style={{ width: `${Math.max(0, Math.min(100, dl.progress || 0))}%` }}
                      />
                    </div>
                    <span className="download-queue-percent text-[11px] font-semibold text-white/50 w-9 text-right tabular-nums">
                      {Math.max(0, Math.min(100, Math.round(dl.progress || 0)))}%
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
export default React.memo(DownloadQueue)
