import React, { useEffect, useState } from 'react'
import { Play, Clock, Video as VideoIcon } from 'lucide-react'
import { Video } from '../types'
import HorizontalScrollRow from '../components/HorizontalScrollRow'

interface VideosProps {
  onPlay: (video: Video) => void
  onShowDetail: (video: Video) => void
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
  onShowDetail?: (v: Video) => void;
  isContinueWatching?: boolean;
}> = ({ video, onPlay, onShowDetail, isContinueWatching }) => {
  const posterUrl = video.poster_path
    ? (video.poster_path.startsWith('http')
        ? video.poster_path
        : `media://file/${encodeURIComponent(video.poster_path)}`)
    : null

  const progressPercent = video.last_watched_time && video.duration
    ? (video.last_watched_time / video.duration) * 100
    : 0

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
      className="group relative flex flex-col space-y-2 cursor-pointer"
      onClick={handleClick}
    >
      {/* Landscape thumbnail */}
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-secondary shadow-lg transition-transform duration-300 group-hover:scale-[1.03] group-hover:shadow-2xl">
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={video.title}
            className="h-full w-full object-cover"
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
          <div className="w-14 h-14 bg-primary rounded-full flex items-center justify-center shadow-xl">
            <Play fill="white" size={26} className="ml-1" />
          </div>
        </div>

        {/* Duration badge */}
        {(video.duration ?? 0) > 0 && (
          <div className="absolute bottom-2 right-2 bg-black/75 text-white text-xs font-semibold px-2 py-0.5 rounded-md backdrop-blur-sm flex items-center gap-1">
            <Clock size={10} />
            {formatDuration(video.duration!)}
          </div>
        )}

        {/* Progress bar */}
        {progressPercent > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>

      <div className="px-1">
        <h3 className="font-semibold text-sm line-clamp-2 leading-snug">{video.title}</h3>
      </div>
    </div>
  )
}

const Videos: React.FC<VideosProps> = ({ onPlay, onShowDetail }) => {
  const [clips, setClips] = useState<Video[]>([])
  const [continueWatching, setContinueWatching] = useState<Video[]>([])

  const fetchClips = async () => {
    const allVideos: Video[] = await window.api.getVideos()
    const cwVideos: Video[] = await window.api.getContinueWatching()

    // Short clips only (< 1 hour, not a series)
    const isShortClip = (v: Video) =>
      v.type === 'movie' && (v.duration ?? 0) > 0 && (v.duration ?? 0) < ONE_HOUR

    setClips(allVideos.filter(isShortClip))

    // Continue watching: short clips with progress, not completed
    setContinueWatching(
      cwVideos.filter(v => isShortClip(v) && !v.completed)
    )
  }

  useEffect(() => {
    fetchClips()
    window.api.onLibraryUpdated(fetchClips)
    return () => window.api.removeAllLibraryUpdateListeners()
  }, [])

  const totalClips = clips.length

  return (
    <div className="space-y-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h2 className="text-3xl font-bold">Videos</h2>
        {totalClips > 0 && (
          <span className="text-sm text-muted bg-secondary px-2.5 py-1 rounded-full font-medium">
            {totalClips} clip{totalClips !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Continue Watching */}
      {continueWatching.length > 0 && (
        <section>
          <h3 className="text-xl font-semibold mb-5 flex items-center gap-2">
            Continue Watching
            <span className="w-2 h-2 rounded-full bg-primary" />
          </h3>
          <HorizontalScrollRow>
            {continueWatching.map(video => (
              <div key={video.id} className="w-56 md:w-64 lg:w-72 flex-shrink-0">
                <VideoClipCard video={video} onPlay={onPlay} onShowDetail={onShowDetail} isContinueWatching={true} />
              </div>
            ))}
          </HorizontalScrollRow>
        </section>
      )}

      {/* All Videos grid */}
      {clips.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 rounded-full bg-secondary flex items-center justify-center mb-5">
            <VideoIcon size={36} className="text-muted" />
          </div>
          <p className="text-muted text-lg font-medium">No short videos found</p>
          <p className="text-muted/60 text-sm mt-2 max-w-sm">
            Videos shorter than 1 hour that aren't Web Series episodes will appear here. Add a folder from Library settings.
          </p>
        </div>
      ) : (
        <section>
          {continueWatching.length > 0 && (
            <h3 className="text-xl font-semibold mb-5">All Videos</h3>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 pb-8">
            {clips.map(video => (
              <VideoClipCard key={video.id} video={video} onPlay={onPlay} onShowDetail={onShowDetail} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}


export default Videos
