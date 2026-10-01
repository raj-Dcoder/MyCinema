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
  Check,
} from 'lucide-react'

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

export interface ReleaseNotes {
  version: string
  /** Short and prominent, e.g. "A smoother watching experience." */
  title: string
  /** Exact word/phrase from `title` rendered in the accent gradient. */
  highlight?: string
  /** One or two plain sentences under the heading. */
  description: string
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
  version: '1.38.0',
  title: 'YouTube on your terms.',
  highlight: 'your terms.',
  description:
    'Meet Focus Tube — a new tab built around channels you pick, with a short tour to show you around.',
  tourId: 'focus-tube',
  updates: [
    {
      icon: 'play',
      title: 'Meet Focus Tube',
      description: 'A new YouTube tab built around your channels.',
    },
    {
      icon: 'layers',
      title: 'Categories for channels',
      description: 'File subscriptions into rooms you name and reorder.',
    },
    {
      icon: 'sparkles',
      title: 'A tour that shows it',
      description: 'Hit Continue once and walk the new tab.',
    },
    {
      icon: 'play',
      title: 'Scroll the seek bar',
      description: 'Roll the wheel over the bar to jump.',
    },
    {
      icon: 'shield',
      title: 'Private by design',
      description: 'No account or key; data stays on this device.',
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
}

const WhatsNewOnboarding: React.FC<WhatsNewOnboardingProps> = ({ onClose, onSkipSession, onStartTour }) => {
  const continueRef = useRef<HTMLButtonElement>(null)
  // Checked = remember this version as seen (the default). Unchecked = show
  // this dialog again on next launch.
  const [dontShowAgain, setDontShowAgain] = useState(true)
  const hasTour = Boolean(LATEST_RELEASE.tourId && onStartTour)

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

  // Primary path: Continue marks this version seen and chains straight into
  // the Focus Tube tour when one is attached. Dismiss paths (X, backdrop,
  // Escape) use handleContinue above and never start the tour.

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
        className="relative w-full max-w-[420px] overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0c0e13] shadow-[0_40px_120px_rgba(0,0,0,0.7)] animate-in fade-in zoom-in-95 duration-300"
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

        <div className="relative max-h-[82vh] overflow-y-auto px-6 pb-5 pt-5">
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
            className="mt-5 text-[30px] font-extrabold leading-[1.12] tracking-tight text-white"
          >
            {renderTitle()}
          </h2>
          <p className="mt-2.5 text-[13px] leading-relaxed text-white/55">
            {LATEST_RELEASE.description}
          </p>

          {/* Updates */}
          <ul className="mt-6 space-y-2.5">
            {LATEST_RELEASE.updates.map((update, i) => {
              const visual = UPDATE_ICONS[update.icon] ?? UPDATE_ICONS.sparkles
              return (
                <li
                  key={update.title}
                  className="flex items-center gap-3.5 rounded-2xl bg-white/[0.03] px-3.5 py-3 transition-colors duration-200 animate-in fade-in slide-in-from-bottom-2 hover:bg-white/[0.05] [animation-fill-mode:backwards]"
                  style={{ animationDelay: `${120 + i * 70}ms`, animationDuration: '350ms' }}
                >
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${visual.tile}`}
                    aria-hidden="true"
                  >
                    {visual.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-white">
                      {update.title}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-white/50">
                      {update.description}
                    </span>
                  </span>
                  <ChevronRight size={17} className="shrink-0 text-white/20" aria-hidden="true" />
                </li>
              )
            })}
          </ul>
        </div>

        {/* Footer */}
        <div className="relative flex items-center justify-between gap-3 border-t border-white/[0.06] px-6 py-4">
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
