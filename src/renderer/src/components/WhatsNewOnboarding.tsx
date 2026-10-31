import React, { useEffect, useRef, useState } from 'react'
import {
  X,
  ArrowRight,
  ChevronRight,
  Download,
  Layers,
  BellRing,
  AudioLines,
  ShieldCheck,
  Sparkles,
  Wrench,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Check,
} from 'lucide-react'
import demoVideo from '../assets/demo/theme_update_demo.mp4'
import demoPoster from '../assets/demo/theme_update_demo_poster.jpg'

// ─── Release-notes data model ───────────────────────────────────────────────
// The modal renders entirely from LATEST_RELEASE below. For a new app
// version, only update this data object (version, title, highlight,
// description, updates with icon keys) — the UI stays the same.
// See RELEASE_GUIDE.md Step 5 for the writing rules.

export type UpdateIconKey =
  | 'download'
  | 'layers'
  | 'bell'
  | 'audio'
  | 'shield'
  | 'sparkles'
  | 'fix'
  | 'play'

export interface ReleaseUpdate {
  /** 6 words or fewer, e.g. "Download queue control". */
  title: string
  /** One short clause, max ~12 words. */
  description: string
  /** Key into UPDATE_ICONS. Pick the closest match; never add one-off icons. */
  icon: UpdateIconKey
}

export interface ReleaseVideo {
  /** Video source path or URL */
  src: string
  /** Optional poster thumbnail image */
  poster?: string
  /** Small caption badge, e.g. "Feature Demo" */
  caption?: string
  /** Autoplay video muted on modal load */
  autoPlay?: boolean
  /** Loop playback */
  loop?: boolean
}

export interface ReleaseNotes {
  version: string
  /** Short and prominent, e.g. "A smoother watching experience." */
  title: string
  /** Exact word/phrase from `title` rendered in the accent gradient. */
  highlight?: string
  /** One or two plain sentences under the heading. */
  description: string
  /** Optional feature demo video */
  video?: ReleaseVideo | null
  /** Max 5 updates. One idea each, most user-visible first. */
  updates: ReleaseUpdate[]
  /** Tour id from ProductTour.tsx TOURS. Adds a "Take the tour" action. */
  tourId?: string | null
}

const UPDATE_ICONS: Record<UpdateIconKey, { icon: React.ReactNode; tile: string }> = {
  download: {
    icon: <Download size={20} strokeWidth={2.2} />,
    tile: 'bg-red-500/12 text-red-400',
  },
  layers: {
    icon: <Layers size={20} strokeWidth={2.2} />,
    tile: 'bg-violet-500/12 text-violet-400',
  },
  bell: {
    icon: <BellRing size={20} strokeWidth={2.2} />,
    tile: 'bg-amber-500/12 text-amber-400',
  },
  audio: {
    icon: <AudioLines size={20} strokeWidth={2.2} />,
    tile: 'bg-sky-500/12 text-sky-400',
  },
  shield: {
    icon: <ShieldCheck size={20} strokeWidth={2.2} />,
    tile: 'bg-emerald-500/12 text-emerald-400',
  },
  sparkles: {
    icon: <Sparkles size={20} strokeWidth={2.2} />,
    tile: 'bg-pink-500/12 text-pink-400',
  },
  fix: {
    icon: <Wrench size={20} strokeWidth={2.2} />,
    tile: 'bg-cyan-500/12 text-cyan-400',
  },
  play: {
    icon: <Play size={20} strokeWidth={2.2} />,
    tile: 'bg-orange-500/12 text-orange-400',
  },
}

export const LATEST_RELEASE: ReleaseNotes = {
  version: '1.48.0',
  title: 'Atmospheric Lighting & Signature Accent Studio.',
  highlight: 'Atmospheric Lighting',
  description:
    'Transform your theater with adaptive halo glow, signature color accents, decoupled button styling, and rock-solid playback & download reliability.',
  tourId: null,
  video: {
    src: demoVideo,
    poster: demoPoster,
    caption: 'Atmospheric Studio Demo',
    autoPlay: true,
    loop: true,
  },
  updates: [
    {
      icon: 'sparkles',
      title: 'Atmospheric lighting studio',
      description: 'Tune ambient glow, diffusion, and saturation with live preview in Settings.',
    },
    {
      icon: 'layers',
      title: 'Signature accent palette',
      description: 'Personalize with Voltage Amber, Crimson, Cyber Teal, and Midnight Violet.',
    },
    {
      icon: 'play',
      title: 'Theater ambilight modes',
      description: 'Switch between Blackout, Soft Halo, and Pause Aura during movie playback.',
    },
    {
      icon: 'shield',
      title: 'Decoupled button accents',
      description: 'Style buttons adaptively or customize them independently under Appearance.',
    },
    {
      icon: 'fix',
      title: 'Auto-repaired video paths',
      description: 'Automatically heals incomplete file extensions and locks download integrity.',
    },
  ],
}

