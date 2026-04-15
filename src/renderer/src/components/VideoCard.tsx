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
    if (h > 0) return `${h}H ${m}M`
    return `${m}M`
  }

  const getFormat = (filePath: string) => {
    const ext = filePath.split('.').pop()?.toUpperCase()
    return ext || 'MKV'
  }

  const genres = video.genres 
     ? video.genres.split(',').map(g => g.trim()).filter(g => g.length > 0) 
     : []

  const getFinishTimeInfo = (v: Video) => {
    if (!v.duration || v.last_watched_time === undefined) return null
    
    const timeLeftSeconds = v.duration - v.last_watched_time
    const totalMins = Math.ceil(timeLeftSeconds / 60)
    
    const now = new Date()
    const finishDate = new Date(now.getTime() + timeLeftSeconds * 1000)
    
    let hours = finishDate.getHours()
    const minutes = finishDate.getMinutes()
    const ampm = hours >= 12 ? 'pm' : 'am'
    hours = hours % 12
    hours = hours ? hours : 12 
    
    const formattedTime = `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`
    
    return (
      <span className="flex flex-wrap items-center justify-start gap-x-1.5 lowercase italic font-medium tracking-widest opacity-80">
        <span className="whitespace-nowrap">{totalMins}min left</span>
        <span className="opacity-40 italic text-[11px] leading-none">•</span>
        <span className="whitespace-nowrap">you can finish it by {formattedTime}</span>
      </span>
    )
  }

  const handleClick = () => {
    if (isContinueWatching) {
      onPlay(video)
    } else if (onShowDetail) {
      onShowDetail(video)
    } else {
      onPlay(video)
    }
  }

  if (isContinueWatching) {
    const displayImage = backdropUrl || posterUrl
    return (
      <div 
        className="group relative flex flex-row justify-start h-72 md:h-96 lg:h-[28rem] w-full bg-secondary/40 rounded-3xl overflow-hidden shadow-2xl cursor-pointer ring-1 ring-white/5 hover:ring-white/20 hover:-translate-y-2 hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all duration-400 ease-out"
        onClick={handleClick}
        style={{ WebkitMaskImage: '-webkit-radial-gradient(white, black)' }}
      >
        {/* Background Image */}
        <div className="absolute inset-0 z-0 overflow-hidden bg-black rounded-3xl">
           {displayImage && <img src={displayImage} className="w-full h-full object-cover opacity-100 group-hover:opacity-90 transition-all duration-700 ease-out scale-105 group-hover:scale-100 object-center" alt="" />}
           <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-transparent to-transparent group-hover:from-black/60 group-hover:via-black/5 transition-all duration-500"></div>
           <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent group-hover:from-black/70 group-hover:via-black/10 transition-all duration-500"></div>
        </div>
        
        {/* Content overlaid directly on the backdrop */}
        <div className="relative z-10 flex flex-col justify-end items-start text-left flex-1 p-6 md:p-8 w-full md:w-3/4 lg:w-2/3">
           <h2 className="text-3xl md:text-5xl font-bold text-white line-clamp-2 mb-2 group-hover:text-red-100 transition-colors drop-shadow-lg">
              {video.type === 'series' && video.series_name ? video.series_name : video.title}
           </h2>
           
           <p className="text-white/80 text-sm md:text-lg font-bold tracking-widest mb-4 drop-shadow-md">
              {video.type === 'series' && video.season !== undefined && video.episode !== undefined ? (
                <span className="text-red-400">
                  SEASON {video.season} • EPISODE {video.episode}
                </span>
              ) : video.release_year ? (
                <span>{video.release_year}</span>
              ) : null}
           </p>
  
           <div className="flex flex-col items-start translate-y-1 group-hover:translate-y-0 transition-transform duration-300 mb-1">
              {video.duration && video.last_watched_time !== undefined && getFinishTimeInfo(video)}
           </div>
        </div>

        {/* Play Button - Bottom Right */}
        <div className="absolute bottom-6 right-6 md:bottom-8 md:right-8 z-10 overflow-visible flex items-end">
          <div className="w-16 h-16 md:w-20 md:h-20 bg-red-600 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(220,38,38,0.5)] transform scale-90 group-hover:scale-110 transition-transform duration-300 hover:bg-red-500">
             <Play fill="white" className="w-8 h-8 md:w-10 md:h-10 ml-2" />
          </div>
        </div>


        {/* Progress bar attached to bottom of card */}
        {progressPercent > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-2 bg-black/60 z-20">
            <div 
              className="h-full bg-red-600 transition-all shadow-[0_0_12px_rgba(220,38,38,0.8)]" 
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div 
      className="group relative flex flex-col space-y-2 cursor-pointer transition-all duration-300"
      onClick={handleClick}
    >
      <div 
        className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-secondary shadow-lg ring-1 ring-white/10 group-hover:ring-red-600/50 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_8px_30px_rgba(220,38,38,0.2)]"
        style={{ WebkitMaskImage: '-webkit-radial-gradient(white, black)' }}
      >
        <div className="absolute inset-0 bg-neutral-900 animate-pulse" style={{ display: posterUrl ? 'none' : 'block' }}></div>
        {posterUrl ? (
          <img 
            src={posterUrl} 
            alt={video.title} 
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'https://via.placeholder.com/500x750?text=No+Poster'
            }}
          />
        ) : (
          <div className="relative z-10 flex h-full w-full items-center justify-center bg-secondary text-muted text-sm text-center p-4">
            <span className="opacity-50">{video.title}</span>
          </div>
        )}
        
        {/* Badges for Catalog Cards */}
        <div className="absolute top-2 right-2 z-10 flex gap-1 transform transition-transform duration-300 group-hover:-translate-y-2 group-hover:opacity-0">
          {video.vote_average && video.vote_average > 0 ? (
            <span className="px-1.5 py-0.5 bg-black/60 backdrop-blur-md rounded-md text-[10px] font-bold text-white border border-white/10 flex items-center gap-1">
              <span className="text-yellow-400">★</span> {video.vote_average.toFixed(1)}
            </span>
          ) : null}
        </div>

        {/* Hover Overlay - Catalog */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4 text-center backdrop-blur-[2px]">
          {/* Play Button - Centered */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(220,38,38,0.4)] transform scale-75 group-hover:scale-100 transition-transform duration-500 ease-out">
              <Play fill="white" size={32} className="ml-1 text-white" />
            </div>
          </div>

          {/* Quick Info Below Play Button */}
          <div className="relative z-10 translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
            {/* Tagline or Overview */}
            {(video.tagline || video.overview) && (
              <p className="text-white/90 text-[0.75rem] mb-3 line-clamp-3 leading-snug drop-shadow-md">
                {video.tagline || video.overview}
              </p>
            )}

            {/* Info Row: Duration and Format */}
            <div className="flex items-center justify-center space-x-2 text-white/70 text-[10px] font-bold tracking-tight">
              {video.episode_count ? (
                <span className="text-red-400">{video.episode_count} Episodes</span>
              ) : (
                <>
                  {video.type === 'series' && video.season !== undefined && video.episode !== undefined ? (
                    <>
                      <span className="text-red-400">
                        S{video.season.toString().padStart(2, '0')} E{video.episode.toString().padStart(2, '0')}
                      </span>
                      <span>•</span>
                    </>
                  ) : null}
                  {video.duration ? (
                    <>
                      <span>{formatDuration(video.duration)}</span>
                      <span>•</span>
                    </>
                  ) : null}
                </>
              )}
              <span className="uppercase bg-white/10 px-1.5 py-0.5 rounded">{getFormat(video.file_path)}</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Title Area */}
      <div className="px-1 pt-1 flex flex-col">
        <h3 className="font-bold tracking-tight text-white/90 group-hover:text-white transition-colors line-clamp-1 text-[0.95rem]">
          {video.type === 'series' && video.series_name ? video.series_name : video.title}
        </h3>
        
        {/* Subtitle / Meta */}
        <p className="text-[0.8rem] text-white/50 font-medium tracking-wide mt-0.5 flex items-center truncate">
          {video.release_year ? `${video.release_year} • ` : ''}
          {video.type === 'series' && video.episode_count 
            ? `${video.episode_count} Episodes`
            : (genres.length > 0 ? genres[0] : (video.type === 'series' ? 'Web Series' : 'Movie'))}
        </p>
      </div>
    </div>
  )
}

export default VideoCard
