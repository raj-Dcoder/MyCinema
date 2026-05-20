import React, { useEffect, useState, useRef, useMemo } from 'react'
import { Play, Clock, Video as VideoIcon, Search, ArrowUpDown, Shuffle, CirclePlay, X, Check } from 'lucide-react'
import { Video } from '../types'
import HorizontalScrollRow from '../components/HorizontalScrollRow'

interface VideosProps {
  onPlay: (video: Video) => void
}

const ONE_HOUR = 3600 // seconds

function formatDuration(seconds: number): string {
  if (!seconds) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  if (m >= 60) {
    const h = Math.floor(m / 60)
    const rem = m % 60
    return `${h}h ${rem}m`
  }
  return `${m}m ${s.toString().padStart(2, '0')}s`
}

const VideoClipCard: React.FC<{ 
  video: Video; 
  onPlay: (v: Video) => void;
  isContinueWatching?: boolean;
}> = ({ video, onPlay, isContinueWatching }) => {
  const [isHovered, setIsHovered] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  const posterUrl = video.poster_path
    ? (video.poster_path.startsWith('http')
        ? video.poster_path
        : `media://file/${encodeURIComponent(video.poster_path)}`)
    : null

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isHovered && videoRef.current && (video.duration ?? 0) > 0) {
      const duration = video.duration!
      const steps = 8
      let currentStep = 1

      // Instant jump to the first segment
      videoRef.current.currentTime = (currentStep / (steps + 1)) * duration

      interval = setInterval(() => {
        currentStep = (currentStep % steps) + 1
        if (videoRef.current) {
          videoRef.current.currentTime = (currentStep / (steps + 1)) * duration
        }
      }, 600)
    }
    return () => clearInterval(interval)
  }, [isHovered, video.duration])

  const progressPercent = video.last_watched_time && video.duration
    ? (video.last_watched_time / video.duration) * 100
    : 0

  const handleClick = () => {
    onPlay(video)
  }

  return (
    <div
      className="group relative flex flex-col space-y-2 cursor-pointer"
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Landscape thumbnail / Video Preview */}
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-secondary shadow-lg transition-transform duration-300 group-hover:scale-[1.03] group-hover:shadow-2xl ring-1 ring-white/5 group-hover:ring-primary/40">
        {isHovered ? (
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
            className="h-full w-full object-cover transition-opacity duration-300"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-secondary to-background">
            <VideoIcon size={40} className="text-muted opacity-50" />
          </div>
        )}

        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-14 h-14 bg-primary rounded-full flex items-center justify-center shadow-xl transform scale-90 group-hover:scale-100 transition-transform">
            <Play fill="white" size={26} className="ml-1" />
          </div>
        </div>

        {/* Duration badge */}
        {(video.duration ?? 0) > 0 && (
          <div className="absolute bottom-2 right-2 bg-black/75 text-white text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-md flex items-center gap-1 border border-white/10 uppercase tracking-tighter">
            {formatDuration(video.duration!)}
          </div>
        )}

        {/* Progress bar */}
        {progressPercent > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
            <div
              className={`h-full transition-all shadow-[0_0_8px_rgba(var(--primary-rgb),0.6)] ${video.completed ? 'bg-green-500' : 'bg-primary'}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>

      <div className="px-1">
        <h3 className="font-bold text-sm line-clamp-1 leading-snug group-hover:text-primary transition-colors tracking-tight">{video.title}</h3>
        {isContinueWatching && (
           <p className="text-[10px] text-muted font-bold uppercase tracking-widest mt-0.5">Resume Playback</p>
        )}
      </div>
    </div>
  )
}

const Videos: React.FC<VideosProps> = ({ onPlay }) => {
  const [clips, setClips] = useState<Video[]>([])
  const [continueWatching, setContinueWatching] = useState<Video[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState('All')
  const [sortBy, setSortBy] = useState('newest')
  const [showSortMenu, setShowSortMenu] = useState(false)

  const fetchClips = async () => {
    const allVideos: Video[] = await window.api.getVideos()
    const cwVideos: Video[] = await window.api.getContinueWatching()

    // New scans store clips/personal media as `video`; keep the old short-movie
    // rule as a compatibility bridge until older libraries are rescanned.
    const isShortClip = (v: Video) =>
      v.type === 'video' || (v.type === 'movie' && (v.duration ?? 0) > 0 && (v.duration ?? 0) < ONE_HOUR)

    setClips(allVideos.filter(isShortClip))

    // Continue watching: short clips with progress, not completed
    setContinueWatching(
      cwVideos.filter(v => isShortClip(v) && !v.completed)
    )
  }

  useEffect(() => {
    fetchClips()
    return window.api.onLibraryUpdated(fetchClips)
  }, [])

  const filteredClips = useMemo(() => {
    let result = clips.filter(v => 
      v.title.toLowerCase().includes(searchQuery.toLowerCase())
    )

    if (activeFilter === 'Unwatched') {
      result = result.filter(v => {
        const isCompleted = !!v.completed;
        const hasProgress = (v.last_watched_time ?? 0) >= (v.duration ?? 0) * 0.9 && (v.duration ?? 0) > 0;
        return !isCompleted && !hasProgress;
      })
    } else if (activeFilter === 'Watched') {
      result = result.filter(v => {
        const isCompleted = !!v.completed;
        const hasProgress = (v.last_watched_time ?? 0) >= (v.duration ?? 0) * 0.9 && (v.duration ?? 0) > 0;
        return isCompleted || hasProgress;
      })
    } else if (activeFilter === 'Short (<5m)') {
      result = result.filter(v => (v.duration ?? 0) < 300)
    } else if (activeFilter === 'Long (>20m)') {
      result = result.filter(v => (v.duration ?? 0) > 1200)
    }

    result.sort((a, b) => {
      if (sortBy === 'name') return a.title.localeCompare(b.title)
      if (sortBy === 'newest') return (b.id ?? 0) - (a.id ?? 0)
      if (sortBy === 'longest') return (b.duration ?? 0) - (a.duration ?? 0)
      if (sortBy === 'shortest') return (a.duration ?? 0) - (b.duration ?? 0)
      return 0
    })

    return result
  }, [clips, searchQuery, activeFilter, sortBy])

  const handleShuffle = () => {
    if (filteredClips.length > 0) {
      const random = filteredClips[Math.floor(Math.random() * filteredClips.length)]
      onPlay(random)
    }
  }

  const handlePlayAll = () => {
    if (filteredClips.length > 0) {
      onPlay(filteredClips[0])
    }
  }

  const totalClips = clips.length
  const displayedClips = filteredClips.length

  return (
    <div className="space-y-10 animate-in fade-in duration-500 pb-20">
      {/* Header & Controls */}
      <div className="flex flex-col gap-6 relative z-30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-3xl font-bold tracking-tight">Videos</h2>
            {totalClips > 0 && (
              <span className="text-xs text-muted bg-secondary/50 px-2.5 py-1 rounded-lg font-bold border border-white/5 uppercase tracking-wider">
                {totalClips} clip{totalClips !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
             <button 
               onClick={handleShuffle}
               className="flex items-center gap-2 px-4 py-2 bg-secondary/30 hover:bg-secondary/60 rounded-xl transition-all font-bold text-xs uppercase tracking-widest border border-white/5"
             >
               <Shuffle size={14} className="text-primary" />
               Shuffle
             </button>
             <button 
               onClick={handlePlayAll}
               className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/80 text-white rounded-xl transition-all font-bold text-xs uppercase tracking-widest shadow-lg shadow-primary/20"
             >
               <CirclePlay size={14} />
               Play All
             </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 bg-secondary/20 p-4 rounded-2xl border border-white/5 backdrop-blur-sm">
          <div className="relative flex-1 min-w-[300px] group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted transition-colors group-focus-within:text-primary" size={18} />
            <input
              type="text"
              placeholder="Search by title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-secondary/40 border border-white/10 focus:border-primary/50 focus:ring-1 focus:ring-primary/50 rounded-xl py-2.5 pl-10 pr-4 outline-none transition-all placeholder:text-muted/50 text-sm font-medium"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-white transition-colors"
                aria-label="Clear search"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-background/50 p-1 rounded-xl border border-white/5">
              {['All', 'Unwatched', 'Watched', 'Short (<5m)', 'Long (>20m)'].map(filter => (
                <button
                  key={filter}
                  onClick={() => setActiveFilter(filter)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                    activeFilter === filter 
                      ? 'bg-primary text-white shadow-lg' 
                      : 'text-muted hover:text-white hover:bg-white/5'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>

            <div className="relative">
              <button
                 onClick={() => setShowSortMenu(!showSortMenu)}
                 className="flex items-center gap-2 px-4 py-2.5 bg-secondary/40 hover:bg-secondary/60 rounded-xl border border-white/10 transition-all text-[10px] font-bold uppercase tracking-widest"
              >
                <ArrowUpDown size={14} className="text-primary" />
                Sort: {sortBy === 'newest' ? 'Newest' : sortBy === 'name' ? 'A-Z' : sortBy === 'longest' ? 'Longest' : 'Shortest'}
              </button>
              
              {showSortMenu && (
                <>
                  <div className="fixed inset-0 z-[60]" onClick={() => setShowSortMenu(false)} />
                  <div className="absolute right-0 mt-2 w-48 bg-surface/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl z-[70] p-1 overflow-hidden animate-in fade-in zoom-in duration-200">
                    {[
                      { id: 'newest', label: 'Recently Added' },
                      { id: 'name', label: 'Name (A-Z)' },
                      { id: 'longest', label: 'Duration (Longest)' },
                      { id: 'shortest', label: 'Duration (Shortest)' }
                    ].map(option => (
                      <button
                        key={option.id}
                        onClick={() => {
                          setSortBy(option.id)
                          setShowSortMenu(false)
                        }}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-white/5 transition-colors"
                      >
                        {option.label}
                        {sortBy === option.id && <Check size={14} className="text-primary" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Continue Watching */}
      {continueWatching.length > 0 && searchQuery === '' && activeFilter === 'All' && (
        <section className="animate-in slide-in-from-left duration-700">
          <h3 className="text-xl font-bold mb-5 flex items-center gap-2">
            Continue Watching
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          </h3>
          <HorizontalScrollRow>
            {continueWatching.map(video => (
              <div key={video.id} className="w-56 md:w-64 lg:w-72 flex-shrink-0">
                <VideoClipCard video={video} onPlay={onPlay} isContinueWatching={true} />
              </div>
            ))}
          </HorizontalScrollRow>
        </section>
      )}

      {/* All Videos grid */}
      {displayedClips === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center animate-in fade-in duration-500">
          <div className="w-24 h-24 rounded-full bg-secondary/30 flex items-center justify-center mb-6 border border-white/5 relative">
            <VideoIcon size={44} className="text-muted/40" />
            <div className="absolute inset-0 rounded-full bg-primary/5 animate-ping" />
          </div>
          <p className="text-white text-xl font-bold tracking-tight">No videos match your criteria</p>
          <p className="text-muted/60 text-sm mt-2 max-w-sm font-medium">
            Try adjusting your search query, filters, or sorting options to find what you're looking for.
          </p>
          <button 
            onClick={() => { setSearchQuery(''); setActiveFilter('All'); setSortBy('newest'); }}
            className="mt-8 text-primary font-bold text-xs uppercase tracking-[0.2em] hover:text-primary/80 transition-colors"
          >
            Reset All Filters
          </button>
        </div>
      ) : (
        <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-baseline justify-between mb-6">
            <h3 className="text-xl font-bold tracking-tight">
              {searchQuery || activeFilter !== 'All' ? 'Filtered Results' : 'All Videos'}
            </h3>
            <span className="text-[10px] font-bold text-muted uppercase tracking-widest">
              Showing {displayedClips} of {totalClips}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6 pb-8">
            {filteredClips.map(video => (
              <VideoClipCard key={video.id} video={video} onPlay={onPlay} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export default Videos
