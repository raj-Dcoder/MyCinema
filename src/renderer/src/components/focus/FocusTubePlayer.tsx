import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowUpNarrowWide,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  FolderPlus,
  Gauge,
  ListVideo,
  Loader2,
  Maximize,
  Maximize2,
  MessageSquare,
  Minimize,
  Minus,
  MonitorPlay,

  SquareArrowDownRight,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  SkipForward,
  Subtitles,
  ThumbsUp,
  Volume2,
  VolumeX,
  X,
  Zap,
  Sparkles,
} from 'lucide-react'
import type { FtCategory, FtComment, FtVideo } from '../../types'
import { categoryDot, embedUrl, formatAgo, formatDuration, formatPublishedExact, formatViews, thumbnailUrl, watchUrl } from '../../utils/focusTube'
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
  categoryName?: string
  categories?: FtCategory[]
  onSelectCategory?: (categoryId: number | null) => void
  queue?: FtVideo[]
  onSelectVideo?: (video: FtVideo) => void
  onToggleSeen?: (video: FtVideo) => void
  hideShorts?: boolean
  sortOrder?: 'newest' | 'oldest'
  onToggleSortOrder?: (order: 'newest' | 'oldest') => void
  isSearchQueue?: boolean
  isChannelSubscribed?: boolean
  onSubscribeChannel?: (
    channel: { channelId: string; title: string; handle?: string | null; avatarUrl?: string | null },
    categoryId?: number
  ) => Promise<void> | void
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
const SPEED_PREF_KEY = 'mycinema_ft_preferred_speed'

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

function loadSpeedPref(): number {
  try {
    const v = localStorage.getItem(SPEED_PREF_KEY)
    if (v) {
      const n = parseFloat(v)
      if (Number.isFinite(n) && n >= SPEED_MIN && n <= SPEED_MAX) {
        return clampSpeed(n)
      }
    }
  } catch {}
  return 1
}

// YouTube rendition ids (getPlaybackQuality / onPlaybackQualityChange).
const QUALITY_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'highres', label: 'Original' },
  { id: 'hd2880', label: '5K' },
  { id: 'hd2160', label: '2160p 4K' },
  { id: 'hd1440', label: '1440p' },
  { id: 'hd1080', label: '1080p' },
  { id: 'hd720', label: '720p' },
  { id: 'large', label: '480p' },
  { id: 'medium', label: '360p' },
  { id: 'small', label: '240p' },
  { id: 'tiny', label: '144p' },
]

export const QUALITY_WEIGHTS: Record<string, number> = {
  highres: 4320,
  hd2880: 2880,
  hd2160: 2160,
  hd1440: 1440,
  hd1080: 1080,
  hd720: 720,
  large: 480,
  medium: 360,
  small: 240,
  tiny: 144,
  auto: 0,
}

function qualityLabel(id: string): string {
  return QUALITY_OPTIONS.find((q) => q.id === id)?.label ?? id
}

export const QUALITY_TARGETS: Array<{ id: string; label: string; desc: string; weight: number }> = [
  { id: 'auto', label: 'Auto (Recommended)', desc: 'Adaptive quality managed by YouTube based on bandwidth', weight: 0 },
  { id: 'hd2160', label: '4K Ultra HD', desc: 'Prioritize 2160p resolution', weight: 2160 },
  { id: 'hd1440', label: '1440p Quad HD', desc: 'Crisp 2K resolution', weight: 1440 },
  { id: 'hd1080', label: '1080p Full HD', desc: 'Standard crisp high-definition 1080p', weight: 1080 },
  { id: 'hd720', label: '720p HD', desc: 'Smooth streaming with reduced data usage', weight: 720 },
  { id: 'medium', label: 'Data Saver (360p / 480p)', desc: 'Lowest bandwidth usage for metered connections', weight: 360 },
]

export const QUALITY_PREF_KEY = 'mycinema_ft_preferred_quality'
export const AMBIENT_PREF_KEY = 'mycinema_ft_ambient_mode'
export const SIDEPANEL_EXPANDED_STORAGE_KEY = 'mycinema_ft_sidepanel_expanded'

/**
 * Ambient Mode Visual Configuration
 * Tweak these parameters to adjust glow spread, intensity, and feathering:
 */
export const AMBIENT_CONFIG = {
  // Horizontal spread outwards to the left & right sides (widescreen theater aura)
  insetX: '-inset-x-12 sm:-inset-x-24 md:-inset-x-36',
  scaleX: 'scale-x-125 sm:scale-x-140',

  // Vertical expansion above & below the player
  insetY: '-inset-y-50 sm:-inset-y-60',
  scaleY: 'scale-y-110 sm:scale-y-115',

  // Diffusion softness (blur radius)
  blur: 'blur-[65px] sm:blur-[95px]',

  // Brightness / Opacity - Calm, non-distracting atmospheric glow
  playingOpacity: 0.55,
  pausedOpacity: 0.35,

  // Soft bottom feathering: allows gentle ambient view below the video without washing out text
  bottomMask: '[mask-image:linear-gradient(to_bottom,black_85%,rgba(0,0,0,0.4)_95%,transparent_100%)]'
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

/** Deterministic hue from a name so fallback avatars are stable per author. */
function avatarHue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i += 1) {
    h = (h * 31 + name.charCodeAt(i)) % 360
  }
  return h
}

/**
 * Commenter avatar with a guaranteed fallback.
 * The Invidious mirrors sometimes return no avatar (or a URL that no longer
 * loads / is blocked) — previously that left a broken <img> icon. Now any
 * missing or failed photo falls back to a colored initial so the row never
 * looks broken.
 */
const CommentAvatar: React.FC<{ comment: FtComment }> = ({ comment }) => {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const url = comment.avatarUrl
  // Reset the load flags when the comment (avatar URL) changes.
  useEffect(() => {
    setFailed(false)
    setLoaded(false)
  }, [url])
  const author = comment.author || '?'
  const initial = author.trim().charAt(0).toUpperCase() || '?'
  const hue = avatarHue(author)
  const fallback = (
    <span
      aria-hidden
      title={comment.author}
      className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-black"
      style={{
        backgroundColor: `hsl(${hue}, 45%, 26%)`,
        color: `hsl(${hue}, 90%, 82%)`,
      }}
    >
      {initial}
    </span>
  )
  if (!url || failed) return <span className="shrink-0">{fallback}</span>
  // Stacked: the initial is always underneath, the photo fades in on top once
  // it actually loads. A blocked / dead URL therefore never flashes a broken
  // <img> icon — worst case the initial stays visible.
  return (
    <span className="relative h-7 w-7 shrink-0 rounded-full">
      {fallback}
      <img
        src={url}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className="absolute inset-0 h-7 w-7 rounded-full bg-transparent object-cover transition-opacity duration-200"
        style={{ opacity: loaded ? 1 : 0 }}
      />
    </span>
  )
}

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

const ChannelAvatar: React.FC<{ title: string; avatarUrl?: string | null; sizeClass?: string }> = ({
  title,
  avatarUrl,
  sizeClass = 'h-10 w-10',
}) => {
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
  }, [avatarUrl])
  if (avatarUrl && !failed) {
    return (
      <img
        src={avatarUrl}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${sizeClass} shrink-0 rounded-full border border-white/10 bg-white/[0.06] object-cover`}
      />
    )
  }
  return (
    <div
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full border border-primary/25 bg-gradient-to-br from-primary/30 to-primary/5 text-xs font-black uppercase text-white shadow-sm`}
    >
      {(title || '?').trim().charAt(0) || '?'}
    </div>
  )
}

