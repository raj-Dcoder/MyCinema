import React, { useEffect, useRef, useState } from 'react'
import { Play, Pause, Rewind, FastForward, X, Maximize, Volume2, Subtitles, Music, SkipForward as SkipNext } from 'lucide-react'
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
  const [selectedAudioId, setSelectedAudioId] = useState<string>('')
  const [showAudioMenu, setShowAudioMenu] = useState(false)
  const [currentSubtitle, setCurrentSubtitle] = useState<number | null>(null)
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false)
  const [playbackRate, setPlaybackRate] = useState<number>(1)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [seekPopup, setSeekPopup] = useState<{ show: boolean, text: string, id: number }>({ show: false, text: '', id: 0 })
  const [embeddedSubs, setEmbeddedSubs] = useState<any[]>([])
  const [embeddedAudio, setEmbeddedAudio] = useState<any[]>([])
  const [lastSeekTime, setLastSeekTime] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
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

  const availableSubtitles = []
  let trackIdx = 0
  if (subtitlePath) {
    availableSubtitles.push({ idx: trackIdx++, label: 'External SRT' })
  }
  embeddedSubs.forEach((sub) => {
    availableSubtitles.push({ idx: trackIdx++, label: sub.title || sub.language || `Track ${sub.index}` })
  })

  const availableAudio = React.useMemo(() => {
    const arr: any[] = []
    if (embeddedAudio.length > audioTracks.length) {
      embeddedAudio.forEach((t, i) => arr.push({ id: `ext-${t.index}`, index: t.index, native: false, label: t.title || t.language || `Track ${i + 1}` }))
    } else if (audioTracks.length > 0) {
      audioTracks.forEach((t, i) => arr.push({ id: `nat-${i}`, index: i, native: true, label: t.language || `Track ${i + 1}` }))
    } else if (embeddedAudio.length > 0) {
      embeddedAudio.forEach((t, i) => arr.push({ id: `ext-${t.index}`, index: t.index, native: false, label: t.title || t.language || `Track ${i + 1}` }))
    } else {
      arr.push({ id: 'nat-0', index: 0, native: true, label: 'Default Track' })
    }
    return arr
  }, [embeddedAudio, audioTracks])

  useEffect(() => {
    if (availableAudio.length > 0) {
      if (!availableAudio.find(a => a.id === selectedAudioId)) {
        const first = availableAudio[0]
        setSelectedAudioId(first.id)
        
        if (!first.native) {
          if (videoRef.current) videoRef.current.muted = true
          if (audioRef.current && videoRef.current) {
            const time = videoRef.current.currentTime
            setLastSeekTime(time)
            audioRef.current.src = `audio://file/${encodeURIComponent(currentVideo.file_path)}?track=${first.index}&time=${time}`
            // Auto play handles the bridge firing if the main element starts buffering
          }
        }
      }
    }
  }, [availableAudio, selectedAudioId, currentVideo.file_path])

  useEffect(() => {
    if (seekPopup.show) {
      const timer = setTimeout(() => {
        setSeekPopup(prev => ({ ...prev, show: false }))
      }, 1300)
      return () => clearTimeout(timer)
    }
  }, [seekPopup.id, seekPopup.show])

  useEffect(() => {
    const fetchProgress = async () => {
      const progress = await window.api.getVideoProgress(currentVideo.id)
      if (progress && videoRef.current) {
        videoRef.current.currentTime = progress.last_watched_time
        setCurrentTime(progress.last_watched_time)
      }
    }

    const fetchMediaTracks = async () => {
      const srt = await window.api.getSubtitlePath(currentVideo.file_path)
      if (srt) setSubtitlePath(srt)
      else setSubtitlePath(null)

      try {
        const [embeddedS, embeddedA] = await Promise.all([
           window.api.getEmbeddedSubtitles(currentVideo.file_path),
           window.api.getEmbeddedAudio(currentVideo.file_path)
        ])
        setEmbeddedSubs(embeddedS || [])
        setEmbeddedAudio(embeddedA || [])
      } catch (err) {
        console.error('Failed to get embedded tracks:', err)
      }
    }

    fetchProgress()
    fetchMediaTracks()
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

  useEffect(() => {
    const driftInterval = setInterval(() => {
      if (isPlaying && videoRef.current && audioRef.current && audioRef.current.src) {
        const expectedTime = videoRef.current.currentTime - lastSeekTime
        if (expectedTime >= 0) {
          const drift = audioRef.current.currentTime - expectedTime
          if (Math.abs(drift) > 0.35) {
            audioRef.current.currentTime = expectedTime
          }
        }
      }
    }, 2000)
    return () => clearInterval(driftInterval)
  }, [isPlaying, lastSeekTime])

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
    setShowAudioMenu(false)
    setShowSubtitleMenu(false)
    setShowSpeedMenu(false)
    
    // Safely enforce visibility extension when a user actively clicks any UI control buttons
    if ((e.target as HTMLElement).closest('.video-controls')) {
      setShowControls(true)
      clearTimeout(window.controlsTimeout)
      window.controlsTimeout = setTimeout(() => setShowControls(false), 4000)
      return
    }

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

  const selectAudioTrack = (trackId: string) => {
    const trackObj = availableAudio.find(a => a.id === trackId)
    if (!trackObj) return

    if (trackObj.native) {
      if (videoRef.current) {
        // @ts-ignore
        const tracks = videoRef.current.audioTracks
        if (tracks) {
          for (let i = 0; i < tracks.length; i++) {
            tracks[i].enabled = i === trackObj.index
          }
        }
        videoRef.current.muted = volume === 0
      }
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.removeAttribute('src')
        audioRef.current.load()
      }
    } else {
      if (videoRef.current) videoRef.current.muted = true
      if (audioRef.current && videoRef.current) {
        const time = videoRef.current.currentTime
        setLastSeekTime(time)
        audioRef.current.src = `audio://file/${encodeURIComponent(currentVideo.file_path)}?track=${trackObj.index}&time=${time}`
        if (isPlaying) audioRef.current.play()
      }
    }
    
    // Anti-stall micro-seek only on native Chromium buffers
    if (videoRef.current && trackObj.native) {
      videoRef.current.currentTime = videoRef.current.currentTime + 0.001
    }

    setSelectedAudioId(trackId)
    setShowAudioMenu(false)
  }

  const changeSpeed = (rate: number) => {
    setPlaybackRate(rate)
    if (videoRef.current) videoRef.current.playbackRate = rate
    if (audioRef.current) audioRef.current.playbackRate = rate
    setShowSpeedMenu(false)
  }

  const selectSubtitleTrack = (index: number | null) => {
    if (videoRef.current?.textTracks) {
      const tTracks = videoRef.current.textTracks
      for (let i = 0; i < tTracks.length; i++) {
        tTracks[i].mode = i === index ? 'showing' : 'hidden'
      }
      setCurrentSubtitle(index)
      setShowSubtitleMenu(false)
    }
  }

  const handleCustomAudioSeekSync = (time: number) => {
    const trackObj = availableAudio.find(a => a.id === selectedAudioId)
    if (trackObj && !trackObj.native && audioRef.current) {
      setLastSeekTime(time)
      audioRef.current.src = `audio://file/${encodeURIComponent(currentVideo.file_path)}?track=${trackObj.index}&time=${time}`
      if (isPlaying) audioRef.current.play()
    }
  }

  const seek = (seconds: number) => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime + seconds
      videoRef.current.currentTime = time
      handleCustomAudioSeekSync(time)
      setSeekPopup(prev => ({ show: true, text: seconds > 0 ? `+${seconds}s` : `${seconds}s`, id: prev.id + 1 }))
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
      handleCustomAudioSeekSync(time)
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
      const trackObj = availableAudio.find(a => a.id === selectedAudioId)
      if (trackObj && !trackObj.native) {
        videoRef.current.muted = true
      } else {
        videoRef.current.muted = v === 0
      }
    }
    if (audioRef.current) {
      audioRef.current.volume = v
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
      onMouseMove={(e) => {
        setShowControls(true)
        clearTimeout(window.controlsTimeout)
        
        // Prevent jarring auto-hide if mouse is directly actively resting on buttons
        if (!(e.target as HTMLElement).closest('.video-controls')) {
          window.controlsTimeout = setTimeout(() => setShowControls(false), 3000)
        } else {
          window.controlsTimeout = setTimeout(() => setShowControls(false), 6000)
        }
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
        onPlay={() => { 
          setIsPlaying(true); 
          const trackObj = availableAudio.find(a => a.id === selectedAudioId);
          if (trackObj && !trackObj.native && audioRef.current && audioRef.current.src) audioRef.current.play(); 
        }}
        onPause={() => { setIsPlaying(false); if (audioRef.current && audioRef.current.src) audioRef.current.pause(); }}
        onEnded={handleEnded}
        onWaiting={() => { setIsBuffering(true); if (audioRef.current && audioRef.current.src) audioRef.current.pause(); }}
        onPlaying={() => { 
          setIsBuffering(false); 
          const trackObj = availableAudio.find(a => a.id === selectedAudioId);
          if (trackObj && !trackObj.native && audioRef.current && isPlaying && audioRef.current.src) audioRef.current.play(); 
        }}
        onLoadedMetadata={() => {
          if (videoRef.current) videoRef.current.playbackRate = playbackRate
          // @ts-ignore
          if (videoRef.current?.audioTracks) {
            // @ts-ignore
            const tracks = videoRef.current.audioTracks
            const tracksArray = []
            for (let i = 0; i < tracks.length; i++) {
              tracksArray.push(tracks[i])
            }
            setAudioTracks(tracksArray)
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
            label="External SRT" 
            kind="subtitles" 
            srcLang="en" 
            src={`media://file/${encodeURIComponent(subtitlePath)}`} 
            default={embeddedSubs.length === 0}
          />
        )}
        {embeddedSubs.map((sub) => (
          <track
            key={`embedded-${sub.index}`}
            label={sub.title || sub.language || `Track ${sub.index}`}
            kind="subtitles"
            srcLang={sub.language !== 'Unknown' ? sub.language : undefined}
            src={`subtitle://file/${encodeURIComponent(currentVideo.file_path)}?track=${sub.index}`}
            default={false}
          />
        ))}
      </video>

      <style>{`
        @keyframes seekAnim {
          0% { opacity: 0; transform: scale(0.8); }
          30% { opacity: 1; transform: scale(1.05); }
          70% { opacity: 1; transform: scale(1.1); }
          100% { opacity: 0; transform: scale(1.15); }
        }
        .animate-seek {
          animation: seekAnim 1.2s ease-in-out forwards;
        }
      `}</style>

      {/* Seek Popup Overlay */}
      {seekPopup.show && (
        <div 
          key={seekPopup.id}
          className={`absolute inset-0 flex items-center pointer-events-none z-50 ${seekPopup.text.includes('+') ? 'justify-end pr-32' : 'justify-start pl-32'}`}
        >
          <div className="bg-black/60 text-white font-bold w-32 h-32 rounded-full backdrop-blur-md flex flex-col justify-center items-center animate-seek shadow-2xl border border-white/10 space-y-2">
            {seekPopup.text.includes('+') ? <FastForward size={40} fill="currentColor" /> : <Rewind size={40} fill="currentColor" />}
            <span className="text-xl tracking-wider">{seekPopup.text}</span>
          </div>
        </div>
      )}

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
            <button onClick={() => seek(-10)} className="text-white hover:text-primary hover:-translate-x-1 transition-all" title="Rewind 10s">
              <Rewind size={28} fill="currentColor" />
            </button>
            <button onClick={togglePlay} className="text-white hover:scale-110 transition-transform">
              {isPlaying ? <Pause size={36} fill="currentColor" /> : <Play size={36} fill="currentColor" />}
            </button>
            <button onClick={() => seek(10)} className="text-white hover:text-primary hover:translate-x-1 transition-all" title="Forward 10s">
              <FastForward size={28} fill="currentColor" />
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
            <div className="relative flex items-center">
              {showAudioMenu && availableAudio.length > 1 && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-6 bg-gray-900 rounded-lg shadow-xl border border-gray-700 overflow-hidden min-w-[150px] z-50">
                  <div className="px-3 py-2 bg-gray-800 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-700">Audio Tracks</div>
                  <div className="max-h-48 overflow-y-auto custom-scrollbar">
                    {availableAudio.map((track) => (
                      <button
                        key={track.id}
                        onClick={(e) => { e.stopPropagation(); selectAudioTrack(track.id); }}
                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-gray-800 border-b border-gray-800/50 last:border-0 ${selectedAudioId === track.id ? 'text-primary font-medium bg-primary/10' : 'text-gray-300'}`}
                      >
                        {track.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button 
                onClick={(e) => { e.stopPropagation(); setShowSubtitleMenu(false); setShowSpeedMenu(false); if (availableAudio.length > 1) setShowAudioMenu(!showAudioMenu); }}
                className={`text-white transition-colors ${availableAudio.length > 1 ? (showAudioMenu ? 'text-primary' : 'hover:text-primary') : 'text-gray-500 opacity-50 cursor-not-allowed'}`}
                title={availableAudio.length > 1 ? `Audio Tracks (${availableAudio.length})` : 'Single Audio Track'}
              >
                <Music size={24} />
              </button>
            </div>
            <div className="relative flex items-center">
              {showSubtitleMenu && availableSubtitles.length > 0 && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-6 bg-gray-900 rounded-lg shadow-xl border border-gray-700 overflow-hidden min-w-[150px] z-50">
                  <div className="px-3 py-2 bg-gray-800 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-700">Subtitles</div>
                  <div className="max-h-48 overflow-y-auto custom-scrollbar">
                    <button
                      onClick={(e) => { e.stopPropagation(); selectSubtitleTrack(null); }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-gray-800 border-b border-gray-800/50 last:border-0 ${currentSubtitle === null ? 'text-primary font-medium bg-primary/10' : 'text-gray-300'}`}
                    >
                      Off
                    </button>
                    {availableSubtitles.map((track) => (
                      <button
                        key={track.idx}
                        onClick={(e) => { e.stopPropagation(); selectSubtitleTrack(track.idx); }}
                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-gray-800 border-b border-gray-800/50 last:border-0 ${currentSubtitle === track.idx ? 'text-primary font-medium bg-primary/10' : 'text-gray-300'}`}
                      >
                        {track.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button 
                onClick={(e) => { e.stopPropagation(); setShowAudioMenu(false); setShowSpeedMenu(false); if (availableSubtitles.length > 0) setShowSubtitleMenu(!showSubtitleMenu); }}
                className={`text-white transition-colors ${availableSubtitles.length > 0 ? (showSubtitleMenu || currentSubtitle !== null ? 'text-primary' : 'hover:text-primary') : 'text-gray-500 opacity-50 cursor-not-allowed'}`}
                title={availableSubtitles.length > 0 ? `Subtitles (${availableSubtitles.length})` : 'No Subtitles'}
              >
                <Subtitles size={24} />
              </button>
            </div>

            <div className="relative flex items-center">
              {showSpeedMenu && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-6 bg-gray-900 rounded-lg shadow-xl border border-gray-700 overflow-hidden min-w-[120px] z-50">
                  <div className="px-3 py-2 bg-gray-800 text-[10px] font-bold text-gray-400 uppercase tracking-wider border-b border-gray-700">Speed</div>
                  <div className="max-h-56 overflow-y-auto custom-scrollbar flex flex-col">
                    {[1, 1.25, 1.5, 1.75, 2].map((rate) => (
                      <button
                        key={rate}
                        onClick={(e) => { e.stopPropagation(); changeSpeed(rate); }}
                        className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-gray-800 border-b border-gray-800/50 last:border-0 ${playbackRate === rate ? 'text-primary font-medium bg-primary/10' : 'text-gray-300'}`}
                      >
                        {rate === 1 ? 'Normal' : `${rate}x`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setShowAudioMenu(false); 
                  setShowSubtitleMenu(false); 
                  setShowSpeedMenu(!showSpeedMenu); 
                }}
                className={`text-white transition-colors text-sm font-bold w-12 flex justify-center ${showSpeedMenu ? 'text-primary' : 'hover:text-primary'}`}
                title="Playback Speed"
              >
                {playbackRate}x
              </button>
            </div>

            <button onClick={toggleFullscreen} className="text-white hover:text-primary transition-colors">
              <Maximize size={24} />
            </button>
          </div>
        </div>
      </div>
      {/* Hidden Custom Audio Extraction Pipeliner */}
      <audio ref={audioRef} style={{ display: 'none' }} />
    </div>
  )
}

export default VideoPlayer
