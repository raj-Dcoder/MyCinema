import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { 
  Play, 
  Video as VideoIcon, 
  Search, 
  ArrowUpDown, 
  Shuffle, 
  CirclePlay, 
  X, 
  Check, 
  MoreVertical, 
  Folder, 
  LayoutGrid, 
  List, 
  Info, 
  Edit3, 
  Trash2, 
  Copy, 
  Sparkles, 
  AlertTriangle, 
  Eye, 
  EyeOff, 
  FolderOpen, 
  Clock, 
  HardDrive,
  CheckSquare,
  Square,
  Loader2
} from 'lucide-react'
import { Video } from '../types'
import HorizontalScrollRow from '../components/HorizontalScrollRow'
import { useTheme } from '../theme/ThemeContext'

interface VideosProps {
  onPlay: (video: Video) => void
}

const ONE_HOUR = 3600

function formatDuration(seconds?: number): string {
  if (!seconds) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  if (m >= 60) {
    const h = Math.floor(m / 60)
    const rem = m % 60
    return `${h}h ${rem.toString().padStart(2, '0')}m`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 MB'
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`
  return `${bytes} B`
}

function formatRelativeDate(timestamp?: number | string): string {
  if (!timestamp) return 'Recently'
  const time = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp
  if (isNaN(time) || time <= 0) return 'Recently'
  const diffSec = Math.floor((Date.now() - time) / 1000)
  if (diffSec < 60) return 'Just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  if (diffSec < 86400 * 2) return 'Yesterday'
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`
  
  const date = new Date(time)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function getParentFolderName(filePath: string): string {
  if (!filePath) return 'Videos'
  const norm = filePath.replace(/\\/g, '/')
  const parts = norm.split('/')
  if (parts.length >= 2) {
    return parts[parts.length - 2] || 'Videos'
  }
  return 'Videos'
}

function getFileExtension(filePath: string): string {
  if (!filePath) return 'MP4'
  const norm = filePath.replace(/\\/g, '/')
  const base = norm.split('/').pop() || ''
  const dotIdx = base.lastIndexOf('.')
  if (dotIdx > 0) {
    return base.substring(dotIdx + 1).toUpperCase()
  }
  return 'MP4'
}

function getResolutionBadge(video: Video): string {
  // Infer or use available resolution signals
  const path = (video.file_path || '').toLowerCase()
  if (path.includes('2160p') || path.includes('4k') || path.includes('uhd')) return '4K UHD'
  if (path.includes('1440p') || path.includes('2k')) return '1440p'
  if (path.includes('1080p') || path.includes('fhd')) return '1080p'
  if (path.includes('720p') || path.includes('hd')) return '720p'
  if (path.includes('60fps') || path.includes('60p')) return 'HD 60'
  if (video.file_size && video.duration) {
    const mbps = (video.file_size * 8) / (video.duration * 1e6)
    if (mbps > 20) return '4K UHD'
    if (mbps > 8) return '1080p'
  }
  return 'HD'
}

function getResolutionBadgeClass(badge: string, isLight: boolean): string {
  if (isLight) {
    if (badge.includes('4K')) {
      return 'bg-purple-50 text-purple-700 border border-purple-200/90 font-mono font-bold text-[10px]'
    }
    if (badge.includes('1080p') || badge.includes('FHD')) {
      return 'bg-blue-50 text-blue-700 border border-blue-200/90 font-mono font-bold text-[10px]'
    }
    return 'bg-amber-50 text-amber-800 border border-amber-300/80 font-mono font-bold text-[10px]'
  }
  return 'bg-black/60 text-amber-300 border border-amber-400/20 text-[10px] font-mono font-bold'
}

// ─── Single Video Card (Grid View) ──────────────────────────────────────────
const VideoGridCard: React.FC<{
  video: Video
  onPlay: (v: Video) => void
  onContextMenu: (e: React.MouseEvent, v: Video) => void
  onInspect: (v: Video) => void
  isContinueWatching?: boolean
}> = ({ video, onPlay, onContextMenu, onInspect, isContinueWatching }) => {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const [isHovered, setIsHovered] = useState(false)
  const [canPlayPreview, setCanPlayPreview] = useState(false)
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  const posterUrl = video.poster_path
    ? (video.poster_path.startsWith('http')
        ? video.poster_path
        : `media://file/${encodeURIComponent(video.poster_path)}`)
    : null

  const handleMouseEnter = () => {
    setIsHovered(true)
    hoverTimerRef.current = setTimeout(() => {
      setCanPlayPreview(true)
    }, 350) // 350ms debounce prevents decoder thrashing on rapid mouse movement
  }

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current)
        hoverTimerRef.current = null
      }
    }
  }, [])

  const handleMouseLeave = () => {
    setIsHovered(false)
    setCanPlayPreview(false)
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (canPlayPreview && videoRef.current && (video.duration ?? 0) > 0) {
      const duration = video.duration!
      const steps = 6
      let currentStep = 1
      videoRef.current.currentTime = (currentStep / (steps + 1)) * duration

      interval = setInterval(() => {
        currentStep = (currentStep % steps) + 1
        if (videoRef.current) {
          videoRef.current.currentTime = (currentStep / (steps + 1)) * duration
        }
      }, 700)
    }
    return () => clearInterval(interval)
  }, [canPlayPreview, video.duration])

  const progressPercent = video.last_watched_time && video.duration
    ? (video.last_watched_time / video.duration) * 100
    : 0

  const folderName = video.folder_name || getParentFolderName(video.file_path)
  const ext = getFileExtension(video.file_path)
  const resBadge = getResolutionBadge(video)

  return (
    <div
      className={`group relative flex flex-col rounded-2xl border transition-all duration-300 overflow-hidden cursor-pointer ${
        isLight
          ? 'border-slate-200/90 bg-white shadow-xs hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10'
          : 'border-white/10 bg-[#0e141f] hover:border-primary/50 hover:shadow-2xl hover:shadow-primary/20'
      }`}
      onClick={() => onPlay(video)}
      onContextMenu={(e) => onContextMenu(e, video)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* 16:9 Thumbnail Area */}
      <div className="relative aspect-video w-full bg-slate-900 overflow-hidden">
        {canPlayPreview ? (
          <video
            ref={videoRef}
            src={`media://file/${encodeURIComponent(video.file_path)}`}
            className="h-full w-full object-cover"
            muted
            playsInline
            preload="metadata"
          />
        ) : posterUrl ? (
          <img
            src={posterUrl}
            alt={video.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-secondary/60 to-background">
            <VideoIcon size={38} className="text-white/20" />
          </div>
        )}

        {/* Top Badges */}
        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10">
          <span className="px-2 py-0.5 rounded bg-black/80 backdrop-blur-md text-[9px] font-black uppercase tracking-wider text-white border border-white/10">
            {ext}
          </span>
        </div>
        <div className="absolute top-2.5 right-2.5 z-10">
          <span className="px-2 py-0.5 rounded bg-black/80 backdrop-blur-md text-[9px] font-black uppercase tracking-wider text-amber-300 border border-amber-400/20">
            {resBadge}
          </span>
        </div>


        {/* 3-Dots Action Trigger Button (Bottom-Left on Hover) */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onContextMenu(e, video)
          }}
          className="absolute bottom-2.5 left-2.5 w-7 h-7 rounded-lg bg-black/80 hover:bg-primary text-white/80 hover:text-white backdrop-blur-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all border border-white/10 z-20"
          title="More Options"
        >
          <MoreVertical size={14} />
        </button>

        {/* Bottom-Right Duration & File Size Badges */}
        <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5 z-10">
          {video.file_size ? (
            <span className="px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-md text-[9px] font-mono font-bold text-white/85 border border-white/10">
              {formatBytes(video.file_size)}
            </span>
          ) : null}
          {(video.duration ?? 0) > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-black/90 backdrop-blur-md text-[9px] font-mono font-bold text-white border border-white/10">
              {formatDuration(video.duration)}
            </span>
          )}
        </div>

        {/* Watch Progress Bar */}
        {progressPercent > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/15 z-10">
            <div
              className={`h-full transition-all ${video.completed ? 'bg-emerald-500' : 'bg-primary'}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>

      {/* Card Info Area */}
      <div className="p-3 space-y-1">
        <h3 
          className={`font-bold text-sm line-clamp-1 leading-snug group-hover:text-primary transition-colors tracking-tight ${
            isLight ? 'text-slate-900' : 'text-white'
          }`}
          title={video.title}
        >
          {video.title}
        </h3>
        <div className={`flex items-center justify-between text-[11px] font-medium ${
          isLight ? 'text-slate-400' : 'text-white/40'
        }`}>
          <span className={`flex items-center gap-1.5 truncate max-w-[65%] ${
            isLight ? 'text-slate-600' : 'text-white/60'
          }`}>
            <Folder size={12} className="text-primary shrink-0" />
            <span className="truncate">{folderName}</span>
          </span>
          <span className="shrink-0">{formatRelativeDate(video.file_mtime || video.updated_at)}</span>
        </div>
        {isContinueWatching && (
          <p className="text-[9px] text-primary font-black uppercase tracking-widest mt-0.5">
            Resume {Math.round(progressPercent)}%
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Main Videos Component ──────────────────────────────────────────────────
const Videos: React.FC<VideosProps> = ({ onPlay }) => {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const [videos, setVideos] = useState<Video[]>([])
  const [continueWatching, setContinueWatching] = useState<Video[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFolder, setActiveFolder] = useState<string>('all')
  const [activeDurationFilter, setActiveDurationFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('newest')
  const [showSortMenu, setShowSortMenu] = useState(false)
  const sortMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setShowSortMenu(false)
      }
    }
    if (showSortMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showSortMenu])
  const [viewMode, setViewMode] = useState<'grid' | 'table'>(() => {
    return (localStorage.getItem('mycinema_videos_view_mode') as 'grid' | 'table') || 'grid'
  })

  // Table batch selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // Modal & Action states
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; video: Video } | null>(null)
  const [inspectorVideo, setInspectorVideo] = useState<Video | null>(null)
  const [inspectorInfo, setInspectorInfo] = useState<any>(null)
  const [inspectorLoading, setInspectorLoading] = useState(false)
  const [renameTarget, setRenameTarget] = useState<Video | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Video | Video[] | null>(null)
  const [copyFeedback, setCopyFeedback] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState<number | null>(null)

  const handleToggleViewMode = (mode: 'grid' | 'table') => {
    setViewMode(mode)
    localStorage.setItem('mycinema_videos_view_mode', mode)
  }

  // Fetch and enrich video library
  const fetchVideos = useCallback(async () => {
    try {
      const allVideos: Video[] = await window.api.getVideos()
      const cwVideos: Video[] = await window.api.getContinueWatching()

      const isLocalVideo = (v: Video) =>
        v.type === 'video' || (v.type === 'movie' && (v.duration ?? 0) > 0 && (v.duration ?? 0) < ONE_HOUR)

      const localList = allVideos.filter(isLocalVideo)
      const localCw = cwVideos.filter(v => isLocalVideo(v) && !v.completed)

      // Fetch file stats for local videos to enrich size, modified date, folder
      const targetPaths = localList.map(v => v.file_path).filter(Boolean)
      let statsMap: Record<string, any> = {}
      if (window.api.getLocalVideoStats && targetPaths.length > 0) {
        try {
          statsMap = await window.api.getLocalVideoStats(targetPaths)
        } catch (e) {
          console.warn('[Videos] Failed to load local stats:', e)
        }
      }

      const enrichedList = localList.map(v => {
        const stat = statsMap[v.file_path]
        return {
          ...v,
          file_size: v.file_size || stat?.size || 0,
          file_mtime: v.file_mtime || stat?.mtime || 0,
          folder_name: stat?.folderName || getParentFolderName(v.file_path)
        }
      })

      setVideos(enrichedList)
      setContinueWatching(
        localCw.map(v => {
          const stat = statsMap[v.file_path]
          return {
            ...v,
            file_size: v.file_size || stat?.size || 0,
            file_mtime: v.file_mtime || stat?.mtime || 0,
            folder_name: stat?.folderName || getParentFolderName(v.file_path)
          }
        })
      )
    } catch (err) {
      console.error('[Videos] Fetch error:', err)
    }
  }, [])

  useEffect(() => {
    fetchVideos()
    return window.api.onLibraryUpdated(fetchVideos)
  }, [fetchVideos])

  // Extract unique folders & counts
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    videos.forEach(v => {
      const folder = v.folder_name || getParentFolderName(v.file_path)
      counts[folder] = (counts[folder] || 0) + 1
    })
    return counts
  }, [videos])

  const foldersList = useMemo(() => {
    return Object.keys(folderCounts).sort((a, b) => folderCounts[b] - folderCounts[a])
  }, [folderCounts])

  // Aggregate Metrics
  const totalClips = videos.length
  const totalDurationSeconds = useMemo(() => {
    return videos.reduce((sum, v) => sum + (v.duration || 0), 0)
  }, [videos])
  const totalSizeBytes = useMemo(() => {
    return videos.reduce((sum, v) => sum + (v.file_size || 0), 0)
  }, [videos])

  // Filter & Sort Logic
  const filteredVideos = useMemo(() => {
    let result = videos.filter(v => {
      if (!searchQuery) return true
      const q = searchQuery.toLowerCase()
      const titleMatch = (v.title || '').toLowerCase().includes(q)
      const folderMatch = (v.folder_name || '').toLowerCase().includes(q)
      const pathMatch = (v.file_path || '').toLowerCase().includes(q)
      return titleMatch || folderMatch || pathMatch
    })

    // Folder Filter
    if (activeFolder !== 'all') {
      result = result.filter(v => (v.folder_name || getParentFolderName(v.file_path)) === activeFolder)
    }

    // Duration & Watched Filters
    if (activeDurationFilter === 'quick') {
      result = result.filter(v => (v.duration ?? 0) > 0 && (v.duration ?? 0) < 120) // < 2m
    } else if (activeDurationFilter === 'short') {
      result = result.filter(v => (v.duration ?? 0) >= 120 && (v.duration ?? 0) < 600) // 2-10m
    } else if (activeDurationFilter === 'medium') {
      result = result.filter(v => (v.duration ?? 0) >= 600 && (v.duration ?? 0) < 1800) // 10-30m
    } else if (activeDurationFilter === 'long') {
      result = result.filter(v => (v.duration ?? 0) >= 1800) // > 30m
    } else if (activeDurationFilter === 'unwatched') {
      result = result.filter(v => {
        const isCompleted = !!v.completed
        const hasProgress = (v.last_watched_time ?? 0) >= (v.duration ?? 0) * 0.9 && (v.duration ?? 0) > 0
        return !isCompleted && !hasProgress
      })
    } else if (activeDurationFilter === 'watched') {
      result = result.filter(v => {
        const isCompleted = !!v.completed
        const hasProgress = (v.last_watched_time ?? 0) >= (v.duration ?? 0) * 0.9 && (v.duration ?? 0) > 0
        return isCompleted || hasProgress
      })
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'name') return (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' })
      if (sortBy === 'newest') return (b.file_mtime || b.id || 0) - (a.file_mtime || a.id || 0)
      if (sortBy === 'oldest') return (a.file_mtime || a.id || 0) - (b.file_mtime || b.id || 0)
      if (sortBy === 'size_desc') return (b.file_size || 0) - (a.file_size || 0)
      if (sortBy === 'size_asc') return (a.file_size || 0) - (b.file_size || 0)
      if (sortBy === 'longest') return (b.duration ?? 0) - (a.duration ?? 0)
      if (sortBy === 'shortest') return (a.duration ?? 0) - (b.duration ?? 0)
      return 0
    })

    return result
  }, [videos, searchQuery, activeFolder, activeDurationFilter, sortBy])

  // Play with Continuous Queue
  const handlePlayWithQueue = (videoToPlay: Video, queueList: Video[] = filteredVideos) => {
    const idx = queueList.findIndex(v => v.id === videoToPlay.id)
    const playTarget: Video = {
      ...videoToPlay,
      playlist: queueList,
      playlistIndex: idx >= 0 ? idx : 0
    }
    onPlay(playTarget)
  }

  const handlePlayAll = () => {
    if (filteredVideos.length > 0) {
      handlePlayWithQueue(filteredVideos[0], filteredVideos)
    }
  }

  const handleShuffle = () => {
    if (filteredVideos.length > 0) {
      const shuffled = [...filteredVideos].sort(() => Math.random() - 0.5)
      handlePlayWithQueue(shuffled[0], shuffled)
    }
  }

  // Context Menu Handlers
  const handleOpenContextMenu = (e: React.MouseEvent, video: Video) => {
    e.preventDefault()
    e.stopPropagation()
    const x = Math.min(e.clientX, window.innerWidth - 260)
    const y = Math.min(e.clientY, window.innerHeight - 340)
    setContextMenu({ x, y, video })
  }

  const closeContextMenu = () => setContextMenu(null)

  const handleOpenFolder = (video: Video) => {
    window.api.openFolder(video.file_path)
    closeContextMenu()
  }

  const handleInspectMedia = async (video: Video) => {
    closeContextMenu()
    setInspectorVideo(video)
    setInspectorLoading(true)
    try {
      const info = await window.api.getMediaInfo(video.file_path)
      setInspectorInfo(info)
    } catch (e) {
      console.warn('[Videos] Media info error:', e)
    } finally {
      setInspectorLoading(false)
    }
  }

  const handleStartRename = (video: Video) => {
    closeContextMenu()
    setRenameTarget(video)
    setRenameValue(video.title)
  }

  const handleSaveRename = async () => {
    if (!renameTarget || !renameValue.trim()) return
    const clean = renameValue.trim()
    try {
      if (window.api.updateVideoTitle) {
        await window.api.updateVideoTitle(renameTarget.id, clean)
      }
      setVideos(prev => prev.map(v => v.id === renameTarget.id ? { ...v, title: clean } : v))
      setContinueWatching(prev => prev.map(v => v.id === renameTarget.id ? { ...v, title: clean } : v))
    } catch (e) {
      console.error('[Videos] Rename error:', e)
    } finally {
      setRenameTarget(null)
    }
  }

  const handleRegenerateThumbnail = async (video: Video) => {
    closeContextMenu()
    setIsRegenerating(video.id)
    try {
      if (window.api.regenerateVideoThumbnail) {
        const res = await window.api.regenerateVideoThumbnail(video.id)
        if (res?.success && res.posterPath) {
          setVideos(prev => prev.map(v => v.id === video.id ? { ...v, poster_path: res.posterPath } : v))
          setContinueWatching(prev => prev.map(v => v.id === video.id ? { ...v, poster_path: res.posterPath } : v))
        }
      }
    } catch (e) {
      console.error('[Videos] Regenerate thumb error:', e)
    } finally {
      setIsRegenerating(null)
    }
  }

  const handleToggleWatched = (video: Video) => {
    closeContextMenu()
    const isWatched = Boolean(video.completed) || ((video.last_watched_time || 0) >= (video.duration || 1) * 0.9)
    const newCompleted = !isWatched
    const newTime = newCompleted ? (video.duration || 1) : 0
    window.api.updateVideoProgress(video.id, newTime, newCompleted)
    setVideos(prev => prev.map(v => v.id === video.id ? { ...v, completed: newCompleted, last_watched_time: newTime } : v))
    if (newCompleted) {
      setContinueWatching(prev => prev.filter(v => v.id !== video.id))
    } else {
      setContinueWatching(prev => prev.map(v => v.id === video.id ? { ...v, completed: newCompleted, last_watched_time: newTime } : v))
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return
    const targets = Array.isArray(deleteTarget) ? deleteTarget : [deleteTarget]
    try {
      for (const item of targets) {
        await window.api.deleteVideoFile(item)
      }
      const targetIds = new Set(targets.map(t => t.id))
      setVideos(prev => prev.filter(v => !targetIds.has(v.id)))
      setContinueWatching(prev => prev.filter(v => !targetIds.has(v.id)))
      setSelectedIds(new Set())
    } catch (e) {
      console.error('[Videos] Delete error:', e)
    } finally {
      setDeleteTarget(null)
    }
  }

  const handleCopyPath = (pathString: string) => {
    navigator.clipboard.writeText(pathString)
    setCopyFeedback(true)
    setTimeout(() => setCopyFeedback(false), 2000)
    closeContextMenu()
  }

  // Batch Selection Handlers
  const handleToggleSelectRow = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSelectAllFiltered = () => {
    if (selectedIds.size === filteredVideos.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredVideos.map(v => v.id)))
    }
  }

  const selectedClips = useMemo(() => {
    return filteredVideos.filter(v => selectedIds.has(v.id))
  }, [filteredVideos, selectedIds])

  const selectedTotalSize = useMemo(() => {
    return selectedClips.reduce((sum, v) => sum + (v.file_size || 0), 0)
  }, [selectedClips])

  const sortLabel = useMemo(() => {
    switch (sortBy) {
      case 'newest': return 'Date Recorded (Newest)'
      case 'oldest': return 'Date Recorded (Oldest)'
      case 'size_desc': return 'File Size (Largest)'
      case 'size_asc': return 'File Size (Smallest)'
      case 'longest': return 'Duration (Longest)'
      case 'shortest': return 'Duration (Shortest)'
      case 'name': return 'Name (A-Z)'
      default: return 'Sort'
    }
  }, [sortBy])

  return (
    <div className="space-y-5 animate-in fade-in duration-500 pb-16 select-none">
      
      {/* ─── Studio Header with Dynamic Metrics & Folders ───────────────────── */}
      <div className={`relative p-5 rounded-2xl overflow-hidden transition-all duration-300 ${
        isLight
          ? 'border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/90 to-slate-100/80 shadow-md shadow-slate-200/50'
          : 'border border-white/10 bg-gradient-to-br from-[#121824]/90 via-[#0d121c]/90 to-[#080b11]/90 shadow-2xl backdrop-blur-2xl'
      }`}>
        <div className={`absolute -right-20 -top-20 w-80 h-80 rounded-full blur-3xl pointer-events-none ${
          isLight ? 'bg-primary/5' : 'bg-primary/10'
        }`} />

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-primary to-rose-400 flex items-center justify-center text-white shadow-xl shadow-primary/30 shrink-0">
              <VideoIcon size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className={`text-3xl font-black uppercase italic tracking-tight ${
                  isLight ? 'text-slate-900' : 'text-white'
                }`}>
                  Local Video Vault
                </h2>
                <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${
                  isLight
                    ? 'bg-slate-200/70 text-slate-700 border border-slate-300/60'
                    : 'bg-white/10 text-white/70 border border-white/10'
                }`}>
                  Studio
                </span>
              </div>
              <div className={`flex flex-wrap items-center gap-3 mt-1.5 text-xs font-semibold ${
                isLight ? 'text-slate-500' : 'text-white/50'
              }`}>
                <span className={`flex items-center gap-1 font-mono ${isLight ? 'text-slate-700' : 'text-white/80'}`}>
                  <strong className={isLight ? 'text-slate-950 font-bold' : 'text-white'}>{totalClips}</strong> Recordings
                </span>
                <span>•</span>
                <span className={`flex items-center gap-1 font-mono ${isLight ? 'text-slate-700' : 'text-white/80'}`}>
                  <strong className={isLight ? 'text-slate-950 font-bold' : 'text-white'}>{formatDuration(totalDurationSeconds)}</strong> Total Playtime
                </span>
                <span>•</span>
                <span className={`flex items-center gap-1 font-mono ${isLight ? 'text-slate-700' : 'text-white/80'}`}>
                  <strong className={isLight ? 'text-slate-950 font-bold' : 'text-white'}>{formatBytes(totalSizeBytes)}</strong> Storage Used
                </span>
              </div>
            </div>
          </div>

          {/* Top Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => window.api.selectFolder?.()}
              className={`h-10 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                isLight
                  ? 'border border-slate-200 bg-white hover:bg-slate-100 text-slate-800 shadow-xs hover:border-slate-300'
                  : 'border border-white/10 bg-white/5 hover:bg-white/10 text-white'
              }`}
              title="Add a folder to library"
            >
              <FolderOpen size={15} className="text-emerald-500" />
              Scan Folder
            </button>
            <button
              onClick={handleShuffle}
              disabled={filteredVideos.length === 0}
              className={`h-10 px-4 rounded-xl text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 disabled:opacity-40 ${
                isLight
                  ? 'border border-slate-200 bg-white hover:bg-slate-100 text-slate-800 shadow-xs hover:border-slate-300'
                  : 'border border-white/10 bg-white/5 hover:bg-white/10 text-white'
              }`}
            >
              <Shuffle size={14} className="text-primary" />
              Shuffle
            </button>
            <button
              onClick={handlePlayAll}
              disabled={filteredVideos.length === 0}
              className="h-10 px-5 rounded-xl bg-primary hover:bg-primary/90 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-primary/30 transition-all flex items-center gap-2 disabled:opacity-40"
            >
              <CirclePlay size={16} />
              Play All Queue
            </button>
          </div>
        </div>

        {/* Source Folder Navigation Chips */}
        {foldersList.length > 0 && (
          <div className={`mt-4 pt-3.5 border-t flex items-center gap-2 overflow-x-auto scrollbar-hide pb-0.5 ${
            isLight ? 'border-slate-200/80' : 'border-white/5'
          }`}>
            <span className={`text-[10px] font-black uppercase tracking-widest mr-1 shrink-0 ${
              isLight ? 'text-slate-400' : 'text-white/40'
            }`}>
              Folders:
            </span>
            <button
              onClick={() => setActiveFolder('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                activeFolder === 'all'
                  ? 'bg-primary text-white shadow-md shadow-primary/25'
                  : (isLight
                      ? 'bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-950 border border-slate-200/90 shadow-2xs'
                      : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/5')
              }`}
            >
              <Folder size={12} className={activeFolder === 'all' ? 'text-white' : (isLight ? 'text-primary' : 'text-primary/80')} />
              All Folders 
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono font-bold ${
                activeFolder === 'all'
                  ? 'bg-black/25 text-white'
                  : (isLight ? 'bg-primary/10 text-primary border border-primary/15' : 'bg-white/10 text-white/80')
              }`}>
                {totalClips}
              </span>
            </button>
            {foldersList.map(folder => (
              <button
                key={folder}
                onClick={() => setActiveFolder(folder)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                  activeFolder === folder
                    ? 'bg-primary text-white shadow-md shadow-primary/25'
                    : (isLight
                        ? 'bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-950 border border-slate-200/90 shadow-2xs'
                        : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/5')
                }`}
              >
                <Folder size={12} className={activeFolder === folder ? 'text-white' : (isLight ? 'text-primary' : 'text-primary/80')} />
                {folder}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono font-bold ${
                  activeFolder === folder
                    ? 'bg-black/25 text-white'
                    : (isLight ? 'bg-primary/10 text-primary border border-primary/15' : 'bg-white/10 text-white/80')
                }`}>
                  {folderCounts[folder] || 0}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ─── Search, Filter Pills & View Mode Bar ────────────────────────────── */}
      <div className={`relative z-30 flex flex-wrap items-center justify-between gap-3 p-2.5 sm:p-3 rounded-2xl transition-all duration-300 ${
        isLight
          ? 'border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl'
          : 'border border-white/10 bg-[#0d121c]/70 backdrop-blur-xl'
      }`}>
        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${
            isLight ? 'text-slate-400' : 'text-white/40'
          }`} />
          <input
            type="text"
            placeholder="Search recordings, folders..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full h-10 pl-10 pr-9 rounded-xl text-xs font-semibold focus:outline-none focus:border-primary transition-colors ${
              isLight
                ? 'bg-slate-100/80 border border-slate-200 text-slate-900 placeholder-slate-400 focus:bg-white'
                : 'bg-black/40 border border-white/10 text-white placeholder-white/40'
            }`}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className={`absolute right-3 top-1/2 -translate-y-1/2 ${
                isLight ? 'text-slate-400 hover:text-slate-700' : 'text-white/40 hover:text-white'
              }`}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Multi-duration Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-1">
          {[
            { id: 'all', label: 'All Lengths' },
            { id: 'quick', label: '< 2m' },
            { id: 'short', label: '2-10m' },
            { id: 'medium', label: '10-30m' },
            { id: 'long', label: '> 30m' },
            { id: 'unwatched', label: 'Unwatched' },
            { id: 'watched', label: 'Watched' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setActiveDurationFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all shrink-0 ${
                activeDurationFilter === f.id
                  ? 'bg-primary text-white shadow-sm'
                  : (isLight
                      ? 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 border border-slate-200/60'
                      : 'bg-white/5 text-white/60 hover:text-white')
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Sort Dropdown & View Mode Switcher */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative z-50" ref={sortMenuRef}>
            <button
              onClick={() => setShowSortMenu(prev => !prev)}
              className={`h-10 px-3.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                isLight
                  ? 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:text-slate-900 shadow-xs'
                  : 'border border-white/10 bg-white/5 text-white/80 hover:text-white'
              }`}
            >
              <ArrowUpDown size={14} className="text-primary" />
              {sortLabel}
            </button>
            {showSortMenu && (
              <div
                style={{ backgroundColor: isLight ? '#ffffff' : '#0e141f' }}
                className={`absolute right-0 top-full z-50 mt-2 w-56 rounded-xl p-1.5 shadow-2xl border ${
                  isLight
                    ? 'border-slate-200 text-slate-800'
                    : 'border-white/15 text-white/90 shadow-black/80'
                }`}
              >
                {[
                  { id: 'newest', label: 'Date Recorded (Newest)' },
                  { id: 'oldest', label: 'Date Recorded (Oldest)' },
                  { id: 'size_desc', label: 'File Size (Largest)' },
                  { id: 'size_asc', label: 'File Size (Smallest)' },
                  { id: 'longest', label: 'Duration (Longest)' },
                  { id: 'shortest', label: 'Duration (Shortest)' },
                  { id: 'name', label: 'Name (A-Z)' }
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      setSortBy(opt.id)
                      setShowSortMenu(false)
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs font-bold transition-colors ${
                      isLight
                        ? (sortBy === opt.id
                            ? 'bg-primary/10 text-primary'
                            : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900')
                        : (sortBy === opt.id
                            ? 'bg-primary/20 text-white'
                            : 'text-white/80 hover:bg-white/10 hover:text-white')
                    }`}
                  >
                    {opt.label}
                    {sortBy === opt.id && <Check size={14} className="text-primary" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* View Mode Toggle: Grid vs List/Table */}
          <div className={`flex items-center p-1 rounded-xl border ${
            isLight ? 'border-slate-200 bg-slate-100' : 'border-white/10 bg-black/40'
          }`}>
            <button
              onClick={() => handleToggleViewMode('grid')}
              className={`p-2 rounded-lg transition-all ${
                viewMode === 'grid'
                  ? 'bg-primary text-white shadow-sm'
                  : (isLight ? 'text-slate-400 hover:text-slate-800' : 'text-white/40 hover:text-white')
              }`}
              title="Grid View"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => handleToggleViewMode('table')}
              className={`p-2 rounded-lg transition-all ${
                viewMode === 'table'
                  ? 'bg-primary text-white shadow-sm'
                  : (isLight ? 'text-slate-400 hover:text-slate-800' : 'text-white/40 hover:text-white')
              }`}
              title="Detailed Table View"
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* ─── Continue Watching Row (Grid only, when no search) ──────────────── */}
      {continueWatching.length > 0 && searchQuery === '' && activeFolder === 'all' && activeDurationFilter === 'all' && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className={`text-base font-black tracking-tight flex items-center gap-2 ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}>
              Continue Watching
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            </h3>
            <span className={`text-xs font-mono ${isLight ? 'text-slate-400' : 'text-white/40'}`}>
              {continueWatching.length} in progress
            </span>
          </div>
          <HorizontalScrollRow compact innerClassName="pt-1 pb-2">
            {continueWatching.map(v => (
              <div key={`cw-${v.id}`} className="w-64 md:w-72 shrink-0">
                <VideoGridCard
                  video={v}
                  onPlay={(target) => handlePlayWithQueue(target, continueWatching)}
                  onContextMenu={handleOpenContextMenu}
                  onInspect={handleInspectMedia}
                  isContinueWatching={true}
                />
              </div>
            ))}
          </HorizontalScrollRow>
        </section>
      )}

      {/* ─── Batch Selection Floating Bar (Table View) ──────────────────────── */}
      {viewMode === 'table' && selectedIds.size > 0 && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 px-5 py-2.5 rounded-2xl shadow-[0_12px_50px_rgba(0,0,0,0.3)] backdrop-blur-2xl animate-in slide-in-from-bottom duration-200 ${
          isLight
            ? 'border border-slate-300 bg-white/95 text-slate-800'
            : 'border border-primary/40 bg-[#0e141f]/95 text-white'
        }`}>
          <span className={`text-xs font-bold flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
            <span className="w-2 h-2 rounded-full bg-primary" />
            <strong>{selectedIds.size} clips</strong> selected ({formatBytes(selectedTotalSize)})
          </span>
          <div className={`h-4 w-px ${isLight ? 'bg-slate-200' : 'bg-white/10'}`} />
          <button
            onClick={() => handlePlayWithQueue(selectedClips[0], selectedClips)}
            className={`text-xs font-black uppercase tracking-wider hover:text-primary transition-colors flex items-center gap-1.5 ${
              isLight ? 'text-slate-800' : 'text-white'
            }`}
          >
            <Play size={13} fill="currentColor" />
            Play In Queue
          </button>
          <button
            onClick={() => setDeleteTarget(selectedClips)}
            className="text-xs font-black uppercase tracking-wider text-red-500 hover:text-red-400 transition-colors flex items-center gap-1.5"
          >
            <Trash2 size={13} />
            Delete Selected
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className={`p-1 ${isLight ? 'text-slate-400 hover:text-slate-700' : 'text-white/40 hover:text-white'}`}
            title="Deselect all"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ─── Main Content Display: Grid vs Table ────────────────────────────── */}
      {filteredVideos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-500">
          <div className="w-20 h-20 rounded-3xl bg-secondary/30 border border-white/10 flex items-center justify-center mb-5 text-white/30">
            <VideoIcon size={36} />
          </div>
          <h3 className={`text-xl font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>No recordings match your criteria</h3>
          <p className={`text-xs mt-1 max-w-sm ${isLight ? 'text-slate-500' : 'text-white/50'}`}>
            Try adjusting your search query, folder selection, or duration filters.
          </p>
          <button
            onClick={() => {
              setSearchQuery('')
              setActiveFolder('all')
              setActiveDurationFilter('all')
              setSortBy('newest')
            }}
            className="mt-6 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold uppercase tracking-wider text-primary hover:bg-white/10 transition-colors"
          >
            Reset All Filters
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        // ─── GRID VIEW ────────────────────────────────────────────────────────
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className={`text-base font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {activeFolder !== 'all' ? activeFolder : (searchQuery ? 'Search Results' : 'All Recordings')}
            </h3>
            <span className={`text-[11px] font-mono ${isLight ? 'text-slate-400' : 'text-white/40'}`}>
              Showing {filteredVideos.length} of {totalClips}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {filteredVideos.map(video => (
              <VideoGridCard
                key={video.id}
                video={video}
                onPlay={(target) => handlePlayWithQueue(target, filteredVideos)}
                onContextMenu={handleOpenContextMenu}
                onInspect={handleInspectMedia}
              />
            ))}
          </div>
        </section>
      ) : (
        // ─── DETAILED TABLE / LIST VIEW ───────────────────────────────────────
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h3 className={`text-base font-black tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {activeFolder !== 'all' ? activeFolder : 'Vault Table'}
            </h3>
            <span className={`text-[11px] font-mono ${isLight ? 'text-slate-400' : 'text-white/40'}`}>
              {filteredVideos.length} recordings listed
            </span>
          </div>

          <div className={`rounded-2xl overflow-hidden transition-all duration-300 ${
            isLight
              ? 'border border-slate-200/90 bg-white shadow-sm'
              : 'border border-white/10 bg-[#0d121c]/90 shadow-2xl backdrop-blur-2xl'
          }`}>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={`border-b text-[10px] font-black uppercase tracking-widest ${
                  isLight
                    ? 'border-slate-200/90 bg-slate-50 text-slate-500'
                    : 'border-white/10 bg-white/[0.02] text-white/40'
                }`}>
                  <th className="py-3 px-4 w-10">
                    <button
                      onClick={handleSelectAllFiltered}
                      className={isLight ? 'text-slate-400 hover:text-slate-700' : 'text-white/60 hover:text-white'}
                      title={selectedIds.size === filteredVideos.length ? "Deselect All" : "Select All"}
                    >
                      {selectedIds.size > 0 && selectedIds.size === filteredVideos.length ? (
                        <CheckSquare size={16} className="text-primary" />
                      ) : (
                        <Square size={16} />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-3 w-28">Preview</th>
                  <th className="py-3 px-4">Title & Filename</th>
                  <th className="py-3 px-4">Folder</th>
                  <th className="py-3 px-4">Recorded</th>
                  <th className="py-3 px-4">Resolution</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y text-xs font-medium ${
                isLight ? 'divide-slate-100' : 'divide-white/5'
              }`}>
                {filteredVideos.map(video => {
                  const isSelected = selectedIds.has(video.id)
                  const posterUrl = video.poster_path
                    ? (video.poster_path.startsWith('http')
                        ? video.poster_path
                        : `media://file/${encodeURIComponent(video.poster_path)}`)
                    : null
                  const folder = video.folder_name || getParentFolderName(video.file_path)
                  const baseName = video.file_path ? video.file_path.split(/[\\/]/).pop() : ''
                  const resBadge = getResolutionBadge(video)

                  return (
                    <tr
                      key={`row-${video.id}`}
                      onClick={() => handlePlayWithQueue(video, filteredVideos)}
                      onContextMenu={(e) => handleOpenContextMenu(e, video)}
                      className={`transition-colors cursor-pointer group ${
                        isSelected 
                          ? (isLight ? 'bg-primary/[0.08]' : 'bg-primary/[0.07]')
                          : (isLight ? 'hover:bg-slate-50' : 'hover:bg-white/[0.04]')
                      }`}
                    >
                      <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleToggleSelectRow(video.id)}
                          className={isLight ? 'text-slate-400 hover:text-slate-700' : 'text-white/40 hover:text-white'}
                        >
                          {isSelected ? (
                            <CheckSquare size={16} className="text-primary" />
                          ) : (
                            <Square size={16} />
                          )}
                        </button>
                      </td>
                      <td className="py-3 px-3">
                        <div className={`relative aspect-video w-24 rounded-lg overflow-hidden bg-slate-900 border shrink-0 ${
                          isLight ? 'border-slate-200' : 'border-white/10'
                        }`}>
                          {posterUrl ? (
                            <img src={posterUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-white/30 text-[9px]">
                              Clip
                            </div>
                          )}
                          {(video.duration ?? 0) > 0 && (
                            <div className="absolute bottom-1 right-1 px-1 rounded bg-black/90 text-[8px] font-mono font-bold text-white">
                              {formatDuration(video.duration)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className={`font-bold group-hover:text-primary transition-colors max-w-md truncate ${
                          isLight ? 'text-slate-900' : 'text-white'
                        }`}>
                          {video.title}
                        </div>
                        <div className={`text-[10px] font-mono mt-0.5 max-w-md truncate ${
                          isLight ? 'text-slate-400' : 'text-white/40'
                        }`}>
                          {baseName}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-bold ${
                          isLight
                            ? 'bg-slate-100 text-slate-700 border border-slate-200'
                            : 'bg-white/5 text-white/70 border border-white/5'
                        }`}>
                          📁 {folder}
                        </span>
                      </td>
                      <td className={`py-3 px-4 font-medium ${
                        isLight ? 'text-slate-600' : 'text-white/60'
                      }`}>
                        {formatRelativeDate(video.file_mtime || video.updated_at)}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-md ${getResolutionBadgeClass(resBadge, isLight)}`}>
                          {resBadge}
                        </span>
                      </td>
                      <td className={`py-3 px-4 font-mono ${
                        isLight ? 'text-slate-700 font-semibold' : 'text-white/90'
                      }`}>
                        {formatDuration(video.duration)}
                      </td>
                      <td className={`py-3 px-4 font-mono ${
                        isLight ? 'text-slate-700 font-semibold' : 'text-white/90'
                      }`}>
                        {formatBytes(video.file_size)}
                      </td>
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handlePlayWithQueue(video, filteredVideos)}
                            className="p-2 rounded-lg bg-primary hover:bg-primary/90 text-white shadow-sm"
                            title="Play Video"
                          >
                            <Play size={13} fill="currentColor" />
                          </button>
                          <button
                            onClick={() => handleOpenFolder(video)}
                            className={`p-2 rounded-lg transition-colors ${
                              isLight
                                ? 'bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200/60'
                                : 'bg-white/5 hover:bg-white/10 text-white/60 hover:text-white'
                            }`}
                            title="Show in File Explorer"
                          >
                            <FolderOpen size={13} />
                          </button>
                          <button
                            onClick={(e) => handleOpenContextMenu(e, video)}
                            className={`p-2 rounded-lg transition-colors ${
                              isLight
                                ? 'bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200/60'
                                : 'bg-white/5 hover:bg-white/10 text-white/60 hover:text-white'
                            }`}
                            title="More Options"
                          >
                            <MoreVertical size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ─── Floating Context Menu ─────────────────────────────────────────── */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={closeContextMenu} />
          <div
            style={{ 
              left: `${contextMenu.x}px`, 
              top: `${contextMenu.y}px`,
              backgroundColor: isLight ? '#ffffff' : '#121722'
            }}
            className={`fixed z-50 w-60 rounded-2xl p-1.5 shadow-2xl space-y-0.5 animate-in fade-in duration-150 border ${
              isLight
                ? 'border-slate-200 text-slate-800'
                : 'border-white/15 text-white'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest border-b mb-1 truncate ${
              isLight ? 'text-slate-400 border-slate-100' : 'text-white/35 border-white/5'
            }`}>
              {contextMenu.video.title}
            </div>

            <button
              onClick={() => {
                handlePlayWithQueue(contextMenu.video, filteredVideos)
                closeContextMenu()
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors text-left ${
                isLight ? 'text-slate-800 hover:bg-primary hover:text-white' : 'text-white hover:bg-primary'
              }`}
            >
              <Play size={14} fill="currentColor" className="text-primary group-hover:text-white" />
              Play Video
            </button>

            <button
              onClick={() => handleOpenFolder(contextMenu.video)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors text-left ${
                isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-white/90 hover:bg-white/10'
              }`}
            >
              <FolderOpen size={14} className="text-blue-400" />
              Show in File Explorer
            </button>

            <button
              onClick={() => handleInspectMedia(contextMenu.video)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors text-left ${
                isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-white/90 hover:bg-white/10'
              }`}
            >
              <Info size={14} className="text-purple-400" />
              Inspect Media Specs
            </button>

            <button
              onClick={() => handleStartRename(contextMenu.video)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors text-left ${
                isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-white/90 hover:bg-white/10'
              }`}
            >
              <Edit3 size={14} className="text-amber-400" />
              Rename Title
            </button>

            <button
              onClick={() => handleRegenerateThumbnail(contextMenu.video)}
              disabled={isRegenerating === contextMenu.video.id}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors text-left disabled:opacity-50 ${
                isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-white/90 hover:bg-white/10'
              }`}
            >
              {isRegenerating === contextMenu.video.id ? (
                <Loader2 size={14} className="text-cyan-400 animate-spin" />
              ) : (
                <Sparkles size={14} className="text-cyan-400" />
              )}
              Regenerate Poster Frame
            </button>

            <button
              onClick={() => handleToggleWatched(contextMenu.video)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors text-left ${
                isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-white/90 hover:bg-white/10'
              }`}
            >
              {contextMenu.video.completed ? (
                <>
                  <EyeOff size={14} className={isLight ? 'text-slate-400' : 'text-white/60'} />
                  Mark as Unwatched
                </>
              ) : (
                <>
                  <Eye size={14} className="text-emerald-400" />
                  Mark as Watched
                </>
              )}
            </button>

            <button
              onClick={() => handleCopyPath(contextMenu.video.file_path)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors text-left ${
                isLight ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-900' : 'text-white/90 hover:bg-white/10'
              }`}
            >
              <Copy size={14} className={isLight ? 'text-slate-400' : 'text-white/60'} />
              Copy File Path
            </button>

            <div className={`border-t my-1 ${isLight ? 'border-slate-100' : 'border-white/5'}`} />

            <button
              onClick={() => {
                setDeleteTarget(contextMenu.video)
                closeContextMenu()
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold text-red-500 hover:bg-red-600 hover:text-white transition-colors text-left"
            >
              <Trash2 size={14} />
              Delete Video File
            </button>
          </div>
        </>
      )}

      {/* ─── Media Inspector Modal ─────────────────────────────────────────── */}
      {inspectorVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div 
            style={{ backgroundColor: isLight ? '#ffffff' : '#0d121c' }}
            className={`relative w-full max-w-2xl rounded-3xl p-6 shadow-2xl space-y-6 border ${
              isLight
                ? 'border-slate-200 text-slate-900'
                : 'border-white/10 text-white'
            }`}
          >
            <div className={`flex items-center justify-between border-b pb-4 ${
              isLight ? 'border-slate-200' : 'border-white/10'
            }`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-500 border border-purple-500/30 flex items-center justify-center">
                  <Info size={20} />
                </div>
                <div>
                  <h3 className={`text-base font-extrabold ${isLight ? 'text-slate-900' : 'text-white'}`}>Media Inspector & Properties</h3>
                  <p className={`text-xs font-mono truncate max-w-md ${isLight ? 'text-slate-500' : 'text-white/40'}`}>{inspectorVideo.title}</p>
                </div>
              </div>
              <button
                onClick={() => setInspectorVideo(null)}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  isLight ? 'hover:bg-slate-100 text-slate-400 hover:text-slate-700' : 'hover:bg-white/10 text-white/40 hover:text-white'
                }`}
              >
                <X size={18} />
              </button>
            </div>

            {inspectorLoading ? (
              <div className="py-16 flex flex-col items-center justify-center space-y-3">
                <Loader2 size={32} className="text-primary animate-spin" />
                <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-white/40'}`}>Probing media streams via ffprobe...</p>
              </div>
            ) : inspectorInfo ? (
              <div className="space-y-4 text-xs">
                {/* Video Specs Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className={`p-3.5 rounded-xl border ${
                    isLight ? 'border-slate-200 bg-slate-50' : 'border-white/5 bg-white/[0.02]'
                  }`}>
                    <span className={`text-[10px] font-black uppercase tracking-widest block ${
                      isLight ? 'text-slate-400' : 'text-white/40'
                    }`}>Resolution</span>
                    <span className={`text-base font-mono font-extrabold mt-1 block ${
                      isLight ? 'text-slate-900' : 'text-white'
                    }`}>
                      {inspectorInfo.video?.resolution || 'HD'}
                    </span>
                    <span className="text-[10px] text-amber-500 font-bold">{inspectorInfo.video?.aspectRatio || '16:9'}</span>
                  </div>
                  <div className={`p-3.5 rounded-xl border ${
                    isLight ? 'border-slate-200 bg-slate-50' : 'border-white/5 bg-white/[0.02]'
                  }`}>
                    <span className={`text-[10px] font-black uppercase tracking-widest block ${
                      isLight ? 'text-slate-400' : 'text-white/40'
                    }`}>Frame Rate</span>
                    <span className={`text-base font-mono font-extrabold mt-1 block ${
                      isLight ? 'text-slate-900' : 'text-white'
                    }`}>
                      {inspectorInfo.video?.frameRate || '60.00 fps'}
                    </span>
                    <span className="text-[10px] text-emerald-500 font-bold">Video Stream</span>
                  </div>
                  <div className={`p-3.5 rounded-xl border ${
                    isLight ? 'border-slate-200 bg-slate-50' : 'border-white/5 bg-white/[0.02]'
                  }`}>
                    <span className={`text-[10px] font-black uppercase tracking-widest block ${
                      isLight ? 'text-slate-400' : 'text-white/40'
                    }`}>Bitrate</span>
                    <span className={`text-base font-mono font-extrabold mt-1 block ${
                      isLight ? 'text-slate-900' : 'text-white'
                    }`}>
                      {inspectorInfo.video?.bitrate || inspectorInfo.container?.bitrate || 'Standard'}
                    </span>
                    <span className={`text-[10px] font-mono ${isLight ? 'text-slate-400' : 'text-white/40'}`}>Stream Bitrate</span>
                  </div>
                  <div className={`p-3.5 rounded-xl border ${
                    isLight ? 'border-slate-200 bg-slate-50' : 'border-white/5 bg-white/[0.02]'
                  }`}>
                    <span className={`text-[10px] font-black uppercase tracking-widest block ${
                      isLight ? 'text-slate-400' : 'text-white/40'
                    }`}>Codec</span>
                    <span className={`text-base font-mono font-extrabold mt-1 block ${
                      isLight ? 'text-slate-900' : 'text-white'
                    }`}>
                      {inspectorInfo.video?.codec || 'AVC / H.264'}
                    </span>
                    <span className={`text-[10px] font-mono ${isLight ? 'text-slate-400' : 'text-white/40'}`}>{inspectorInfo.container?.format || 'Video'}</span>
                  </div>
                  <div className={`p-3.5 rounded-xl border ${
                    isLight ? 'border-slate-200 bg-slate-50' : 'border-white/5 bg-white/[0.02]'
                  }`}>
                    <span className={`text-[10px] font-black uppercase tracking-widest block ${
                      isLight ? 'text-slate-400' : 'text-white/40'
                    }`}>Audio Stream</span>
                    <span className={`text-base font-mono font-extrabold mt-1 block truncate ${
                      isLight ? 'text-slate-900' : 'text-white'
                    }`}>
                      {inspectorInfo.audio?.[0]?.codec || 'AAC'} {inspectorInfo.audio?.[0]?.channels || 'Stereo'}
                    </span>
                    <span className={`text-[10px] font-mono ${isLight ? 'text-slate-400' : 'text-white/40'}`}>{inspectorInfo.audio?.[0]?.sampleRate || '48 kHz'}</span>
                  </div>
                  <div className={`p-3.5 rounded-xl border ${
                    isLight ? 'border-slate-200 bg-slate-50' : 'border-white/5 bg-white/[0.02]'
                  }`}>
                    <span className={`text-[10px] font-black uppercase tracking-widest block ${
                      isLight ? 'text-slate-400' : 'text-white/40'
                    }`}>File Size</span>
                    <span className={`text-base font-mono font-extrabold mt-1 block ${
                      isLight ? 'text-slate-900' : 'text-white'
                    }`}>
                      {inspectorInfo.file?.size || formatBytes(inspectorVideo.file_size)}
                    </span>
                    <span className={`text-[10px] font-mono ${isLight ? 'text-slate-400' : 'text-white/40'}`}>{formatDuration(inspectorVideo.duration)}</span>
                  </div>
                </div>

                {/* Path Display */}
                <div className={`p-3.5 rounded-xl border space-y-1.5 ${
                  isLight ? 'border-slate-200 bg-slate-50' : 'border-white/5 bg-black/40'
                }`}>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className={`font-bold ${isLight ? 'text-slate-600' : 'text-white/60'}`}>Disk Location:</span>
                    <button
                      onClick={() => handleCopyPath(inspectorVideo.file_path)}
                      className="text-primary hover:text-primary/80 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1"
                    >
                      <Copy size={12} />
                      {copyFeedback ? 'Copied!' : 'Copy Path'}
                    </button>
                  </div>
                  <div className={`p-2 rounded-lg border text-xs font-mono break-all select-all ${
                    isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-black/60 border border-white/5 text-white/80'
                  }`}>
                    {inspectorVideo.file_path}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Modal Bottom Actions */}
            <div className={`flex items-center justify-between pt-2 border-t ${
              isLight ? 'border-slate-200' : 'border-white/5'
            }`}>
              <button
                onClick={() => {
                  setDeleteTarget(inspectorVideo)
                  setInspectorVideo(null)
                }}
                className="px-4 py-2 rounded-xl border border-red-500/30 bg-red-600/10 text-red-500 hover:bg-red-600 hover:text-white transition-colors text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
              >
                <Trash2 size={14} />
                Delete File
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenFolder(inspectorVideo)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors uppercase tracking-wider flex items-center gap-1.5 ${
                    isLight
                      ? 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-100'
                      : 'border border-white/10 bg-white/5 text-white hover:bg-white/10'
                  }`}
                >
                  <FolderOpen size={14} className="text-blue-500" />
                  Show in Explorer
                </button>
                <button
                  onClick={() => {
                    handlePlayWithQueue(inspectorVideo, filteredVideos)
                    setInspectorVideo(null)
                  }}
                  className="px-5 py-2 rounded-xl bg-primary text-xs font-black text-white hover:bg-primary/90 transition-colors uppercase tracking-widest shadow-lg shadow-primary/30 flex items-center gap-1.5"
                >
                  <Play size={14} fill="currentColor" />
                  Play Now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Rename Dialog Modal ───────────────────────────────────────────── */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 ${
            isLight
              ? 'border border-slate-200 bg-white text-slate-900'
              : 'border border-white/10 bg-[#0e141f] text-white'
          }`}>
            <h3 className={`text-base font-bold flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
              <Edit3 size={18} className="text-primary" />
              Rename Video Title
            </h3>
            <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-white/50'}`}>
              Change the in-app display title for this recording.
            </p>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveRename()
                if (e.key === 'Escape') setRenameTarget(null)
              }}
              autoFocus
              className={`w-full h-11 px-3.5 rounded-xl text-sm font-semibold focus:outline-none focus:border-primary ${
                isLight
                  ? 'bg-slate-50 border border-slate-300 text-slate-900 placeholder-slate-400'
                  : 'bg-black/50 border border-white/20 text-white'
              }`}
            />
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setRenameTarget(null)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                  isLight ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100' : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRename}
                disabled={!renameValue.trim()}
                className="px-5 py-2 rounded-xl bg-primary text-xs font-black text-white hover:bg-primary/90 transition-colors disabled:opacity-40"
              >
                Save Title
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Delete Confirmation Modal ─────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className={`w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4 ${
            isLight
              ? 'border border-red-200 bg-white text-slate-900'
              : 'border border-red-500/30 bg-[#0e141f] text-white'
          }`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-600/20 text-red-500 border border-red-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className={`text-base font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>Permanently Delete Video?</h3>
                <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-white/50'}`}>
                  {Array.isArray(deleteTarget)
                    ? `Are you sure you want to delete ${deleteTarget.length} video files from disk?`
                    : `Are you sure you want to delete "${deleteTarget.title}" from disk?`}
                </p>
              </div>
            </div>
            <p className={`text-xs p-3 rounded-xl border font-medium ${
              isLight
                ? 'bg-red-50 text-red-700 border-red-200'
                : 'bg-red-500/10 text-red-400/90 border-red-500/20'
            }`}>
              Warning: This action will physically delete the file(s) from your storage and remove all watch progress.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
                  isLight ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100' : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-xs font-black text-white transition-colors shadow-lg shadow-red-600/30"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

export default React.memo(Videos)