const QueueCard: React.FC<{
  video: FtVideo
  isCurrent: boolean
  onSelect: (video: FtVideo) => void
  onToggleSeen: (video: FtVideo) => void
}> = ({ video, isCurrent, onSelect, onToggleSeen }) => {
  const [variant, setVariant] = useState(0)
  const [thumbBroken, setThumbBroken] = useState(false)
  const duration = formatDuration(video.duration)

  return (
    <div
      onClick={() => onSelect(video)}
      className={`group relative flex items-center gap-3 rounded-xl border p-2 transition-all cursor-pointer select-none ${
        isCurrent
          ? 'border-primary/60 bg-primary/10 shadow-[0_4px_20px_-8px_rgba(229,9,20,0.5)]'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.06]'
      }`}
    >
      <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-lg bg-black/60 sm:w-32">
        {!thumbBroken ? (
          <img
            src={thumbnailUrl(video.videoId, variant)}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={() => {
              if (variant < 3) setVariant((v) => v + 1)
              else setThumbBroken(true)
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[9px] font-bold uppercase text-white/30">
            Preview
          </div>
        )}
        {duration && (
          <span className="absolute bottom-1 right-1 rounded bg-black/85 px-1 py-0.5 text-[10px] font-bold tabular-nums text-white backdrop-blur-sm">
            {duration}
          </span>
        )}
        {isCurrent && (
          <span className="absolute top-1 left-1 flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow">
            <Play size={8} fill="currentColor" /> Playing
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h4
          className={`line-clamp-2 text-xs font-bold leading-snug transition-colors ${
            isCurrent ? 'text-white' : 'text-white/85 group-hover:text-white'
          }`}
          title={video.title}
        >
          {video.title}
        </h4>
        <p className="mt-1 truncate text-[11px] font-medium text-white/45">
          {video.channelTitle}
        </p>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggleSeen(video)
        }}
        title={video.seen ? 'Mark as unwatched' : 'Mark as watched'}
        aria-label={video.seen ? 'Mark as unwatched' : 'Mark as watched'}
        className={`shrink-0 rounded-lg p-1.5 transition-colors ${
          video.seen
            ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
            : 'text-white/30 hover:bg-white/10 hover:text-white'
        }`}
      >
        <Check size={14} strokeWidth={video.seen ? 3 : 2} />
      </button>
    </div>
  )
}

/**
 * MyCinema's isolated cinema shell around the YouTube embed.
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
  categoryName,
  categories,
  onSelectCategory,
  queue,
  onSelectVideo,
  onToggleSeen,
  hideShorts,
  sortOrder = 'newest',
  onToggleSortOrder,
  isSearchQueue,
  isChannelSubscribed = true,
  onSubscribeChannel,
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
  const [descriptionOpen, setDescriptionOpen] = useState(true)
  const [segmentsOpen, setSegmentsOpen] = useState(true)
  const [chaptersOpen, setChaptersOpen] = useState(true)
  const [fetchedDetails, setFetchedDetails] = useState<import('../../types').FtVideoDetails | null>(null)
  const [expandedLong, setExpandedLong] = useState<Record<string, boolean>>({})
  const [commentReplies, setCommentReplies] = useState<Record<string, { items: FtComment[]; continuation: string | null; loading: boolean; open: boolean }>>({})
  const [sponsorSegments, setSponsorSegments] = useState<FtSponsorSegment[]>([])
  const [skipSponsors, setSkipSponsors] = useState(() => loadSkipSponsors())
  const [skipToast, setSkipToast] = useState<{ text: string; id: number } | null>(null)
  const [speedToast, setSpeedToast] = useState<{ text: string; id: number } | null>(null)
  const [captionsOn, setCaptionsOn] = useState(false)
  const [speed, setSpeed] = useState<number>(() => loadSpeedPref())
  // Live rendition readout (getPlaybackQuality / onPlaybackQualityChange) + target preference.
  const [actualQuality, setActualQuality] = useState<string | null>(null)
  const [availableQualities, setAvailableQualities] = useState<string[]>([])
  const [qualityPref, setQualityPref] = useState<string>(() => {
    try {
      return localStorage.getItem(QUALITY_PREF_KEY) || 'auto'
    } catch {
      return 'auto'
    }
  })
  const qualityPrefRef = useRef(qualityPref)
  qualityPrefRef.current = qualityPref

  const [ambientMode, setAmbientMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(AMBIENT_PREF_KEY)
      return saved !== null ? saved === 'true' : true
    } catch {
      return true
    }
  })
  const ambientModeRef = useRef(ambientMode)
  ambientModeRef.current = ambientMode
  const ambientCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const lastAmbientUrlRef = useRef<string | null>(null)

  const handleToggleAmbient = useCallback(() => {
    setAmbientMode((prev) => {
      const next = !prev
      try {
        localStorage.setItem(AMBIENT_PREF_KEY, String(next))
      } catch {}
      return next
    })
  }, [])

  const maxDetectedWeight = useMemo(() => {
    let maxW = 0
    if (Array.isArray(availableQualities)) {
      for (const q of availableQualities) {
        const w = QUALITY_WEIGHTS[q] || 0
        if (w > maxW) maxW = w
      }
    }
    if (actualQuality) {
      const w = QUALITY_WEIGHTS[actualQuality] || 0
      if (w > maxW) maxW = w
    }
    return maxW
  }, [availableQualities, actualQuality])

  const maxSupportedLabel = useMemo(() => {
    if (maxDetectedWeight >= 2160) return '4K'
    if (maxDetectedWeight >= 1440) return '1440p'
    if (maxDetectedWeight >= 1080) return '1080p'
    if (maxDetectedWeight >= 720) return '720p'
    if (maxDetectedWeight >= 480) return '480p'
    if (maxDetectedWeight >= 360) return '360p'
    return null
  }, [maxDetectedWeight])

  const displayedQualityTargets = useMemo(() => {
    if (maxDetectedWeight === 0) return QUALITY_TARGETS
    return QUALITY_TARGETS.filter((t) => {
      if (t.id === 'auto') return true
      return t.weight <= maxDetectedWeight
    })
  }, [maxDetectedWeight])
  const [isHolding2x, setIsHolding2x] = useState(false)
  // Two separate menus instead of one generic "settings" gear: speed gets a
  // real panel; quality opens an Auto readout (same tab UI, honest content).
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<'speed' | 'quality'>('speed')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const isFullscreenRef = useRef(false)
  isFullscreenRef.current = isFullscreen
  const [scrubTime, setScrubTime] = useState<number | null>(null)
  // In-app mini player: docks the SAME iframe to the bottom-right corner so
  // playback continues while the user browses MyCinema. Unlike OS PiP this
  // never leaves the app and never remounts the iframe (no restart).
  const [isMinimized, setIsMinimized] = useState(false)
  const isMinimizedRef = useRef(false)
  isMinimizedRef.current = isMinimized
  const prevMinimizedRef = useRef(false)
  const prevFullscreenRef = useRef(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const isTransitioningRef = useRef(false)
  isTransitioningRef.current = isTransitioning
  const prevRectRef = useRef<DOMRect | null>(null)
  const activeAnimRef = useRef<Animation | null>(null)

  const [queueSearch, setQueueSearch] = useState('')
  const [sidebarTab, setSidebarTab] = useState<'queue' | 'chapters' | 'comments'>('queue')
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false)
  const [subscribePopoverOpen, setSubscribePopoverOpen] = useState(false)
  const [subscribingCatId, setSubscribingCatId] = useState<number | null>(null)
  const [optimisticSubscribed, setOptimisticSubscribed] = useState(false)
  const [showNewCatInput, setShowNewCatInput] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [creatingCat, setCreatingCat] = useState(false)
  const subscribePopoverRef = useRef<HTMLDivElement>(null)
  const subscribeBtnRef = useRef<HTMLButtonElement>(null)
  const [isSidepanelExpanded, setIsSidepanelExpanded] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEPANEL_EXPANDED_STORAGE_KEY) !== 'false'
    } catch {
      return true
    }
  })
  const [isSidepanelTransitioning, setIsSidepanelTransitioning] = useState(false)
  const isSidepanelTransitioningRef = useRef(false)
  isSidepanelTransitioningRef.current = isSidepanelTransitioning

  const handleToggleSidepanel = useCallback((expand?: boolean) => {
    setIsSidepanelTransitioning(true)
    setIsSidepanelExpanded((prev) => (typeof expand === 'boolean' ? expand : !prev))
    window.setTimeout(() => {
      setIsSidepanelTransitioning(false)
    }, 500)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(SIDEPANEL_EXPANDED_STORAGE_KEY, String(isSidepanelExpanded))
    } catch {}
  }, [isSidepanelExpanded])

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
  const stageWrapperRef = useRef<HTMLDivElement>(null)
  const fsToggleInFlightRef = useRef(false)
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null)
  const singleTapTimerRef = useRef<number>(0)
  // Hold-for-2x refs. speedRef mirrors the `speed` state so timer callbacks
  // always restore the rate that was active when the hold began.
  const speedRef = useRef<number>(speed)
  speedRef.current = speed
  const spaceHoldTimerRef = useRef<number>(0)
  const holdActiveRef = useRef(false)
  const holdPrevSpeedRef = useRef<number>(speed)
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

  // Keyed on video/retry/resume.
  // Reads qualityPrefRef.current on initial build so new videos carry &vq=,
  // but qualityPref is deliberately NOT in the dependency array so changing
  // the preferred resolution never interrupts or reloads the active iframe.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const embedSrc = useMemo(
    () => embedUrl(video.videoId, resumeAt, qualityPrefRef.current),
    [video.videoId, iframeKey, resumeAt],
  )

  const currentDescription = fetchedDetails?.description ?? video.description ?? ''

  const chapters = useMemo(() => {
    if (fetchedDetails?.chapters && fetchedDetails.chapters.length > 0) {
      return fetchedDetails.chapters
    }
    return parseChapters(currentDescription, duration ?? video.duration ?? fetchedDetails?.duration ?? null)
  }, [fetchedDetails?.chapters, fetchedDetails?.duration, currentDescription, duration, video.duration])
  const activeChapterIndex = useMemo(
    () => (chapters.length ? getActiveChapterIndex(chapters, currentTime) : 0),
    [chapters, currentTime],
  )
  const descParts = useMemo(
    () => (currentDescription ? splitDescription(currentDescription) : []),
    [currentDescription],
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

  const queueItems = useMemo(() => {
    const list = (queue && queue.length > 0 ? queue : []).filter((v) => {
      if (hideShorts && v.isShort) return false
      return true
    })
    if (isSearchQueue) {
      if (!queueSearch.trim()) return list
      const q = queueSearch.trim().toLowerCase()
      return list.filter((v) => v.title.toLowerCase().includes(q) || v.channelTitle.toLowerCase().includes(q))
    }
    const live = list.filter((v) => v.isLive)
    const rest = list.filter((v) => !v.isLive).sort((a, b) => {
      const diff = new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()
      return sortOrder === 'oldest' ? diff : -diff
    })
    const sorted = [...live, ...rest]
    if (!queueSearch.trim()) return sorted
    const q = queueSearch.trim().toLowerCase()
    return sorted.filter((v) => v.title.toLowerCase().includes(q) || v.channelTitle.toLowerCase().includes(q))
  }, [queue, queueSearch, hideShorts, sortOrder, isSearchQueue])

  const remainingCount = useMemo(() => {
    return (queue || []).filter((v) => (!hideShorts || !v.isShort) && !v.seen && v.videoId !== video.videoId).length
  }, [queue, video.videoId, hideShorts])

  const handleToggleQueueSeen = useCallback((v: FtVideo) => {
    if (onToggleSeen) {
      onToggleSeen(v)
    } else {
      cbRef.current.onMarkSeen(v.videoId)
    }
  }, [onToggleSeen])

  const handleSelectQueueVideo = useCallback((v: FtVideo) => {
    if (v.videoId === video.videoId) return
    saveProgress(displayTime)
    if (onSelectVideo) {
      onSelectVideo(v)
    } else {
      cbRef.current.onManualNext(v.videoId)
    }
  }, [video.videoId, displayTime, saveProgress, onSelectVideo])

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

  const applyQualityToPlayer = useCallback((prefId: string) => {
    withBridge(() => {
      if (prefId === 'auto') {
        cmd('setPlaybackQualityRange', ['auto', 'auto'])
        cmd('setPlaybackQuality', ['auto'])
      } else {
        cmd('setPlaybackQualityRange', [prefId, prefId])
        cmd('setPlaybackQuality', [prefId])
      }
    })
    window.api?.ftSetFrameQuality?.(prefId)
      ?.then(() => {
        window.api?.ftGetFrameQuality?.()?.then((res) => {
          if (res?.quality) setActualQuality(res.quality)
          if (Array.isArray(res?.available) && res.available.length > 0) {
            setAvailableQualities(res.available)
          }
        })
      })
      .catch(() => {})
  }, [cmd, withBridge])

  // Ask the embed for its rate capabilities + current rendition. Getters
  // answer via `infoDelivery`, which the bridge handler below folds into
  // state.
  const requestPlaybackInfo = useCallback(() => {
    withBridge(() => {
      cmd('getPlaybackQuality', [])
      cmd('getAvailableQualityLevels', [])
      cmd('getAvailablePlaybackRates', [])
      cmd('getPlaybackRate', [])
    })
    window.api?.ftGetFrameQuality?.()?.then((res) => {
      if (res?.quality) setActualQuality((prev) => (prev === res.quality ? prev : res.quality))
      if (Array.isArray(res?.available) && res.available.length > 0) {
        const avail = res.available
        setAvailableQualities((prev) => {
          if (JSON.stringify(prev) === JSON.stringify(avail)) return prev
          return avail
        })
      }
    }).catch(() => {})
  }, [cmd, withBridge])

  const handleSelectQualityPref = useCallback((prefId: string) => {
    setQualityPref(prefId)
    qualityPrefRef.current = prefId
    try {
      localStorage.setItem(QUALITY_PREF_KEY, prefId)
    } catch {}
    applyQualityToPlayer(prefId)
    const label = QUALITY_TARGETS.find((q) => q.id === prefId)?.label || prefId
    flashSpeedToast(`Target Quality: ${label}`)
    window.setTimeout(() => {
      requestPlaybackInfo()
    }, 600)
    window.setTimeout(() => {
      requestPlaybackInfo()
    }, 1800)
  }, [applyQualityToPlayer, flashSpeedToast, requestPlaybackInfo])

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

  // ── Video details lookup (full description + chapters) ────────────────────
  useEffect(() => {
    let cancelled = false
    setFetchedDetails(null)
    window.api?.ftGetVideoDetails?.(video.videoId)
      ?.then((details) => {
        if (!cancelled && details) {
          setFetchedDetails(details)
        }
      })
      ?.catch(() => {})
    return () => {
      cancelled = true
    }
  }, [video.videoId])

  useEffect(() => {
    try {
      localStorage.setItem(SKIP_SPONSORS_KEY, skipSponsors ? 'true' : 'false')
    } catch { /* ignore */ }
  }, [skipSponsors])

  // ── Ambient Mode: Thumbnail initialization ───────────────────────────────
  useEffect(() => {
    if (!ambientMode) return
    const thumbUrl = video.thumbnail || thumbnailUrl(video.videoId)
    if (!thumbUrl) return

    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = thumbUrl
    img.onload = () => {
      const canvas = ambientCanvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      }
    }
  }, [video.videoId, video.thumbnail, ambientMode])

  // ── Ambient Mode: Live video frame sampling with calm, micro-smoothed transitions ──
  useEffect(() => {
    if (!ambientMode || isMinimized || playerState !== STATE_PLAYING) return

    let active = true
    let rAFId = 0
    const interval = setInterval(async () => {
      // Don't poll if paused or during dock/theater/sidepanel animations
      if (!active || stateRef.current !== STATE_PLAYING || isTransitioningRef.current || isSidepanelTransitioningRef.current) return
      try {
        const res = await window.api?.ftGetAmbientFrame?.()
        if (!active || !res?.dataUrl) return
        if (res.dataUrl === lastAmbientUrlRef.current) return
        lastAmbientUrlRef.current = res.dataUrl

        const img = new Image()
        img.onload = () => {
          if (!active) return
          // Micro-smooth transition: gently blend over 8 rAF frames (~130ms) then remain 100% calm and static
          let frame = 0
          const totalFrames = 8
          const step = () => {
            if (!active || frame >= totalFrames) return
            const canvas = ambientCanvasRef.current
            if (canvas) {
              const ctx = canvas.getContext('2d')
              if (ctx) {
                ctx.imageSmoothingEnabled = true
                ctx.imageSmoothingQuality = 'high'
                ctx.globalAlpha = 0.25
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
                ctx.globalAlpha = 1.0
              }
            }
            frame++
            if (frame < totalFrames && active) {
              rAFId = requestAnimationFrame(step)
            }
          }
          step()
        }
        img.src = res.dataUrl
      } catch {
        // ignore
      }
    }, 750)

    return () => {
      active = false
      clearInterval(interval)
      cancelAnimationFrame(rAFId)
    }
  }, [ambientMode, isMinimized, playerState])

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
        <CommentAvatar comment={comment} />
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
  // (Speed preference is preserved across videos; quality is Auto with live readout.)
  // Captions always default to OFF for every video.
  // NOTE: the parent keeps ONE stable player instance across Next /
  // auto-advance (no videoId key) so fullscreen survives. That means every
  // piece of per-video UI state must reset here — a remount no longer does
  // it for us.
  useEffect(() => {
    // If hideShorts is enabled and the current video is a Short, skip it immediately.
    if (hideShorts && video.isShort) {
      if (hasNextRef.current) {
        cbRef.current.onAutoAdvance(video.videoId)
      } else {
        cbRef.current.onClose()
      }
      return
    }

    setCaptionsOn(false)
    captionsOnRef.current = false
    captionTracksRef.current = []
    const preferredSpeed = loadSpeedPref()
    setSpeed(preferredSpeed)
    speedRef.current = preferredSpeed
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
    setAvailableQualities([])
    lastAmbientUrlRef.current = null
    // Fresh video = fresh metadata. Without this a reused instance would show
    // the previous video's duration / thumbnail / error state for a beat.
    setDuration(video.duration)
    durationRef.current = video.duration
    setRefused(false)
    setThumbOk(true)
    setErrorText(null)
    setOptimisticSubscribed(false)
    setSubscribePopoverOpen(false)
    setShowNewCatInput(false)
    setNewCatName('')
    setSubscribingCatId(null)
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
        // Assert preferred quality if configured
        const targetPref = qualityPrefRef.current
        if (targetPref && targetPref !== 'auto') {
          send('setPlaybackQualityRange', [targetPref, targetPref])
          send('setPlaybackQuality', [targetPref])
          window.api?.ftSetFrameQuality?.(targetPref).catch(() => {})
        }
        send('getPlaybackQuality', [])
        send('getAvailableQualityLevels', [])
        send('getAvailablePlaybackRates', [])
        // Assert preferred playback rate if configured
        const currentSpeed = speedRef.current
        if (currentSpeed !== 1) {
          send('setPlaybackRate', [currentSpeed])
        }
        send('getPlaybackRate', [])
        window.api?.ftGetFrameQuality?.()?.then((res) => {
          if (res?.quality) setActualQuality(res.quality)
          if (Array.isArray(res?.available) && res.available.length > 0) {
            setAvailableQualities(res.available)
          }
        }).catch(() => {})
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
          endedRef.current = false
          setErrorText(null)
          // Re-assert preferred playback rate on active playback start
          if (speedRef.current !== 1) {
            send('setPlaybackRate', [speedRef.current])
          }
          // Re-assert target quality preference on active playback start
          const targetPref = qualityPrefRef.current
          if (targetPref && targetPref !== 'auto') {
            send('setPlaybackQualityRange', [targetPref, targetPref])
            send('setPlaybackQuality', [targetPref])
            window.api?.ftSetFrameQuality?.(targetPref).catch(() => {})
            window.setTimeout(() => {
              send('setPlaybackQualityRange', [targetPref, targetPref])
              send('setPlaybackQuality', [targetPref])
              window.api?.ftSetFrameQuality?.(targetPref).catch(() => {})
              send('getPlaybackQuality', [])
              send('getAvailableQualityLevels', [])
            }, 600)
          }
          send('getAvailableQualityLevels', [])
          window.api?.ftGetFrameQuality?.()?.then((res) => {
            if (res?.quality) setActualQuality((prev) => (prev === res.quality ? prev : res.quality))
            if (Array.isArray(res?.available) && res.available.length > 0) {
              setAvailableQualities(res.available)
            }
          }).catch(() => {})
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
          // Preserve the window mode: remember fullscreen so the next video
          // opens in the same mode (fullscreen stays fullscreen).
          ftFullscreenIntent = !!document.fullscreenElement
          if (autoplayNextRef.current && hasNextRef.current) {
            cbRef.current.onAutoAdvance(video.videoId)
          } else {
            // Explicitly pause/stop the YouTube iframe so YouTube's own internal autoplay does not play a Short
            send('pauseVideo', [])
            cbRef.current.onMarkSeen(video.videoId)
            setBottomVisible(true)
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
            // If YouTube reports 1.0 right after loading but user preferred a different speed,
            // re-assert our preferred speed instead of letting YouTube reset it to 1.0.
            if (reported === 1 && speedRef.current !== 1) {
              send('setPlaybackRate', [speedRef.current])
            } else {
              speedRef.current = reported
              setSpeed(reported)
              try {
                localStorage.setItem(SPEED_PREF_KEY, String(reported))
              } catch {}
            }
          }
        }
        // Extract available quality levels if reported in infoDelivery
        const levels = Array.isArray(data.info.availableQualityLevels)
          ? data.info.availableQualityLevels
          : Array.isArray(data.info.qualityLevels)
            ? data.info.qualityLevels
            : Array.isArray(data.info) && data.info.every((x: any) => typeof x === 'string')
              ? data.info
              : null
        if (levels && levels.length > 0) {
          setAvailableQualities((prev) => (prev.length === levels.length && prev.every((q, i) => q === levels[i]) ? prev : levels))
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
        send('getAvailableQualityLevels', [])
        window.api?.ftGetFrameQuality?.()?.then((res) => {
          if (Array.isArray(res?.available) && res.available.length > 0) {
            setAvailableQualities(res.available)
          }
        }).catch(() => {})
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
  // Unified FLIP (First, Last, Invert, Play) transition system for Theater, Mini, and Fullscreen modes.
  // Captures instantaneous visual geometry in viewport coordinates and morphs the video shell
  // with GPU-accelerated transforms, providing continuous, fast, and completely symmetrical transitions.
  const transitionToFullscreen = useCallback((targetFullscreen: boolean) => {
    if (isFullscreenRef.current === targetFullscreen) return

    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {})
    }
    setShowSettings(false)

    if (shellRef.current) {
      prevRectRef.current = shellRef.current.getBoundingClientRect()
      prevMinimizedRef.current = isMinimizedRef.current
      prevFullscreenRef.current = isFullscreenRef.current
      if (activeAnimRef.current) {
        try {
          activeAnimRef.current.cancel()
        } catch {}
        activeAnimRef.current = null
      }
      shellRef.current.style.position = ''
      shellRef.current.style.left = ''
      shellRef.current.style.top = ''
      shellRef.current.style.width = ''
      shellRef.current.style.height = ''
      shellRef.current.style.zIndex = ''
    }

    setIsTransitioning(true)
    setIsFullscreen(targetFullscreen)
  }, [])

  const transitionToMinimized = useCallback((targetMinimized: boolean) => {
    if (isMinimizedRef.current === targetMinimized) return

    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {})
    }
    setShowSettings(false)

    if (shellRef.current) {
      prevRectRef.current = shellRef.current.getBoundingClientRect()
      prevMinimizedRef.current = isMinimizedRef.current
      prevFullscreenRef.current = isFullscreenRef.current
      if (activeAnimRef.current) {
        try {
          activeAnimRef.current.cancel()
        } catch {}
        activeAnimRef.current = null
      }
      shellRef.current.style.position = ''
      shellRef.current.style.left = ''
      shellRef.current.style.top = ''
      shellRef.current.style.width = ''
      shellRef.current.style.height = ''
      shellRef.current.style.zIndex = ''
    }

    setIsTransitioning(true)
    setIsMinimized(targetMinimized)
  }, [])

  const toggleFullscreen = useCallback(() => {
    pokeBottom()
    if (isMinimizedRef.current) {
      transitionToMinimized(false)
      return
    }
    transitionToFullscreen(!isFullscreenRef.current)
  }, [pokeBottom, transitionToFullscreen, transitionToMinimized])

  const exitVideoFullscreen = useCallback(() => {
    if (isFullscreenRef.current) {
      transitionToFullscreen(false)
      return true
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {})
      return true
    }
    return false
  }, [transitionToFullscreen])

  useEffect(() => {
    const onFsChange = () => {
      if (document.fullscreenElement && !isFullscreenRef.current) {
        transitionToFullscreen(true)
      } else if (!document.fullscreenElement && isFullscreenRef.current) {
        transitionToFullscreen(false)
      }
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange)
    }
  }, [transitionToFullscreen])

  useEffect(() => () => {
    window.clearTimeout(singleTapTimerRef.current)
    window.clearTimeout(spaceHoldTimerRef.current)
    window.clearTimeout(pointerHoldTimerRef.current)
  }, [])

  useLayoutEffect(() => {
    const prevRect = prevRectRef.current
    prevRectRef.current = null

    const shell = shellRef.current
    if (!prevRect || !shell) {
      setIsTransitioning(false)
      return
    }

    const stageWrapper = stageWrapperRef.current
    const isReturningToTheater = !isMinimized && !isFullscreen && (prevMinimizedRef.current || prevFullscreenRef.current)

    let currentRect: DOMRect
    if (isReturningToTheater && stageWrapper) {
      currentRect = stageWrapper.getBoundingClientRect()
      shell.style.position = 'fixed'
      shell.style.left = `${currentRect.left}px`
      shell.style.top = `${currentRect.top}px`
      shell.style.width = `${currentRect.width}px`
      shell.style.height = `${currentRect.height}px`
      shell.style.zIndex = '90'
    } else {
      currentRect = shell.getBoundingClientRect()
    }

    const cleanupReturningStyles = () => {
      if (isReturningToTheater && shell) {
        shell.style.position = ''
        shell.style.left = ''
        shell.style.top = ''
        shell.style.width = ''
        shell.style.height = ''
        shell.style.zIndex = ''
      }
    }

    if (prevRect.width === 0 || prevRect.height === 0 || currentRect.width === 0 || currentRect.height === 0) {
      cleanupReturningStyles()
      prevMinimizedRef.current = false
      prevFullscreenRef.current = false
      setIsTransitioning(false)
      return
    }

    const deltaX = prevRect.left - currentRect.left
    const deltaY = prevRect.top - currentRect.top
    const scaleX = prevRect.width / currentRect.width
    const scaleY = prevRect.height / currentRect.height

    if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1 && Math.abs(scaleX - 1) < 0.01 && Math.abs(scaleY - 1) < 0.01) {
      cleanupReturningStyles()
      prevMinimizedRef.current = false
      prevFullscreenRef.current = false
      setIsTransitioning(false)
      return
    }

    const duration = 280
    const easing = 'cubic-bezier(0.16, 1, 0.3, 1)'

    const prevRadius = prevFullscreenRef.current ? '0px' : prevMinimizedRef.current ? '12px' : '16px'
    const nextRadius = isFullscreen ? '0px' : isMinimized ? '12px' : '16px'

    try {
      const anim = shell.animate(
        [
          {
            transformOrigin: 'top left',
            transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scaleX}, ${scaleY})`,
            borderRadius: prevRadius,
          },
          {
            transformOrigin: 'top left',
            transform: 'translate3d(0, 0, 0) scale(1, 1)',
            borderRadius: nextRadius,
          },
        ],
        {
          duration,
          easing,
          fill: 'none',
        },
      )

      activeAnimRef.current = anim

      const finishHandler = () => {
        if (activeAnimRef.current === anim) {
          activeAnimRef.current = null
          cleanupReturningStyles()
          prevMinimizedRef.current = false
          prevFullscreenRef.current = false
          setIsTransitioning(false)
        }
      }

      anim.onfinish = finishHandler
      anim.oncancel = finishHandler
    } catch {
      cleanupReturningStyles()
      prevMinimizedRef.current = false
      prevFullscreenRef.current = false
      setIsTransitioning(false)
    }

    return () => {
      if (activeAnimRef.current) {
        try {
          activeAnimRef.current.cancel()
        } catch {}
        activeAnimRef.current = null
      }
    }
  }, [isMinimized, isFullscreen])

  const toggleMinimize = useCallback(() => {
    transitionToMinimized(!isMinimizedRef.current)
    pokeBottom()
  }, [transitionToMinimized, pokeBottom])

  const autoMinimizedByTabRef = useRef(false)

  // Auto-minimize when navigating away from FocusTube, and auto-restore when returning
  useEffect(() => {
    const handleTabChange = (e: any) => {
      const activeTab = e.detail?.activeTab
      if (activeTab && activeTab !== 'focustube') {
        if (!isMinimizedRef.current) {
          autoMinimizedByTabRef.current = true
          transitionToMinimized(true)
        }
      } else if (activeTab === 'focustube') {
        if (autoMinimizedByTabRef.current || isMinimizedRef.current) {
          autoMinimizedByTabRef.current = false
          transitionToMinimized(false)
        }
      }
    }

    window.addEventListener('focustube-tab-changed', handleTabChange)
    return () => window.removeEventListener('focustube-tab-changed', handleTabChange)
  }, [transitionToMinimized])

  const handleExpandFromMini = useCallback(() => {
    window.dispatchEvent(new CustomEvent('focustube-request-tab', { detail: { tab: 'focustube' } }))
    autoMinimizedByTabRef.current = false
    transitionToMinimized(false)
    pokeBottom()
  }, [transitionToMinimized, pokeBottom])

  // Dismiss subtle subscribe popover on outside click or Escape
  useEffect(() => {
    if (!subscribePopoverOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (
        subscribePopoverRef.current &&
        !subscribePopoverRef.current.contains(e.target as Node) &&
        subscribeBtnRef.current &&
        !subscribeBtnRef.current.contains(e.target as Node)
      ) {
        setSubscribePopoverOpen(false)
        setShowNewCatInput(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSubscribePopoverOpen(false)
        setShowNewCatInput(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [subscribePopoverOpen])

  const handleSelectSubscribeCategory = useCallback(async (catId: number) => {
    setSubscribingCatId(catId)
    try {
      if (onSubscribeChannel) {
        await onSubscribeChannel(
          {
            channelId: video.channelId,
            title: video.channelTitle,
            handle: video.channelHandle,
            avatarUrl: video.channelAvatarUrl,
          },
          catId,
        )
      }
      setOptimisticSubscribed(true)
      setSubscribePopoverOpen(false)
      setShowNewCatInput(false)
    } catch {
      // ignore
    } finally {
      setSubscribingCatId(null)
    }
  }, [onSubscribeChannel, video.channelId, video.channelTitle, video.channelHandle, video.channelAvatarUrl])

  const handleCreateAndSubscribeCategory = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newCatName.trim()
    if (!trimmed) return
    setCreatingCat(true)
    try {
      const newCat = await window.api.ftCreateCategory(trimmed)
      if (newCat) {
        await handleSelectSubscribeCategory(newCat.id)
      }
    } catch {
      // ignore
    } finally {
      setCreatingCat(false)
      setShowNewCatInput(false)
      setNewCatName('')
    }
  }, [newCatName, handleSelectSubscribeCategory])

  // ── Commands ───────────────────────────────────────────────────────────────
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

  const togglePlay = useCallback(() => {
    pokeBottom()
    if (stateRef.current === STATE_ENDED) {
      handleSeek(0)
      withBridge(() => cmd('playVideo', []))
      return
    }
    withBridge(() => cmd(stateRef.current === STATE_PLAYING ? 'pauseVideo' : 'playVideo', []))
  }, [cmd, withBridge, pokeBottom, handleSeek])

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
    try {
      localStorage.setItem(SPEED_PREF_KEY, String(clamped))
    } catch {}
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
    pokeBottom()
    ftFullscreenIntent = !!document.fullscreenElement

    // If there is a next video in queue, mark current watched & immediately advance
    if (hasNext && cbRef.current.onAutoAdvance) {
      cbRef.current.onAutoAdvance(video.videoId)
    } else {
      if (onToggleSeen) {
        onToggleSeen(video)
      } else {
        cbRef.current.onMarkSeen(video.videoId)
      }
    }
  }, [hasNext, pokeBottom, saveProgress, onToggleSeen, video])

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

  // ── Mouse back button closes the player (same as VideoPlayer/DetailScreen) ─
  // Mice with a dedicated "back" side button fire mousedown with button === 3.
  // Without this the press does nothing (or navigates history) while the
  // fullscreen player takeover is open. preventDefault stops any history nav.
  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (event.button === 3) {
        event.preventDefault()
        handleClose()
      }
    }
    window.addEventListener('mousedown', onMouseDown)
    return () => window.removeEventListener('mousedown', onMouseDown)
  }, [handleClose])

  // ── Keyboard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const exitFullscreenOnly = () => exitVideoFullscreen()
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      // When the embed itself holds focus, its own shortcuts (space, arrows)
      // do the same job — handling them here as well would double-toggle.
      if (document.activeElement?.tagName === 'IFRAME') {
        if (event.key === 'Escape' && !exitFullscreenOnly()) {
          if (isMinimizedRef.current) transitionToMinimized(false)
          else handleClose()
        }
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
          if (isMinimized) { transitionToMinimized(false); break }
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
  }, [togglePlay, handleSeek, handleVolume, toggleMute, toggleCaptions, toggleFullscreen, handleClose, handleManualNext, exitVideoFullscreen, volume, showSettings, nudgeSpeed, enterHold2x, exitHold2x, isMinimized, transitionToMinimized])

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
  const isFullscreenLayer = fsActive || (isTransitioning && (isFullscreen || prevFullscreenRef.current))
  const chromeVisible = bottomVisible
  // Theater UI stays mounted during the 300ms transition to fade out smoothly with zero cuts
  const theaterUiVisible = !isMinimized || isTransitioning

  return createPortal(
    <div
      data-fullscreen-gesture-scope="player"
      style={{ left: fsActive ? '0' : 'var(--sidebar-width, 5rem)' }}
      className={`fixed right-0 top-0 bottom-0 ${
        fsActive ? 'left-0' : ''
      } ${
        isFullscreenLayer ? 'z-[100]' : 'z-[70]'
      } m-0 flex flex-col text-white select-none bg-transparent ${
        isMinimized && !isTransitioning
          ? 'pointer-events-none'
          : fsActive
            ? 'bg-black overflow-hidden'
            : 'overflow-hidden'
      }`}
    >
      {/* Smooth Dark Theater Backdrop that cross-fades during dock / restore / fullscreen */}
      <div
        aria-hidden
        className={`absolute inset-0 bg-[#090a0f] pointer-events-none transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isMinimized || fsActive ? 'opacity-0' : 'opacity-100'
        }`}
      />

      {/* ── TOP THEATER HEADER (smooth cross-fade during dock/restore/fullscreen) ── */}
      {theaterUiVisible && (
        <header className={`relative z-40 flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#0c0d12]/95 px-4 backdrop-blur-md sm:px-6 transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isMinimized || fsActive ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/80 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
            >
              <ArrowLeft size={14} /> Back to Feed
            </button>
          </div>

          {/* Search Queue */}
          <div className="hidden sm:block relative w-64 md:w-80">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              type="text"
              value={queueSearch}
              onChange={(e) => setQueueSearch(e.target.value)}
              placeholder="Search queue..."
              className="h-8 w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-8 text-xs font-medium text-white placeholder:text-white/30 transition-colors hover:border-white/20 focus:border-primary/60 focus:bg-white/[0.08] focus:outline-none"
            />
            {queueSearch && (
              <button
                type="button"
                onClick={() => setQueueSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-white/30 hover:text-white"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Right: Playing from (moved here) */}
          <div className="relative z-50">
            <button
              type="button"
              onClick={() => setCategoryDropdownOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/20"
            >
              <span className="text-white/50 font-normal">Playing from:</span>
              <span className="font-black text-white">{categoryName || 'All'}</span>
              {categories && categories.length > 0 && (
                <ChevronDown size={13} className={`transition-transform text-white/60 ${categoryDropdownOpen ? 'rotate-180' : ''}`} />
              )}
            </button>

            {categoryDropdownOpen && (
              <>
                <div
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setCategoryDropdownOpen(false)}
                />
                <div className="absolute right-0 top-full z-50 mt-1.5 w-52 max-h-80 overflow-y-auto rounded-xl border border-white/15 bg-[#14161f] p-1.5 shadow-2xl backdrop-blur-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryDropdownOpen(false)
                      if (onSelectCategory) onSelectCategory(null)
                    }}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-bold transition-colors ${
                      !categoryName || categoryName === 'All'
                        ? 'bg-primary/20 text-white font-black'
                        : 'text-white/80 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    All
                  </button>
                  {categories && categories.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setCategoryDropdownOpen(false)
                        if (onSelectCategory) onSelectCategory(cat.id)
                      }}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-bold transition-colors ${
                        categoryName === cat.name
                          ? 'bg-primary/20 text-white font-black'
                          : 'text-white/80 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${categoryDot(cat.color)}`} />
                      <span className="truncate">{cat.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </header>
      )}

      {/* Floating Expand Tab (docked on right edge when sidepanel is collapsed) */}
      {theaterUiVisible && !isMinimized && !fsActive && !isSidepanelExpanded && (
        <button
          type="button"
          onClick={() => handleToggleSidepanel(true)}
          className="fixed right-0 top-20 z-40 hidden lg:flex h-8 w-6 items-center justify-center rounded-l-full bg-[#1a2230] border border-r-0 border-white/10 text-white/70 shadow-2xl opacity-75 hover:opacity-100 hover:text-white hover:bg-[#253040] hover:w-7 transition-all duration-200"
          title="Expand Sidepanel (Queue, Chapters, Comments)"
        >
          <ChevronLeft size={16} strokeWidth={2.5} />
        </button>
      )}

      {/* Body: stable two columns on desktop, stacked on mobile. */}
      <div className={`relative z-10 flex min-h-0 flex-1 flex-col overflow-x-hidden ${isMinimized || fsActive ? 'overflow-hidden pointer-events-none' : 'overflow-y-auto lg:overflow-hidden'} lg:flex-row`}>

        {/* ── MAIN VIDEO AREA ─────────────────────────────────────────── */}
        <div className={`flex min-h-0 flex-1 flex-col bg-transparent p-4 sm:p-6 lg:p-7 overflow-x-hidden ${isMinimized || fsActive ? 'overflow-y-hidden pointer-events-none' : 'overflow-y-auto [scrollbar-gutter:stable]'}`}>
          <div className={`relative mx-auto w-full transition-[max-width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isSidepanelExpanded ? 'max-w-5xl' : 'max-w-5xl xl:max-w-6xl'} space-y-5`}>
            
            {/* Player Stage Wrapper: Ambient glow with widescreen spread & gentle bottom reach */}
            <div ref={stageWrapperRef} className={`relative w-full aspect-video ${isMinimized || fsActive ? '' : 'z-0'}`}>
              {ambientMode && (
                <div
                  aria-hidden
                  className={`pointer-events-none absolute ${AMBIENT_CONFIG.insetY} ${AMBIENT_CONFIG.insetX} z-0 overflow-visible transition-opacity duration-500 ease-out ${AMBIENT_CONFIG.bottomMask} ${
                    isMinimized || fsActive ? 'opacity-0' : ''
                  }`}
                  style={{ opacity: (isMinimized || fsActive) ? 0 : (isPlaying ? AMBIENT_CONFIG.playingOpacity : AMBIENT_CONFIG.pausedOpacity) }}
                >
                  {/* Fallback ambient color layer from thumbnail while live frames load */}
                  <div
                    className={`absolute inset-0 ${AMBIENT_CONFIG.scaleX} ${AMBIENT_CONFIG.scaleY} rounded-3xl bg-cover bg-center filter ${AMBIENT_CONFIG.blur} opacity-40 transform-gpu transition-opacity duration-700`}
                    style={{ backgroundImage: `url(${video.thumbnail || thumbnailUrl(video.videoId)})` }}
                  />
                  {/* Dynamic live frame ambient canvas — Calm, steady, micro-smoothed */}
                  <canvas
                    ref={ambientCanvasRef}
                    width={32}
                    height={18}
                    className={`absolute inset-0 h-full w-full ${AMBIENT_CONFIG.scaleX} ${AMBIENT_CONFIG.scaleY} transform-gpu rounded-3xl filter ${AMBIENT_CONFIG.blur}`}
                  />
                  {/* Glossy specular reflection sheen layer for premium finish */}
                  <div className={`absolute inset-0 ${AMBIENT_CONFIG.scaleX} ${AMBIENT_CONFIG.scaleY} rounded-3xl bg-gradient-to-b from-white/[0.08] via-transparent to-black/30 filter blur-[45px] pointer-events-none`} />
                </div>
              )}
              {!isMinimized && !fsActive && !ambientMode && (
                <div aria-hidden className="pointer-events-none absolute -inset-3 rounded-3xl bg-primary/10 blur-2xl opacity-60 animate-in fade-in duration-300" />
              )}

            {/* Stage: 16:9 on theater, full in fullscreen, corner dock when minimized */}
            <div
              ref={shellRef}
              className={
                isMinimized
                  ? `pointer-events-auto fixed bottom-4 right-4 z-[80] aspect-video w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-white/15 bg-black shadow-[0_20px_60px_rgba(0,0,0,0.7)] ${
                      isTransitioning ? 'will-change-transform' : ''
                    }`
                  : fsActive
                    ? `pointer-events-auto fixed inset-0 z-[100] w-full h-full m-0 overflow-hidden rounded-none border-0 bg-black shadow-none ${
                        isTransitioning ? 'will-change-transform' : ''
                      } ${isPlaying && !chromeVisible ? 'cursor-none' : ''}`
                    : isTransitioning && (prevMinimizedRef.current || prevFullscreenRef.current)
                      ? `pointer-events-auto fixed z-[90] overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl will-change-transform ${
                          isPlaying && !chromeVisible ? 'cursor-none' : ''
                        }`
                      : `absolute inset-0 h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl ${
                          isPlaying && !chromeVisible ? 'cursor-none' : ''
                        }`
              }
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

            {/* ── FLOATING CORNER CHROME (fullscreen only) ──
                In normal theater mode, the video stage is kept 100% clean
                without floating button clutter because all actions (Back,
                Mark Watched, Next, Open on YouTube) already live in the
                dedicated top header and metadata row below.
                These corner buttons only appear in native fullscreen mode. */}
            {fsActive && !isMinimized && (
              <div
                className={`pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-end p-3 transition-all duration-200 sm:p-4 ${
                  chromeVisible ? 'visible translate-y-0 opacity-100' : 'invisible -translate-y-2 opacity-0'
                }`}
                aria-hidden={!chromeVisible}
              >
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
                  onClick={() => transitionToFullscreen(false)}
                  title="Exit fullscreen (F or Esc)"
                  aria-label="Exit fullscreen"
                  tabIndex={chromeVisible ? 0 : -1}
                  className={`pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white/70 backdrop-blur-md transition-all hover:bg-black/85 hover:text-white active:scale-95 ${
                    chromeVisible ? '' : 'pointer-events-none'
                  }`}
                >
                  <Minimize size={17} />
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
          )}

            {/* ── MINI-PLAYER DOCK BAR (only when minimized) ──
                Same iframe keeps playing underneath; this bar moves with it.
                Follows the same chrome visibility as the full player: fades
                after ~2.5s idle while playing, returns on hover/tap. The slim
                seek strip at the very bottom stays visible so progress is
                glanceable and seeking works even when faded. */}
            {isMinimized && (
              <div className={`absolute inset-x-0 bottom-0 z-40 transition-opacity duration-200 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
                <div className={`bg-gradient-to-t from-black/90 via-black/50 to-transparent px-2.5 pb-1 pt-8 transition-all duration-200 ${chromeVisible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-1 opacity-0'}`}>
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <p
                      onClick={handleExpandFromMini}
                      className="min-w-0 flex-1 truncate text-[11px] font-bold text-white/90 cursor-pointer hover:text-white transition-colors"
                      title="Click to expand player"
                    >
                      {video.title}
                    </p>
                    <button
                      type="button"
                      onClick={handleExpandFromMini}
                      title="Expand player"
                      aria-label="Expand player"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 backdrop-blur-md transition-colors hover:bg-white/20 hover:text-white"
                    >
                      <Maximize2 size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={handleClose}
                      title="Close player"
                      aria-label="Close player"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 backdrop-blur-md transition-colors hover:bg-primary hover:text-white"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={togglePlay}
                      title={isPlaying ? 'Pause' : 'Play'}
                      aria-label={isPlaying ? 'Pause' : 'Play'}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105"
                    >
                      {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <input
                        type="range"
                        min={0}
                        max={duration ?? 0}
                        step={0.1}
                        value={displayTime}
                        onPointerDown={() => { scrubbingRef.current = true }}
                        onChange={(e) => setScrubTime(Number(e.target.value))}
                        onPointerUp={(e) => {
                          const t = Number((e.target as HTMLInputElement).value)
                          scrubbingRef.current = false
                          setScrubTime(null)
                          handleSeek(t)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="h-1 w-full cursor-pointer accent-primary"
                        aria-label="Seek video"
                      />
                      <div className="mt-0.5 flex items-center justify-between text-[10px] font-semibold tabular-nums text-white/60">
                        <span>{formatChapterTime(displayTime)}</span>
                        <span>{duration !== null && duration > 0 ? formatChapterTime(duration) : '--:--'}</span>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Always-visible slim seek strip: full-width hit area with an
                    invisible native slider, so seeking works even when faded. */}
                <div className="relative flex h-3.5 items-end px-2.5 pb-1.5">
                  <div className="h-1 w-full overflow-hidden rounded-full bg-white/25">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${progressRatio * 100}%` }} />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={duration ?? 0}
                    step={0.1}
                    value={displayTime}
                    onPointerDown={() => { scrubbingRef.current = true }}
                    onChange={(e) => setScrubTime(Number(e.target.value))}
                    onPointerUp={(e) => {
                      const t = Number((e.target as HTMLInputElement).value)
                      scrubbingRef.current = false
                      setScrubTime(null)
                      handleSeek(t)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    aria-label="Seek video"
                  />
                </div>
              </div>
            )}

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
                      <div className="flex items-center justify-between px-1 pb-2">
                          <div className="flex items-center gap-1.5">
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">
                              Quality Preference
                            </p>
                          </div>
                      </div>

                      <div className="space-y-1 max-h-56 overflow-y-auto pr-0.5">
                        {displayedQualityTargets.map((target, idx) => {
                          const isHighestSupported = idx === 1 && displayedQualityTargets.length > 1
                          const isCappedActive =
                            qualityPref !== 'auto' &&
                            !displayedQualityTargets.some((t) => t.id === qualityPref) &&
                            isHighestSupported
                          const isSelected = qualityPref === target.id || isCappedActive
                          return (
                            <button
                              key={target.id}
                              type="button"
                              onClick={() => handleSelectQualityPref(target.id)}
                              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition-all ${
                                isSelected
                                  ? 'bg-primary text-white font-bold shadow-sm'
                                  : 'bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white'
                              }`}
                            >
                              <div className="min-w-0 pr-2">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-xs font-bold leading-tight">{target.label}</p>
                                  {isCappedActive && (
                                    <span className="rounded bg-white/20 px-1 py-0.2 text-[8px] font-black uppercase tracking-wider text-white">
                                      Active
                                    </span>
                                  )}
                                </div>
                                <p className={`text-[9px] truncate ${isSelected ? 'text-white/80' : 'text-white/40'}`}>
                                  {isCappedActive
                                    ? `Video max: ${target.label} (preferred ${QUALITY_TARGETS.find((q) => q.id === qualityPref)?.label || qualityPref})`
                                    : target.desc}
                                </p>
                              </div>
                              {isSelected && <Check size={12} className="shrink-0 text-white" strokeWidth={3} />}
                            </button>
                          )
                        })}
                      </div>

                      <p className="px-1 pt-2 text-[10px] leading-relaxed text-white/30">
                        Focus Tube requests your target resolution; YouTube dynamically scales if bandwidth fluctuates.
                      </p>
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

            {/* ── BOTTOM OVERLAY (always mounted; fades only; hidden in mini mode) ── */}
            <div
              className={`pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pb-2 pt-10 transition-all duration-200 sm:px-4 ${
                isMinimized ? 'hidden' : ''
              } ${
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
                  aria-label={isPlaying ? 'Pause' : playerState === STATE_ENDED ? 'Replay' : 'Play'}
                  title={isPlaying ? 'Pause (Space)' : playerState === STATE_ENDED ? 'Replay (Space)' : 'Play (Space)'}
                  tabIndex={bottomVisible ? 0 : -1}
                  className="p-2 text-white transition-colors hover:text-white/70"
                >
                  {isPlaying ? (
                    <Pause size={20} fill="currentColor" />
                  ) : playerState === STATE_ENDED ? (
                    <RotateCcw size={19} />
                  ) : (
                    <Play size={20} fill="currentColor" />
                  )}
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
                  aria-label="Video quality settings"
                  aria-expanded={showSettings && settingsTab === 'quality'}
                  title={actualQuality ? `Quality: ${qualityLabel(actualQuality)} · Target: ${qualityLabel(qualityPref)}` : `Target Quality: ${qualityLabel(qualityPref)}`}
                  tabIndex={bottomVisible ? 0 : -1}
                  className={`flex items-center gap-1 p-2 transition-colors hover:text-white ${showSettings && settingsTab === 'quality' ? 'text-white' : 'text-white/70'}`}
                >
                  <MonitorPlay size={18} />
                  <span className="hidden text-[11px] font-black min-[420px]:inline">
                    {actualQuality ? qualityLabel(actualQuality) : (qualityPref !== 'auto' ? qualityLabel(qualityPref) : 'Auto')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleToggleAmbient}
                  aria-label={ambientMode ? 'Turn off ambient glow' : 'Turn on ambient glow'}
                  title={ambientMode ? 'Ambient Mode: ON (Click to turn off)' : 'Ambient Mode: OFF (Click to turn on)'}
                  tabIndex={bottomVisible ? 0 : -1}
                  className={`flex items-center gap-1 p-2 transition-all rounded-lg ${
                    ambientMode
                      ? 'text-sky-400 hover:text-sky-300 drop-shadow-[0_0_6px_rgba(56,189,248,0.5)]'
                      : 'text-white/70 hover:text-white'
                  }`}
                >
                  <Sparkles size={18} className={ambientMode ? 'animate-pulse' : ''} />
                  <span className="hidden text-[11px] font-black min-[480px]:inline">
                    Ambient
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
                <button
                  type="button"
                  onClick={toggleMinimize}
                  aria-label="Mini player — dock to corner"
                  title="Mini player — dock video to the corner and keep browsing"
                  tabIndex={bottomVisible ? 0 : -1}
                  className="p-2 text-white/80 transition-colors hover:text-white"
                >
                  <SquareArrowDownRight size={18} />
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

          {/* Video Meta Info (Title, Channel, Actions, Sections) below the Player */}
          {theaterUiVisible && (
              <div className={`relative ${subscribePopoverOpen ? 'z-50' : 'z-20'} space-y-4 pt-1 transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                isMinimized || fsActive ? 'opacity-0 pointer-events-none' : 'opacity-100'
              }`}>
                <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-white leading-snug tracking-tight">
                  {video.title}
                </h1>

                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-4">
                  <div className="flex items-center gap-3">
                    <ChannelAvatar title={video.channelTitle} avatarUrl={video.channelAvatarUrl} sizeClass="h-11 w-11" />
                    <div>
                      <p className="text-base font-bold text-white">
                        {video.channelTitle}
                      </p>
                      {isChannelSubscribed || optimisticSubscribed ? (
                        <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                          <Check size={12} strokeWidth={3} />
                          <span>Subscribed</span>
                          {video.channelHandle && (
                            <>
                              <span className="text-white/20">•</span>
                              <span className="text-white/40">@{video.channelHandle.replace(/^@/, '')}</span>
                            </>
                          )}
                        </p>
                      ) : (
                        <div className={`relative inline-flex items-center gap-2 mt-0.5 ${subscribePopoverOpen ? 'z-50' : ''}`}>
                          {onSubscribeChannel && (
                            <>
                              <button
                                ref={subscribeBtnRef}
                                type="button"
                                onClick={() => setSubscribePopoverOpen((prev) => !prev)}
                                aria-expanded={subscribePopoverOpen}
                                className="inline-flex items-center gap-1 rounded-full bg-red-600 hover:bg-red-500 px-3 py-1 text-xs font-bold text-white shadow-md transition-transform hover:scale-105 active:scale-95"
                              >
                                <Plus size={11} strokeWidth={2.5} /> Subscribe
                              </button>

                              {subscribePopoverOpen && (
                                <div
                                  ref={subscribePopoverRef}
                                  onClick={(e) => e.stopPropagation()}
                                  className="absolute bottom-full left-0 mb-2 z-[70] w-64 overflow-hidden rounded-2xl border border-white/15 bg-[#161822] p-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.85)] animate-in fade-in zoom-in-95 duration-150 pointer-events-auto"
                                >
                                  <div className="flex items-center justify-between px-1.5 pb-2 border-b border-white/[0.08] mb-1.5">
                                    <span className="text-[11px] font-black uppercase tracking-wider text-white/50">
                                      Add to Category
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setSubscribePopoverOpen(false)}
                                      className="rounded-full p-1 text-white/40 hover:bg-white/10 hover:text-white transition-colors"
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>

                                  <div className="max-h-52 overflow-y-auto space-y-1 pr-0.5 scrollbar-hide">
                                    {categories && categories.length > 0 ? (
                                      categories.map((cat) => {
                                        const isBusy = subscribingCatId === cat.id
                                        return (
                                          <button
                                            key={cat.id}
                                            type="button"
                                            disabled={subscribingCatId !== null || creatingCat}
                                            onClick={() => void handleSelectSubscribeCategory(cat.id)}
                                            className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all text-left group ${
                                              isBusy
                                                ? 'bg-red-600/25 text-white'
                                                : 'text-white/85 hover:bg-white/[0.08] hover:text-white'
                                            }`}
                                          >
                                            <span
                                              className={`h-2.5 w-2.5 rounded-full shrink-0 ${categoryDot(cat.color)}`}
                                            />
                                            <span className="truncate flex-1 font-medium">{cat.name}</span>
                                            {isBusy ? (
                                              <Loader2 size={12} className="animate-spin text-red-400 shrink-0" />
                                            ) : (
                                              <Plus size={12} className="opacity-0 group-hover:opacity-100 text-white/60 shrink-0 transition-opacity" />
                                            )}
                                          </button>
                                        )
                                      })
                                    ) : (
                                      <div className="p-3 text-center text-xs text-white/40">
                                        No categories yet
                                      </div>
                                    )}
                                  </div>

                                  {showNewCatInput ? (
                                    <form onSubmit={handleCreateAndSubscribeCategory} className="mt-2 pt-2 border-t border-white/[0.08] flex items-center gap-1.5">
                                      <input
                                        type="text"
                                        autoFocus
                                        value={newCatName}
                                        onChange={(e) => setNewCatName(e.target.value)}
                                        placeholder="New category..."
                                        className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs text-white placeholder-white/30 focus:border-red-500 focus:outline-none"
                                      />
                                      <button
                                        type="submit"
                                        disabled={!newCatName.trim() || creatingCat}
                                        className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-500 disabled:opacity-40"
                                      >
                                        {creatingCat ? <Loader2 size={11} className="animate-spin" /> : 'Add'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => { setShowNewCatInput(false); setNewCatName('') }}
                                        className="rounded-lg p-1 text-white/40 hover:text-white"
                                      >
                                        <X size={12} />
                                      </button>
                                    </form>
                                  ) : (
                                    <div className="mt-1.5 pt-1.5 border-t border-white/[0.08]">
                                      <button
                                        type="button"
                                        onClick={() => setShowNewCatInput(true)}
                                        className="w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-bold text-white/40 hover:text-white/80 hover:bg-white/5 transition-colors"
                                      >
                                        <FolderPlus size={12} />
                                        <span>+ Create category</span>
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )}
                            </>
                          )}
                          {video.channelHandle && (
                            <span className="text-xs font-medium text-white/40">@{video.channelHandle.replace(/^@/, '')}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleMarkWatched}
                      title={hasNext ? (nextTitle ? `Mark watched & play next: ${nextTitle}` : 'Mark watched & play next') : (video.seen ? 'Watched' : 'Mark watched')}
                      className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold transition-all ${
                        video.seen
                          ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                          : 'border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10'
                      }`}
                    >
                      <Check size={15} strokeWidth={video.seen ? 3 : 2} />
                      {video.seen ? 'Watched' : 'Mark Watched'}
                    </button>
                    {hasNext && (
                      <button
                        type="button"
                        onClick={handleManualNext}
                        title={nextTitle ? `Next: ${nextTitle}` : 'Next video'}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-bold text-white/80 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
                      >
                        <SkipForward size={14} /> Next
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={openOnYouTube}
                      title="Open on YouTube"
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 p-2 text-white/70 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
                    >
                      <ExternalLink size={15} />
                    </button>
                  </div>
                </div>

                {/* Video Views & Upload Date stats row */}
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-white/80">
                  <span className="font-bold text-white">
                    {video.views ? formatViews(video.views) : 'Subscribed upload'}
                  </span>
                  <span className="text-white/30">•</span>
                  <span>{publishedAgo ? `${publishedAgo} ago` : 'Uploaded'} ({formatPublishedExact(video.publishedAt)})</span>
                </div>

                {/* Collapsible Sections (Chapters, Segments, About) */}
                <div className="space-y-3 pt-1">
                  {chapters.length > 0 && (
                    <section aria-label="Chapters" className="rounded-xl border border-white/10 bg-[#12131a]/90 backdrop-blur-md p-3.5 shadow-lg">
                      <div className="flex w-full items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setChaptersOpen((v) => !v)}
                          aria-expanded={chaptersOpen}
                          className="flex items-center gap-2 text-left text-xs font-black uppercase tracking-wider text-white/90 transition-colors hover:text-white"
                        >
                          <ListVideo size={14} /> Chapters ({chapters.length})
                          {activeChapterIndex >= 0 && chapters[activeChapterIndex] && (
                            <span className="text-primary font-bold normal-case text-xs">
                              · {chapters[activeChapterIndex].title}
                            </span>
                          )}
                          <ChevronDown size={14} className={`transition-transform ${chaptersOpen ? '' : '-rotate-90'}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSidebarTab('chapters')
                            handleToggleSidepanel(true)
                          }}
                          className="text-[10px] font-bold text-primary hover:text-primary/80 transition-colors hover:underline"
                        >
                          Sidepanel →
                        </button>
                      </div>
                      {chaptersOpen && (
                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-60 overflow-y-auto pr-1">
                          {chapters.map((chapter, index) => (
                            <button
                              key={`${chapter.start}-${index}`}
                              type="button"
                              onClick={() => handleSeek(chapter.start)}
                              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                                index === activeChapterIndex
                                  ? 'bg-primary/20 text-white font-bold border border-primary/40'
                                  : 'text-white/70 hover:bg-white/5 hover:text-white'
                              }`}
                            >
                              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white/80">
                                {formatChapterTime(chapter.start)}
                              </span>
                              <span className="min-w-0 flex-1 truncate">{chapter.title}</span>
                              {index === activeChapterIndex && <Play size={10} fill="currentColor" className="text-primary shrink-0" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </section>
                  )}

                  {sponsorSegments.length > 0 && (
                    <section aria-label="In-video segments" className="rounded-xl border border-amber-300/30 bg-[#161412]/90 backdrop-blur-md p-3.5 shadow-lg">
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setSegmentsOpen((v) => !v)}
                          className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-300"
                        >
                          <Zap size={14} /> SponsorBlock Segments ({sponsorSegments.length})
                          <ChevronDown size={14} className={`transition-transform ${segmentsOpen ? '' : '-rotate-90'}`} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSkipSponsors((v) => !v)}
                          className={`rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-widest transition-colors ${
                            skipSponsors ? 'bg-amber-300 text-black' : 'bg-white/10 text-white/70 hover:text-white'
                          }`}
                        >
                          {skipSponsors ? 'Auto-skip on' : 'Auto-skip off'}
                        </button>
                      </div>
                      {segmentsOpen && (
                        <div className="mt-2 space-y-1">
                          {sponsorSegments.map((seg, index) => (
                            <button
                              key={`${seg.start}-${seg.end}-${index}`}
                              type="button"
                              onClick={() => handleSeek(seg.start)}
                              className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-xs font-medium text-white/70 hover:bg-white/5 hover:text-white"
                            >
                              <span className="truncate">{sponsorLabel(seg.category)}</span>
                              <span className="shrink-0 tabular-nums text-white/50">
                                {formatChapterTime(seg.start)} → {formatChapterTime(seg.end)}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </section>
                  )}

                  <section aria-label="Description" className="rounded-xl border border-white/10 bg-[#12131a]/90 backdrop-blur-md p-3.5 shadow-lg">
                    <button
                      type="button"
                      onClick={() => setDescriptionOpen((v) => !v)}
                      className="flex w-full items-center justify-between text-left text-xs font-black uppercase tracking-wider text-white/90 hover:text-white"
                    >
                      <span className="flex items-center gap-2">
                        <FileText size={14} /> About / Description
                      </span>
                      <ChevronDown size={14} className={`transition-transform ${descriptionOpen ? '' : '-rotate-90'}`} />
                    </button>
                    {descriptionOpen && (
                      <div className="mt-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-white/85 max-h-72 overflow-y-auto">
                        {currentDescription ? (
                          descParts.map((part, i) => {
                            if (part.kind === 'newline') return <br key={i} />
                            if (part.kind === 'timestamp') {
                              return (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => handleSeek(part.seconds ?? 0)}
                                  className="font-bold text-sky-400 hover:underline"
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
                                  className="break-all text-sky-400 hover:underline"
                                >
                                  {part.text}
                                </a>
                              )
                            }
                            return <span key={i}>{part.text}</span>
                          })
                        ) : (
                          <p className="text-white/40">No description available.</p>
                        )}
                      </div>
                    )}
                  </section>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── SIDEBAR (Up Next in Category Queue & Comments) ── */}
        {theaterUiVisible && (
          <aside
            className={`group/sidepanel relative flex shrink-0 flex-col border-white/[0.08] ${isSidepanelTransitioning ? 'bg-[#0c0d12]' : 'bg-[#0c0d12]/95'} lg:h-full lg:min-h-0 transition-[width,opacity] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] will-change-[width,opacity] ${
              isSidepanelExpanded
                ? 'w-full border-t lg:w-[380px] lg:border-l lg:border-t-0 xl:w-[420px] opacity-100'
                : 'w-0 lg:w-0 xl:w-0 opacity-0 overflow-hidden pointer-events-none border-l-0 lg:flex'
            } ${isMinimized || fsActive ? 'opacity-0 pointer-events-none' : ''}`}
          >
            {/* Floating Collapse Button on Left Border (Consistent with MyCinema sidebar) */}
            <button
              type="button"
              onClick={() => handleToggleSidepanel(false)}
              className="absolute -left-3.5 top-9 z-50 hidden lg:flex h-7 w-7 items-center justify-center rounded-full bg-[#1a2230] border border-white/10 text-white/70 shadow-xl opacity-0 translate-x-2 pointer-events-none group-hover/sidepanel:opacity-100 group-hover/sidepanel:translate-x-0 group-hover/sidepanel:pointer-events-auto hover:text-white hover:bg-[#253040] hover:scale-110 transition-all duration-300"
              title="Collapse Sidepanel"
            >
              <ChevronRight size={16} strokeWidth={2.5} />
            </button>

            {/* Stable inner container to prevent text reflow during width collapse transition */}
            <div className="w-full lg:w-[380px] xl:w-[420px] h-full flex flex-col min-h-0 shrink-0">
              {/* Sidebar Header */}
              <div className="flex shrink-0 items-center justify-between border-b border-white/[0.08] p-3 sm:p-3.5 gap-2">
                <div className="min-w-0 pr-1">
                  <h3 className="truncate text-sm font-black text-white">
                    {sidebarTab === 'queue'
                      ? `Up Next in ${categoryName || 'All'}`
                      : sidebarTab === 'chapters'
                        ? 'Video Chapters'
                        : 'Discussion'}
                  </h3>
                  <p className="text-[11px] font-semibold text-white/40 truncate">
                    {sidebarTab === 'queue'
                      ? `${remainingCount} unseen ${remainingCount === 1 ? 'video' : 'videos'} remaining`
                      : sidebarTab === 'chapters'
                        ? (chapters.length > 0
                            ? (activeChapterIndex >= 0 && chapters[activeChapterIndex]
                                ? `Current: ${chapters[activeChapterIndex].title}`
                                : 'Timestamped sections')
                            : 'No chapters available')
                        : 'Viewer comments'}
                  </p>
                </div>

                {/* Quick Tab Switcher & Collapse Button */}
                <div className="flex shrink-0 items-center gap-1.5">
                  <div className="flex shrink-0 items-center gap-0.5 bg-white/[0.04] p-0.5 rounded-xl border border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => setSidebarTab('queue')}
                      className={`rounded-lg px-2 py-1 text-[11px] font-bold transition-colors ${
                        sidebarTab === 'queue'
                          ? 'bg-primary text-white shadow'
                          : 'text-white/50 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      Queue
                    </button>
                    <button
                      type="button"
                      onClick={() => setSidebarTab('chapters')}
                      className={`rounded-lg px-2 py-1 text-[11px] font-bold transition-colors ${
                        sidebarTab === 'chapters'
                          ? 'bg-primary text-white shadow'
                          : 'text-white/50 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      Chapters
                    </button>
                    <button
                      type="button"
                      onClick={() => setSidebarTab('comments')}
                      className={`rounded-lg px-2 py-1 text-[11px] font-bold transition-colors ${
                        sidebarTab === 'comments'
                          ? 'bg-primary text-white shadow'
                          : 'text-white/50 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      Comments
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleToggleSidepanel(false)}
                    title="Collapse Sidepanel"
                    className="hidden lg:flex h-7 w-7 items-center justify-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    <ChevronRight size={14} strokeWidth={2.5} />
                  </button>
                </div>
              </div>

            {/* Sidebar Body */}
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-2">
              {sidebarTab === 'queue' && (
                <>
                  <div className="flex items-center justify-between pb-2 mb-1 border-b border-white/[0.06]">
                    <span className="text-[11px] font-bold text-white/50">
                      {isSearchQueue ? `Search Queue (${queueItems.length})` : 'Upload Order'}
                    </span>
                    <div className="flex items-center gap-0.5 bg-white/[0.04] p-0.5 rounded-lg border border-white/[0.08]">
                      <button
                        type="button"
                        onClick={() => onToggleSortOrder ? onToggleSortOrder('newest') : null}
                        title="Queue order: Newest uploads first"
                        className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold transition-all ${
                          sortOrder === 'newest'
                            ? 'bg-primary text-white shadow'
                            : 'text-white/40 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <ArrowDownWideNarrow size={11} />
                        <span>Newest</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleSortOrder ? onToggleSortOrder('oldest') : null}
                        title="Queue order: Oldest uploads first (chronological order)"
                        className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold transition-all ${
                          sortOrder === 'oldest'
                            ? 'bg-primary text-white shadow'
                            : 'text-white/40 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <ArrowUpNarrowWide size={11} />
                        <span>Oldest</span>
                      </button>
                    </div>
                  </div>
                  {queueItems.length > 0 ? (
                    queueItems.map((item) => (
                      <QueueCard
                        key={item.videoId}
                        video={item}
                        isCurrent={item.videoId === video.videoId}
                        onSelect={handleSelectQueueVideo}
                        onToggleSeen={handleToggleQueueSeen}
                      />
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <p className="text-xs font-bold text-white/40">
                        {queueSearch ? `No videos matching “${queueSearch}”` : 'No upcoming videos in this queue'}
                      </p>
                    </div>
                  )}
                </>
              )}

              {sidebarTab === 'chapters' && (
                chapters.length > 0 ? (
                  <div className="space-y-1.5">
                    {chapters.map((chapter, index) => {
                      const isActive = index === activeChapterIndex
                      const nextChapter = chapters[index + 1]
                      const chapterDuration = nextChapter
                        ? nextChapter.start - chapter.start
                        : (duration ? duration - chapter.start : null)

                      return (
                        <button
                          key={`${chapter.start}-${index}`}
                          type="button"
                          onClick={() => handleSeek(chapter.start)}
                          className={`group/chap flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-all ${
                            isActive
                              ? 'border-primary/50 bg-primary/15 text-white shadow-lg shadow-primary/10'
                              : 'border-white/[0.06] bg-white/[0.02] text-white/70 hover:border-white/20 hover:bg-white/[0.06] hover:text-white'
                          }`}
                        >
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                            isActive ? 'bg-primary text-white' : 'bg-white/10 text-white/60 group-hover/chap:bg-white/20 group-hover/chap:text-white'
                          }`}>
                            {isActive ? (
                              <Play size={12} fill="currentColor" className="animate-pulse" />
                            ) : (
                              <span className="text-[10px] font-bold tabular-nums">#{index + 1}</span>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className={`truncate text-xs ${isActive ? 'font-black text-white' : 'font-bold'}`}>
                              {chapter.title}
                            </p>
                            <div className="mt-0.5 flex items-center gap-2 text-[10px] font-semibold text-white/40">
                              <span className="font-mono text-white/70">{formatChapterTime(chapter.start)}</span>
                              {chapterDuration && chapterDuration > 0 && (
                                <>
                                  <span>•</span>
                                  <span>{formatDuration(chapterDuration)}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/30 mb-3">
                      <ListVideo size={20} />
                    </div>
                    <p className="text-xs font-bold text-white/60">No chapters found</p>
                    <p className="mt-1 text-[11px] text-white/30 max-w-xs">
                      This video does not have timestamped chapters in its description.
                    </p>
                  </div>
                )
              )}

              {sidebarTab === 'comments' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-white/[0.06]">
                    <span className="text-xs font-bold text-white/70">
                      Comments
                    </span>
                    <div className="flex items-center gap-1">
                      {(['top', 'new'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setCommentsSort(mode)}
                          className={`rounded px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                            commentsSort === mode ? 'bg-white/15 text-white' : 'text-white/35 hover:text-white'
                          }`}
                        >
                          {mode === 'top' ? 'Top' : 'New'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {commentsLoading ? (
                    <span className="flex items-center gap-2 px-1 py-4 text-xs font-semibold text-white/40">
                      <Loader2 size={14} className="animate-spin" /> Loading comments…
                    </span>
                  ) : commentsDisabled ? (
                    <p className="px-1 py-4 text-xs text-white/30">Comments are turned off for this video.</p>
                  ) : commentsError && comments.length === 0 ? (
                    <div className="px-1 py-4">
                      <p className="text-xs text-white/40">{commentsError}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setCommentsError(null)
                          setCommentsLoading(true)
                          window.api.ftGetComments(video.videoId, { sortBy: commentsSort })
                            .then((result) => {
                              if ('error' in result) setCommentsError(result.error || 'Could not load comments')
                              else if (result.disabled) setCommentsDisabled(true)
                              else {
                                setComments(result.comments)
                                setCommentsContinuation(result.continuation)
                                setCommentsCount(result.commentCount)
                              }
                            })
                            .catch((err) => setCommentsError(err?.message || 'Could not load comments'))
                            .finally(() => setCommentsLoading(false))
                        }}
                        className="mt-2 rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-white/15"
                      >
                        Retry
                      </button>
                    </div>
                  ) : comments.length === 0 ? (
                    <p className="px-1 py-4 text-xs text-white/30">No comments yet.</p>
                  ) : (
                    <>
                      <div className="space-y-3">
                        {comments.map((comment, i) => renderComment(comment, `c${i}-${comment.commentId ?? ''}`))}
                      </div>
                      {commentsContinuation && (
                        <button
                          type="button"
                          onClick={loadMoreComments}
                          disabled={commentsLoadingMore}
                          className="mt-2 w-full rounded-lg bg-white/5 px-3 py-2 text-xs font-bold text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-40"
                        >
                          {commentsLoadingMore ? 'Loading…' : 'Load more comments'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            </div>
          </aside>
        )}
      </div>
    </div>,
    document.body,
  )
}

export default FocusTubePlayer
