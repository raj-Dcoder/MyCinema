import React from 'react'
import { Play } from 'lucide-react'
import { Video } from '../types'

interface VideoCardProps {
  video: Video
  onPlay: (video: Video) => void
}

const VideoCard: React.FC<VideoCardProps> = ({ video, onPlay }) => {
  const posterUrl = video.poster_path 
    ? (video.poster_path.startsWith('http') 
        ? video.poster_path 
        : `media://file/${encodeURIComponent(video.poster_path)}`)
    : null

  const progressPercent = video.last_watched_time && video.duration 
    ? (video.last_watched_time / video.duration) * 100 
    : 0

  return (
    <div 
      className="group relative flex flex-col space-y-2 cursor-pointer transition-transform duration-300 hover:scale-105"
      onClick={() => onPlay(video)}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-md bg-secondary shadow-lg">
        {posterUrl ? (
          <img 
            src={posterUrl} 
            alt={video.title} 
            className="h-full w-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = 'https://via.placeholder.com/500x750?text=No+Poster'
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-secondary text-muted text-sm text-center p-4">
            {video.title}
          </div>
        )}
        
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center shadow-xl">
            <Play fill="white" size={24} className="ml-1" />
          </div>
        </div>

        {progressPercent > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-600">
            <div 
              className="h-full bg-primary transition-all" 
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>
      
      <div className="px-1">
        <h3 className="font-semibold text-sm line-clamp-1">
          {video.type === 'series' && video.series_name ? video.series_name : video.title}
        </h3>
        <p className="text-xs text-muted">
          {video.type === 'series' 
            ? `S${video.season?.toString().padStart(2, '0')} E${video.episode?.toString().padStart(2, '0')}` 
            : 'Movie'}
        </p>
      </div>
    </div>
  )
}

export default VideoCard