interface WhatsNewOnboardingProps {
  /** Persist this version as seen and close. */
  onClose: () => void
  /** Close for this session only — the dialog returns next launch. */
  onSkipSession: () => void
  /** Called instead of onClose when the release has a tour and the user picks it. */
  onStartTour?: () => void
  /** Navigate directly to the Updates tab. */
  onViewAllUpdates?: () => void
}

const WhatsNewOnboarding: React.FC<WhatsNewOnboardingProps> = ({ onClose, onSkipSession, onStartTour, onViewAllUpdates }) => {
  const continueRef = useRef<HTMLButtonElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  // Checked = remember this version as seen (the default). Unchecked = show
  // this dialog again on next launch.
  const [dontShowAgain, setDontShowAgain] = useState(true)
  const [isPlaying, setIsPlaying] = useState(true)
  const [isMuted, setIsMuted] = useState(true)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isHoveringVideo, setIsHoveringVideo] = useState(false)

  const hasTour = Boolean(LATEST_RELEASE.tourId && onStartTour)
  const hasVideo = Boolean(LATEST_RELEASE.video?.src)

  useEffect(() => {
    continueRef.current?.focus()
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  const handleContinue = () => {
    if (dontShowAgain) onClose()
    else onSkipSession()
  }

  const togglePlay = () => {
    if (!videoRef.current) return
    if (videoRef.current.paused) {
      videoRef.current.play()
      setIsPlaying(true)
    } else {
      videoRef.current.pause()
      setIsPlaying(false)
    }
  }

  const toggleMute = () => {
    if (!videoRef.current) return
    videoRef.current.muted = !videoRef.current.muted
    setIsMuted(videoRef.current.muted)
  }

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime)
    }
  }

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration)
    }
  }

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    videoRef.current.currentTime = pos * duration
    setCurrentTime(pos * duration)
  }

  const handleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen()
      }
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`
  }

  const renderTitle = () => {
    const { title, highlight } = LATEST_RELEASE
    if (!highlight || !title.includes(highlight)) return title
    const [before, after] = title.split(highlight)
    return (
      <>
        {before}
        <span className="bg-gradient-to-r from-red-500 via-rose-400 to-pink-400 bg-clip-text text-transparent">
          {highlight}
        </span>
        {after}
      </>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4 font-sans backdrop-blur-md"
      onClick={handleContinue}
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-title"
    >
      <div
        className={`relative w-full ${hasVideo ? 'max-w-[540px]' : 'max-w-[420px]'} overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0c0e13] shadow-[0_40px_120px_rgba(0,0,0,0.7)] animate-in fade-in zoom-in-95 duration-300`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Ambient glow */}
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/[0.16] blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-28 -left-20 h-56 w-56 rounded-full bg-pink-600/[0.07] blur-3xl"
          aria-hidden="true"
        />

        <div className="relative max-h-[84vh] overflow-y-auto px-6 pb-5 pt-5 custom-scrollbar">
          {/* Header */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-primary/[0.14] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
                What&apos;s new
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-white/55">
                v{LATEST_RELEASE.version}
              </span>
            </div>
            <button
              onClick={handleContinue}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/50 transition-all hover:bg-white/10 hover:text-white"
              aria-label="Close what's new"
            >
              <X size={15} />
            </button>
          </div>

          {/* Heading */}
          <h2
            id="whats-new-title"
            className="mt-4 text-[26px] font-extrabold leading-[1.15] tracking-tight text-white"
          >
            {renderTitle()}
          </h2>
          <p className="mt-2 text-[12.5px] leading-relaxed text-white/55">
            {LATEST_RELEASE.description}
          </p>

          {/* Demo Video in the middle */}
          {LATEST_RELEASE.video && (
            <div
              className="group/player relative mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/80 shadow-[0_12px_36px_rgba(0,0,0,0.6)]"
              onMouseEnter={() => setIsHoveringVideo(true)}
              onMouseLeave={() => setIsHoveringVideo(false)}
            >
              {/* Feature demo pill */}
              <div className="pointer-events-none absolute left-3 top-3 z-20 flex items-center gap-1.5 rounded-full border border-white/15 bg-black/60 px-2.5 py-1 text-[10.5px] font-semibold text-white/90 backdrop-blur-md">
                <Sparkles size={11} className="text-amber-400" />
                <span>{LATEST_RELEASE.video.caption || 'Feature Demo'}</span>
              </div>

              {/* HTML5 Video Element */}
              <video
                ref={videoRef}
                src={LATEST_RELEASE.video.src}
                poster={LATEST_RELEASE.video.poster}
                playsInline
                muted={isMuted}
                loop={LATEST_RELEASE.video.loop ?? true}
                autoPlay={LATEST_RELEASE.video.autoPlay ?? true}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onClick={togglePlay}
                className="aspect-video w-full cursor-pointer object-cover"
              />

              {/* Big Center Play Button when paused */}
              {!isPlaying && (
                <button
                  type="button"
                  onClick={togglePlay}
                  className="absolute inset-0 z-20 m-auto flex h-13 w-13 items-center justify-center rounded-full bg-primary/90 text-white shadow-[0_8px_32px_rgba(229,9,20,0.6)] backdrop-blur-sm transition-transform duration-200 hover:scale-110 active:scale-95"
                  aria-label="Play demo video"
                >
                  <Play size={20} className="ml-1 fill-white" />
                </button>
              )}

              {/* Controls bar at bottom */}
              <div
                className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pb-2.5 pt-7 transition-opacity duration-200 ${
                  isHoveringVideo || !isPlaying ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {/* Scrub line */}
                <div
                  className="group/track relative mb-2 flex h-3 w-full cursor-pointer items-center"
                  onClick={handleSeek}
                >
                  <div className="h-1 w-full rounded-full bg-white/20 transition-all group-hover/track:h-1.5">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* Left and Right controls */}
                <div className="flex items-center justify-between text-white/80">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={togglePlay}
                      className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/10 hover:text-white transition-colors"
                      aria-label={isPlaying ? 'Pause' : 'Play'}
                    >
                      {isPlaying ? <Pause size={13} /> : <Play size={13} className="ml-0.5 fill-white" />}
                    </button>

                    <button
                      type="button"
                      onClick={toggleMute}
                      className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/10 hover:text-white transition-colors"
                      aria-label={isMuted ? 'Unmute' : 'Mute'}
                    >
                      {isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                    </button>

                    <span className="text-[10.5px] font-mono text-white/60">
                      {formatTime(currentTime)} / {formatTime(duration || 88)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={handleFullscreen}
                    className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/10 hover:text-white transition-colors"
                    aria-label="Fullscreen"
                  >
                    <Maximize size={12} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Updates */}
          <ul className="mt-4 space-y-2">
            {LATEST_RELEASE.updates.map((update, i) => {
              const visual = UPDATE_ICONS[update.icon] ?? UPDATE_ICONS.sparkles
              return (
                <li
                  key={update.title}
                  className="flex items-center gap-3 rounded-2xl bg-white/[0.03] px-3.5 py-2.5 transition-colors duration-200 animate-in fade-in slide-in-from-bottom-2 hover:bg-white/[0.05] [animation-fill-mode:backwards]"
                  style={{ animationDelay: `${120 + i * 50}ms`, animationDuration: '300ms' }}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${visual.tile}`}
                    aria-hidden="true"
                  >
                    {visual.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-white">
                      {update.title}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] leading-snug text-white/50">
                      {update.description}
                    </span>
                  </span>
                  <ChevronRight size={15} className="shrink-0 text-white/20" aria-hidden="true" />
                </li>
              )
            })}
          </ul>
          {onViewAllUpdates && (
            <div className="mt-3.5 text-center">
              <button
                type="button"
                onClick={onViewAllUpdates}
                className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-white/40 hover:text-white transition-colors"
              >
                <span>View all updates & release history</span>
                <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="relative flex items-center justify-between gap-3 border-t border-white/[0.06] px-6 py-3.5">
          <button
            type="button"
            role="checkbox"
            aria-checked={dontShowAgain}
            aria-label="Don't show again for this version"
            onClick={() => setDontShowAgain((v) => !v)}
            className="group flex min-w-0 items-center gap-2.5 text-left"
          >
            <span
              className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-all ${
                dontShowAgain
                  ? 'border-primary bg-primary text-white'
                  : 'border-white/25 text-transparent group-hover:border-white/45'
              }`}
              aria-hidden="true"
            >
              <Check size={11} strokeWidth={3.5} />
            </span>
            <span className="truncate text-[12px] font-medium text-white/45 transition-colors group-hover:text-white/65">
              Don&apos;t show again for this version
            </span>
          </button>
          <button
            ref={continueRef}
            onClick={() => {
              if (hasTour && onStartTour) onStartTour()
              else handleContinue()
            }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#e50914] to-[#ff5c7a] px-6 py-2.5 text-sm font-semibold text-white shadow-[0_8px_30px_rgba(229,9,20,0.35)] transition-all hover:brightness-110 hover:shadow-[0_8px_36px_rgba(229,9,20,0.45)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 active:scale-[0.98]"
          >
            Continue
            <ArrowRight size={15} strokeWidth={2.4} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default WhatsNewOnboarding
