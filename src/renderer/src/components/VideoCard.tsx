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
      <span className="flex flex-wrap items-center justify-center gap-x-1.5 lowercase italic font-medium tracking-widest opacity-80">
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

  return (
    <div 
      className="group relative flex flex-col space-y-2 cursor-pointer transition-all duration-300"
      onClick={handleClick}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-secondary shadow-lg ring-1 ring-white/10 group-hover:ring-red-600/50 transition-all duration-300">
        {posterUrl ? (
          <img 
            src={posterUrl} 
            alt={video.title} 
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'https://via.placeholder.com/500x750?text=No+Poster'
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-secondary text-muted text-sm text-center p-4">
            {video.title}
          </div>
        )}
        
        {/* Hover Overlay */}
        {!isContinueWatching && (
          <div className="absolute inset-0 bg-black/85 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center p-4 text-center backdrop-blur-[2px]">
            {/* Play Button - Centered */}
            <div className="flex-1 flex flex-col items-center justify-center w-full">
              <div className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(220,38,38,0.4)] mb-6 transform scale-75 group-hover:scale-100 transition-transform duration-500 ease-out">
                <Play fill="white" size={36} className="ml-1 text-white" />
              </div>

              {/* Tagline */}
              {video.tagline && (
                <p className="text-white font-bold text-[0.9rem] mb-4 line-clamp-3 px-2 leading-tight">
                  "{video.tagline}"
                </p>
              )}

              {/* Info Row: Duration and Format */}
            <div className="flex items-center space-x-3 text-gray-400 text-[10px] font-black tracking-tight">
              {video.episode_count ? (
                <span className="text-red-500 font-black">{video.episode_count} Episodes</span>
              ) : (
                <>
                  {video.type === 'series' && video.season !== undefined && video.episode !== undefined ? (
                    <>
                      <span className="text-red-500 font-black">
                        S{video.season.toString().padStart(2, '0')} E{video.episode.toString().padStart(2, '0')}
                      </span>
                      <span className="text-gray-600">•</span>
                    </>
                  ) : null}
                  {video.duration ? (
                    <>
                      <span>{formatDuration(video.duration)}</span>
                      <span className="text-gray-600">•</span>
                    </>
                  ) : null}
                </>
              )}
              <span className="uppercase">{getFormat(video.file_path)}</span>
            </div>
            </div>

            {/* Genres - Pushed to the lower side */}
            <div className="flex flex-wrap justify-center gap-1.5 px-2 pb-2">
              {genres.slice(0, 3).map((genre, idx) => (
                <span 
                  key={idx} 
                  className="px-2.5 py-1 bg-white/5 rounded-md text-[9px] font-black uppercase tracking-widest text-gray-400 border border-white/5"
                >
                  {genre}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Standard Overlay for Continue Watching */}
        {isContinueWatching && (
          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col items-center backdrop-blur-[12px]">
            {/* Play Button - Centered vertically in the available space above the text */}
            <div className="flex-1 flex items-center justify-center">
              <div className="w-14 h-14 bg-red-600 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(220,38,38,0.4)] transform scale-90 group-hover:scale-100 transition-transform duration-500 ease-out">
                <Play fill="white" size={28} className="ml-0.5" />
              </div>
            </div>
            
            {video.duration && video.last_watched_time !== undefined && (
              <div className="text-white text-[11px] pb-8 px-4 text-center opacity-0 group-hover:opacity-100 transition-all duration-700 delay-150">
                {getFinishTimeInfo(video)}
              </div>
            )}
          </div>
        )}

        {progressPercent > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-gray-600/40">
            <div 
              className="h-full bg-primary transition-all shadow-[0_0_12px_rgba(229,9,20,0.6)]" 
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>
      
      <div className="px-1 pt-1.5">
        <h3 className="font-bold text-[0.9rem] line-clamp-1 tracking-tight text-red-600 mb-0.5">
          {video.type === 'series' && video.series_name ? video.series_name : video.title}
        </h3>
        <p className="text-[0.75rem] text-muted font-black tracking-wide uppercase opacity-60">
          {video.episode_count 
            ? `${video.episode_count} Episodes`
            : (video.type === 'series' && video.season !== undefined && video.episode !== undefined 
                ? `S${video.season.toString().padStart(2, '0')} E${video.episode.toString().padStart(2, '0')}` 
                : (video.type === 'series' ? 'Web Series' : 'Movies'))}
          {!video.episode_count && video.duration && ` • ${formatDuration(video.duration)}`}
        </p>
      </div>
    </div>
  )
}

export default VideoCard
