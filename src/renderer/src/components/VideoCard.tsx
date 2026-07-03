import React from 'react'
import { Layers3, Play, Star } from 'lucide-react'
import { Video } from '../types'
import { groupSeriesCards } from '../utils/seriesCards'

interface VideoCardProps {
  video: Video
  onPlay: (video: Video) => void
  onShowDetail?: (video: Video) => void
  isContinueWatching?: boolean
}

const getHighQualityTmdbImageUrl = (url: string) => {
  return url.startsWith('https://image.tmdb.org/t/p/')
    ? url.replace(/\/t\/p\/(w342|w500|w780|w1280|original)\//, '/t/p/w500/')
    : url
}

const VideoCard: React.FC<VideoCardProps> = ({ video, onPlay, onShowDetail, isContinueWatching }) => {
  const posterUrl = video.poster_path 
    ? (video.poster_path.startsWith('http') 
        ? getHighQualityTmdbImageUrl(video.poster_path)
        : `media://file/${encodeURIComponent(video.poster_path)}`)
    : null

  const backdropUrl = video.backdrop_path 
    ? (video.backdrop_path.startsWith('http') 
        ? getHighQualityTmdbImageUrl(video.backdrop_path)
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

  const resolveCardTarget = async () => {
    if (video.isExternal || video.type !== 'series' || !video.series_name) return video

    try {
      const allVideos: Video[] = await window.api.getVideos()
      const seriesCard = groupSeriesCards(allVideos).find(item =>
        item.series_name?.trim().toLowerCase() === video.series_name?.trim().toLowerCase()
      )
      return seriesCard || video
    } catch (error) {
      console.error('Failed to resolve series resume target:', error)
      return video
    }
  }

  const handleClick = async () => {
    const target = await resolveCardTarget()
    if (onShowDetail) {
      onShowDetail(target)
    } else {
      onPlay(target)
    }
  }

  const title = video.type === 'series' && video.series_name ? video.series_name : video.title
  const tagline = video.tagline || video.overview
  const category = genres.length > 0 ? genres[0] : (video.type === 'series' ? 'Web Series' : video.type === 'video' ? 'Video' : 'Movie')
  const handleWatchNow = async () => {
    if (video.isExternal && onShowDetail) {
      onShowDetail(video)
      return
    }

    onPlay(await resolveCardTarget())
  }

  // "Continue Watching" style (Side Panel)
  if (isContinueWatching) {
    return (
      <div 
        className="group flex items-center gap-4 p-2 rounded-2xl hover:bg-white/5 transition-all cursor-pointer"
        onClick={() => onPlay(video)}
      >
        <div className="relative w-24 aspect-video rounded-xl overflow-hidden bg-secondary flex-shrink-0 isolate transform-gpu [clip-path:inset(0_round_0.75rem)]">
          {backdropUrl || posterUrl ? (
            <img
              src={backdropUrl || posterUrl || ''}
              className="w-full h-full object-cover"
              alt=""
              loading="lazy"
              decoding="async"
            />
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
      className="group cursor-pointer"
      onClick={handleClick}
      tabIndex={0}
      role="button"
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          void handleClick()
        }
      }}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-2xl bg-secondary shadow-lg ring-1 ring-white/5 isolate transform-gpu transition-[transform,box-shadow] duration-300 will-change-transform [backface-visibility:hidden] [clip-path:inset(0_round_1rem)] group-hover:-translate-y-2 group-hover:scale-[1.03] group-hover:shadow-2xl group-hover:shadow-red-950/30 group-hover:ring-red-600/60 group-focus-visible:-translate-y-2 group-focus-visible:scale-[1.03] group-focus-visible:outline-none group-focus-visible:ring-2 group-focus-visible:ring-red-600/80">
        {posterUrl ? (
          <img 
            src={posterUrl} 
            alt={title}
            className="block h-full w-full object-cover transform-gpu transition-transform duration-500 [backface-visibility:hidden] group-hover:scale-110"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center p-4 text-center">
            <span className="text-xs text-muted font-bold uppercase tracking-widest opacity-50">{title}</span>
          </div>
        )}

        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black via-black/75 to-black/10 p-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
          <div className="mb-auto flex items-start justify-between gap-2">
            {(() => {
              if ((video.version_count || 1) > 1) {
                return (
                  <span className="inline-flex items-center gap-1 rounded-md border border-emerald-400/25 bg-emerald-400/15 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-emerald-200 backdrop-blur-md">
                    <Layers3 size={10} />
                    {video.version_count} versions
                  </span>
                )
              }
              if (video.isExternal && !video.is_watchlist) {
                if (!video.release_date) {
                  return (
                    <span className="rounded-md border border-red-500/30 bg-red-600/25 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-white backdrop-blur-md">
                      Trending
                    </span>
                  )
                }
                
                const releaseDate = new Date(video.release_date)
                const isReleased = releaseDate <= new Date()
                
                if (isReleased) {
                  return (
                    <span className="rounded-md border border-emerald-500/30 bg-emerald-600/25 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-emerald-200 backdrop-blur-md">
                      Released
                    </span>
                  )
                } else {
                  return (
                    <span className="rounded-md border border-amber-500/30 bg-amber-600/25 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-amber-200 backdrop-blur-md">
                      Coming Soon
                    </span>
                  )
                }
              }
              return <span />
            })()}
            {video.vote_average && video.vote_average > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/55 px-2 py-1 text-[10px] font-black text-white backdrop-blur-md">
                <Star size={11} fill="#facc15" className="text-yellow-400" />
                {video.vote_average.toFixed(1)}
              </span>
            )}
          </div>

          <div className="space-y-2">
            <div>
              <h3 className="line-clamp-2 text-sm font-black leading-tight text-white">
                {title}
              </h3>
              <div className="mt-1 flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-white/65">
                {video.release_year && <span>{video.release_year}</span>}
                {video.release_year && <span className="h-1 w-1 rounded-full bg-white/35" />}
                <span className="truncate">{category}</span>
              </div>
            </div>

            {tagline && (
              <p className="line-clamp-2 text-[11px] font-medium leading-snug text-white/75">
                {tagline}
              </p>
            )}

            <button
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-red-950/40 transition-colors hover:bg-red-500"
              onClick={(event) => {
                event.stopPropagation()
                void handleWatchNow()
              }}
            >
              <Play fill="white" size={14} />
              Watch Now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default VideoCard
