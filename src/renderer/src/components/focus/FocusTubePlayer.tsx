import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ExternalLink,
  FileText,
  Gauge,
  ListVideo,
  Loader2,
  Maximize,
  MessageSquare,
  Minimize,
  Minus,
  MonitorPlay,
  Pause,
  Play,
  Plus,
  SkipForward,
  Subtitles,
  ThumbsUp,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react'
import type { FtComment, FtVideo } from '../../types'
import { embedUrl, formatAgo, formatDuration, formatViews, thumbnailUrl, watchUrl } from '../../utils/focusTube'
import {
  parseChapters,
  getActiveChapterIndex,
  sponsorLabel,
  splitDescription,
  formatChapterTime,
  type FtSponsorSegment,
} from '../../utils/focusCinema'

interface FocusTubePlayerProps {
  video: FtVideo
  startSeconds: number
  onClose: () => void
  onMarkSeen: (videoId: string) => void
  onSaveProgress: (videoId: string, position: number) => void
  onObserved: (videoId: string, observation: { duration?: number | null; ended?: boolean }) => void
  onNotEmbeddable: (videoId: string) => void
  autoplayNext: boolean
  onToggleAutoplayNext: () => void
  hasNext: boolean
  nextTitle: string | null
  onAutoAdvance: (finishedVideoId: string) => void
  onManualNext: (currentVideoId: string) => void
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

// Cross-instance fullscreen intent. When Next / auto-advance swaps the video,
// the newly mounted player must start in the SAME window mode the user was
// in: fullscreen stays fullscreen, windowed stays windowed. The parent keeps
// a stable player instance so the fullscreen element normally never leaves
// the DOM, but this flag is the safety net for any remount (React key change,
// StrictMode, browser quirk that drops fullscreen on iframe swap).
let ftFullscreenIntent = false

const VOLUME_KEY = 'mycinema_ft_volume'
const MUTED_KEY = 'mycinema_ft_muted'
const SKIP_SPONSORS_KEY = 'mycinema_ft_skip_sponsors'

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

// YouTube's IFrame API only honours roughly 0.25x-2x. Fine steps outside that
// snap back, so clamp everything to the same window.
const SPEED_MIN = 0.25
const SPEED_MAX = 2
const HOLD_2X_RATE = 2
// How long Space (or a press-and-hold on the video) must be held before we
// treat it as "hold for 2x" instead of a tap (play/pause). Matches the 350ms
// VideoPlayer uses for the same gesture.
const SPACE_HOLD_MS = 350
const POINTER_HOLD_MS = 450

function clampSpeed(rate: number): number {
  if (!Number.isFinite(rate)) return 1
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round(rate * 10) / 10))
}

// YouTube rendition ids (getPlaybackQuality / onPlaybackQualityChange).
// Read-only: YouTube ignores every manual quality lever (setPlaybackQuality is
// a documented no-op; setPlaybackQualityRange, loadVideoById quality and the
// `vq` URL param were verified ignored Oct-2026), so these labels only feed
// the live "playing at" readout. `auto` = YouTube decides, always.
const QUALITY_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'hd2160', label: '2160p 4K' },
  { id: 'hd1440', label: '1440p' },
  { id: 'hd1080', label: '1080p' },
  { id: 'hd720', label: '720p' },
  { id: 'large', label: '480p' },
  { id: 'medium', label: '360p' },
  { id: 'small', label: '240p' },
  { id: 'tiny', label: '144p' },
]

function qualityLabel(id: string): string {
  return QUALITY_OPTIONS.find((q) => q.id === id)?.label ?? id
}

