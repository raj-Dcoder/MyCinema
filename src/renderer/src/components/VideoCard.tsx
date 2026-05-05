import React from 'react'
import { Play } from 'lucide-react'
import { Video } from '../types'

interface VideoCardProps {
  video: Video
  onPlay: (video: Video) => void
  onShowDetail?: (video: Video) => void
  isContinueWatching?: boolean
}

const VideoCard: React.FC<VideoCardProps> = ({ video, onPlay, onShowDetail, isContinueWatching }) => {
  const posterUrl = video.poster_path 
    ? (video.poster_path.startsWith('http') 
        ? video.poster_path 
        : `media://file/${encodeURIComponent(video.poster_path)}`)
    : null

  const backdropUrl = video.backdrop_path 
    ? (video.backdrop_path.startsWith('http') 
        ? video.backdrop_path 
        : `media://file/${encodeURIComponent(video.backdrop_path)}`)
    : null

  const progressPercent = video.last_watched_time && video.duration 
    ? (video.last_watched_time / video.duration) * 100 
    : 0

  const formatDuration = (seconds?: number) => {
    if (!seconds) return null
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
  }

  const genres = video.genres 
     ? video.genres.split(',').map(g => g.trim()).filter(g => g.length > 0) 
     : []

  const handleClick = () => {
    if (onShowDetail) {
      onShowDetail(video)
    } else {
      onPlay(video)
    }
  }

  // "Continue Watching" style (Side Panel)
  if (isContinueWatching) {
    return (
      <div 
        className="group flex items-center gap-4 p-2 rounded-2xl hover:bg-white/5 transition-all cursor-pointer"
        onClick={() => onPlay(video)}
      >
        <div className="relative w-24 aspect-video rounded-xl overflow-hidden bg-secondary flex-shrink-0">
          {backdropUrl || posterUrl ? (
            <img src={backdropUrl || posterUrl || ''} className="w-full h-full object-cover" alt="" />
          ) : (
            <div className="w-full h-full bg-neutral-800" />
          )}
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Play fill="white" size={16} className="text-white" />
          </div>
          {progressPercent > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
              <div className="h-full bg-red-600" style={{ width: `${progressPercent}%` }} />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-white truncate leading-tight mb-1">{video.type === 'series' && video.series_name ? video.series_name : video.title}</h4>
          <div className="flex items-center gap-2 text-[10px] font-bold text-muted uppercase tracking-wider">
            {video.release_year && <span>{video.release_year}</span>}
            {video.duration && <span>• {formatDuration(video.duration)}</span>}
          </div>
        </div>
        <div className="text-[11px] font-black text-white/40">{Math.round(progressPercent)}%</div>
      </div>
    )
  }

  // Standard Poster Style (Home/Grid)
  return (
    <div 
      className="group flex flex-col gap-3 cursor-pointer"
      onClick={handleClick}
    >
      <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-secondary shadow-lg ring-1 ring-white/5 group-hover:ring-red-600/50 transition-all duration-300 group-hover:-translate-y-2">
        {posterUrl ? (
          <img 
            src={posterUrl} 
            alt={video.title} 
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center p-4 text-center">
            <span className="text-xs text-muted font-bold uppercase tracking-widest opacity-50">{video.title}</span>
          </div>
        )}

        {/* Rating Badge */}
        {video.vote_average && video.vote_average > 0 && (
          <div className="absolute top-3 right-3 z-10 px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded-lg border border-white/10 flex items-center gap-1">
            <span className="text-yellow-400 text-[10px]">★</span>
            <span className="text-white text-[10px] font-black">{video.vote_average.toFixed(1)}</span>
          </div>
        )}

        {/* Trending Badge */}
        {video.isExternal && (
          <div className="absolute top-3 left-3 z-10 px-2 py-0.5 bg-primary/20 backdrop-blur-md border border-primary/30 rounded-lg flex items-center gap-1.5">
            <div className="w-1 h-1 bg-primary rounded-full animate-pulse" />
            <span className="text-[8px] font-black text-white uppercase tracking-widest italic">Trending</span>
          </div>
        )}

        {/* Play Overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center shadow-xl transform scale-75 group-hover:scale-100 transition-transform duration-300">
            <Play fill="white" size={24} className="text-white ml-1" />
          </div>
        </div>
      </div>

      {/* Info Below */}
      <div className="space-y-1 px-1">
        <h3 className="text-sm font-bold text-white truncate leading-tight group-hover:text-primary transition-colors">
          {video.type === 'series' && video.series_name ? video.series_name : video.title}
        </h3>
        <div className="flex items-center gap-2 text-[10px] font-bold text-muted uppercase tracking-wider">
          {video.release_year && <span>{video.release_year}</span>}
          <span>•</span>
          <span className="truncate">{genres.length > 0 ? genres[0] : (video.type === 'series' ? 'Web Series' : 'Movie')}</span>
        </div>
      </div>
    </div>
  )
}

export default VideoCard
