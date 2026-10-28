import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Compass,
  Maximize2,
  Minus,
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
import { embedUrl, formatDuration, thumbnailUrl } from '../../utils/focusTube'
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

  // Auto-hide controls after idle
  const pokeControls = useCallback(() => {
    setShowControls(true)
    if (hideControlsTimerRef.current !== null) {
      window.clearTimeout(hideControlsTimerRef.current)
    }
    if (playerStateRef.current === STATE_PLAYING) {
      hideControlsTimerRef.current = window.setTimeout(() => {
        setShowControls(false)
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

        // Periodic sync to main process
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
          setCurrentTime(t)
          currentTimeRef.current = t

          // SponsorBlock segment check
          if (sponsorSegments.length > 0) {
            const hit = sponsorSegments.find((seg) => t >= seg.start && t < seg.end - 0.5)
            if (hit) {
              post('seekTo', [hit.end, true])
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
    setCurrentTime(target)
    currentTimeRef.current = target
    post('seekTo', [target, true])
    pokeControls()
  }, [duration, post, pokeControls])

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
    if (videoRef.current) {
      window.api?.ftSyncPipState?.({
        videoId: videoRef.current.videoId,
        currentTime: currentTimeRef.current,
        isPlaying: playerStateRef.current === STATE_PLAYING,
      }).catch(() => {})
    }
    window.api?.ftRestorePip?.().catch(() => {})
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
      <div className="flex h-screen w-screen items-center justify-center bg-black text-white/50 text-xs">
        Loading mini player...
      </div>
    )
  }

  return (
    <div
      onMouseMove={pokeControls}
      onMouseEnter={pokeControls}
      className="group relative flex h-screen w-screen select-none flex-col overflow-hidden bg-black font-sans text-white"
    >
      {/* ── DRAGGABLE TITLEBAR ── */}
      <div
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        className="relative z-50 flex h-8 shrink-0 items-center justify-between border-b border-white/10 bg-gradient-to-r from-neutral-950 via-neutral-900 to-neutral-950 px-2.5 shadow-md"
      >
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
            <Compass size={11} className="animate-spin-slow" />
          </div>
          <span className="truncate text-[11px] font-semibold text-white/90" title={video.title}>
            {video.title}
          </span>
          {video.channelTitle && (
            <span className="hidden truncate text-[10px] text-white/40 sm:inline" title={video.channelTitle}>
              • {video.channelTitle}
            </span>
          )}
        </div>

        <div
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          className="flex items-center gap-1 shrink-0"
        >
          <button
            type="button"
            onClick={handleRestore}
            title="Restore to Main Player (Esc)"
            aria-label="Restore to main player"
            className="flex h-5 w-5 items-center justify-center rounded text-white/60 transition-colors hover:bg-white/15 hover:text-white"
          >
            <Maximize2 size={12} />
          </button>
          <button
            type="button"
            onClick={handleClose}
            title="Close Mini Player"
            aria-label="Close mini player"
            className="flex h-5 w-5 items-center justify-center rounded text-white/60 transition-colors hover:bg-red-500 hover:text-white"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* ── VIDEO CONTAINER ── */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        <iframe
          ref={iframeRef}
          key={`${video.videoId}:${idRef.current}`}
          src={embedSrc}
          title={video.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          className="h-full w-full border-0 pointer-events-auto"
          onLoad={sendHandshake}
        />

        {/* ── SPONSOR SKIP TOAST ── */}
        {skipToast && (
          <div className="pointer-events-none absolute inset-x-0 bottom-14 z-40 flex justify-center px-4">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300/30 bg-black/85 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-200 shadow-xl backdrop-blur-md">
              <Zap size={11} className="text-amber-300" /> {skipToast.text}
            </span>
          </div>
        )}

        {/* ── CONTROLS OVERLAY (Auto-fades on idle while playing) ── */}
        <div
          className={`absolute inset-0 z-30 flex flex-col justify-between bg-gradient-to-t from-black/85 via-black/30 to-black/60 p-2 transition-opacity duration-200 ${
            showControls ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <div /> {/* Top spacer */}

          {/* Center Play / Pause & Skip Buttons */}
          <div className="flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={() => handleRelativeSeek(-10)}
              title="Rewind 10s (J)"
              aria-label="Rewind 10 seconds"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm transition-transform hover:scale-110 hover:text-white active:scale-95"
            >
              <RotateCcw size={15} />
            </button>
            <button
              type="button"
              onClick={togglePlay}
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
            >
              {isPlaying ? (
                <Pause size={18} fill="currentColor" />
              ) : (
                <Play size={18} fill="currentColor" className="ml-0.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => handleRelativeSeek(10)}
              title="Forward 10s (L)"
              aria-label="Forward 10 seconds"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-sm transition-transform hover:scale-110 hover:text-white active:scale-95"
            >
              <RotateCw size={15} />
            </button>
          </div>

          {/* Bottom Controls Bar */}
          <div className="flex flex-col gap-1.5 pt-1">
            {/* Scrubber Range Bar */}
            <div className="group/scrub relative flex h-3 cursor-pointer items-center">
              <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full rounded-full bg-primary transition-all"
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

            {/* Time & Mini Actions */}
            <div className="flex items-center justify-between text-[10px] font-semibold text-white/70">
              <div className="flex items-center gap-1.5 tabular-nums">
                <span>{formatChapterTime(displayTime)}</span>
                <span>/</span>
                <span>{duration ? formatChapterTime(duration) : '--:--'}</span>
              </div>

              <div className="flex items-center gap-2">
                {/* Volume toggle */}
                <button
                  type="button"
                  onClick={toggleMute}
                  title={muted ? 'Unmute (M)' : 'Mute (M)'}
                  className="text-white/70 hover:text-white"
                >
                  {muted || volume === 0 ? <VolumeX size={13} /> : <Volume2 size={13} />}
                </button>

                {/* Speed toggle */}
                <button
                  type="button"
                  onClick={cycleSpeed}
                  title="Playback Speed"
                  className="rounded bg-white/10 px-1 py-0.5 text-[9px] font-bold text-white/80 hover:bg-white/20 hover:text-white"
                >
                  {speed}x
                </button>

                {/* Next button */}
                {hasNext && (
                  <button
                    type="button"
                    onClick={handleNext}
                    title={nextTitle ? `Next: ${nextTitle}` : 'Next video'}
                    className="text-white/70 hover:text-white"
                  >
                    <SkipForward size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── ALWAYS VISIBLE SLIM SEEK STRIP AT THE VERY BOTTOM ── */}
        {!showControls && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-black/40">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default FocusTubePipPlayer