/** Compact like/comment counts: 1234 -> "1.2K". */
function formatCompactCount(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`
  return `${n}`
}

/** Long comments collapse to 6 lines with a show more/less toggle. */
const LONG_COMMENT_CHARS = 400

function loadVolume(): { volume: number; muted: boolean } {
  try {
    const volume = Math.min(100, Math.max(0, Number(localStorage.getItem(VOLUME_KEY) ?? 100) || 0))
    return { volume, muted: localStorage.getItem(MUTED_KEY) === '1' }
  } catch {
    return { volume: 100, muted: false }
  }
}

function loadSkipSponsors(): boolean {
  try {
    return localStorage.getItem(SKIP_SPONSORS_KEY) !== 'false'
  } catch {
    return true
  }
}

/**
 * MyCinema's isolated cinema shell around the YouTube embed.
 *
 * LAYOUT CONTRACT (no layout shift, ever):
 * - Root is portalled to document.body as a fixed full-screen column, so no
 *   ancestor transform/filter can shrink it or leave a sliver of the feed
 *   visible: body row holds MAIN VIDEO AREA + SIDEBAR with stable geometry.
 *   Nothing in the sidebar or the tabs changes the video column's box.
 * - The stage is a full-bleed black box; the iframe fills it edge to edge.
 *   Aspect is preserved by the embed itself (letterbox = black on black).
 *   No padding, no card, no rounded container, no ring/shadow around video.
 * - There is NO top title bar: it duplicated YouTube's own native title row
 *   (avatar + title + channel) on pause and ghosted through our translucent
 *   gradient. The video owns the whole stage; only small floating icon
 *   buttons (back / watched / next / open / close) fade in with the bottom
 *   bar on mouse move / tap and hide on idle, YouTube-style.
 * - Bottom controls are an ABSOLUTE overlay inside the stage. It mounts once
 *   and only fades (opacity/translate/visibility) — never unmounts, never
 *   takes part in document flow — so showing/hiding cannot move the video.
 *
 * Isolation contract (unchanged by default):
 * - Single video only: rel=0, no recommendation wall, auto-close on ENDED.
 * - Optional player-only "Auto" queue: when the user turns it ON inside the
 *   player, ENDED advances to the next unseen video in the current stack
 *   instead of closing. OFF (default) keeps the historic close behaviour.
 * - Official embed only — never direct stream extraction.
 */
const FocusTubePlayer: React.FC<FocusTubePlayerProps> = ({
  video,
  startSeconds,
  onClose,
  onMarkSeen,
  onSaveProgress,
  onObserved,
  onNotEmbeddable,
  autoplayNext,
  onToggleAutoplayNext,
  hasNext,
  nextTitle,
  onAutoAdvance,
  onManualNext,
}) => {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  // Stable per-video channel id. (A previous revision read a mutated counter
  // here and addressed commands to a channel that was never registered.)
  const idRef = useRef(0)

  const [playerState, setPlayerState] = useState<number | null>(null)
  const [duration, setDuration] = useState<number | null>(video.duration)
  const [currentTime, setCurrentTime] = useState(startSeconds)
  const [volume, setVolume] = useState(() => loadVolume().volume)
  const [muted, setMuted] = useState(() => loadVolume().muted)
  const [refused, setRefused] = useState(false)
  const [errorText, setErrorText] = useState<string | null>(null)
  // Bottom overlay visibility only. The top bar is permanently visible and the
  // stage/iframe never move, so this boolean cannot cause layout shift.
  const [bottomVisible, setBottomVisible] = useState(true)
  const [iframeKey, setIframeKey] = useState(0)
  const [thumbOk, setThumbOk] = useState(true)

  // ── Cinema state ─────────────────────────────────────────────────────────
  const [comments, setComments] = useState<FtComment[]>([])
  const [commentsContinuation, setCommentsContinuation] = useState<string | null>(null)
  const [commentsCount, setCommentsCount] = useState<number | null>(null)
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsLoadingMore, setCommentsLoadingMore] = useState(false)
  const [commentsError, setCommentsError] = useState<string | null>(null)
  const [commentsDisabled, setCommentsDisabled] = useState(false)
  const [commentsSort, setCommentsSort] = useState<'top' | 'new'>('top')
  const [commentsOpen, setCommentsOpen] = useState(true)
  const [expandedLong, setExpandedLong] = useState<Record<string, boolean>>({})
  const [commentReplies, setCommentReplies] = useState<Record<string, { items: FtComment[]; continuation: string | null; loading: boolean; open: boolean }>>({})
  const [sponsorSegments, setSponsorSegments] = useState<FtSponsorSegment[]>([])
  const [skipSponsors, setSkipSponsors] = useState(() => loadSkipSponsors())
  const [skipToast, setSkipToast] = useState<{ text: string; id: number } | null>(null)
  const [speedToast, setSpeedToast] = useState<{ text: string; id: number } | null>(null)
  const [captionsOn, setCaptionsOn] = useState(false)
  const [speed, setSpeed] = useState(1)
  // Live rendition readout only (getPlaybackQuality / onPlaybackQualityChange).
  // There is deliberately NO manual selector: YouTube ignores every quality
  // lever, so quality is always Auto and this just reports what it picked.
  const [actualQuality, setActualQuality] = useState<string | null>(null)
  const [isHolding2x, setIsHolding2x] = useState(false)
  // Two separate menus instead of one generic "settings" gear: speed gets a
  // real panel; quality opens an Auto readout (same tab UI, honest content).
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'speed' | 'quality'>('speed')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [scrubTime, setScrubTime] = useState<number | null>(null)

  const stateRef = useRef<number | null>(null)
  const timeRef = useRef(startSeconds)
  const durationRef = useRef<number | null>(video.duration)
  const endedRef = useRef(false)
  const hideTimerRef = useRef<number>(0)
  const bridgeUpRef = useRef(false)
  const lastSkipRef = useRef<string | null>(null)
  const skipToastTimerRef = useRef<number>(0)
  const barRef = useRef<HTMLDivElement>(null)
  const scrubbingRef = useRef(false)
  const shellRef = useRef<HTMLDivElement>(null)
  const fsToggleInFlightRef = useRef(false)
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null)
  const singleTapTimerRef = useRef<number>(0)
  // Hold-for-2x refs. speedRef mirrors the `speed` state so timer callbacks
  // always restore the rate that was active when the hold began.
  const speedRef = useRef(1)
  const spaceHoldTimerRef = useRef<number>(0)
  const holdActiveRef = useRef(false)
  const holdPrevSpeedRef = useRef(1)
  const pointerHoldTimerRef = useRef<number>(0)
  const pointerHoldActiveRef = useRef(false)
  const speedToastTimerRef = useRef<number>(0)
  const settingsTabRef = useRef<'speed' | 'quality'>('speed')
  // Mirrors `captionsOn` so the bridge handler (registered once per video)
  // always sees the current toggle without a stale closure.
  // Default is OFF and it resets per video — see the reset effect below.
  const captionsOnRef = useRef(false)
  // Available caption tracks reported by the embed (via getOption
  // captions/tracklist). Used to pick a real languageCode when turning on.
  const captionTracksRef = useRef<Array<{ languageCode: string }>>([])
  // Parent callbacks in refs so the bridge subscription is set up once per
  // video instead of on every parent render.
  const cbRef = useRef({ onClose, onMarkSeen, onSaveProgress, onObserved, onNotEmbeddable, onAutoAdvance, onManualNext })
  cbRef.current = { onClose, onMarkSeen, onSaveProgress, onObserved, onNotEmbeddable, onAutoAdvance, onManualNext }
  // Autoplay choice + queue availability change independently of the bridge
  // subscription — mirror them so the ENDED handler never acts on a stale
  // closure when the user toggles mid-playback.
  const autoplayNextRef = useRef(autoplayNext)
  autoplayNextRef.current = autoplayNext
  const hasNextRef = useRef(hasNext)
  hasNextRef.current = hasNext

  const isPlaying = playerState === STATE_PLAYING
  const buffering = playerState === STATE_BUFFERING
  const started = playerState !== null && playerState !== -1

  // Resuming from a saved position is only meaningful a little way in; near the
  // end we would just land on the credits.
  const resumeAt = startSeconds > 10 && (video.duration === null || startSeconds < video.duration - 20)
    ? startSeconds
    : 0

  // Keyed ONLY on video/retry.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const embedSrc = useMemo(
    () => embedUrl(video.videoId, resumeAt),
    [video.videoId, iframeKey, resumeAt],
  )

  const chapters = useMemo(
    () => parseChapters(video.description, duration ?? video.duration),
    [video.description, duration, video.duration],
  )
  const activeChapterIndex = useMemo(
    () => (chapters.length ? getActiveChapterIndex(chapters, currentTime) : 0),
    [chapters, currentTime],
  )
  const descParts = useMemo(
    () => (video.description ? splitDescription(video.description) : []),
    [video.description],
  )
  const remaining = duration !== null && duration > 0 ? Math.max(0, duration - currentTime) : null
  // Mask YouTube's forced endscreen grid: fade our own cover in the last
  // seconds so the "more videos" wall never gets a clean frame. The player
  // still closes on ENDED — unless autoplay-next is ON, in which case the
  // queue advances instead.
  const showEndCover = remaining !== null && remaining < 3 && remaining > 0 && started
  const endCoverLabel = autoplayNext && hasNext
    ? (nextTitle ? `Up next: ${nextTitle}` : 'Up next…')
    : 'Ending · nothing plays next'

  const displayTime = scrubTime ?? currentTime
  const progressRatio = duration !== null && duration > 0
    ? Math.min(1, Math.max(0, displayTime / duration))
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
    for (const event of ['onReady', 'onStateChange', 'onPlaybackQualityChange', 'onError']) {
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

  const flashSkipToast = useCallback((text: string) => {
    window.clearTimeout(skipToastTimerRef.current)
    setSkipToast({ text, id: Date.now() })
    skipToastTimerRef.current = window.setTimeout(() => setSkipToast(null), 2600)
  }, [])

  useEffect(() => () => window.clearTimeout(skipToastTimerRef.current), [])
  useEffect(() => () => window.clearTimeout(speedToastTimerRef.current), [])

  const flashSpeedToast = useCallback((text: string) => {
    window.clearTimeout(speedToastTimerRef.current)
    setSpeedToast({ text, id: Date.now() })
    speedToastTimerRef.current = window.setTimeout(() => setSpeedToast(null), 1400)
  }, [])

  // Ask the embed for its rate capabilities + current rendition. Getters
  // answer via `infoDelivery`, which the bridge handler below folds into
  // state. Quality is read-only (YouTube ignores every setter), so we only
  // ever ASK what it picked — never tell it what to play.
  const requestPlaybackInfo = useCallback(() => {
    withBridge(() => {
      cmd('getPlaybackQuality', [])
      cmd('getAvailablePlaybackRates', [])
      cmd('getPlaybackRate', [])
    })
  }, [cmd, withBridge])

  // ── SponsorBlock lookup (one fetch per video, cached in main) ─────────────
  useEffect(() => {
    let cancelled = false
    setSponsorSegments([])
    lastSkipRef.current = null
    window.api.ftGetSponsorSegments(video.videoId)
      .then((result) => {
        if (cancelled) return
        const list = Array.isArray(result?.segments) ? result.segments : []
        setSponsorSegments(
          list
            .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
            .sort((a, b) => a.start - b.start),
        )
      })
      .catch(() => {
        if (!cancelled) setSponsorSegments([])
      })
    return () => { cancelled = true }
  }, [video.videoId])

  useEffect(() => {
    try {
      localStorage.setItem(SKIP_SPONSORS_KEY, skipSponsors ? 'true' : 'false')
    } catch { /* ignore */ }
  }, [skipSponsors])

  // ── Comments (keyless via Invidious mirrors, one fetch per video+sort) ────
  useEffect(() => {
    let cancelled = false
    setComments([])
    setCommentsContinuation(null)
    setCommentsCount(null)
    setCommentsError(null)
    setCommentsDisabled(false)
    setExpandedLong({})
    setCommentReplies({})
    setCommentsLoading(true)
    window.api.ftGetComments(video.videoId, { sortBy: commentsSort })
      .then((result) => {
        if (cancelled) return
        if ('error' in result) {
          setCommentsError(result.error || 'Could not load comments')
        } else if (result.disabled) {
          setCommentsDisabled(true)
        } else {
          setComments(result.comments)
          setCommentsContinuation(result.continuation)
          setCommentsCount(result.commentCount)
        }
      })
      .catch((err) => {
        if (!cancelled) setCommentsError(err?.message || 'Could not load comments')
      })
      .finally(() => {
        if (!cancelled) setCommentsLoading(false)
      })
    return () => { cancelled = true }
  }, [video.videoId, commentsSort])

  const loadMoreComments = () => {
    if (!commentsContinuation || commentsLoadingMore) return
    setCommentsLoadingMore(true)
    setCommentsError(null)
    window.api.ftGetComments(video.videoId, { sortBy: commentsSort, continuation: commentsContinuation })
      .then((result) => {
        if ('error' in result) {
          setCommentsError(result.error || 'Could not load more comments')
        } else if (!result.disabled) {
          setComments((prev) => [...prev, ...result.comments])
          setCommentsContinuation(result.continuation)
          if (typeof result.commentCount === 'number') setCommentsCount(result.commentCount)
        }
      })
      .catch((err) => setCommentsError(err?.message || 'Could not load more comments'))
      .finally(() => setCommentsLoadingMore(false))
  }

  const toggleReplies = (key: string, comment: FtComment) => {
    const entry = commentReplies[key]
    if (entry?.open) {
      setCommentReplies((prev) => ({ ...prev, [key]: { ...prev[key], open: false } }))
      return
    }
    if (entry && entry.items.length > 0) {
      setCommentReplies((prev) => ({ ...prev, [key]: { ...prev[key], open: true } }))
      return
    }
    if (!comment.replyContinuation) return
    const continuation = comment.replyContinuation
    setCommentReplies((prev) => ({ ...prev, [key]: { items: [], continuation: null, loading: true, open: true } }))
    window.api.ftGetComments(video.videoId, { sortBy: commentsSort, continuation })
      .then((result) => {
        if ('error' in result) {
          setCommentReplies((prev) => ({ ...prev, [key]: { items: [], continuation, loading: false, open: true } }))
          return
        }
        setCommentReplies((prev) => ({
          ...prev,
          [key]: { items: result.disabled ? [] : result.comments, continuation: result.disabled ? null : result.continuation, loading: false, open: true },
        }))
      })
      .catch(() => {
        setCommentReplies((prev) => ({ ...prev, [key]: { items: [], continuation, loading: false, open: true } }))
      })
  }

  const loadMoreReplies = (key: string) => {
    const entry = commentReplies[key]
    if (!entry?.continuation || entry.loading) return
    const continuation = entry.continuation
    setCommentReplies((prev) => ({ ...prev, [key]: { ...prev[key], loading: true } }))
    window.api.ftGetComments(video.videoId, { sortBy: commentsSort, continuation })
      .then((result) => {
        if ('error' in result || result.disabled) {
          setCommentReplies((prev) => ({ ...prev, [key]: { ...prev[key], loading: false } }))
          return
        }
        setCommentReplies((prev) => ({
          ...prev,
          [key]: { items: [...prev[key].items, ...result.comments], continuation: result.continuation, loading: false, open: true },
        }))
      })
      .catch(() => {
        setCommentReplies((prev) => ({ ...prev, [key]: { ...prev[key], loading: false } }))
      })
  }

  const renderComment = (comment: FtComment, key: string, nested = false) => {
    const long = comment.content.length > LONG_COMMENT_CHARS
    const showFull = !long || expandedLong[key]
    const replyEntry = commentReplies[key]
    const canReply = comment.replyCount > 0 && (comment.replyContinuation || (replyEntry && replyEntry.items.length > 0))
    return (
      <div key={key} className={`flex gap-2.5 ${nested ? '' : 'border-b border-white/5 px-1 py-3'}`}>
        {comment.avatarUrl ? (
          <img src={comment.avatarUrl} alt="" loading="lazy" className="h-7 w-7 shrink-0 rounded-full bg-white/10 object-cover" />
        ) : (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-black text-white/60">
            {(comment.author || '?').charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate text-xs font-bold text-white/90">{comment.author}</span>
            {comment.publishedText && (
              <span className="shrink-0 text-[11px] font-medium text-white/35">{comment.publishedText}</span>
            )}
          </p>
          <p className={`mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-white/70 ${showFull ? '' : 'line-clamp-6'}`}>
            {comment.content}
          </p>
          {long && (
            <button
              type="button"
              onClick={() => setExpandedLong((prev) => ({ ...prev, [key]: !prev[key] }))}
              className="mt-1 text-[11px] font-bold text-white/45 hover:text-white"
            >
              {showFull ? 'Show less' : 'Read more'}
            </button>
          )}
          <div className="mt-1.5 flex items-center gap-3">
            {comment.likeCount !== null && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-white/40">
                <ThumbsUp size={11} /> {formatCompactCount(comment.likeCount)}
              </span>
            )}
            {canReply && (
              <button
                type="button"
                onClick={() => toggleReplies(key, comment)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-300/80 hover:text-sky-200"
              >
                <ChevronDown size={12} className={`transition-transform ${replyEntry?.open ? 'rotate-180' : ''}`} />
                {replyEntry?.open ? 'Hide' : ''} {comment.replyCount > 0 ? `${comment.replyCount} ${comment.replyCount === 1 ? 'reply' : 'replies'}` : 'Replies'}
              </button>
            )}
          </div>
          {replyEntry?.open && (
            <div className="mt-2 space-y-0 border-l-2 border-white/10 pl-3">
              {replyEntry.loading && replyEntry.items.length === 0 ? (
                <span className="flex items-center gap-2 py-2 text-[11px] font-semibold text-white/40">
                  <Loader2 size={12} className="animate-spin" /> Loading replies…
                </span>
              ) : replyEntry.items.length > 0 ? (
                <>
                  {replyEntry.items.map((reply, i) => renderComment(reply, `${key}-r${i}-${reply.commentId ?? ''}`, true))}
                  {replyEntry.continuation && (
                    <button
                      type="button"
                      onClick={() => loadMoreReplies(key)}
                      disabled={replyEntry.loading}
                      className="py-1 text-[11px] font-bold text-sky-300/80 hover:text-sky-200 disabled:opacity-40"
                    >
                      {replyEntry.loading ? 'Loading…' : 'More replies'}
                    </button>
                  )}
                </>
              ) : !replyEntry.loading ? (
                <p className="py-1 text-[11px] text-white/30">Could not load replies.</p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Reset per-video overlay prefs that don't persist across videos.
  // (Speed resets to 1x; quality is always Auto with a live readout.)
  // Captions always default to OFF for every video.
  // NOTE: the parent keeps ONE stable player instance across Next /
  // auto-advance (no videoId key) so fullscreen survives. That means every
  // piece of per-video UI state must reset here — a remount no longer does
  // it for us.
  useEffect(() => {
    setCaptionsOn(false)
    captionsOnRef.current = false
    captionTracksRef.current = []
    setSpeed(1)
    speedRef.current = 1
    setIsHolding2x(false)
    holdActiveRef.current = false
    pointerHoldActiveRef.current = false
    window.clearTimeout(spaceHoldTimerRef.current)
    window.clearTimeout(pointerHoldTimerRef.current)
    setShowSettings(false)
    setSettingsTab('speed')
    settingsTabRef.current = 'speed'
    setScrubTime(null)
    scrubbingRef.current = false
    setActualQuality(null)
    // Fresh video = fresh metadata. Without this a reused instance would show
    // the previous video's duration / thumbnail / error state for a beat.
    setDuration(video.duration)
    durationRef.current = video.duration
    setRefused(false)
    setThumbOk(true)
    setErrorText(null)
    // If we were fullscreen before the swap and the browser dropped us
    // (remount, iframe quirk), climb straight back in — no flash of windowed.
    // Windowed stays windowed: we only ever re-enter, never exit here.
    if (ftFullscreenIntent && !document.fullscreenElement) {
      const shell = shellRef.current
      if (shell && typeof shell.requestFullscreen === 'function') {
        void shell.requestFullscreen().catch(() => {})
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setCurrentTime(startSeconds)
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
      const send = (func: string, args: unknown[] = []) => {
        try {
          iframeRef.current?.contentWindow?.postMessage(
            JSON.stringify({ event: 'command', func, args, id, channel: 'widget' }), '*')
        } catch { /* retry on the next tick */ }
      }

      if (data.event === 'onReady') {
        // Restore the user's volume, learn the runtime, and try to start.
        // The start attempt usually succeeds because opening the player follows
        // the card click (a user gesture); if not, the overlay covers it.
        send('setVolume', [volumePref.volume])
        send(volumePref.muted ? 'mute' : 'unMute', [])
        setVolume(volumePref.volume)
        setMuted(volumePref.muted)
        send('getDuration', [])
        send('playVideo', [])
        // Read back what YouTube picked (Auto, always). Setters are ignored by
        // YouTube, so nothing is ever asserted — see the module docstring.
        send('getPlaybackQuality', [])
        send('getAvailablePlaybackRates', [])
        send('getPlaybackRate', [])
        // Captions OFF by default. cc_load_policy=0 only means "do not force",
        // which is not the same as off — YouTube can still enable them from its
        // own preferences / auto-captions. Unloading the module plus clearing
        // the track is deterministic and independent of URL params or stored
        // cookies. The user can still switch them on with our CC button.
        send('setOption', ['captions', 'track', {}])
        send('unloadModule', ['captions'])
        // Learn which caption tracks exist so turning ON can pick a real one.
        send('getOption', ['captions', 'tracklist'])
        return
      }

      if (data.event === 'onStateChange') {
        const state = Number(data.info)
        stateRef.current = state
        setPlayerState(state)
        if (state === STATE_PLAYING) {
          setErrorText(null)
          // YouTube can auto-enable captions once playback actually starts
          // (account prefs / auto-captions), even after the onReady unload.
          // Re-assert OFF here unless the user explicitly turned them on.
          if (!captionsOnRef.current) {
            send('setOption', ['captions', 'track', {}])
            send('unloadModule', ['captions'])
          }
          // Tracklist is usually only available once the video has loaded.
          send('getOption', ['captions', 'tracklist'])
        }
        if (state === STATE_PAUSED) saveProgress(timeRef.current)
        if (state === STATE_ENDED && !endedRef.current) {
          endedRef.current = true
          saveProgress(timeRef.current)
          cbRef.current.onObserved(video.videoId, { ended: true })
          // Autoplay ON + a next unseen video exists: hand off to the queue
          // (the parent marks this video seen and swaps in the next one).
          // Otherwise keep the historic behaviour: mark seen + close.
          // Preserve the window mode: remember fullscreen so the next video
          // opens in the same mode (fullscreen stays fullscreen).
          ftFullscreenIntent = !!document.fullscreenElement
          if (autoplayNextRef.current && hasNextRef.current) {
            cbRef.current.onAutoAdvance(video.videoId)
          } else {
            cbRef.current.onMarkSeen(video.videoId)
            cbRef.current.onClose()
          }
        }
        return
      }

      if (data.event === 'infoDelivery' && data.info && typeof data.info === 'object') {
        if (typeof data.info.currentTime === 'number' && data.info.currentTime >= 0) {
          // While scrubbing, the bar owns the displayed time; the polled value
          // still lands in the ref so a commit seeks from a fresh position.
          timeRef.current = data.info.currentTime
          if (!scrubbingRef.current) setCurrentTime(data.info.currentTime)
        }
        // The feed cannot provide duration, so the player is where we learn it.
        if (typeof data.info.duration === 'number' && data.info.duration > 0
          && durationRef.current !== data.info.duration) {
          durationRef.current = data.info.duration
          setDuration(data.info.duration)
          cbRef.current.onObserved(video.videoId, { duration: data.info.duration })
        }
        // Playback-rate / quality answers to our getter commands. While a
        // hold-for-2x is active the embed's rate is transiently 2x, so don't
        // let it overwrite the user's real speed.
        if (typeof data.info.playbackRate === 'number' && Number.isFinite(data.info.playbackRate)
          && !holdActiveRef.current && !pointerHoldActiveRef.current) {
          const reported = clampSpeed(data.info.playbackRate)
          if (reported !== speedRef.current) {
            speedRef.current = reported
            setSpeed(reported)
          }
        }
        // The live rendition YouTube picked (Auto). Read-only — reported here
        // so the UI can show what is actually playing.
        if (typeof data.info.playbackQuality === 'string' && data.info.playbackQuality.length > 0) {
          setActualQuality((prev) => (prev === data.info.playbackQuality ? prev : data.info.playbackQuality))
        }
        // Answer to getOption(captions, tracklist). Shape varies by build:
        // either { tracklist: [...] } or the array itself. Stored so the
        // captions toggle can pick a real languageCode when turning on —
        // loadModule alone shows nothing without a selected track.
        {
          const raw = (data.info as any)?.tracklist ?? (Array.isArray(data.info) ? data.info : null)
          if (Array.isArray(raw)) {
            const cleaned = raw
              .filter((t: any) => t && typeof t.languageCode === 'string' && t.languageCode.length > 0)
              .map((t: any) => ({ languageCode: t.languageCode as string }))
            if (cleaned.length) captionTracksRef.current = cleaned
          }
        }
        return
      }

      if (data.event === 'onPlaybackQualityChange') {
        // Fires when the embed switches renditions (Auto adapting). Shape
        // varies by build: either the quality id string itself or an object
        // carrying it. Feeds the live readout only — never fought.
        const raw = typeof data.info === 'string'
          ? data.info
          : (data.info && typeof data.info.playbackQuality === 'string' ? data.info.playbackQuality : '')
        if (raw) {
          setActualQuality((prev) => (prev === raw ? prev : raw))
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

  // ── Time polling while playing + periodic progress saves + sponsor skip ───
  const sponsorSegmentsRef = useRef<FtSponsorSegment[]>([])
  sponsorSegmentsRef.current = sponsorSegments
  const skipSponsorsRef = useRef(skipSponsors)
  skipSponsorsRef.current = skipSponsors

  useEffect(() => {
    let ticks = 0
    const interval = window.setInterval(() => {
      if (stateRef.current !== STATE_PLAYING) return
      const target = iframeRef.current?.contentWindow
      if (target) {
        try {
          target.postMessage(JSON.stringify({
            event: 'command', func: 'getCurrentTime', args: [], id: idRef.current, channel: 'widget',
          }), '*')
        } catch { /* ignore */ }
      }
      ticks += 1
      if (ticks % 20 === 0) saveProgress(timeRef.current)

      // SponsorBlock auto-skip: jump over crowd-flagged in-video segments.
      // Guarded per-segment so a manual seek-back is honoured once (the key
      // clears once the playhead leaves the segment).
      if (skipSponsorsRef.current && !scrubbingRef.current) {
        const now = timeRef.current
        const hit = sponsorSegmentsRef.current.find((s) => now >= s.start && now < s.end - 0.2)
        if (hit) {
          const key = `${hit.start}-${hit.end}`
          if (lastSkipRef.current !== key) {
            lastSkipRef.current = key
            const dest = hit.end + 0.15
            timeRef.current = dest
            setCurrentTime(dest)
            try {
              target?.postMessage(JSON.stringify({
                event: 'command', func: 'seekTo', args: [dest, true], id: idRef.current, channel: 'widget',
              }), '*')
            } catch { /* next tick retries via bridge */ }
            flashSkipToast(`Skipped ${sponsorLabel(hit.category)} ${formatChapterTime(hit.start)} → ${formatChapterTime(hit.end)}`)
          }
        } else {
          lastSkipRef.current = null
        }
      }
    }, 250)
    return () => window.clearInterval(interval)
  }, [saveProgress, flashSkipToast])

  // ── Chrome auto-hide (overlay only — never touches layout) ────────────────
  // YouTube-style: while playing, the bars hide ~2.5s after the last mouse
  // movement or tap — even with the cursor resting on the video — and the
  // cursor itself disappears too. Any movement/tap brings them back. The tap
  // layer above the iframe guarantees moves are observed (iframe mousemove
  // events never bubble to the parent). The windowed top bar is exempt and
  // stays pinned; in fullscreen it fades with the bottom bar.
  const pokeBottom = useCallback(() => {
    setBottomVisible(true)
    window.clearTimeout(hideTimerRef.current)
    hideTimerRef.current = window.setTimeout(() => {
      if (stateRef.current === STATE_PLAYING) {
        setBottomVisible(false)
      }
    }, 2500)
  }, [])

  const handlePointerEnter = useCallback(() => {
    pokeBottom()
  }, [pokeBottom])

  const handlePointerLeave = useCallback(() => {
    // Leaving the stage (e.g. onto the sidebar): hide promptly if playing.
    window.clearTimeout(hideTimerRef.current)
    if (stateRef.current === STATE_PLAYING) {
      setBottomVisible(false)
    } else {
      pokeBottom()
    }
  }, [pokeBottom])

  useEffect(() => () => window.clearTimeout(hideTimerRef.current), [])

  // Declared before the effects/callbacks that depend on them (TDZ order).
  // VIDEO-ONLY fullscreen: the Electron window fullscreen (app-level, F11-style)
  // is a completely separate layer. This button must never read or write it -
  // the app often launches window-fullscreen, and stacking the video element
  // fullscreen on top is legal. Touching the window mode here is what caused
  // "first click exits the app, second click enters video, exit restores app".
  const syncFsState = useCallback(() => {
    setIsFullscreen(!!document.fullscreenElement)
  }, [])

  // Exits ONLY the video element fullscreen. Never touches the app window -
  // closing the player or pressing Escape must preserve the app's window mode.
  // Returns true if anything exited.
  const exitVideoFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {})
      return true
    }
    return false
  }, [])

  useEffect(() => {
    const onFsChange = () => syncFsState()
    document.addEventListener('fullscreenchange', onFsChange)
    syncFsState()
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
    }
  }, [syncFsState])

  useEffect(() => () => {
    window.clearTimeout(singleTapTimerRef.current)
    window.clearTimeout(spaceHoldTimerRef.current)
    window.clearTimeout(pointerHoldTimerRef.current)
  }, [])

  // -- Fullscreen (video element only) -------------------------------------
  // Element fullscreen on the stage shell. The app window fullscreen is never
  // consulted: entering stacks over it, exiting reveals it untouched.
  // Window IPC is a last-resort fallback only when requestFullscreen is
  // missing or truly rejects (old webview).
  //
  // Debounce: a second toggle within 500ms is swallowed, so an accidental
  // +double-fire can never enter-then-instantly-exit.
  const lastFsToggleRef = useRef(0)
  const toggleFullscreen = useCallback(() => {
    pokeBottom()
    const now = Date.now()
    if (fsToggleInFlightRef.current || now - lastFsToggleRef.current < 500) return
    lastFsToggleRef.current = now
    // VIDEO-ONLY: never read or write the app window fullscreen here. The app
    // often runs window-fullscreen; stacking element fullscreen on top is
    // legal and exiting must not drop the app out of its window mode.
    if (document.fullscreenElement) {
      fsToggleInFlightRef.current = true
      void document.exitFullscreen().catch(() => {}).finally(() => {
        fsToggleInFlightRef.current = false
        window.setTimeout(syncFsState, 100)
      })
      return
    }
    const shell = shellRef.current
    if (shell && typeof shell.requestFullscreen === 'function') {
      fsToggleInFlightRef.current = true
      void shell.requestFullscreen()
        .catch(() => {
          // Fallback only when element fullscreen is unavailable.
          return window.api.toggleFullscreen().then(() => undefined).catch(() => undefined)
        })
        .finally(() => {
          fsToggleInFlightRef.current = false
          window.setTimeout(syncFsState, 100)
        })
      return
    }
    fsToggleInFlightRef.current = true
    void window.api.toggleFullscreen().catch(() => {}).finally(() => {
      fsToggleInFlightRef.current = false
      window.setTimeout(syncFsState, 100)
    })
  }, [pokeBottom, syncFsState])

  // ── Commands ───────────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    pokeBottom()
    withBridge(() => cmd(stateRef.current === STATE_PLAYING ? 'pauseVideo' : 'playVideo', []))
  }, [cmd, withBridge, pokeBottom])

  const handleSeek = useCallback((seconds: number) => {
    pokeBottom()
    const clamped = Math.max(0, seconds)
    timeRef.current = clamped
    setCurrentTime(clamped)
    // A manual seek clears the skip guard so the user can rewatch a skipped
    // section if they jump back into it deliberately.
    lastSkipRef.current = null
    withBridge(() => cmd('seekTo', [clamped, true]))
  }, [cmd, withBridge, pokeBottom])

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
    pokeBottom()
    setMuted((was) => {
      const next = !was
      try { localStorage.setItem(MUTED_KEY, next ? '1' : '0') } catch { /* ignore */ }
      withBridge(() => cmd(next ? 'mute' : 'unMute', []))
      return next
    })
  }, [cmd, withBridge, pokeBottom])

  const toggleCaptions = useCallback(() => {
    pokeBottom()
    // Compute outside the state updater (updaters must stay pure — StrictMode
    // can double-invoke them, which would fire the bridge twice).
    const next = !captionsOnRef.current
    captionsOnRef.current = next
    setCaptionsOn(next)
    withBridge(() => {
      if (next) {
        // Loading the module alone shows nothing — a track must be selected.
        // Prefer English when available, else the video's first track.
        const tracks = captionTracksRef.current
        const pick = tracks.some((t) => t.languageCode.toLowerCase().startsWith('en'))
          ? 'en'
          : (tracks[0]?.languageCode || 'en')
        cmd('loadModule', ['captions'])
        cmd('setOption', ['captions', 'track', { languageCode: pick }])
        // Refresh the list in case it wasn't ready yet.
        cmd('getOption', ['captions', 'tracklist'])
      } else {
        cmd('setOption', ['captions', 'track', {}])
        cmd('unloadModule', ['captions'])
      }
    })
  }, [cmd, withBridge, pokeBottom])

  const handleSpeed = useCallback((rate: number, opts?: { close?: boolean }) => {
    const clamped = clampSpeed(rate)
    speedRef.current = clamped
    // If the user re-picks a speed mid-hold, release should keep the new
    // choice instead of snapping back to the pre-hold rate.
    if (holdActiveRef.current) holdPrevSpeedRef.current = clamped
    setSpeed(clamped)
    if (opts?.close !== false) setShowSettings(false)
    pokeBottom()
    withBridge(() => cmd('setPlaybackRate', [clamped]))
  }, [cmd, withBridge, pokeBottom])

  // Fine stepping: + / - buttons (and keyboard) move in 0.10 increments.
  // The panel stays open so the user can tap repeatedly.
  const nudgeSpeed = useCallback((delta: number) => {
    const next = clampSpeed(Math.round((speedRef.current + delta) * 10) / 10)
    handleSpeed(next, { close: false })
    flashSpeedToast(`${next.toFixed(2).replace(/0$/, '')}x`)
  }, [handleSpeed, flashSpeedToast])

  const openSettingsTab = useCallback((tab: 'speed' | 'quality') => {
    pokeBottom()
    if (tab === 'quality') requestPlaybackInfo()
    const prev = settingsTabRef.current
    settingsTabRef.current = tab
    setSettingsTab(tab)
    // Tapping the active tab's button closes the panel (toggle behaviour);
    // tapping the other tab while open switches to it and stays open.
    setShowSettings((was) => (was && prev === tab ? false : true))
  }, [pokeBottom, requestPlaybackInfo])

  // -- Hold for 2x (YouTube-style) -----------------------------------------
  // Tap = play/pause. Holding Space (or pressing-and-holding the video) past
  // the threshold switches to 2x until release, then restores the previous
  // rate. Key repeat events are ignored - the timer decides, not repeats.
  const enterHold2x = useCallback(() => {
    if (holdActiveRef.current || stateRef.current !== STATE_PLAYING) return
    holdActiveRef.current = true
    holdPrevSpeedRef.current = speedRef.current
    setIsHolding2x(true)
    pokeBottom()
    withBridge(() => cmd('setPlaybackRate', [HOLD_2X_RATE]))
  }, [cmd, withBridge, pokeBottom])

  const exitHold2x = useCallback(() => {
    if (!holdActiveRef.current) return
    holdActiveRef.current = false
    window.clearTimeout(spaceHoldTimerRef.current)
    const prev = clampSpeed(holdPrevSpeedRef.current)
    speedRef.current = prev
    setSpeed(prev)
    setIsHolding2x(false)
    withBridge(() => cmd('setPlaybackRate', [prev]))
  }, [cmd, withBridge])

  // ── Scrub bar (click + drag; commit on release) ────────────────────────────
  const timeFromClientX = useCallback((clientX: number): number | null => {
    const el = barRef.current
    if (!el || duration === null || duration <= 0) return null
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0) return null
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio * duration
  }, [duration])

  const handleBarPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (duration === null || duration <= 0) return
    event.preventDefault()
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* ignore */ }
    scrubbingRef.current = true
    pokeBottom()
    const t = timeFromClientX(event.clientX)
    if (t !== null) setScrubTime(t)
  }, [duration, pokeBottom, timeFromClientX])

  const handleBarPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return
    const t = timeFromClientX(event.clientX)
    if (t !== null) setScrubTime(t)
  }, [timeFromClientX])

  const handleBarPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!scrubbingRef.current) return
    scrubbingRef.current = false
    const t = timeFromClientX(event.clientX)
    setScrubTime(null)
    if (t !== null) handleSeek(t)
    else pokeBottom()
  }, [handleSeek, pokeBottom, timeFromClientX])

  // ── Tap gestures on the video ────────────────────────────────────────────
  // The cross-origin iframe swallows all pointer events, so double-tap /
  // double-click can only be observed on our own transparent layer above it.
  // Single tap = play/pause via the bridge (self-healing on first use);
  // double tap / double click = fullscreen. The 280ms hold-back on single
  // taps is the standard cost of telling single apart from double.
  // Press-and-hold (>450ms while playing) = 2x until release, YouTube-style.
  const handleGesturePointerDown = useCallback(() => {
    window.clearTimeout(pointerHoldTimerRef.current)
    pointerHoldActiveRef.current = false
    pointerHoldTimerRef.current = window.setTimeout(() => {
      if (stateRef.current !== STATE_PLAYING) return
      pointerHoldActiveRef.current = true
      // A hold is neither a single nor a double tap: drop any pending tap.
      lastTapRef.current = null
      window.clearTimeout(singleTapTimerRef.current)
      enterHold2x()
    }, POINTER_HOLD_MS)
  }, [enterHold2x])

  const handleGesturePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    window.clearTimeout(pointerHoldTimerRef.current)
    if (pointerHoldActiveRef.current) {
      pointerHoldActiveRef.current = false
      exitHold2x()
      pokeBottom()
      return
    }
    pokeBottom()
    const now = Date.now()
    const last = lastTapRef.current
    if (last && now - last.time < 300 && Math.hypot(event.clientX - last.x, event.clientY - last.y) < 32) {
      lastTapRef.current = null
      window.clearTimeout(singleTapTimerRef.current)
      toggleFullscreen()
      return
    }
    lastTapRef.current = { time: now, x: event.clientX, y: event.clientY }
    window.clearTimeout(singleTapTimerRef.current)
    singleTapTimerRef.current = window.setTimeout(() => {
      togglePlay()
    }, 280)
  }, [pokeBottom, toggleFullscreen, togglePlay, exitHold2x])

  const handleGesturePointerCancel = useCallback(() => {
    window.clearTimeout(pointerHoldTimerRef.current)
    if (pointerHoldActiveRef.current) {
      pointerHoldActiveRef.current = false
      exitHold2x()
    }
  }, [exitHold2x])

  const handleClose = useCallback(() => {
    saveProgress(timeRef.current)
    ftFullscreenIntent = false
    exitVideoFullscreen()
    cbRef.current.onClose()
  }, [saveProgress, exitVideoFullscreen])

  const handleMarkWatched = useCallback(() => {
    saveProgress(timeRef.current)
    ftFullscreenIntent = false
    exitVideoFullscreen()
    cbRef.current.onMarkSeen(video.videoId)
    cbRef.current.onClose()
  }, [saveProgress, exitVideoFullscreen, video.videoId])

  // Manual skip: keep the current position (NOT marked seen) and hand the
  // queue to the parent. Disabled when this is the last video in the stack.
  // Fullscreen is deliberately left untouched here: the shell element stays
  // mounted (stable parent key), so the browser keeps fullscreen and the
  // next video continues in the same mode. Windowed likewise stays windowed.
  const handleManualNext = useCallback(() => {
    if (!hasNext) return
    pokeBottom()
    saveProgress(timeRef.current)
    ftFullscreenIntent = !!document.fullscreenElement
    cbRef.current.onManualNext(video.videoId)
  }, [hasNext, pokeBottom, saveProgress, video.videoId])

  const handleToggleAutoplay = useCallback(() => {
    pokeBottom()
    onToggleAutoplayNext()
  }, [onToggleAutoplayNext, pokeBottom])

  const openOnYouTube = useCallback(() => {
    window.api.openWebPopup(watchUrl(video.videoId))
  }, [video.videoId])

  // ── Keyboard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const exitFullscreenOnly = () => exitVideoFullscreen()
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      // When the embed itself holds focus, its own shortcuts (space, arrows)
      // do the same job — handling them here as well would double-toggle.
      if (document.activeElement?.tagName === 'IFRAME') {
        if (event.key === 'Escape' && !exitFullscreenOnly()) handleClose()
        return
      }
      if (event.code === 'Space') {
        // Keep Space on the player even when a button has focus: otherwise a
        // focused button fires natively AND we toggle -> double-toggle. Blur
        // first so there is exactly one owner of the key.
        if (document.activeElement?.tagName === 'BUTTON') {
          (document.activeElement as HTMLElement).blur()
        }
        event.preventDefault()
        if (event.repeat || spaceHoldTimerRef.current) return
        spaceHoldTimerRef.current = window.setTimeout(() => {
          spaceHoldTimerRef.current = 0
          enterHold2x()
        }, SPACE_HOLD_MS)
        return
      }
      switch (event.key) {
        case 'k':
        case 'K':
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
        case 'c':
        case 'C':
          toggleCaptions()
          break
        case 'f':
        case 'F':
          toggleFullscreen()
          break
        case 'n':
        case 'N':
          event.preventDefault()
          handleManualNext()
          break
        case '+':
        case '=':
          event.preventDefault()
          nudgeSpeed(0.1)
          break
        case '-':
        case '_':
          event.preventDefault()
          nudgeSpeed(-0.1)
          break
        case 'Escape':
          if (showSettings) { setShowSettings(false); break }
          if (!exitFullscreenOnly()) handleClose()
          break
        default:
          break
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== 'Space') return
      if (spaceHoldTimerRef.current) {
        // Quick tap: never reached the hold threshold -> play/pause.
        window.clearTimeout(spaceHoldTimerRef.current)
        spaceHoldTimerRef.current = 0
        const target = event.target as HTMLElement | null
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
        if (document.activeElement?.tagName === 'IFRAME') return
        event.preventDefault()
        togglePlay()
        return
      }
      // Held past the threshold -> release 2x, never toggle play.
      if (holdActiveRef.current) {
        event.preventDefault()
        exitHold2x()
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('keyup', onKeyUp)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('keyup', onKeyUp)
    }
  }, [togglePlay, handleSeek, handleVolume, toggleMute, toggleCaptions, toggleFullscreen, handleClose, handleManualNext, exitVideoFullscreen, volume, showSettings, nudgeSpeed, enterHold2x, exitHold2x])

  // Either the flag already said so, or the embed told us mid-flight.
  if (!video.embeddable || refused) {
    return createPortal(
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black p-8">
        <div className="w-full max-w-lg border border-white/10 bg-[#0b0b0b] p-8 text-center space-y-5">
          <h3 className="text-lg font-black uppercase italic text-white">Embedding disabled</h3>
          <p className="text-sm text-white/50 font-semibold">
            The creator of “{video.title}” has blocked playback outside YouTube.
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={openOnYouTube}
              className="inline-flex items-center gap-2 bg-primary px-4 py-2 text-xs font-black uppercase tracking-widest text-white"
            >
              <ExternalLink size={14} /> Open on YouTube
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-white"
            >
              Close
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )
  }

  const showSpinner = buffering && started
  const publishedAgo = video.publishedAt ? formatAgo(video.publishedAt) : ''
  // Video element fullscreen only - the app window mode must not affect the
  // icon or the auto-hide chrome. Otherwise the button shows "exit" while the
  // video is still windowed just because the app launched fullscreen.
  const fsActive = isFullscreen
  // Single chrome visibility source: floating corner buttons + bottom bar fade
  // together on idle while playing (YouTube-style), in windowed and
  // fullscreen alike — so the video owns the whole stage while watching.
  const chromeVisible = bottomVisible

  // Portalled to document.body: immune to any ancestor transform/filter that
  // would otherwise turn `fixed` into a cropped box and leak the feed through
  // the top. True viewport takeover, edge to edge.
  return createPortal(
    // Root: fixed full-screen column. Geometry is set once by flexbox; overlays
    // never participate in layout, so nothing here can shift the video.
    // data-fullscreen-gesture-scope keeps App's double-tap-to-toggle-window
    // handler from firing while interacting with this player.
    <div
      data-fullscreen-gesture-scope="player"
      className="fixed inset-0 z-[70] m-0 flex flex-col bg-black p-0 text-white select-none overflow-hidden">
      {/* Body: stable two columns on desktop, stacked on mobile. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">

        {/* ── MAIN VIDEO AREA ─────────────────────────────────────────── */}
        <div className="flex w-full shrink-0 flex-col bg-black lg:h-full lg:min-h-0 lg:w-auto lg:min-w-0 lg:flex-1">
          {/* Stage: full-bleed black. Mobile = 16:9 strip; desktop = fills. */}
          <div
            ref={shellRef}
            className={`relative aspect-video w-full shrink-0 bg-black lg:aspect-auto lg:h-full lg:min-h-0 lg:w-full lg:flex-1 ${
              isPlaying && !chromeVisible ? 'cursor-none' : ''
            }`}
            onMouseMove={pokeBottom}
            onMouseEnter={handlePointerEnter}
            onMouseLeave={handlePointerLeave}
          >
            <iframe
              ref={iframeRef}
              key={`${video.videoId}:${iframeKey}`}
              src={embedSrc}
              title={video.title}
              className="absolute inset-0 z-0 h-full w-full border-0 bg-black"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              onLoad={sendHandshake}
            />

            {/* Tap layer: single tap = play/pause, double tap/click =
                fullscreen, press-and-hold = 2x. Below center + chrome
                overlays so buttons win. */}
            {started && !errorText && (
              <div
                className="absolute inset-0 z-[5] touch-none"
                onPointerDown={handleGesturePointerDown}
                onPointerUp={handleGesturePointerUp}
                onPointerCancel={handleGesturePointerCancel}
                onPointerLeave={handleGesturePointerCancel}
              />
            )}

            {/* Hold-for-2x indicator (YouTube-style, top-center). */}
            {isHolding2x && (
              <div className="pointer-events-none absolute inset-x-0 top-16 z-40 flex justify-center px-4">
                <span className="inline-flex items-center gap-2 bg-black/70 px-4 py-1.5 text-xs font-black tracking-widest text-white shadow-2xl backdrop-blur-md">
                  <Play size={12} fill="currentColor" /> 2x
                </span>
              </div>
            )}

            {/* ── FLOATING CORNER CHROME (no title bar) ──
                Icon-only buttons that fade with the bottom bar. Deliberately
                text-free: the video title/channel already live in the sidebar,
                and any text here overlaps YouTube's own native title row on
                pause (avatar + title), which ghosted as double text. */}
            <div
              className={`pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between p-3 transition-all duration-200 sm:p-4 ${
                chromeVisible ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-2 opacity-0'
              }`}
              aria-hidden={!chromeVisible}
            >
              <button
                type="button"
                onClick={handleClose}
                aria-label="Back"
                title="Back (Esc)"
                tabIndex={chromeVisible ? 0 : -1}
                className={`pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white/85 backdrop-blur-md transition-all hover:bg-black/85 hover:text-white active:scale-95 ${
                  chromeVisible ? '' : 'pointer-events-none'
                }`}
              >
                <ArrowLeft size={18} />
              </button>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleMarkWatched}
                  title="Mark as watched and close"
                  aria-label="Mark as watched and close"
                  tabIndex={chromeVisible ? 0 : -1}
                  className={`pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white/70 backdrop-blur-md transition-all hover:bg-black/85 hover:text-emerald-400 active:scale-95 ${
                    chromeVisible ? '' : 'pointer-events-none'
                  }`}
                >
                  <Check size={17} />
                </button>
                {hasNext && (
                  <button
                    type="button"
                    onClick={handleManualNext}
                    title={nextTitle ? `Play next: ${nextTitle} (N)` : 'Play next unseen video (N)'}
                    aria-label={nextTitle ? `Play next: ${nextTitle}` : 'Play next unseen video'}
                    tabIndex={chromeVisible ? 0 : -1}
                    className={`pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white/70 backdrop-blur-md transition-all hover:bg-black/85 hover:text-white active:scale-95 ${
                      chromeVisible ? '' : 'pointer-events-none'
                    }`}
                  >
                    <SkipForward size={17} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={openOnYouTube}
                  title="Open on YouTube"
                  aria-label="Open on YouTube"
                  tabIndex={chromeVisible ? 0 : -1}
                  className={`pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white/70 backdrop-blur-md transition-all hover:bg-black/85 hover:text-white active:scale-95 ${
                    chromeVisible ? '' : 'pointer-events-none'
                  }`}
                >
                  <ExternalLink size={16} />
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  aria-label="Close player"
                  title="Close (Esc)"
                  tabIndex={chromeVisible ? 0 : -1}
                  className={`pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white/70 backdrop-blur-md transition-all hover:bg-black/85 hover:text-white active:scale-95 ${
                    chromeVisible ? '' : 'pointer-events-none'
                  }`}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* ── CENTER STATE OVERLAYS (absolute, never in flow) ── */}
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
                    <span className="bg-black/70 px-2 py-0.5 text-xs font-bold tabular-nums text-white">
                      {formatDuration(duration)}
                    </span>
                  )}
                  {resumeAt > 0 && (
                    <span className="bg-black/70 px-2 py-0.5 text-xs font-bold text-white">
                      Resuming at {formatDuration(resumeAt)}
                    </span>
                  )}
                </span>
              </button>
            )}

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

            {showSpinner && (
              <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 text-white/90">
                <Loader2 size={44} className="animate-spin" />
              </div>
            )}

            {showEndCover && (
              <div className="pointer-events-none absolute inset-0 z-20 flex items-end justify-center bg-gradient-to-t from-black via-black/60 to-transparent pb-24">
                <span className="max-w-[90%] truncate bg-black/70 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-white/80">
                  {endCoverLabel}
                </span>
              </div>
            )}

            {errorText && (
              <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black px-8 text-center">
                <p className="text-sm font-bold text-white">{errorText}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setErrorText(null)
                      setIframeKey((key) => key + 1)
                    }}
                    className="bg-primary px-5 py-2 text-xs font-black uppercase tracking-widest text-white"
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="bg-white/10 px-5 py-2 text-xs font-black uppercase tracking-widest text-white"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {/* ── SETTINGS POPOVER (overlay, above bottom bar) ── */}
            {showSettings && (
              <>
                <button
                  type="button"
                  aria-label="Close settings"
                  onClick={() => setShowSettings(false)}
                  className="absolute inset-0 z-30 cursor-default bg-transparent"
                />
                <div className="absolute bottom-24 right-3 z-40 w-64 border border-white/10 bg-[#141414] p-3 shadow-2xl sm:right-4">
                  {/* Tabs: two separate buttons' panels, not one generic gear. */}
                  <div className="mb-2 grid grid-cols-2 gap-1 bg-white/5 p-1">
                    {(['speed', 'quality'] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => {
                          settingsTabRef.current = tab
                          setSettingsTab(tab)
                          if (tab === 'quality') requestPlaybackInfo()
                          pokeBottom()
                        }}
                        aria-pressed={settingsTab === tab}
                        className={`px-2 py-1.5 text-[10px] font-black uppercase tracking-widest transition-colors ${
                          settingsTab === tab ? 'bg-white text-black' : 'text-white/50 hover:text-white'
                        }`}
                      >
                        {tab === 'speed' ? 'Speed' : 'Quality'}
                      </button>
                    ))}
                  </div>
                  {settingsTab === 'speed' ? (
                    <>
                      <div className="flex items-center justify-between gap-2 px-1 pb-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-white/40">
                          Playback speed
                        </p>
                        <span className="bg-white/10 px-2 py-0.5 text-xs font-black tabular-nums text-white">
                          {isHolding2x ? '2x' : `${speed}x`}
                        </span>
                      </div>
                      {/* Fine stepping: - / + move in 0.10 increments. */}
                      <div className="mb-2 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => nudgeSpeed(-0.1)}
                          aria-label="Decrease speed by 0.10"
                          title="Slower (-0.10)"
                          className="flex h-8 flex-1 items-center justify-center bg-white/5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                        >
                          <Minus size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => nudgeSpeed(0.1)}
                          aria-label="Increase speed by 0.10"
                          title="Faster (+0.10)"
                          className="flex h-8 flex-1 items-center justify-center bg-white/5 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                        >
                          <Plus size={15} />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {SPEEDS.map((rate) => (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => handleSpeed(rate)}
                            className={`px-2 py-1.5 text-xs font-bold tabular-nums transition-colors ${
                              speed === rate && !isHolding2x ? 'bg-primary text-white' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            {rate}x
                          </button>
                        ))}
                      </div>
                      <p className="px-1 pt-2 text-[10px] leading-relaxed text-white/30">
                        Hold Space for 2x - + / - steps of 0.10
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="px-1 pb-2 text-[10px] font-black uppercase tracking-widest text-white/40">
                        Quality · Auto
                      </p>
                      <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5">
                        <p className="text-xs font-black text-white">
                          {actualQuality ? `Playing at ${qualityLabel(actualQuality)}` : 'Detecting…'}
                        </p>
                        <p className="mt-1 text-[10px] leading-relaxed text-white/40">
                          YouTube decides the rendition and ignores manual
                          switches, so there is no selector here — this just
                          shows what it picked for your screen and connection.
                        </p>
                      </div>
                    </>
                  )}
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-white/10 px-1 pt-3">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-white/70">
                      <Zap size={12} className="text-amber-300" /> Auto-skip sponsors
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={skipSponsors}
                      onClick={() => setSkipSponsors((v) => !v)}
                      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${skipSponsors ? 'bg-amber-300' : 'bg-white/15'}`}
                    >
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-black transition-all ${skipSponsors ? 'left-[18px]' : 'left-0.5 bg-white/70'}`} />
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ── BOTTOM OVERLAY (always mounted; fades only) ── */}
            <div
              className={`pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pb-2 pt-10 transition-all duration-200 sm:px-4 ${
                bottomVisible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'
              }`}
              aria-hidden={!bottomVisible}
            >
              {/* Progress */}
              <div
                ref={barRef}
                role="slider"
                aria-label="Seek"
                aria-valuemin={0}
                aria-valuemax={Math.round(duration ?? 0)}
                aria-valuenow={Math.round(displayTime)}
                tabIndex={bottomVisible ? 0 : -1}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') { e.preventDefault(); handleSeek(displayTime - 5) }
                  if (e.key === 'ArrowRight') { e.preventDefault(); handleSeek(displayTime + 5) }
                }}
                onPointerDown={handleBarPointerDown}
                onPointerMove={handleBarPointerMove}
                onPointerUp={handleBarPointerUp}
                onPointerCancel={() => { scrubbingRef.current = false; setScrubTime(null) }}
                className={`group relative flex h-5 cursor-pointer items-center touch-none ${bottomVisible ? 'pointer-events-auto' : 'pointer-events-none'}`}
              >
                <div className="relative h-1.5 w-full overflow-visible rounded-full bg-white/20 transition-all group-hover:h-2">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-primary"
                    style={{ width: `${progressRatio * 100}%` }}
                  />
                  {duration !== null && duration > 0 && sponsorSegments.map((seg, i) => (
                    <div
                      key={`${seg.start}-${seg.end}-${i}`}
                      className="absolute inset-y-0 bg-amber-300/80"
                      style={{
                        left: `${(seg.start / duration) * 100}%`,
                        width: `${Math.max(0.4, ((seg.end - seg.start) / duration) * 100)}%`,
                      }}
                    />
                  ))}
                  <div
                    className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow transition-transform group-hover:scale-110"
                    style={{ left: `${progressRatio * 100}%` }}
                  />
                </div>
              </div>
              {/* Buttons */}
              <div className={`flex items-center gap-0.5 sm:gap-1 ${bottomVisible ? 'pointer-events-auto' : 'pointer-events-none'}`}>
                <button
                  type="button"
                  onClick={togglePlay}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                  tabIndex={bottomVisible ? 0 : -1}
                  className="p-2 text-white transition-colors hover:text-white/70"
                >
                  {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                </button>
                <button
                  type="button"
                  onClick={handleManualNext}
                  disabled={!hasNext}
                  aria-label={nextTitle ? `Play next: ${nextTitle}` : 'Play next unseen video'}
                  title={nextTitle ? `Next: ${nextTitle} (N)` : hasNext ? 'Play next unseen video (N)' : 'No more unseen videos in this stack'}
                  tabIndex={bottomVisible && hasNext ? 0 : -1}
                  className={`p-2 transition-colors ${hasNext ? 'text-white/80 hover:text-white' : 'cursor-default text-white/25'}`}
                >
                  <SkipForward size={19} />
                </button>
                <span className="whitespace-nowrap px-1 text-[11px] font-semibold tabular-nums text-white/80">
                  {formatChapterTime(displayTime)} <span className="text-white/40">/ {duration !== null && duration > 0 ? formatChapterTime(duration) : '--:--'}</span>
                </span>
                <div className="w-1 sm:w-2" />
                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                  tabIndex={bottomVisible ? 0 : -1}
                  className="p-2 text-white/80 transition-colors hover:text-white"
                >
                  {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={muted ? 0 : volume}
                  onChange={(e) => handleVolume(Number(e.target.value))}
                  aria-label="Volume"
                  tabIndex={bottomVisible ? 0 : -1}
                  className="hidden h-1 w-16 cursor-pointer accent-white min-[420px]:block sm:w-20"
                />
                <div className="min-w-0 flex-1" />
                {sponsorSegments.length > 0 && (
                  <span className="mr-1 hidden whitespace-nowrap text-[10px] font-bold uppercase tracking-widest text-amber-200/70 md:inline">
                    {skipSponsors ? 'Skipping sponsors' : 'Sponsors listed'}
                  </span>
                )}
                {/* Player-only autoplay: when ON, ENDED advances to the next
                    unseen video in the stack instead of closing. */}
                <button
                  type="button"
                  onClick={handleToggleAutoplay}
                  role="switch"
                  aria-checked={autoplayNext}
                  aria-label={autoplayNext ? 'Autoplay next on' : 'Autoplay next off'}
                  title={autoplayNext
                    ? (nextTitle ? `Autoplay ON — next: ${nextTitle}` : 'Autoplay ON — plays the next unseen video automatically')
                    : 'Autoplay OFF — turn on to play the next unseen video automatically'}
                  tabIndex={bottomVisible ? 0 : -1}
                  className={`flex items-center gap-1.5 p-2 transition-colors hover:text-white ${autoplayNext ? 'text-white' : 'text-white/50'}`}
                >
                  <span className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${autoplayNext ? 'bg-primary' : 'bg-white/20'}`}>
                    <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${autoplayNext ? 'left-3.5' : 'left-0.5'}`} />
                  </span>
                  <span className="hidden text-[11px] font-black uppercase tracking-widest min-[420px]:inline">
                    Auto
                  </span>
                </button>
                <button
                  type="button"
                  onClick={toggleCaptions}
                  aria-label="Toggle captions"
                  aria-pressed={captionsOn}
                  title="Captions"
                  tabIndex={bottomVisible ? 0 : -1}
                  className={`p-2 transition-colors hover:text-white ${captionsOn ? 'text-white' : 'text-white/50'}`}
                >
                  <Subtitles size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => openSettingsTab('speed')}
                  aria-label="Playback speed"
                  aria-expanded={showSettings && settingsTab === 'speed'}
                  title="Speed (+ / - steps of 0.10)"
                  tabIndex={bottomVisible ? 0 : -1}
                  className={`flex items-center gap-1 p-2 transition-colors hover:text-white ${showSettings && settingsTab === 'speed' ? 'text-white' : 'text-white/70'}`}
                >
                  <Gauge size={18} />
                  <span className="min-w-7 text-left text-[11px] font-black tabular-nums">
                    {isHolding2x ? '2x' : `${speed}x`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => openSettingsTab('quality')}
                  aria-label="Video quality (auto, decided by YouTube)"
                  aria-expanded={showSettings && settingsTab === 'quality'}
                  title={actualQuality ? `Auto · playing at ${qualityLabel(actualQuality)}` : 'Auto · YouTube decides the quality'}
                  tabIndex={bottomVisible ? 0 : -1}
                  className={`flex items-center gap-1 p-2 transition-colors hover:text-white ${showSettings && settingsTab === 'quality' ? 'text-white' : 'text-white/70'}`}
                >
                  <MonitorPlay size={18} />
                  <span className="hidden text-[11px] font-black min-[420px]:inline">
                    {actualQuality ? qualityLabel(actualQuality) : 'Auto'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={toggleFullscreen}
                  aria-label={fsActive ? 'Exit fullscreen' : 'Fullscreen'}
                  title="Fullscreen (f)"
                  tabIndex={bottomVisible ? 0 : -1}
                  className="p-2 text-white/80 transition-colors hover:text-white"
                >
                  {fsActive ? <Minimize size={18} /> : <Maximize size={18} />}
                </button>
              </div>
            </div>

            {/* Sponsor skip toast (overlay, above bottom bar). */}
            {skipToast && (
              <div className="pointer-events-none absolute inset-x-0 bottom-24 z-40 flex justify-center px-4">
                <span className="inline-flex items-center gap-2 border border-amber-300/30 bg-black/85 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-amber-200 shadow-2xl">
                  <Zap size={12} /> {skipToast.text}
                </span>
              </div>
            )}

            {/* Speed / quality toast (overlay, above bottom bar). */}
            {!skipToast && speedToast && (
              <div className="pointer-events-none absolute inset-x-0 bottom-24 z-40 flex justify-center px-4">
                <span className="inline-flex items-center gap-2 border border-white/15 bg-black/85 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-white shadow-2xl">
                  <Gauge size={12} /> {speedToast.text}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── SIDEBAR (visible by default; fixed width on desktop) ────────── */}
        <aside className="flex w-full shrink-0 flex-col border-t border-white/10 bg-[#0b0b0b] lg:h-full lg:min-h-0 lg:w-[360px] lg:border-l lg:border-t-0 xl:w-[400px]">
          {/* Panel header — fixed height, so content changes never resize video. */}
          <div className="flex shrink-0 items-center gap-1.5 p-3">
            <FileText size={13} className="text-white/40" />
            <span className="text-[11px] font-black uppercase tracking-widest text-white/60">
              Description
            </span>
          </div>

          {/* Scroll region. Desktop: fills sidebar height. Mobile: natural flow. */}
          <div className="min-h-0 flex-1 px-4 pb-6 lg:overflow-y-auto">
            <div className="space-y-5">
                <div>
                  <h4 className="text-sm font-bold leading-snug text-white">{video.title}</h4>
                  <p className="mt-1.5 text-xs font-medium text-white/45">
                    {[video.channelTitle, formatViews(video.views), publishedAgo ? `${publishedAgo} ago` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>

                {chapters.length > 0 && (
                  <section aria-label="Chapters">
                    <h5 className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-white/40">
                      <ListVideo size={12} /> Chapters
                    </h5>
                    <div className="space-y-0.5">
                      {chapters.map((chapter, index) => (
                        <button
                          key={`${chapter.start}-${index}`}
                          type="button"
                          onClick={() => handleSeek(chapter.start)}
                          className={`flex w-full items-center gap-3 px-2 py-2 text-left transition-colors ${
                            index === activeChapterIndex ? 'bg-primary/15 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
                          }`}
                        >
                          <span className={`shrink-0 px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                            index === activeChapterIndex ? 'bg-primary text-white' : 'bg-white/10 text-white/70'
                          }`}>
                            {formatChapterTime(chapter.start)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold">{chapter.title}</span>
                          {index === activeChapterIndex && <Play size={11} fill="currentColor" className="shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {sponsorSegments.length > 0 && (
                  <section aria-label="In-video segments" className="border border-amber-300/15 bg-amber-300/[0.04] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-amber-200/90">
                        <Zap size={12} /> In-video segments
                      </span>
                      <button
                        type="button"
                        onClick={() => setSkipSponsors((v) => !v)}
                        aria-pressed={skipSponsors}
                        className={`px-2.5 py-1 text-[10px] font-black uppercase tracking-widest transition-colors ${
                          skipSponsors ? 'bg-amber-300 text-black' : 'bg-white/10 text-white/60 hover:text-white'
                        }`}
                      >
                        {skipSponsors ? 'Auto-skip on' : 'Auto-skip off'}
                      </button>
                    </div>
                    <div className="mt-2 space-y-0.5">
                      {sponsorSegments.map((seg, index) => (
                        <button
                          key={`${seg.start}-${seg.end}-${index}`}
                          type="button"
                          onClick={() => handleSeek(seg.start)}
                          className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-xs font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white"
                        >
                          <span className="truncate">{sponsorLabel(seg.category)}</span>
                          <span className="shrink-0 tabular-nums text-white/35">
                            {formatChapterTime(seg.start)} → {formatChapterTime(seg.end)}
                          </span>
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-white/30">
                      Crowd-sourced via SponsorBlock. Baked-in promos YouTube itself never skips.
                    </p>
                  </section>
                )}

                <section aria-label="Comments">
                  <div className="mb-1 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setCommentsOpen((v) => !v)}
                      aria-expanded={commentsOpen}
                      className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-white/40 transition-colors hover:text-white/70"
                    >
                      <MessageSquare size={12} />
                      Comments{commentsCount !== null ? ` · ${formatCompactCount(commentsCount)}` : ''}
                      <ChevronDown size={12} className={`transition-transform ${commentsOpen ? '' : '-rotate-90'}`} />
                    </button>
                    <div className="ml-auto flex items-center gap-1">
                      {(['top', 'new'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setCommentsSort(mode)}
                          aria-pressed={commentsSort === mode}
                          className={`rounded px-2 py-1 text-[10px] font-black uppercase tracking-widest transition-colors ${
                            commentsSort === mode ? 'bg-white/10 text-white' : 'text-white/35 hover:text-white/70'
                          }`}
                        >
                          {mode === 'top' ? 'Top' : 'Newest'}
                        </button>
                      ))}
                    </div>
                  </div>
                  {commentsOpen && (
                    <div>
                      {commentsLoading ? (
                        <span className="flex items-center gap-2 px-1 py-3 text-xs font-semibold text-white/40">
                          <Loader2 size={14} className="animate-spin" /> Loading comments…
                        </span>
                      ) : commentsDisabled ? (
                        <p className="px-1 py-3 text-[13px] text-white/30">Comments are turned off for this video.</p>
                      ) : commentsError && comments.length === 0 ? (
                        <div className="px-1 py-3">
                          <p className="text-[13px] text-white/40">{commentsError}</p>
                          <button
                            type="button"
                            onClick={() => {
                              setCommentsError(null)
                              setCommentsLoading(true)
                              window.api.ftGetComments(video.videoId, { sortBy: commentsSort })
                                .then((result) => {
                                  if ('error' in result) {
                                    setCommentsError(result.error || 'Could not load comments')
                                  } else if (result.disabled) {
                                    setCommentsDisabled(true)
                                  } else {
                                    setComments(result.comments)
                                    setCommentsContinuation(result.continuation)
                                    setCommentsCount(result.commentCount)
                                  }
                                })
                                .catch((err) => setCommentsError(err?.message || 'Could not load comments'))
                                .finally(() => setCommentsLoading(false))
                            }}
                            className="mt-2 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-white hover:bg-white/15"
                          >
                            Retry
                          </button>
                        </div>
                      ) : comments.length === 0 ? (
                        <p className="px-1 py-3 text-[13px] text-white/30">No comments yet.</p>
                      ) : (
                        <>
                          <div>
                            {comments.map((comment, i) => renderComment(comment, `c${i}-${comment.commentId ?? ''}`))}
                          </div>
                          {commentsError && (
                            <p className="px-1 py-2 text-[11px] text-amber-200/70">{commentsError}</p>
                          )}
                          {commentsContinuation && (
                            <button
                              type="button"
                              onClick={loadMoreComments}
                              disabled={commentsLoadingMore}
                              className="mt-2 w-full rounded-lg bg-white/5 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
                            >
                              {commentsLoadingMore ? 'Loading…' : 'Load more comments'}
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </section>

                <section aria-label="Description">
                  <h5 className="mb-2 text-[11px] font-black uppercase tracking-widest text-white/40">
                    About
                  </h5>
                  {video.description ? (
                    <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-white/65">
                      {descParts.map((part, i) => {
                        if (part.kind === 'newline') return <br key={i} />
                        if (part.kind === 'timestamp') {
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => handleSeek(part.seconds ?? 0)}
                              className="font-bold text-sky-300 hover:underline"
                            >
                              {part.text}
                            </button>
                          )
                        }
                        if (part.kind === 'url') {
                          return (
                            <a
                              key={i}
                              href={part.text}
                              onClick={(e) => { e.preventDefault(); window.api.openWebPopup(part.text) }}
                              className="break-all text-sky-300 hover:underline"
                            >
                              {part.text}
                            </a>
                          )
                        }
                        return <span key={i}>{part.text}</span>
                      })}
                    </div>
                  ) : (
                    <p className="text-[13px] text-white/30">No description available.</p>
                  )}
                </section>

                <p className="border-t border-white/10 pt-4 text-[11px] leading-relaxed text-white/30">
                  Isolated playback — never recommends. Closes when the video ends unless Auto is on,
                  which plays the next unseen video in the stack. N skips forward.
                  Speed and captions are in the player bar below. Quality is always Auto — YouTube picks it.
                </p>
              </div>
          </div>
        </aside>
      </div>
    </div>,
    document.body,
  )
}

export default FocusTubePlayer
