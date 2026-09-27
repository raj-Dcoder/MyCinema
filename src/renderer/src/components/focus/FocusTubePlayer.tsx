import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ExternalLink, Loader2, Play, X } from 'lucide-react'
import type { FtVideo } from '../../types'
import { embedUrl, formatDuration, formatViews, thumbnailUrl, watchUrl } from '../../utils/focusTube'

interface FocusTubePlayerProps {
  video: FtVideo
  startSeconds: number
  onClose: () => void
  onMarkSeen: (videoId: string) => void
  onSaveProgress: (videoId: string, position: number) => void
  onObserved: (videoId: string, observation: { duration?: number | null; ended?: boolean }) => void
  onNotEmbeddable: (videoId: string) => void
}

// YouTube player states (see IFrame Player API reference).
const STATE_ENDED = 0
const STATE_PLAYING = 1
const STATE_PAUSED = 2
const STATE_BUFFERING = 3
const YT_ORIGIN = 'https://www.youtube.com'
const YT_NOCOOKIE_ORIGIN = 'https://www.youtube-nocookie.com'

// Error 101 and 150 are YouTube's "this video cannot be played in an embed".
const EMBED_DISABLED_ERRORS = new Set([101, 150])

const VOLUME_KEY = 'mycinema_ft_volume'
const MUTED_KEY = 'mycinema_ft_muted'

function loadVolume(): { volume: number; muted: boolean } {
  try {
    const volume = Math.min(100, Math.max(0, Number(localStorage.getItem(VOLUME_KEY) ?? 100) || 0))
    return { volume, muted: localStorage.getItem(MUTED_KEY) === '1' }
  } catch {
    return { volume: 100, muted: false }
  }
}

/**
 * MyCinema's own player shell around the chromeless YouTube embed
 * (`controls=0`). All state comes from the postMessage bridge — which works
 * because `embedUrl` omits the `origin` param (see its docs) — so this UI
 * reflects the player instead of fighting it: whatever changes playback
 * (our bar, click-to-toggle on the video, YouTube's own keyboard shortcuts)
 * arrives back as events.
 */
