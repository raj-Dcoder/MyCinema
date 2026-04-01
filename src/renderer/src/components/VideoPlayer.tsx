import React, { useEffect, useRef, useState } from 'react'
import { Play, Pause, Rewind, FastForward, X, Maximize, Minimize, Volume2, VolumeX, Subtitles, Music, SkipForward as SkipNext, ArrowLeft, MessageSquareText, AlertTriangle, Check } from 'lucide-react'
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
  const [forceRestart, setForceRestart] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [subtitlePath, setSubtitlePath] = useState<string | null>(null)
  const [volume, setVolume] = useState(1)
  const [currentVideo, setCurrentVideo] = useState<Video>(video)
  const [isSeeking, setIsSeeking] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [audioTracks, setAudioTracks] = useState<any[]>([])
  const [selectedAudioId, setSelectedAudioId] = useState<string>('')
  const [showMediaMenu, setShowMediaMenu] = useState(false)
  const [currentSubtitle, setCurrentSubtitle] = useState<number | null>(null)
  const [playbackRate, setPlaybackRate] = useState<number>(1)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [seekPopup, setSeekPopup] = useState<{ show: boolean, text: string, id: number }>({ show: false, text: '', id: 0 })
  const [volumePopup, setVolumePopup] = useState<{ show: boolean, volume: number, isMuted: boolean, id: number }>({ show: false, volume: 1, isMuted: false, id: 0 })
  const [speedPopup, setSpeedPopup] = useState<{ show: boolean, rate: number, id: number }>({ show: false, rate: 1, id: 0 })
  const [trackPopup, setTrackPopup] = useState<{ show: boolean, type: 'audio' | 'subtitle', text: string, id: number }>({ show: false, type: 'subtitle', text: '', id: 0 })
  const [seekPreview, setSeekPreview] = useState<number | null>(null)
  const seekPreviewRef = useRef<number>(0)
  const [embeddedSubs, setEmbeddedSubs] = useState<any[]>([])
  const [embeddedAudio, setEmbeddedAudio] = useState<any[]>([])
  const [lastSeekTime, setLastSeekTime] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)
  const [hasNextEpisode, setHasNextEpisode] = useState(false)
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const timeRef = useRef(0)
  const durationRef = useRef(1)
  const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const wasHoldingRef = useRef(false)
  const [isHolding2x, setIsHolding2x] = useState(false)
  const [isHoldingRev2x, setIsHoldingRev2x] = useState(false)
  const reverseRafRef = useRef<number | null>(null)
  const forwardIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const arrowHoldTimerRef = useRef<NodeJS.Timeout | null>(null)
  const seekPreviewIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const wasPlayingBeforeRevRef = useRef<boolean>(false)
  const lastReverseStepRef = useRef<number>(0)
  const spaceHoldTimerRef = useRef<NodeJS.Timeout | null>(null)
  const mediaMenuTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastTimeUpdateRef = useRef(0)
  
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const [hoverPosition, setHoverPosition] = useState<number>(0)

  const checkNextEpisode = async (video: Video) => {
    if (video.type === 'series' && video.series_name) {
      const episodes: Video[] = await window.api.getSeriesInfo(video.series_name)
      const currentIndex = episodes.findIndex(e => e.id === video.id)
      setHasNextEpisode(currentIndex !== -1 && currentIndex < episodes.length - 1)
    } else {
      setHasNextEpisode(false)
    }
  }

  const formatTrackLabel = (track: any, defaultIndex: number) => {
    let langName = ''
    if (track.language && track.language !== 'und' && track.language !== 'Unknown') {
      try {
        const displayNames = new Intl.DisplayNames(['en'], { type: 'language' })
        langName = displayNames.of(track.language) || track.language
      } catch (e) {
        langName = track.language.toUpperCase()
      }
    }
    
    if (langName) {
      langName = langName.charAt(0).toUpperCase() + langName.slice(1)
    }

    const title = track.title
    
    if (title && title.toLowerCase() !== track.language?.toLowerCase() && title.toLowerCase() !== langName.toLowerCase()) {
      return langName ? `${langName} (${title})` : title
    }
    
    if (langName) return langName
    return `Track ${defaultIndex}`
  }

  const availableSubtitles: any[] = []
  let trackIdx = 0
  if (subtitlePath) {
    availableSubtitles.push({ idx: trackIdx++, label: 'External SRT' })
  }
  embeddedSubs.forEach((sub) => {
    availableSubtitles.push({ idx: trackIdx++, label: formatTrackLabel(sub, sub.index) })
  })

  const availableAudio = React.useMemo(() => {
    const arr: any[] = []
    if (embeddedAudio.length > audioTracks.length) {
      embeddedAudio.forEach((t, i) => arr.push({ id: `ext-${t.index}`, index: t.index, native: false, label: formatTrackLabel(t, i + 1) }))
    } else if (audioTracks.length > 0) {
      audioTracks.forEach((t, i) => arr.push({ id: `nat-${i}`, index: i, native: true, label: formatTrackLabel(t, i + 1) }))
    } else if (embeddedAudio.length > 0) {
      embeddedAudio.forEach((t, i) => arr.push({ id: `ext-${t.index}`, index: t.index, native: false, label: formatTrackLabel(t, i + 1) }))
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
      let targetTime = progress?.last_watched_time || 0
      
      if (progress?.completed) {
        targetTime = 0
      }
      
      if (forceRestart) {
        targetTime = 0
        setForceRestart(false)
      }

      if (videoRef.current && targetTime > 0) {
        if (videoRef.current.readyState >= 1) {
          videoRef.current.currentTime = targetTime
          setCurrentTime(targetTime)
          timeRef.current = targetTime
        } else {
          videoRef.current.addEventListener('loadedmetadata', () => {
            if (videoRef.current) {
              videoRef.current.currentTime = targetTime
              setCurrentTime(targetTime)
              timeRef.current = targetTime
            }
          }, { once: true })
        }
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
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [currentVideo.id])

  const showVolumeToast = (vol: number, muted: boolean) => {
    setVolumePopup({ show: true, volume: vol, isMuted: muted, id: Date.now() })
    setTimeout(() => {
      setVolumePopup(prev => prev.id === Date.now() ? { ...prev, show: false } : prev)
    }, 1000)
  }

  const showSpeedToast = (rate: number) => {
    const id = Date.now()
    setSpeedPopup({ show: true, rate, id })
    setTimeout(() => {
      setSpeedPopup(prev => prev.id === id ? { ...prev, show: false } : prev)
    }, 1000)
  }

  const showTrackToast = (type: 'audio' | 'subtitle', text: string) => {
    const id = Date.now()
    setTrackPopup({ show: true, type, text, id })
    setTimeout(() => {
      setTrackPopup(prev => prev.id === id ? { ...prev, show: false } : prev)
    }, 1500)
  }

  // Dedicated Keyboard Shortcuts Effect
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Only block shortcuts for actual text inputs (not range sliders, checkboxes etc)
      const active = document.activeElement as HTMLInputElement | null
      if (active?.tagName === 'INPUT' && active?.type !== 'range') return

      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault()

      // Space hold = 2x speed
      if (e.code === 'Space' && !e.repeat) {
        spaceHoldTimerRef.current = setTimeout(() => {
          if (videoRef.current && !videoRef.current.paused) {
            setIsHolding2x(true)
            videoRef.current.playbackRate = 2
            if (audioRef.current) audioRef.current.playbackRate = 2
            spaceHoldTimerRef.current = null
          }
        }, 350)
      }

      switch(e.code) {
        case 'ArrowRight':
          if (!e.repeat) {
            seek(10)
            arrowHoldTimerRef.current = setTimeout(() => {
              seekPreviewRef.current = videoRef.current?.currentTime ?? 0
              setSeekPreview(seekPreviewRef.current)
              setShowControls(true)
              clearTimeout(window.controlsTimeout)
              if (seekPreviewIntervalRef.current) clearInterval(seekPreviewIntervalRef.current)
              seekPreviewIntervalRef.current = setInterval(() => {
                const dur = videoRef.current?.duration || 1
                // 10.0s per 100ms = 100x real-time speed
                seekPreviewRef.current = Math.min(dur, seekPreviewRef.current + 10.0)
                setSeekPreview(seekPreviewRef.current)
                // Drive the existing thumbnail preview to show frame at this timestamp
                const pct = (seekPreviewRef.current / dur) * 100
                setHoverTime(seekPreviewRef.current)
                setHoverPosition(pct)
                if (previewVideoRef.current) previewVideoRef.current.currentTime = seekPreviewRef.current
              }, 100)
            }, 400)
          }
          break
        case 'ArrowLeft':
          if (!e.repeat) {
            seek(-10)
            arrowHoldTimerRef.current = setTimeout(() => {
              seekPreviewRef.current = videoRef.current?.currentTime ?? 0
              setSeekPreview(seekPreviewRef.current)
              setShowControls(true)
              clearTimeout(window.controlsTimeout)
              if (seekPreviewIntervalRef.current) clearInterval(seekPreviewIntervalRef.current)
              seekPreviewIntervalRef.current = setInterval(() => {
                const dur = videoRef.current?.duration || 1
                // 10.0s per 100ms = 100x real-time speed
                seekPreviewRef.current = Math.max(0, seekPreviewRef.current - 10.0)
                setSeekPreview(seekPreviewRef.current)
                const pct = (seekPreviewRef.current / dur) * 100
                setHoverTime(seekPreviewRef.current)
                setHoverPosition(pct)
                if (previewVideoRef.current) previewVideoRef.current.currentTime = seekPreviewRef.current
              }, 100)
            }, 400)
          }
          break
        case 'ArrowUp': {
          const nextUp = Math.min(1, volume + 0.05)
          setVolume(nextUp)
          if (videoRef.current) { videoRef.current.volume = nextUp; videoRef.current.muted = nextUp === 0; }
          showVolumeToast(nextUp, nextUp === 0)
          break
        }
        case 'ArrowDown': {
          const nextDown = Math.max(0, volume - 0.05)
          setVolume(nextDown)
          if (videoRef.current) { videoRef.current.volume = nextDown; videoRef.current.muted = nextDown === 0; }
          showVolumeToast(nextDown, nextDown === 0)
          break
        }
        case 'KeyM': {
          const nextM = volume === 0 ? 1 : 0
          setVolume(nextM)
          if (videoRef.current) { videoRef.current.volume = nextM; videoRef.current.muted = nextM === 0; }
          showVolumeToast(nextM, nextM === 0)
          break
        }
        case 'KeyF': toggleFullscreen(); break
        case 'KeyN': if (currentVideo.type === 'series' && hasNextEpisode) playNextEpisode(); break
        case 'KeyS':
          if (availableSubtitles.length > 0) {
            const options = [null, ...availableSubtitles.map(s => s.idx)]
            const currentIndex = options.indexOf(currentSubtitle)
            const nextIdx = options[(currentIndex + 1) % options.length]
            selectSubtitleTrack(nextIdx)
            const label = nextIdx === null ? 'Off' : availableSubtitles.find(s => s.idx === nextIdx)?.label || 'On'
            showTrackToast('subtitle', label)
          } else {
            showTrackToast('subtitle', 'None Available')
          }
          break
        case 'KeyA':
          if (availableAudio.length > 1) {
            const currentIndex = availableAudio.findIndex(a => a.id === selectedAudioId)
            const nextIdx = (currentIndex + 1) % availableAudio.length
            const nextTrack = availableAudio[nextIdx]
            selectAudioTrack(nextTrack.id)
            showTrackToast('audio', nextTrack.label)
          } else if (availableAudio.length === 1) {
            showTrackToast('audio', availableAudio[0].label)
          } else {
            showTrackToast('audio', 'None Available')
          }
          break
        case 'Escape': onClose(); break
        case 'Equal':
        case 'NumpadAdd': {
          const speeds = [1, 1.25, 1.5, 1.75, 2]
          const currentIndex = speeds.indexOf(playbackRate)
          const nextRate = currentIndex < speeds.length - 1 ? speeds[currentIndex + 1] : speeds[speeds.length - 1]
          changeSpeed(nextRate)
          showSpeedToast(nextRate)
          break
        }
        case 'Minus':
        case 'NumpadSubtract': {
          const speeds = [1, 1.25, 1.5, 1.75, 2]
          const currentIndex = speeds.indexOf(playbackRate)
          const nextRate = currentIndex > 0 ? speeds[currentIndex - 1] : speeds[0]
          changeSpeed(nextRate)
          showSpeedToast(nextRate)
          break
        }
      }
    }

    const handleGlobalKeyUp = (e: KeyboardEvent) => {
      const active = document.activeElement as HTMLInputElement | null
      if (active?.tagName === 'INPUT' && active?.type !== 'range') return

      // Space hold/tap logic on keyup
      if (e.code === 'Space') {
        if (spaceHoldTimerRef.current) { 
          clearTimeout(spaceHoldTimerRef.current); 
          spaceHoldTimerRef.current = null;
          togglePlay();
        } else if (isHolding2x) {
          setIsHolding2x(false)
          if (videoRef.current) videoRef.current.playbackRate = playbackRate
          if (audioRef.current) audioRef.current.playbackRate = playbackRate
        }
      }

      // Cancel any pending arrow hold timer
      if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
        if (arrowHoldTimerRef.current) { clearTimeout(arrowHoldTimerRef.current); arrowHoldTimerRef.current = null; }
      }

      if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
        if (seekPreviewIntervalRef.current) { clearInterval(seekPreviewIntervalRef.current); seekPreviewIntervalRef.current = null; }
        if (seekPreview !== null) {
          if (videoRef.current) videoRef.current.currentTime = seekPreviewRef.current
          if (audioRef.current) audioRef.current.currentTime = seekPreviewRef.current
          setSeekPreview(null)
          // Dismiss thumbnail preview
          setHoverTime(null)
          window.controlsTimeout = setTimeout(() => setShowControls(false), 3000)
        }
        setIsHolding2x(false)
        setIsHoldingRev2x(false)
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    window.addEventListener('keyup', handleGlobalKeyUp)
    return () => {
      window.removeEventListener('keydown', handleGlobalKeyDown)
      window.removeEventListener('keyup', handleGlobalKeyUp)
    }
  }, [currentVideo, hasNextEpisode, availableSubtitles, playbackRate, isHolding2x, isHoldingRev2x, volume, seekPreview])

  useEffect(() => {
    const interval = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        const time = videoRef.current.currentTime
        const total = videoRef.current.duration || 1
        const completed = time / total > 0.95
        
        timeRef.current = time
        durationRef.current = total
        
        window.api.updateVideoProgress(currentVideo.id, time, completed, false)
      }
    }, 5000)

    return () => {
      clearInterval(interval)
      const time = timeRef.current
      const total = durationRef.current || 1
      const completed = time / total > 0.95
      window.api.updateVideoProgress(currentVideo.id, time, completed, true)
    }
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
        setForceRestart(true)
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
    if (wasHoldingRef.current) return

    setShowMediaMenu(false)
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

  const handlePointerDown = (e: React.PointerEvent | React.TouchEvent | React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.video-controls')) return
    
    if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current)
    wasHoldingRef.current = false
    
    holdTimeoutRef.current = setTimeout(() => {
      if (videoRef.current?.paused) return
      
      wasHoldingRef.current = true
      setIsHolding2x(true)
      
      if (videoRef.current) videoRef.current.playbackRate = 2
      if (audioRef.current) audioRef.current.playbackRate = 2
    }, 450)
  }

  const handlePointerUpOrLeave = () => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current)
      holdTimeoutRef.current = null
    }

    if (wasHoldingRef.current) {
      setIsHolding2x(false)
      if (videoRef.current) videoRef.current.playbackRate = playbackRate
      if (audioRef.current) audioRef.current.playbackRate = playbackRate
      
      setTimeout(() => {
        wasHoldingRef.current = false
      }, 50)
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
    setShowMediaMenu(false)
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
      setShowMediaMenu(false)
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
      timeRef.current = time
      handleCustomAudioSeekSync(time)
      setSeekPopup(prev => ({ show: true, text: seconds > 0 ? `+${seconds}s` : `${seconds}s`, id: prev.id + 1 }))
    }
  }

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value)
    setCurrentTime(time)
    timeRef.current = time
  }

  const handleSeekMouseUp = (e: React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>) => {
    setIsSeeking(false)
    const time = parseFloat((e.target as HTMLInputElement).value)
    if (videoRef.current) {
      videoRef.current.currentTime = time
      timeRef.current = time
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

  const handleProgressMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    // The tooltip width is w-48 (192px). Half is 96px.
    const padding = 96
    
    let x = e.clientX - rect.left
    const percentage = Math.max(0, Math.min(1, x / rect.width))
    const time = percentage * duration
    
    setHoverTime(time)

    // Center tooltip unless at margins
    let popupLeft = x
    if (popupLeft < padding) popupLeft = padding
    if (popupLeft > rect.width - padding) popupLeft = rect.width - padding

    setHoverPosition((popupLeft / rect.width) * 100)

    if (previewVideoRef.current && Math.abs(previewVideoRef.current.currentTime - time) > 1.5) {
      previewVideoRef.current.currentTime = time
    }
  }

  const handleProgressMouseLeave = () => {
    setHoverTime(null)
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
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUpOrLeave}
      onPointerLeave={handlePointerUpOrLeave}
      onPointerCancel={handlePointerUpOrLeave}
    >
      <video
        ref={videoRef}
        src={`media://file/${encodeURIComponent(currentVideo.file_path)}`}
        className="max-h-full w-full outline-none"
        onTimeUpdate={() => {
          if (!isSeeking && videoRef.current) {
            // Aggressively throttle the incredibly heavy state update to maximum 4 times a second 
            // rather than firing up to 60 times a second and completely stalling the Chromium GPU pipeline with massive Garbage Collection
            const now = Date.now()
            if (now - lastTimeUpdateRef.current >= 250) {
              setCurrentTime(videoRef.current.currentTime)
              lastTimeUpdateRef.current = now
            }
            timeRef.current = videoRef.current.currentTime
          }
        }}
        onDurationChange={() => {
          if (videoRef.current) {
            setDuration(videoRef.current.duration)
            durationRef.current = videoRef.current.duration || 1
          }
        }}
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
          if (videoRef.current) {
            videoRef.current.playbackRate = playbackRate
            // Explicitly set volume on each new load to prevent silent starts
            videoRef.current.volume = volume
            videoRef.current.muted = false
          }
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
            src={`subtitle://file/${encodeURIComponent(subtitlePath)}?track=0`} 
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

        /* Dynamic Subtitle Positioning on Chromium Native Element */
        video::-webkit-media-text-track-container {
          transform: translateY(${showControls ? '-95px' : '-20px'}) !important;
          transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        /* Override default browser subtitle formatting */
        video::cue {
          font-family: 'Inter', system-ui, sans-serif !important;
          font-size: 28px !important;
          font-weight: 600 !important;
          text-shadow: 0px 2px 4px rgba(0,0,0,0.9), 0px 4px 12px rgba(0,0,0,0.7) !important;
          background-color: transparent !important;
          background: transparent !important;
        }
      `}</style>

      {/* Seek Popup Overlay */}
      {seekPopup.show && (
        <div 
          key={seekPopup.id}
          className={`absolute inset-0 flex items-center pointer-events-none z-50 ${seekPopup.text.includes('+') ? 'justify-end pr-32' : 'justify-start pl-32'}`}
        >
          <div className="bg-black/60 text-white font-bold w-24 h-24 rounded-full backdrop-blur-md flex flex-col justify-center items-center animate-seek shadow-2xl border border-white/10 space-y-1">
            {seekPopup.text.includes('+') ? <FastForward size={32} fill="currentColor" /> : <Rewind size={32} fill="currentColor" />}
            <span className="text-lg tracking-wider">{seekPopup.text}</span>
          </div>
        </div>
      )}

      {/* Volume Popup Overlay */}
      {volumePopup.show && (
        <div 
          key={`vol-${volumePopup.id}`}
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-50"
        >
          <div className="bg-black/60 text-white font-bold w-24 h-24 rounded-full backdrop-blur-md flex flex-col justify-center items-center animate-seek shadow-2xl border border-white/10 space-y-1">
            {volumePopup.isMuted ? <VolumeX size={32} /> : <Volume2 size={32} />}
            <span className="text-lg tracking-wider">{volumePopup.isMuted ? 'Muted' : `${Math.round(volumePopup.volume * 100)}%`}</span>
          </div>
        </div>
      )}

      {/* Speed Popup Overlay */}
      {speedPopup.show && (
        <div 
          key={`speed-${speedPopup.id}`}
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-50"
        >
          <div className="bg-black/60 text-white font-bold w-24 h-24 rounded-full backdrop-blur-md flex flex-col justify-center items-center animate-seek shadow-2xl border border-white/10 space-y-1">
            <FastForward size={32} />
            <span className="text-lg tracking-wider">{speedPopup.rate}x</span>
          </div>
        </div>
      )}

      {/* Track Popup Overlay */}
      {trackPopup.show && (
        <div 
          key={`track-${trackPopup.id}`}
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-50"
        >
          <div className="bg-black/60 text-white font-bold px-8 py-5 rounded-3xl backdrop-blur-md flex flex-col justify-center items-center animate-seek shadow-2xl border border-white/10 space-y-2">
            {trackPopup.type === 'audio' ? <Music size={32} className="text-primary mb-1" /> : <Subtitles size={32} className="text-primary mb-1" />}
            <span className="text-[17px] font-bold tracking-wide text-center" style={{ maxWidth: '280px' }}>
              {trackPopup.type === 'audio' ? 'Audio' : 'Subtitle'}: {trackPopup.text}
            </span>
          </div>
        </div>
      )}

      {/* 2x Hold Indicator */}
      {isHolding2x && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-md text-white/90 text-sm font-bold tracking-wide px-4 py-1.5 rounded-full flex items-center space-x-2 z-50 pointer-events-none animate-in slide-in-from-top-2 fade-in duration-200">
          <span>Playing at 2x speed</span>
          <FastForward size={16} />
        </div>
      )}

      {/* 2x Reverse Hold Indicator */}
      {isHoldingRev2x && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-black/50 backdrop-blur-md text-white/90 text-sm font-bold tracking-wide px-4 py-1.5 rounded-full flex items-center space-x-2 z-50 pointer-events-none animate-in slide-in-from-top-2 fade-in duration-200">
          <Rewind size={16} />
          <span>Rewinding at 2x speed</span>
        </div>
      )}

      {/* Buffering Indicator */}
      {isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Unified Top Info Bar */}
      <div className={`absolute top-0 left-0 right-0 px-10 pt-10 pb-6 flex items-start justify-between transition-opacity duration-300 video-controls z-40 bg-gradient-to-b from-black/80 to-transparent ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="flex items-center space-x-4">
          <button 
            onClick={onClose}
            className="p-2 -ml-2 text-white/90 hover:text-white transition-colors"
            title="Close Player"
          >
            <ArrowLeft size={28} />
          </button>
          <div>
            <h2 className="text-xl font-bold text-white drop-shadow-md">
              {currentVideo.type === 'series' && currentVideo.series_name ? currentVideo.series_name : currentVideo.title}
            </h2>
            <p className="text-sm font-medium text-gray-300 drop-shadow-sm mt-0.5">
              {currentVideo.type === 'series' 
                ? `S${currentVideo.season} E${currentVideo.episode} ${currentVideo.series_name ? currentVideo.title : ''}` 
                : 'Movie'
              }
            </p>
          </div>
        </div>

        {/* Top Right Actions */}
        <div className="flex items-center space-x-4">
          {(availableAudio.length > 0 || availableSubtitles.length > 0) && (
            <div 
              className="relative"
              onMouseEnter={() => { 
                if (mediaMenuTimeoutRef.current) clearTimeout(mediaMenuTimeoutRef.current)
                setShowSpeedMenu(false)
                setShowMediaMenu(true)
              }}
              onMouseLeave={() => {
                mediaMenuTimeoutRef.current = setTimeout(() => setShowMediaMenu(false), 300)
              }}
            >
              <button 
                onClick={(e) => e.stopPropagation()}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg bg-black/50 transition-colors backdrop-blur-md border border-white/5 ${showMediaMenu ? 'text-white bg-black/80' : 'text-white hover:bg-black/80'}`}
              >
                <MessageSquareText size={20} className={showMediaMenu ? "text-primary" : ""} />
                <span className="text-sm font-bold tracking-wide">Audio & Subtitles</span>
              </button>
              
              {/* The Unified Popup Menu */}
              {showMediaMenu && (
                <div 
                  className="absolute top-full right-0 mt-3 bg-[#181818]/95 backdrop-blur-3xl rounded-xl shadow-2xl border border-gray-700/50 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200"
                  style={{ width: '420px' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex p-6">
                    {/* Audio Column */}
                    {availableAudio.length > 0 && (
                      <div className="flex-1 pr-6">
                        <h3 className="text-[11px] font-bold text-gray-400 tracking-[0.2em] mb-4">AUDIO</h3>
                        <div className="space-y-1 max-h-56 overflow-y-auto custom-scrollbar pr-2">
                          {availableAudio.map((track) => (
                            <button
                              key={track.id}
                              onClick={(e) => { e.stopPropagation(); selectAudioTrack(track.id); }}
                              className="w-full flex items-center space-x-3 py-2 text-left group"
                            >
                              <div className="w-4 flex justify-center">
                                                {selectedAudioId === track.id && <Check size={16} strokeWidth={3} className="text-primary" />}
                              </div>
                              <span className={`text-[15px] transition-colors ${selectedAudioId === track.id ? 'text-white font-medium drop-shadow' : 'text-gray-400 group-hover:text-white'}`}>
                                {track.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Subtitles Column */}
                    {availableSubtitles.length > 0 && (
                      <div className={`flex-1 ${availableAudio.length > 0 ? 'pl-6 border-l border-white/10' : ''}`}>
                        <h3 className="text-[11px] font-bold text-gray-400 tracking-[0.2em] mb-4">SUBTITLES</h3>
                        <div className="space-y-1 max-h-56 overflow-y-auto custom-scrollbar pr-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); selectSubtitleTrack(null); }}
                            className="w-full flex items-center space-x-3 py-2 text-left group"
                          >
                            <div className="w-4 flex justify-center">
                              {currentSubtitle === null && <Check size={16} strokeWidth={3} className="text-primary" />}
                            </div>
                            <span className={`text-[15px] transition-colors ${currentSubtitle === null ? 'text-white font-medium drop-shadow' : 'text-gray-400 group-hover:text-white'}`}>
                              Off
                            </span>
                          </button>
                          {availableSubtitles.map((track) => (
                            <button
                              key={track.idx}
                              onClick={(e) => { e.stopPropagation(); selectSubtitleTrack(track.idx); }}
                              className="w-full flex items-center space-x-3 py-2 text-left group"
                            >
                              <div className="w-4 flex justify-center">
                                                {currentSubtitle === track.idx && <Check size={16} strokeWidth={3} className="text-primary" />}
                              </div>
                              <span className={`text-[15px] transition-colors ${currentSubtitle === track.idx ? 'text-white font-medium drop-shadow' : 'text-gray-400 group-hover:text-white'}`}>
                                {track.label}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Footer */}
                  <div className="bg-[#111111]/80 hover:bg-[#1f1f1f]/80 transition-colors p-4 border-t border-white/10 flex justify-center items-center cursor-pointer">
                    <button className="flex items-center justify-center w-full space-x-2 text-gray-400 hover:text-white transition-colors text-xs font-semibold tracking-wide" onClick={(e) => e.stopPropagation()}>
                      <AlertTriangle size={14} />
                      <span>Report an Issue</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {currentVideo.type === 'series' && hasNextEpisode && (
            <button 
              onClick={(e) => { e.stopPropagation(); playNextEpisode(); }}
              className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-black/50 transition-colors backdrop-blur-md border border-white/5 text-white hover:bg-black/80 group/next"
            >
              <span className="text-sm font-bold tracking-wide">Next Episode</span>
              <SkipNext size={20} className="group-hover/next:text-primary transition-colors" />
            </button>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent px-10 pb-10 pt-20 transition-opacity duration-300 video-controls ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        {/* Progress Bar Wrapper */}
        <div 
          className="group/progress relative h-6 mb-4 flex items-center cursor-pointer"
          onMouseMove={handleProgressMouseMove}
          onMouseLeave={handleProgressMouseLeave}
        >
          {/* Hover Preview Tooltip */}
          <div 
            className={`absolute bottom-full mb-4 -translate-x-1/2 flex flex-col items-center pointer-events-none transition-opacity duration-200 z-30 ${hoverTime !== null ? 'opacity-100' : 'opacity-0'}`}
            style={{ left: `${hoverPosition}%` }}
          >
            <div className="w-48 aspect-video bg-black/80 rounded-lg overflow-hidden border border-white/20 shadow-2xl flex items-center justify-center relative">
              <video
                ref={previewVideoRef}
                src={`media://file/${encodeURIComponent(currentVideo.file_path)}`}
                className="w-full h-full object-cover"
                muted
                preload="auto"
              />
              <div className="absolute bottom-1 bg-black/60 px-2 py-0.5 rounded text-[10px] font-bold text-white drop-shadow-md">
                {hoverTime !== null ? formatTime(hoverTime) : '0:00'}
              </div>
            </div>
          </div>

          <input 
            type="range"
            min="0"
            max={duration}
            step="0.1"
            value={currentTime}
            onChange={handleSeekChange}
            onMouseDown={handleSeekMouseDown}
            onMouseUp={(e) => { handleSeekMouseUp(e); (e.target as HTMLElement).blur(); }}
            onTouchStart={handleSeekMouseDown}
            onTouchEnd={(e) => { handleSeekMouseUp(e); (e.target as HTMLElement).blur(); }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
          />
          
          <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 bg-gray-600 rounded-full" />
          <div 
            className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-primary rounded-full transition-all group-hover/progress:h-1.5 duration-100" 
            style={{ width: `${((seekPreview ?? currentTime) / duration) * 100}%` }}
          />
          {/* Seek Preview Ghost Indicator */}
          {seekPreview !== null && duration > 0 && (
            <>
              <div 
                className="absolute top-1/2 -translate-y-1/2 h-1 bg-white/30 rounded-full"
                style={{ left: `${(currentTime / duration) * 100}%`, width: `${Math.abs((seekPreview - currentTime) / duration) * 100}%`, ...(seekPreview < currentTime ? { left: `${(seekPreview / duration) * 100}%` } : {}) }}
              />
              <div 
                className="absolute w-4 h-4 bg-white rounded-full shadow-xl border-2 border-primary top-1/2 -translate-y-1/2 z-20 pointer-events-none"
                style={{ left: `calc(${(seekPreview / duration) * 100}% - 8px)` }}
              />
              <div
                className="absolute bottom-full mb-3 -translate-x-1/2 bg-black/80 text-white text-xs font-bold px-2 py-1 rounded-md pointer-events-none"
                style={{ left: `${(seekPreview / duration) * 100}%` }}
              >
                {formatTime(seekPreview)}
              </div>
            </>
          )}
          <div 
            className="absolute w-3 h-3 bg-primary rounded-full shadow-lg opacity-0 group-hover/progress:opacity-100 transition-opacity top-1/2 -translate-y-1/2 z-10 group-hover/progress:scale-125"
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
            
            {/* Volume: Speaker icon + always-visible horizontal slider */}
            <div className="flex items-center space-x-2">
              <button
                onClick={(e) => { e.stopPropagation(); handleVolumeChange({ target: { value: volume === 0 ? '1' : '0' } } as any) }}
                className="text-white hover:text-primary transition-colors flex-shrink-0"
                title={volume === 0 ? 'Unmute' : 'Mute'}
              >
                <Volume2 size={22} className={volume === 0 ? 'opacity-40' : ''} />
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={handleVolumeChange}
                onClick={(e) => e.stopPropagation()}
                className="w-20 h-1 accent-primary cursor-pointer flex-shrink-0"
              />
            </div>

            <div className="text-sm font-medium text-gray-300">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>

          <div className="flex items-center space-x-6">
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
                  setShowMediaMenu(false); 
                  setShowSpeedMenu(!showSpeedMenu); 
                }}
                className={`text-white transition-colors text-sm font-bold w-12 flex justify-center ${showSpeedMenu ? 'text-primary' : 'hover:text-primary'}`}
                title="Playback Speed"
              >
                {playbackRate}x
              </button>
            </div>

            <button onClick={toggleFullscreen} className="text-white hover:text-primary transition-colors" title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
              {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
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
