import React, { useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, RotateCw, X, Maximize, Volume2, Subtitles, Music, SkipForward as SkipNext } from 'lucide-react'
import { Video } from '../types'

interface VideoPlayerProps {
  video: Video
  onClose: () => void
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ video, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showControls, setShowControls] = useState(true)
  const [subtitlePath, setSubtitlePath] = useState<string | null>(null)
  const [volume, setVolume] = useState(1)
  const [currentVideo, setCurrentVideo] = useState<Video>(video)
  const [isSeeking, setIsSeeking] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [audioTracks, setAudioTracks] = useState<any[]>([])
  const [currentAudioTrack, setCurrentAudioTrack] = useState<number>(0)
  const [hasNextEpisode, setHasNextEpisode] = useState(false)
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const checkNextEpisode = async (video: Video) => {
    if (video.type === 'series' && video.series_name) {
      const episodes: Video[] = await window.api.getSeriesInfo(video.series_name)
      const currentIndex = episodes.findIndex(e => e.id === video.id)
      setHasNextEpisode(currentIndex !== -1 && currentIndex < episodes.length - 1)
    } else {
      setHasNextEpisode(false)
    }
  }

  useEffect(() => {
    const fetchProgress = async () => {
      const progress = await window.api.getVideoProgress(currentVideo.id)
      if (progress && videoRef.current) {
        videoRef.current.currentTime = progress.last_watched_time
        setCurrentTime(progress.last_watched_time)
      }
    }

    const fetchSubtitles = async () => {
      const srt = await window.api.getSubtitlePath(currentVideo.file_path)
      if (srt) setSubtitlePath(srt)
      else setSubtitlePath(null)
    }

    fetchProgress()
    fetchSubtitles()
    checkNextEpisode(currentVideo)
    setIsPlaying(false)
    if (videoRef.current) {
      videoRef.current.load()
      videoRef.current.play().catch(e => console.error('Auto-play failed:', e))
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        togglePlay()
        e.preventDefault()
      } else if (e.code === 'ArrowRight') {
        seek(10)
      } else if (e.code === 'ArrowLeft') {
        seek(-10)
      } else if (e.code === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentVideo.id])

  useEffect(() => {
    const interval = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        const time = videoRef.current.currentTime
        const total = videoRef.current.duration
        const completed = time / total > 0.9
        window.api.updateVideoProgress(currentVideo.id, time, completed)
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [currentVideo.id])

  const handleEnded = async () => {
    playNextEpisode()
  }

  const playNextEpisode = async () => {
    if (currentVideo.type === 'series' && currentVideo.series_name) {
      const episodes: Video[] = await window.api.getSeriesInfo(currentVideo.series_name)
      const currentIndex = episodes.findIndex(e => e.id === currentVideo.id)
      if (currentIndex !== -1 && currentIndex < episodes.length - 1) {
        setCurrentVideo(episodes[currentIndex + 1])
      } else {
        onClose()
      }
    } else {
      onClose()
    }
  }

  const togglePlay = (e?: React.MouseEvent | React.KeyboardEvent) => {
    if (e) e.stopPropagation()
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play()
        setIsPlaying(true)
      } else {
        videoRef.current.pause()
        setIsPlaying(false)
      }
    }
  }

  const handleContainerClick = (e: React.MouseEvent) => {
    // Only toggle if clicking on the main video area, not on controls
    if ((e.target as HTMLElement).closest('.video-controls')) return

    if (clickTimeoutRef.current) {
      // It's a double click!
      clearTimeout(clickTimeoutRef.current)
      clickTimeoutRef.current = null
      toggleFullscreen()
    } else {
      // First click!
      clickTimeoutRef.current = setTimeout(() => {
        togglePlay()
        clickTimeoutRef.current = null
      }, 300)
    }
  }

  const toggleAudioTrack = () => {
    if (videoRef.current) {
      // @ts-ignore - audioTracks is not standard but supported in some browsers/Electron
      const tracks = videoRef.current.audioTracks
      if (tracks && tracks.length > 1) {
        const nextTrack = (currentAudioTrack + 1) % tracks.length
        for (let i = 0; i < tracks.length; i++) {
          tracks[i].enabled = i === nextTrack
        }
        setCurrentAudioTrack(nextTrack)
      }
    }
  }

  const seek = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime += seconds
    }
  }

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    setCurrentTime(time)
  }

  const handleSeekMouseUp = (e: React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>) => {
    setIsSeeking(false)
    const time = parseFloat((e.target as HTMLInputElement).value)
    if (videoRef.current) {
      videoRef.current.currentTime = time
    }
  }

  const handleSeekMouseDown = () => {
    setIsSeeking(true)
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value)
    setVolume(v)
    if (videoRef.current) {
      videoRef.current.volume = v
    }
  }

  const toggleFullscreen = () => {
    if (videoRef.current?.parentElement) {
      if (!document.fullscreenElement) {
        videoRef.current.parentElement.requestFullscreen()
      } else {
        document.exitFullscreen()
      }
    }
  }

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    return `${hrs > 0 ? hrs + ':' : ''}${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div 
      className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center group overflow-hidden"
      onMouseMove={() => {
        setShowControls(true)
        clearTimeout(window.controlsTimeout)
        window.controlsTimeout = setTimeout(() => setShowControls(false), 3000)
      }}
      onClick={handleContainerClick}
    >
      <video
        ref={videoRef}
        src={`media://file/${encodeURIComponent(currentVideo.file_path)}`}
        className="max-h-full w-full outline-none"
        onTimeUpdate={() => {
          if (!isSeeking) {
            setCurrentTime(videoRef.current?.currentTime || 0)
          }
        }}
        onDurationChange={() => setDuration(videoRef.current?.duration || 0)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={handleEnded}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onLoadedMetadata={() => {
          // @ts-ignore
          if (videoRef.current?.audioTracks) {
            // @ts-ignore
            setAudioTracks(Array.from(videoRef.current.audioTracks))
          }
        }}
        onError={(e) => {
          console.error('Video Error:', e)
          const error = (e.target as HTMLVideoElement).error
          console.error('Video Error Details:', error?.message, error?.code)
        }}
        crossOrigin="anonymous"
        autoPlay
      >
        {subtitlePath && (
          <track 
            label="English" 
            kind="subtitles" 
            srcLang="en" 
            src={`media://file/${encodeURIComponent(subtitlePath)}`} 
            default 
          />
        )}
      </video>

      {/* Buffering Indicator */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Close Button */}
      <button 
        onClick={onClose}
        className={`absolute top-6 right-6 p-2 rounded-full bg-black/50 text-white hover:bg-black/80 transition-opacity duration-300 video-controls ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        <X size={24} />
      </button>

      {/* Next Episode Button (Series Only) */}
      {currentVideo.type === 'series' && hasNextEpisode && (
        <button 
          onClick={(e) => { e.stopPropagation(); playNextEpisode(); }}
          className={`absolute top-6 right-20 flex items-center space-x-2 px-4 py-2 rounded-lg bg-black/50 text-white hover:bg-primary transition-all duration-300 video-controls ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
          <span className="text-sm font-bold uppercase tracking-wider">Next Episode</span>
          <SkipNext size={20} fill="currentColor" />
        </button>
      )}

      {/* Info Bar */}
      <div className={`absolute top-6 left-6 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <h2 className="text-xl font-bold text-white drop-shadow-md">{currentVideo.title}</h2>
        <p className="text-sm text-gray-300">
          {currentVideo.type === 'series' ? `Season ${currentVideo.season}, Episode ${currentVideo.episode}` : 'Movie'}
        </p>
      </div>

      {/* Controls */}
      <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-6 pt-12 transition-opacity duration-300 video-controls ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {/* Progress Bar */}
        <div className="group/progress relative h-1 mb-6 flex items-center cursor-pointer">
          <input 
            type="range"
            min="0"
            max={duration}
            step="0.1"
            value={currentTime}
            onChange={handleSeekChange}
            onMouseDown={handleSeekMouseDown}
            onMouseUp={handleSeekMouseUp}
            onTouchStart={handleSeekMouseDown}
            onTouchEnd={handleSeekMouseUp}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          />
          <div className="absolute inset-0 bg-gray-600 rounded-full" />
          <div 
            className="absolute inset-0 bg-primary rounded-full transition-all" 
            style={{ width: `${(currentTime / duration) * 100}%` }}
          />
          <div 
            className="absolute w-3 h-3 bg-primary rounded-full shadow-lg opacity-0 group-hover/progress:opacity-100 transition-opacity"
            style={{ left: `calc(${(currentTime / duration) * 100}% - 6px)` }}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <button onClick={() => seek(-10)} className="text-white hover:text-primary transition-colors">
              <RotateCcw size={24} fill="currentColor" />
            </button>
            <button onClick={togglePlay} className="text-white hover:scale-110 transition-transform">
              {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" />}
            </button>
            <button onClick={() => seek(10)} className="text-white hover:text-primary transition-colors">
              <RotateCw size={24} fill="currentColor" />
            </button>
            
            <div className="flex items-center space-x-3 group/volume">
              <Volume2 size={20} className="text-gray-300" />
              <input 
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={handleVolumeChange}
                className="w-0 group-hover/volume:w-20 transition-all overflow-hidden h-1 accent-primary"
              />
            </div>

            <div className="text-sm font-medium text-gray-300">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>

          <div className="flex items-center space-x-6">
            <button 
              onClick={(e) => { e.stopPropagation(); toggleAudioTrack(); }}
              className={`text-white transition-colors ${audioTracks.length > 1 ? 'hover:text-primary' : 'text-gray-500 opacity-50 cursor-not-allowed'}`}
              title={audioTracks.length > 1 ? `Switch Audio Track (${currentAudioTrack + 1}/${audioTracks.length})` : 'Single Audio Track'}
            >
              <Music size={24} />
            </button>
            <button className={`text-white transition-colors ${subtitlePath ? 'text-primary' : 'text-gray-500 opacity-50'}`}>
              <Subtitles size={24} />
            </button>
            <button onClick={toggleFullscreen} className="text-white hover:text-primary transition-colors">
              <Maximize size={24} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default VideoPlayer