const FocusTubePlayer: React.FC<FocusTubePlayerProps> = ({
  video,
  startSeconds,
  onClose,
  onMarkSeen,
  onSaveProgress,
  onObserved,
  onNotEmbeddable,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  // Stable per-video channel id. (A previous revision read a mutated counter
  // here and addressed commands to a channel that was never registered.)
  const idRef = useRef(0)

  const [playerState, setPlayerState] = useState<number | null>(null)
  const [duration, setDuration] = useState<number | null>(video.duration)
  const [volume, setVolume] = useState(() => loadVolume().volume)
  const [muted, setMuted] = useState(() => loadVolume().muted)
  const [refused, setRefused] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [iframeKey, setIframeKey] = useState(0)
  const [thumbOk, setThumbOk] = useState(true)

  const stateRef = useRef<number | null>(null)
  const timeRef = useRef(startSeconds)
  const durationRef = useRef<number | null>(video.duration)
  const endedRef = useRef(false)
  const hideTimerRef = useRef<number>(0)
  const bridgeUpRef = useRef(false)
  // Parent callbacks in refs so the bridge subscription is set up once per
  // video instead of on every parent render.
  const cbRef = useRef({ onClose, onMarkSeen, onSaveProgress, onObserved, onNotEmbeddable })
  cbRef.current = { onClose, onMarkSeen, onSaveProgress, onObserved, onNotEmbeddable }

  const buffering = playerState === STATE_BUFFERING
  const started = playerState !== null && playerState !== -1

  // Resuming from a saved position is only meaningful a little way in; near the
  // end we would just land on the credits.
  const resumeAt = startSeconds > 10 && (video.duration === null || startSeconds < video.duration - 20)
    ? startSeconds
    : 0

  const post = useCallback((id: number, func: string, args: unknown[] = []) => {
    const target = iframeRef.current?.contentWindow
    if (!target) return
    try {
      target.postMessage(JSON.stringify({ event: 'command', func, args, id, channel: 'widget' }), '*')
    } catch {
      /* cross-origin access denied — controls keep working on the next tick */
    }
  }, [])

  /**
   * (Re)registers our channel with the player and subscribes to events.
   * Idempotent: re-sending for an already-registered id is harmless.
   */
  const sendHandshake = useCallback(() => {
    const id = idRef.current
    if (!id) return
    const send = (message: Record<string, unknown>) => {
      try {
        iframeRef.current?.contentWindow?.postMessage(JSON.stringify(message), '*')
      } catch { /* iframe not ready yet */ }
    }
    send({ event: 'listening', id, channel: 'widget' })
    for (const event of ['onReady', 'onStateChange', 'onError']) {
      send({ event: 'command', func: 'addEventListener', args: [event], id, channel: 'widget' })
    }
  }, [])

  /**
   * Runs a command, healing the bridge first if no reply has ever arrived.
   * postMessage delivery is FIFO per sender, so a handshake sent immediately
   * before the command is always processed first — this self-heals the case
   * where every earlier handshake landed before the player had booted.
   */
  const withBridge = useCallback((fn: () => void) => {
    if (!bridgeUpRef.current) sendHandshake()
    fn()
  }, [sendHandshake])

  const cmd = useCallback((func: string, args: unknown[] = []) => {
    post(idRef.current, func, args)
  }, [post])

  const saveProgress = useCallback((position: number) => {
    if (position > 3) cbRef.current.onSaveProgress(video.videoId, position)
  }, [video.videoId])

  // ── Bridge subscription (one setup per video, re-run on retry) ─────────────
  useEffect(() => {
    const id = idRef.current + 1
    idRef.current = id
    endedRef.current = false
    // A retried iframe starts clean: forget the previous attempt's state.
    stateRef.current = null
    setPlayerState(null)
    timeRef.current = startSeconds
    bridgeUpRef.current = false
    setErrorText(null)

    const volumePref = loadVolume()

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== YT_ORIGIN && event.origin !== YT_NOCOOKIE_ORIGIN) return
      let data: any
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      } catch {
        return
      }
      if (!data || data.id !== id) return
      // Any reply proves the bridge is live from this origin.
      bridgeUpRef.current = true

      if (data.event === 'onReady') {
        // Restore the user's volume, learn the runtime, and try to start.
        // The start attempt usually succeeds because opening the player follows
        // the card click (a user gesture); if not, the overlay covers it.
        const send = (func: string, args: unknown[] = []) => {
          try {
            iframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: 'command', func, args, id, channel: 'widget' }), '*')
          } catch { /* retry on the next tick */ }
        }
        send('setVolume', [volumePref.volume])
        send(volumePref.muted ? 'mute' : 'unMute', [])
        setVolume(volumePref.volume)
        setMuted(volumePref.muted)
        send('getDuration', [])
        send('playVideo', [])
        // Captions OFF by default. cc_load_policy=0 only means "do not force",
        // which is not the same as off — YouTube can still enable them from its
        // own preferences. Unloading the module is deterministic and independent
        // of URL params or stored cookies. The user can still switch them on
        // with YouTube's own CC button.
        send('unloadModule', ['captions'])
        return
      }

      if (data.event === 'onStateChange') {
        const state = Number(data.info)
        stateRef.current = state
        setPlayerState(state)
        if (state === STATE_PLAYING) setErrorText(null)
        if (state === STATE_PAUSED) saveProgress(timeRef.current)
        if (state === STATE_ENDED && !endedRef.current) {
          endedRef.current = true
          saveProgress(timeRef.current)
          cbRef.current.onObserved(video.videoId, { ended: true })
          cbRef.current.onMarkSeen(video.videoId)
          cbRef.current.onClose()
        }
        return
      }

      if (data.event === 'infoDelivery' && data.info && typeof data.info === 'object') {
        if (typeof data.info.currentTime === 'number' && data.info.currentTime >= 0) {
          timeRef.current = data.info.currentTime
        }
        // The feed cannot provide duration, so the player is where we learn it.
        if (typeof data.info.duration === 'number' && data.info.duration > 0
          && durationRef.current !== data.info.duration) {
          durationRef.current = data.info.duration
          setDuration(data.info.duration)
          cbRef.current.onObserved(video.videoId, { duration: data.info.duration })
        }
        return
      }

      if (data.event === 'onError') {
        const code = Number(data.info)
        if (EMBED_DISABLED_ERRORS.has(code)) {
          setRefused(true)
          cbRef.current.onNotEmbeddable(video.videoId)
        } else {
          setErrorText(`YouTube reported error ${code}`)
        }
      }
    }

    window.addEventListener('message', onMessage)
    // Best-effort early handshake; the authoritative one happens on iframe
    // load (see onLoad below), because a handshake sent before the embed
    // document exists is delivered to the void.
    sendHandshake()

    return () => window.removeEventListener('message', onMessage)
  }, [video.videoId, iframeKey, startSeconds, saveProgress, sendHandshake])

  // ── Time polling while playing + periodic progress saves ───────────────────
  useEffect(() => {
    let ticks = 0
    const interval = window.setInterval(() => {
      if (stateRef.current !== STATE_PLAYING) return
      const target = iframeRef.current?.contentWindow
      if (!target) return
      try {
        target.postMessage(JSON.stringify({
          event: 'command', func: 'getCurrentTime', args: [], id: idRef.current, channel: 'widget',
        }), '*')
      } catch { /* ignore */ }
      ticks += 1
      if (ticks % 20 === 0) saveProgress(timeRef.current)
    }, 250)
    return () => window.clearInterval(interval)
  }, [saveProgress])

  // ── Controls auto-hide ─────────────────────────────────────────────────────
  // Subtlety: mousemove events inside a cross-origin iframe do NOT bubble to the
  // parent, so auto-hiding on "no mousemove seen for N ms" would hide the chrome
  // and leave no way to get it back while the pointer is over the video. So we
  // track whether the pointer is inside the video area (mouseenter/leave DO
  // fire for the iframe element) and only auto-hide once it has left.
  const pointerInsideRef = useRef(false)

  const pokeControls = useCallback(() => {
    setControlsVisible(true)
    window.clearTimeout(hideTimerRef.current)
    hideTimerRef.current = window.setTimeout(() => {
      if (stateRef.current === STATE_PLAYING && !pointerInsideRef.current) {
        setControlsVisible(false)
      }
    }, 3200)
  }, [])

  const handlePointerEnter = useCallback(() => {
    pointerInsideRef.current = true
    pokeControls()
  }, [pokeControls])

  const handlePointerLeave = useCallback(() => {
    pointerInsideRef.current = false
    pokeControls()
  }, [pokeControls])

  useEffect(() => () => window.clearTimeout(hideTimerRef.current), [])

  // ── Fullscreen ─────────────────────────────────────────────────────────────
  // YouTube owns the control surface (see embedUrl), so the player no longer
  // draws a control bar. What remains here is the app-specific behaviour:
  // keyboard shortcuts, volume/mute preference, progress, resume and the
  // end-of-video hand-off back to the stack.
  const toggleFullscreen = useCallback(() => {
    pokeControls()
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {})
    } else {
      void document.documentElement.requestFullscreen().catch(() => {})
    }
  }, [pokeControls])

  // ── Commands ───────────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    pokeControls()
    withBridge(() => cmd(stateRef.current === STATE_PLAYING ? 'pauseVideo' : 'playVideo', []))
  }, [cmd, withBridge, pokeControls])

  const handleSeek = useCallback((seconds: number) => {
    pokeControls()
    const clamped = Math.max(0, seconds)
    timeRef.current = clamped
    withBridge(() => cmd('seekTo', [clamped, true]))
  }, [cmd, withBridge, pokeControls])

  const handleVolume = useCallback((next: number) => {
    const clamped = Math.min(100, Math.max(0, Math.round(next)))
    setVolume(clamped)
    if (clamped > 0) setMuted(false)
    try { localStorage.setItem(VOLUME_KEY, String(clamped)) } catch { /* ignore */ }
    withBridge(() => {
      cmd('setVolume', [clamped])
      if (clamped > 0) cmd('unMute', [])
    })
  }, [cmd, withBridge])

  const toggleMute = useCallback(() => {
    setMuted((was) => {
      const next = !was
      try { localStorage.setItem(MUTED_KEY, next ? '1' : '0') } catch { /* ignore */ }
      withBridge(() => cmd(next ? 'mute' : 'unMute', []))
      return next
    })
  }, [cmd, withBridge])

  // YouTube owns the control surface (see embedUrl), so the player no longer
  // draws a control bar. What remains here is the app-specific behaviour:
  // keyboard shortcuts, volume/mute preference, progress, resume and the
  // end-of-video hand-off back to the stack.

  const handleClose = useCallback(() => {
    saveProgress(timeRef.current)
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {})
    }
    cbRef.current.onClose()
  }, [saveProgress])

  const handleMarkWatched = useCallback(() => {
    saveProgress(timeRef.current)
    cbRef.current.onMarkSeen(video.videoId)
    cbRef.current.onClose()
  }, [saveProgress, video.videoId])

  // ── Keyboard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const exitFullscreenOnly = () => {
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {})
        return true
      }
      return false
    }
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      // When the embed itself holds focus, its own shortcuts (space, arrows)
      // do the same job — handling them here as well would double-toggle.
      if (document.activeElement?.tagName === 'IFRAME') {
        if (event.key === 'Escape' && !exitFullscreenOnly()) handleClose()
        return
      }
      switch (event.key) {
        case ' ':
        case 'k':
        case 'K':
          // A focused button already toggles on space natively.
          if (event.key === ' ' && document.activeElement?.tagName === 'BUTTON') return
          event.preventDefault()
          togglePlay()
          break
        case 'ArrowLeft':
        case 'j':
        case 'J':
          handleSeek(timeRef.current - 5)
          break
        case 'ArrowRight':
        case 'l':
        case 'L':
          handleSeek(timeRef.current + 5)
          break
        case 'ArrowUp':
          event.preventDefault()
          handleVolume(volume + 5)
          break
        case 'ArrowDown':
          event.preventDefault()
          handleVolume(volume - 5)
          break
        case 'm':
        case 'M':
          toggleMute()
          break
        case 'f':
        case 'F':
          toggleFullscreen()
          break
        case 'Escape':
          if (!exitFullscreenOnly()) handleClose()
          break
        default:
          break
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [togglePlay, handleSeek, handleVolume, toggleMute, toggleFullscreen, handleClose, volume])

  // Either the flag already said so, or the embed told us mid-flight.
  if (!video.embeddable || refused) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-8">
        <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-surface p-8 text-center space-y-5">
          <h3 className="text-lg font-black uppercase italic text-white">Embedding disabled</h3>
          <p className="text-sm text-white/50 font-semibold">
            The creator of “{video.title}” has blocked playback outside YouTube.
          </p>
          <div className="flex items-center justify-center gap-3">
            <a
              href={watchUrl(video.videoId)}
              onClick={(event) => {
                event.preventDefault()
                window.api.openWebPopup(watchUrl(video.videoId))
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-black uppercase tracking-widest text-white"
            >
              <ExternalLink size={14} /> Open on YouTube
            </a>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-white"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  const showSpinner = buffering && started

  return (
    // Fully opaque: the previous bg-black/95 let the app's own sidebar, nav and
    // card grid bleed through the "cinema" and made the player look broken.
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-[#000000] select-none"
      onMouseMove={pokeControls}
    >
      {/*
        Our own metadata lives in a slim bar ABOVE the frame, not on top of it.
        YouTube draws its own title in the video's top-left corner when its
        control bar is visible, so an overlay title would sit exactly on top of
        it. The bar collapses to zero height during playback so the video still
        gets the full window.
      */}
      <header
        className={`shrink-0 overflow-hidden transition-all duration-300 ease-out ${
          controlsVisible ? 'max-h-24 opacity-100' : 'pointer-events-none max-h-0 opacity-0'
        }`}
      >
        <div className="flex items-start gap-4 bg-gradient-to-b from-black to-transparent px-5 pb-4 pt-5 sm:px-8">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-[15px] font-bold leading-tight text-white sm:text-lg">
              {video.title}
            </h3>
            <p className="mt-1 truncate text-[11px] font-semibold text-white/45 sm:text-xs">
              {[video.channelTitle, formatViews(video.views), video.isShort ? 'Short' : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <a
              href={watchUrl(video.videoId)}
              onClick={(event) => {
                event.preventDefault()
                window.api.openWebPopup(watchUrl(video.videoId))
              }}
              title="Open on YouTube"
              aria-label="Open on YouTube"
              className="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              <ExternalLink size={18} />
            </a>
            <button
              type="button"
              onClick={handleMarkWatched}
              title="Mark as watched and close"
              aria-label="Mark as watched and close"
              className="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-emerald-400"
            >
              <Check size={18} />
            </button>
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close player"
              className="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3 sm:p-6">
        {/*
          Fit a 16:9 frame inside whatever space is left after the header. A
          width-only cap (max-w-*) overflowed the viewport once the header was
          showing and the bottom of the video — including our control bar — was
          clipped. Bounding the width by the available *height* as well keeps the
          whole frame, and our bar, on screen at any window size.
        */}
        <div
          className="relative aspect-video w-full"
          style={{ width: 'min(100%, calc((100vh - 160px) * 16 / 9))' }}
        >
          <div
            className="relative aspect-video w-full overflow-hidden bg-black shadow-[0_40px_140px_rgba(0,0,0,0.9)] sm:rounded-2xl ring-1 ring-white/[0.08]"
            onMouseMove={pokeControls}
            onMouseEnter={handlePointerEnter}
            onMouseLeave={handlePointerLeave}
          >
            <iframe
              ref={iframeRef}
              key={`${video.videoId}:${iframeKey}`}
              src={embedUrl(video.videoId, resumeAt)}
              title={video.title}
              className="absolute inset-0 h-full w-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              onLoad={sendHandshake}
            />

            {/* Pre-play overlay: thumbnail + play button. */}
            {!started && !errorText && (
              <button
                type="button"
                onClick={togglePlay}
                aria-label={`Play ${video.title}`}
                className="group absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black"
              >
                {thumbOk && (
                  <img
                    src={thumbnailUrl(video.videoId, 0)}
                    alt=""
                    loading="eager"
                    decoding="async"
                    onError={() => setThumbOk(false)}
                    className="absolute inset-0 h-full w-full object-cover opacity-70 transition-opacity group-hover:opacity-55"
                  />
                )}
                <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/40" />
                <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-primary text-white shadow-[0_12px_48px_rgba(229,9,20,0.45)] transition-transform duration-200 group-hover:scale-105">
                  <Play size={34} fill="currentColor" className="ml-1" />
                </span>
                <span className="relative flex items-center gap-2">
                  {duration !== null && duration > 0 && (
                    <span className="rounded bg-black/70 px-2 py-0.5 text-xs font-bold tabular-nums text-white">
                      {formatDuration(duration)}
                    </span>
                  )}
                  {resumeAt > 0 && (
                    <span className="rounded bg-black/70 px-2 py-0.5 text-xs font-bold text-white">
                      Resuming at {formatDuration(resumeAt)}
                    </span>
                  )}
                </span>
              </button>
            )}

            {/* Paused: resume affordance. Other clicks still toggle natively. */}
            {started && playerState === STATE_PAUSED && !errorText && (
              <button
                type="button"
                onClick={togglePlay}
                aria-label="Resume"
                className="absolute left-1/2 top-1/2 z-10 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm transition-transform hover:scale-105"
              >
                <Play size={28} fill="currentColor" className="ml-0.5" />
              </button>
            )}

            {/* Buffering spinner. */}
            {showSpinner && (
              <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-white/90">
                <Loader2 size={44} className="animate-spin" />
              </div>
            )}

            {/* Non-fatal player errors with a retry path. */}
            {errorText && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/92 px-8 text-center">
                <p className="text-sm font-bold text-white">{errorText}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setErrorText(null)
                      setIframeKey((key) => key + 1)
                    }}
                    className="rounded-lg bg-primary px-5 py-2 text-xs font-black uppercase tracking-widest text-white"
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="rounded-lg bg-white/10 px-5 py-2 text-xs font-black uppercase tracking-widest text-white"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default FocusTubePlayer
