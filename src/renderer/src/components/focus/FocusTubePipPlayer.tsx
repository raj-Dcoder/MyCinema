import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SkipForward,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react'
import type { FtVideo } from '../../types'
import { embedUrl } from '../../utils/focusTube'
import { formatChapterTime, type FtSponsorSegment, sponsorLabel } from '../../utils/focusCinema'

const YT_ORIGIN = 'https://www.youtube.com'
const YT_NOCOOKIE_ORIGIN = 'https://www.youtube-nocookie.com'
const STATE_ENDED = 0
const STATE_PLAYING = 1
const STATE_PAUSED = 2
const STATE_BUFFERING = 3

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2]

export interface FocusTubePipPlayerProps {
  initialPayload?: {
    video: FtVideo
    currentTime: number
    isPlaying: boolean
    playbackRate?: number
    volume?: number
    muted?: boolean
    queue?: FtVideo[]
    hasNext?: boolean
    nextTitle?: string | null
  }
}

export const FocusTubePipPlayer: React.FC<FocusTubePipPlayerProps> = ({ initialPayload }) => {
  const [video, setVideo] = useState<FtVideo | null>(initialPayload?.video || null)
  const [startSeconds, setStartSeconds] = useState<number>(initialPayload?.currentTime || 0)
  const [playerState, setPlayerState] = useState<number | null>(null)
  const [currentTime, setCurrentTime] = useState<number>(initialPayload?.currentTime || 0)
  const [duration, setDuration] = useState<number | null>(initialPayload?.video?.duration ?? null)
  const [volume, setVolume] = useState<number>(initialPayload?.volume ?? 100)
  const [muted, setMuted] = useState<boolean>(initialPayload?.muted ?? false)
  const [speed, setSpeed] = useState<number>(initialPayload?.playbackRate ?? 1)
  const [showControls, setShowControls] = useState<boolean>(true)
  const [scrubTime, setScrubTime] = useState<number | null>(null)
  const [sponsorSegments, setSponsorSegments] = useState<FtSponsorSegment[]>([])
  const [skipToast, setSkipToast] = useState<{ text: string } | null>(null)
  const [hasNext, setHasNext] = useState<boolean>(!!initialPayload?.hasNext)
  const [nextTitle, setNextTitle] = useState<string | null>(initialPayload?.nextTitle || null)
  const [queue, setQueue] = useState<FtVideo[]>(initialPayload?.queue || [])
  const [showVolumeSlider, setShowVolumeSlider] = useState<boolean>(false)

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const idRef = useRef<number>(1)
  const bridgeUpRef = useRef<boolean>(false)
  const hideControlsTimerRef = useRef<number | null>(null)
  const currentTimeRef = useRef<number>(initialPayload?.currentTime || 0)
  currentTimeRef.current = currentTime
  const playerStateRef = useRef<number | null>(null)
  playerStateRef.current = playerState
  const videoRef = useRef<FtVideo | null>(video)
  videoRef.current = video
  const lastTapTimeRef = useRef<number>(0)
  const seekLockRef = useRef<{ target: number; until: number } | null>(null)

  // Force pure dark mode on PiP window
  useEffect(() => {
    document.documentElement.classList.remove('light', 'glass-light')
    document.documentElement.classList.add('dark')
    document.documentElement.style.colorScheme = 'dark'
    document.body.style.backgroundColor = '#000000'
    document.body.style.color = '#ffffff'
  }, [])

  // Fetch initial payload from main process if not provided via props
  useEffect(() => {
    if (!video && window.api?.ftGetPipState) {
      window.api.ftGetPipState().then((payload) => {
        if (payload?.video) {
          setVideo(payload.video)
          setStartSeconds(payload.currentTime || 0)
          setCurrentTime(payload.currentTime || 0)
          setVolume(payload.volume ?? 100)
          setMuted(payload.muted ?? false)
          setSpeed(payload.playbackRate ?? 1)
          setHasNext(!!payload.hasNext)
          setNextTitle(payload.nextTitle || null)
          setQueue(payload.queue || [])
        }
      }).catch(() => {})
    }

    if (window.api?.onFtPipInit) {
      const unsub = window.api.onFtPipInit((payload) => {
        if (payload?.video) {
          setVideo(payload.video)
          setStartSeconds(payload.currentTime || 0)
          setCurrentTime(payload.currentTime || 0)
          setVolume(payload.volume ?? 100)
          setMuted(payload.muted ?? false)
          setSpeed(payload.playbackRate ?? 1)
          setHasNext(!!payload.hasNext)
          setNextTitle(payload.nextTitle || null)
          setQueue(payload.queue || [])
          idRef.current += 1
        }
      })
      return () => {
        unsub()
      }
    }
  }, [video])

  // Fetch sponsor segments whenever the video changes
  useEffect(() => {
    if (!video?.videoId) return
    let active = true
    window.api?.ftGetSponsorSegments?.(video.videoId).then((res) => {
      if (active && Array.isArray(res?.segments)) {
        setSponsorSegments(res.segments)
      }
    }).catch(() => {})
    return () => {
      active = false
    }
  }, [video?.videoId])

  const post = useCallback((func: string, args: unknown[] = []) => {
    const target = iframeRef.current?.contentWindow
    if (!target) return
    try {
      target.postMessage(
        JSON.stringify({ event: 'command', func, args, id: idRef.current, channel: 'widget' }),
        '*'
      )
    } catch {}
  }, [])

  const sendHandshake = useCallback(() => {
    const target = iframeRef.current?.contentWindow
    if (!target) return
    const id = idRef.current
    try {
      target.postMessage(JSON.stringify({ event: 'listening', id, channel: 'widget' }), '*')
      for (const event of ['onReady', 'onStateChange', 'onError']) {
        target.postMessage(
          JSON.stringify({ event: 'command', func: 'addEventListener', args: [event], id, channel: 'widget' }),
          '*'
        )
      }
    } catch {}
  }, [])

  // Auto-hide controls after idle during active playback
  const pokeControls = useCallback(() => {
    setShowControls(true)
    if (hideControlsTimerRef.current !== null) {
      window.clearTimeout(hideControlsTimerRef.current)
    }
    if (playerStateRef.current === STATE_PLAYING) {
      hideControlsTimerRef.current = window.setTimeout(() => {
        setShowControls(false)
        setShowVolumeSlider(false)
      }, 2500)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (hideControlsTimerRef.current !== null) {
        window.clearTimeout(hideControlsTimerRef.current)
      }
    }
  }, [])

  // Time polling and SponsorBlock skip check
  useEffect(() => {
    let ticks = 0
    const interval = window.setInterval(() => {
      if (playerStateRef.current === STATE_PLAYING) {
        post('getCurrentTime')
        ticks += 1
        if (ticks % 4 === 0) {
          post('getDuration')
        }

        // Periodic sync to main process & SQLite DB
        if (videoRef.current && currentTimeRef.current > 0) {
          window.api?.ftSyncPipState?.({
            videoId: videoRef.current.videoId,
            currentTime: currentTimeRef.current,
            isPlaying: true,
          }).catch(() => {})
        }
      }
    }, 500)

    return () => window.clearInterval(interval)
  }, [post])

  // Iframe message bridge
  useEffect(() => {
    if (!video) return
    bridgeUpRef.current = false
    const id = idRef.current

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== YT_ORIGIN && event.origin !== YT_NOCOOKIE_ORIGIN) return
      let data: any
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      } catch {
        return
      }
      if (!data || data.id !== id) return
      bridgeUpRef.current = true

      if (data.event === 'onReady') {
        post('setVolume', [volume])
        post(muted ? 'mute' : 'unMute', [])
        if (speed !== 1) post('setPlaybackRate', [speed])
        post('getDuration')
        post('playVideo')
        return
      }

      if (data.event === 'onStateChange') {
        const state = Number(data.info)
        setPlayerState(state)
        playerStateRef.current = state
        if (state === STATE_PLAYING) {
          seekLockRef.current = null
          pokeControls()
          if (speed !== 1) post('setPlaybackRate', [speed])
        } else {
          setShowControls(true)
        }
        if (videoRef.current) {
          window.api?.ftSyncPipState?.({
            videoId: videoRef.current.videoId,
            currentTime: currentTimeRef.current,
            isPlaying: state === STATE_PLAYING,
          }).catch(() => {})
        }
        return
      }

      if (data.event === 'infoDelivery' && data.info) {
        if (typeof data.info.currentTime === 'number') {
          const t = data.info.currentTime
          if (seekLockRef.current) {
            if (Date.now() < seekLockRef.current.until && Math.abs(t - seekLockRef.current.target) > 2) {
              return
            }
            seekLockRef.current = null
          }
          setCurrentTime(t)
          currentTimeRef.current = t

          // SponsorBlock segment check
          if (sponsorSegments.length > 0) {
            const hit = sponsorSegments.find((seg) => t >= seg.start && t < seg.end - 0.5)
            if (hit) {
              seekLockRef.current = { target: hit.end, until: Date.now() + 1600 }
              post('seekTo', [hit.end, true])
              window.api?.ftSeekFrame?.(hit.end, true).catch(() => {})
              setSkipToast({ text: `Skipped ${sponsorLabel(hit.category)}` })
              setTimeout(() => setSkipToast(null), 2500)
            }
          }
        }
        if (typeof data.info.duration === 'number' && data.info.duration > 0) {
          setDuration(data.info.duration)
        }
      }
    }

    window.addEventListener('message', onMessage)
    sendHandshake()

    return () => {
      window.removeEventListener('message', onMessage)
    }
  }, [video, sendHandshake, post, sponsorSegments, volume, muted, speed, pokeControls])

  const togglePlay = useCallback(() => {
    if (playerState === STATE_PLAYING) {
      post('pauseVideo')
    } else {
      post('playVideo')
    }
    pokeControls()
  }, [playerState, post, pokeControls])

  const handleSeek = useCallback((time: number) => {
    const target = Math.max(0, Math.min(duration || Infinity, time))
    seekLockRef.current = { target, until: Date.now() + 1600 }
    setCurrentTime(target)
    currentTimeRef.current = target
    const shouldPlay = playerState === STATE_PLAYING || playerState === STATE_BUFFERING
    post('seekTo', [target, true])
    if (shouldPlay) {
      post('playVideo')
    }
    window.api?.ftSeekFrame?.(target, shouldPlay).catch(() => {})
    pokeControls()
  }, [duration, post, pokeControls, playerState])

  const handleRelativeSeek = useCallback((delta: number) => {
    handleSeek(currentTimeRef.current + delta)
  }, [handleSeek])

  const toggleMute = useCallback(() => {
    const nextMuted = !muted
    setMuted(nextMuted)
    post(nextMuted ? 'mute' : 'unMute')
    pokeControls()
  }, [muted, post, pokeControls])

  const handleVolumeChange = useCallback((newVol: number) => {
    const v = Math.max(0, Math.min(100, newVol))
    setVolume(v)
    post('setVolume', [v])
    if (muted && v > 0) {
      setMuted(false)
      post('unMute')
    }
    pokeControls()
  }, [muted, post, pokeControls])

  const cycleSpeed = useCallback(() => {
    const currentIndex = SPEED_OPTIONS.indexOf(speed)
    const nextSpeed = SPEED_OPTIONS[(currentIndex + 1) % SPEED_OPTIONS.length]
    setSpeed(nextSpeed)
    post('setPlaybackRate', [nextSpeed])
    pokeControls()
  }, [speed, post, pokeControls])

  const handleRestore = useCallback(() => {
    const payload = {
      videoId: videoRef.current?.videoId,
      currentTime: currentTimeRef.current,
      isPlaying: playerStateRef.current === STATE_PLAYING,
    }
    window.api?.ftSyncPipState?.(payload).catch(() => {})
    window.api?.ftRestorePip?.(payload).catch(() => {})
  }, [])

  const handleClose = useCallback(() => {
    if (videoRef.current) {
      window.api?.ftSyncPipState?.({
        videoId: videoRef.current.videoId,
        currentTime: currentTimeRef.current,
        isPlaying: false,
      }).catch(() => {})
    }
    window.api?.ftClosePip?.().catch(() => {})
  }, [])

  const handleNext = useCallback(() => {
    if (!queue.length) return
    const nextVid = queue[0]
    setVideo(nextVid)
    setStartSeconds(0)
    setCurrentTime(0)
    currentTimeRef.current = 0
    setQueue((q) => q.slice(1))
    setHasNext(queue.length > 1)
    setNextTitle(queue.length > 1 ? queue[1].title : null)
    idRef.current += 1
  }, [queue])

  // Tap layer gesture: single click = play/pause, double click = restore
  const handleTapLayerClick = useCallback(() => {
    const now = Date.now()
    if (now - lastTapTimeRef.current < 300) {
      // Double tap -> Restore to theater
      handleRestore()
      lastTapTimeRef.current = 0
      return
    }
    lastTapTimeRef.current = now
    togglePlay()
  }, [togglePlay, handleRestore])

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement as HTMLElement)?.tagName?.toLowerCase()
      if (activeTag === 'input' || activeTag === 'textarea') return

      if (e.code === 'Space' || e.code === 'KeyK') {
        e.preventDefault()
        togglePlay()
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault()
        handleRelativeSeek(-5)
      } else if (e.code === 'ArrowRight') {
        e.preventDefault()
        handleRelativeSeek(5)
      } else if (e.code === 'KeyJ') {
        e.preventDefault()
        handleRelativeSeek(-10)
      } else if (e.code === 'KeyL') {
        e.preventDefault()
        handleRelativeSeek(10)
      } else if (e.code === 'ArrowUp') {
        e.preventDefault()
        handleVolumeChange(volume + 5)
      } else if (e.code === 'ArrowDown') {
        e.preventDefault()
        handleVolumeChange(volume - 5)
      } else if (e.code === 'KeyM') {
        e.preventDefault()
        toggleMute()
      } else if (e.code === 'Escape') {
        e.preventDefault()
        handleRestore()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [togglePlay, handleRelativeSeek, handleVolumeChange, volume, toggleMute, handleRestore])

  const isPlaying = playerState === STATE_PLAYING
  const displayTime = scrubTime ?? currentTime
  const progressPercent = duration ? Math.min(100, Math.max(0, (displayTime / duration) * 100)) : 0

  const resumeAt = startSeconds > 10 && (video?.duration === null || startSeconds < (video?.duration || 0) - 20)
    ? startSeconds
    : 0

  const embedSrc = useMemo(() => {
    if (!video) return ''
    return embedUrl(video.videoId, resumeAt)
  }, [video, resumeAt])

  if (!video) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-black text-white text-xs font-semibold">
        Loading mini player...
      </div>
    )
  }

  return (
    <div
      onMouseMove={pokeControls}
      onMouseEnter={pokeControls}
      onMouseLeave={() => {
        if (isPlaying) {
          setShowControls(false)
          setShowVolumeSlider(false)
        }
      }}
      className="ft-pip-player keep-dark dark relative flex h-screen w-screen select-none overflow-hidden bg-black font-sans text-white group"
    >
      {/* ── 100% EDGE-TO-EDGE VIDEO ── */}
      <iframe
        ref={iframeRef}
        key={`${video.videoId}:${idRef.current}`}
        src={embedSrc}
        title={video.title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        className="absolute inset-0 h-full w-full border-0 bg-black pointer-events-none"
        onLoad={sendHandshake}
      />

      {/* ── TAP SHIELD (Prevents YouTube's internal chrome/seekbar/watermark from ever showing) ── */}
      <div
        onClick={handleTapLayerClick}
        className="absolute inset-0 z-10 cursor-pointer bg-transparent"
        title="Click to Play/Pause, Double-click to Restore"
      />

      {/* ── PERSISTENT TOP DRAG HANDLE (Always draggable even when controls are idle) ── */}
      <div
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        className="absolute inset-x-0 top-0 h-11 z-20 cursor-grab active:cursor-grabbing"
      />

      {/* ── SPONSOR SKIP TOAST ── */}
      {skipToast && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 z-40 flex justify-center px-4">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-black/90 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-200 shadow-2xl backdrop-blur-md">
            <Zap size={12} className="text-amber-300" /> {skipToast.text}
          </span>
        </div>
      )}

      {/* ── HIGH-CONTRAST FLOATING CONTROLS OVERLAY (Auto-fades on idle while playing) ── */}
      <div
        className={`absolute inset-0 z-30 flex flex-col justify-between pointer-events-none transition-opacity duration-200 ${
          showControls || !isPlaying
            ? 'opacity-100 bg-black/35 backdrop-blur-[1px]'
            : 'opacity-0'
        }`}
      >
        {/* TOP BAR: High-contrast draggable title & Window buttons */}
        <div
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          className="pointer-events-auto flex items-center justify-between bg-gradient-to-b from-black/95 via-black/70 to-transparent px-3 pt-3 pb-8 cursor-grab active:cursor-grabbing"
        >
          <div className="flex min-w-0 items-center gap-2 pr-2">
            <span
              style={{ color: '#ffffff' }}
              className="truncate text-xs font-bold drop-shadow-[0_2px_4px_rgba(0,0,0,1)] select-none"
              title={video.title}
            >
              {video.title}
            </span>
          </div>

          <div
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            className="flex items-center gap-2 shrink-0 z-40"
          >
            <button
              type="button"
              onClick={handleRestore}
              title="Restore to Theater View (Esc or Double-click)"
              aria-label="Restore to theater view"
              style={{ color: '#ffffff', backgroundColor: 'rgba(0, 0, 0, 0.75)', borderColor: 'rgba(255, 255, 255, 0.5)' }}
              className="flex h-7 w-7 items-center justify-center rounded-full hover:!bg-white hover:!text-black text-white border shadow-xl backdrop-blur-md transition-all hover:scale-105 active:scale-95 group/btn"
            >
              <Maximize2 size={13} strokeWidth={2.5} color="currentColor" />
            </button>
            <button
              type="button"
              onClick={handleClose}
              title="Close"
              aria-label="Close"
              style={{ color: '#ffffff', backgroundColor: 'rgba(0, 0, 0, 0.75)', borderColor: 'rgba(255, 255, 255, 0.5)' }}
              className="flex h-7 w-7 items-center justify-center rounded-full hover:!bg-red-600 hover:!border-red-500 text-white border shadow-xl backdrop-blur-md transition-all hover:scale-105 active:scale-95"
            >
              <X size={14} strokeWidth={2.5} color="#ffffff" />
            </button>
          </div>
        </div>

        {/* CENTER CONTROLS: Crisp, High-Contrast Play / Pause / Skip */}
        <div className="pointer-events-auto flex items-center justify-center gap-6 select-none">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleRelativeSeek(-10)
            }}
            title="Rewind 10s (J)"
            aria-label="Rewind 10 seconds"
            style={{ color: '#ffffff', backgroundColor: 'rgba(0, 0, 0, 0.85)', borderColor: 'rgba(255, 255, 255, 0.6)' }}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-black text-white border shadow-2xl backdrop-blur-md transition-transform hover:scale-110 active:scale-95"
          >
            <RotateCcw size={19} strokeWidth={2.5} color="#ffffff" />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              togglePlay()
            }}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            style={{ backgroundColor: '#ffffff', color: '#000000' }}
            className="flex h-13 w-13 p-3.5 items-center justify-center rounded-full shadow-[0_4px_30px_rgba(0,0,0,0.9)] transition-transform hover:scale-110 active:scale-95"
          >
            {isPlaying ? (
              <Pause size={22} fill="#000000" color="#000000" strokeWidth={2.5} />
            ) : (
              <Play size={22} fill="#000000" color="#000000" strokeWidth={2.5} className="ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              handleRelativeSeek(10)
            }}
            title="Forward 10s (L)"
            aria-label="Forward 10 seconds"
            style={{ color: '#ffffff', backgroundColor: 'rgba(0, 0, 0, 0.85)', borderColor: 'rgba(255, 255, 255, 0.6)' }}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-black text-white border shadow-2xl backdrop-blur-md transition-transform hover:scale-110 active:scale-95"
          >
            <RotateCw size={19} strokeWidth={2.5} color="#ffffff" />
          </button>
        </div>

        {/* BOTTOM BAR: Scrubber, Time, Volume, Speed */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="pointer-events-auto flex flex-col gap-1.5 bg-gradient-to-t from-black via-black/90 to-transparent px-3.5 pt-8 pb-3"
        >
          {/* Scrubber Bar */}
          <div className="group/scrub relative flex h-3 cursor-pointer items-center">
            <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/35 transition-all group-hover/scrub:h-2">
              <div
                className="h-full rounded-full bg-primary shadow-[0_0_10px_rgba(var(--c-accent),0.8)] transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.1}
              value={displayTime}
              onPointerDown={() => setScrubTime(currentTime)}
              onChange={(e) => setScrubTime(Number(e.target.value))}
              onPointerUp={(e) => {
                const t = Number((e.target as HTMLInputElement).value)
                setScrubTime(null)
                handleSeek(t)
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Seek video"
            />
          </div>

          {/* Time & Action Controls */}
          <div className="flex items-center justify-between text-xs font-semibold select-none text-white drop-shadow-[0_1px_3px_rgba(0,0,0,1)]">
            <div className="flex items-center gap-1.5 tabular-nums text-white">
              <span style={{ color: '#ffffff' }}>{formatChapterTime(displayTime)}</span>
              <span style={{ color: 'rgba(255, 255, 255, 0.85)' }} className="font-bold">/</span>
              <span style={{ color: '#ffffff' }}>{duration ? formatChapterTime(duration) : '--:--'}</span>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Volume */}
              <div
                onMouseEnter={() => setShowVolumeSlider(true)}
                onMouseLeave={() => setShowVolumeSlider(false)}
                className="flex items-center gap-1.5"
              >
                <button
                  type="button"
                  onClick={toggleMute}
                  title={muted ? 'Unmute (M)' : 'Mute (M)'}
                  style={{ color: '#ffffff' }}
                  className="p-1 transition-colors hover:!text-primary"
                >
                  {muted || volume === 0 ? (
                    <VolumeX size={17} strokeWidth={2.5} color="#ffffff" />
                  ) : (
                    <Volume2 size={17} strokeWidth={2.5} color="#ffffff" />
                  )}
                </button>
                {showVolumeSlider && (
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={muted ? 0 : volume}
                    onChange={(e) => handleVolumeChange(Number(e.target.value))}
                    className="h-1.5 w-16 cursor-pointer accent-primary"
                    aria-label="Volume"
                  />
                )}
              </div>

              {/* Speed Pill */}
              <button
                type="button"
                onClick={cycleSpeed}
                title="Playback Speed"
                style={{
                  color: '#ffffff',
                  backgroundColor: 'rgba(255, 255, 255, 0.25)',
                  borderColor: 'rgba(255, 255, 255, 0.5)'
                }}
                className="rounded-md font-bold text-[11px] px-2 py-0.5 border shadow-md backdrop-blur-sm transition-colors hover:!bg-white/40"
              >
                {speed}x
              </button>

              {/* Next Button */}
              {hasNext && (
                <button
                  type="button"
                  onClick={handleNext}
                  title={nextTitle ? `Next: ${nextTitle}` : 'Next video'}
                  style={{ color: '#ffffff' }}
                  className="p-1 transition-colors hover:!text-primary"
                >
                  <SkipForward size={17} strokeWidth={2.5} color="#ffffff" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── HAIRLINE PROGRESS STRIP (When controls are hidden while playing) ── */}
      {!showControls && isPlaying && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[2.5px] bg-black/50">
          <div
            className="h-full bg-primary shadow-[0_0_6px_rgba(var(--c-accent),0.8)] transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </div>
  )
}

export default FocusTubePipPlayer
