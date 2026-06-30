import React, { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import type { LucideIcon } from 'lucide-react'
import {
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Download as DownloadIcon,
  Film,
  Heart,
  Play,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  Tv,
  X,
  Zap
} from 'lucide-react'

type WhatsNewMood = {
  name: string
  gradient: string
  text: string
  border: string
  shadow: string
  backdrop: string
  cursor: string
}

type WhatsNewSlide = {
  id: string
  layout: 'reveal' | 'share' | 'discovery' | 'downloads' | 'security' | 'celebrate'
  mood: WhatsNewMood
  icon: LucideIcon
  kicker: string
  headline: string
  highlight: string
  support: string
  bullets: string[]
  signal: string
  cta: string
}

export const LATEST_RELEASE: {
  version: string
  eyebrow: string
  slides: WhatsNewSlide[]
} = {
  version: '1.26.1',
  eyebrow: "What's New",
  slides: [
    {
      id: 'audio-speed',
      layout: 'reveal',
      icon: Zap,
      kicker: 'Speed',
      headline: 'Stable playback speed always.',
      highlight: 'playback speed',
      support: 'External audio tracks now perfectly preserve your preferred playback speed when reloading or seeking.',
      bullets: [
        'Maintains chosen speed across seeking.',
        'Persistent rate settings on audio load.'
      ],
      signal: 'Fixed',
      cta: "Let's go",
      mood: {
        name: 'audio-speed',
        gradient: 'from-amber-300 via-orange-300 to-red-300',
        text: 'text-amber-200',
        border: 'border-amber-300/30',
        shadow: 'shadow-[0_0_72px_rgba(251,191,36,0.3)]',
        backdrop:
          'linear-gradient(135deg, rgba(251,191,36,0.2), transparent 35%), linear-gradient(235deg, rgba(249,115,22,0.18), transparent 50%)',
        cursor: 'rgba(251,191,36,0.22)'
      }
    },
    {
      id: 'audio-codec',
      layout: 'discovery',
      icon: Tv,
      kicker: 'Codec',
      headline: 'Seamless audio track selection.',
      highlight: 'Seamless',
      support: 'Enjoy better support and cleaner track options for videos with unsupported audio codecs.',
      bullets: [
        'Cleaned up duplicate audio tracks list.',
        'Handles fallback audio track states seamlessly.'
      ],
      signal: 'Solved',
      cta: 'Nice',
      mood: {
        name: 'audio-codec',
        gradient: 'from-cyan-300 via-sky-300 to-blue-300',
        text: 'text-cyan-200',
        border: 'border-cyan-300/30',
        shadow: 'shadow-[0_0_72px_rgba(34,211,238,0.3)]',
        backdrop:
          'linear-gradient(135deg, rgba(14,165,233,0.2), transparent 35%), linear-gradient(235deg, rgba(59,130,246,0.18), transparent 50%)',
        cursor: 'rgba(34,211,238,0.22)'
      }
    },
    {
      id: 'tooltip-fix',
      layout: 'celebrate',
      icon: Sparkles,
      kicker: 'Interface',
      headline: 'Clean workspace, zero clutter.',
      highlight: 'zero clutter',
      support: 'The persistent fullscreen helper tooltip has been completely removed to keep your view distraction-free.',
      bullets: [
        'No more annoying background popups.',
        'Clean hover states everywhere.'
      ],
      signal: 'Polished',
      cta: 'Awesome',
      mood: {
        name: 'tooltip-fix',
        gradient: 'from-lime-300 via-emerald-300 to-teal-300',
        text: 'text-emerald-200',
        border: 'border-emerald-300/30',
        shadow: 'shadow-[0_0_72px_rgba(52,211,153,0.3)]',
        backdrop:
          'linear-gradient(135deg, rgba(16,185,129,0.2), transparent 35%), linear-gradient(235deg, rgba(20,184,166,0.18), transparent 50%)',
        cursor: 'rgba(52,211,153,0.22)'
      }
    }
  ]
};

type WhatsNewOnboardingProps = {
  currentStep: number
  onNext: () => void
  onPrevious: () => void
  onStepChange: (step: number) => void
  onClose: () => void
}

const particles = Array.from({ length: 30 }, (_, index) => ({
  id: index,
  left: `${(index * 29) % 100}%`,
  top: `${(index * 47) % 100}%`,
  delay: (index % 8) * 0.38,
  duration: 6 + (index % 6),
  scale: 0.65 + (index % 5) * 0.14
}))

const slideVariants = {
  initial: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? 90 : -90,
    scale: 0.97,
    filter: 'blur(10px)'
  }),
  animate: {
    opacity: 1,
    x: 0,
    scale: 1,
    filter: 'blur(0px)'
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction > 0 ? -90 : 90,
    scale: 0.98,
    filter: 'blur(10px)'
  })
}

const renderHeadline = (slide: WhatsNewSlide) => {
  const parts = slide.headline.split(slide.highlight)

  if (parts.length === 1) {
    return slide.headline
  }

  return (
    <>
      {parts[0]}
      <span className={clsx('bg-gradient-to-r bg-clip-text text-transparent', slide.mood.gradient)}>
        {slide.highlight}
      </span>
      {parts[1]}
    </>
  )
}

const EnergyBars = ({ slide }: { slide: WhatsNewSlide }) => (
  <div className="flex h-8 items-end gap-1.5" aria-hidden="true">
    {[0, 1, 2, 3, 4].map((bar) => (
      <span
        key={bar}
        className={clsx('w-1.5 rounded-full bg-gradient-to-t opacity-90 whats-new-energy-bar', slide.mood.gradient)}
        style={{ animationDelay: `${bar * 0.14}s` }}
      />
    ))}
  </div>
)

const MoodBadge = ({ slide }: { slide: WhatsNewSlide }) => {
  const Icon = slide.icon

  return (
    <div className={clsx('inline-flex items-center gap-3 rounded-full border bg-white/[0.06] px-4 py-2 backdrop-blur-2xl', slide.mood.border, slide.mood.shadow)}>
      <span className={clsx('flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br text-slate-950', slide.mood.gradient)}>
        <Icon size={17} strokeWidth={2.5} />
      </span>
      <span className="text-[11px] font-black uppercase tracking-[0.22em] text-white/70">{slide.kicker}</span>
    </div>
  )
}

const CTAButton = ({ slide, isLastStep, onClick }: { slide: WhatsNewSlide; isLastStep: boolean; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className={clsx(
      'group relative inline-flex h-14 min-w-40 items-center justify-center overflow-hidden rounded-full px-7 text-sm font-black uppercase tracking-[0.12em] text-slate-950 transition duration-300 hover:scale-[1.03] focus:outline-none focus:ring-2 focus:ring-white/70',
      slide.mood.shadow
    )}
  >
    <span className={clsx('absolute inset-0 bg-gradient-to-r', slide.mood.gradient)} />
    <span className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 whats-new-button-sheen" />
    <span className="relative flex items-center gap-2">
      {slide.cta}
      {isLastStep ? <Check size={17} strokeWidth={3} /> : <ChevronRight size={17} strokeWidth={3} className="transition-transform group-hover:translate-x-1" />}
    </span>
  </button>
)

const HeadlineBlock = ({ slide, align = 'left' }: { slide: WhatsNewSlide; align?: 'left' | 'center' }) => (
  <div className={clsx('relative z-10 flex max-w-[640px] flex-col gap-5', align === 'center' && 'mx-auto items-center text-center')}>
    <MoodBadge slide={slide} />
    <h2 className="text-[48px] font-black leading-[0.94] tracking-normal text-white xl:text-[58px]">
      {renderHeadline(slide)}
    </h2>
    <p className={clsx('max-w-[470px] text-base font-semibold leading-7 text-white/60', align === 'center' && 'mx-auto')}>
      {slide.support}
    </p>
    <div className={clsx('grid max-w-[560px] gap-2.5', align === 'center' && 'mx-auto')}>
      {slide.bullets.map((item) => (
        <div
          key={item}
          className={clsx(
            'flex gap-3 rounded-2xl border bg-black/25 px-4 py-3 text-left text-sm font-semibold leading-5 text-white/70 backdrop-blur-xl',
            slide.mood.border
          )}
        >
          <Check size={16} className={clsx('mt-0.5 flex-shrink-0', slide.mood.text)} strokeWidth={3} />
          <span>{item}</span>
        </div>
      ))}
    </div>
  </div>
)

const SignalPill = ({ slide }: { slide: WhatsNewSlide }) => (
  <div className={clsx('inline-flex items-center gap-2 rounded-full border bg-black/25 px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.18em] backdrop-blur-2xl', slide.mood.border, slide.mood.text)}>
    <span className={clsx('h-2 w-2 rounded-full bg-current whats-new-live-dot', slide.mood.text)} />
    {slide.signal}
  </div>
)

const RevealVisual = ({ slide }: { slide: WhatsNewSlide }) => (
  <div className="relative mx-auto flex h-[420px] w-full max-w-[760px] items-center justify-center" aria-hidden="true">
    <div className={clsx('absolute inset-x-10 top-8 h-40 rotate-[-8deg] rounded-[2rem] border bg-white/[0.045] backdrop-blur-2xl whats-new-float-slow', slide.mood.border, slide.mood.shadow)} />
    <div className="absolute left-10 top-16 h-64 w-44 rotate-[-12deg] overflow-hidden rounded-[1.7rem] border border-white/10 bg-black/40 shadow-2xl backdrop-blur-xl">
      <div className="h-24 bg-gradient-to-br from-white/20 to-white/0" />
      <div className="space-y-2 p-4">
        <div className="h-3 w-24 rounded-full bg-white/50" />
        <div className={clsx('h-2 w-20 rounded-full bg-gradient-to-r', slide.mood.gradient)} />
        <div className="mt-5 grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map((item) => (
            <span key={item} className="h-16 rounded-xl bg-white/[0.08]" />
          ))}
        </div>
      </div>
    </div>
    <div className="absolute right-8 top-20 h-60 w-52 rotate-[10deg] overflow-hidden rounded-[1.7rem] border border-white/10 bg-black/40 shadow-2xl backdrop-blur-xl whats-new-float">
      <div className={clsx('flex h-28 items-center justify-center bg-gradient-to-br', slide.mood.gradient)}>
        <Play className="text-slate-950" size={42} fill="currentColor" />
      </div>
      <div className="space-y-3 p-4">
        <div className="h-3 w-28 rounded-full bg-white/60" />
        <div className="h-2 w-36 rounded-full bg-white/20" />
        <div className="flex gap-2 pt-2">
          <Heart className="text-white/60" size={18} />
          <Bell className="text-white/60" size={18} />
          <Share2 className={slide.mood.text} size={18} />
        </div>
      </div>
    </div>
    <div className={clsx('relative flex h-56 w-56 items-center justify-center rounded-[3rem] border bg-black/40 backdrop-blur-2xl', slide.mood.border, slide.mood.shadow)}>
      <span className={clsx('absolute inset-5 rounded-[2.2rem] bg-gradient-to-br opacity-20 blur-2xl', slide.mood.gradient)} />
      <span className="relative text-[74px] font-black leading-none tracking-normal text-white">{LATEST_RELEASE.version}</span>
      <Sparkles className={clsx('absolute -right-5 -top-5', slide.mood.text)} size={44} />
    </div>
  </div>
)

const ShareVisual = ({ slide }: { slide: WhatsNewSlide }) => (
  <div className="relative h-[440px] w-full max-w-[650px]" aria-hidden="true">
    <div className={clsx('absolute left-10 top-8 w-[450px] rounded-[2rem] border bg-white/[0.055] p-5 backdrop-blur-2xl', slide.mood.border, slide.mood.shadow)}>
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={clsx('flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br text-slate-950', slide.mood.gradient)}>
            <Share2 size={20} strokeWidth={2.5} />
          </span>
          <div>
            <div className="h-3 w-28 rounded-full bg-white/60" />
            <div className="mt-2 h-2 w-20 rounded-full bg-white/20" />
          </div>
        </div>
        <SignalPill slide={slide} />
      </div>
      <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-black/40">
        <div className="flex h-36 items-end bg-gradient-to-br from-cyan-300/25 via-blue-500/20 to-transparent p-4">
          <div className="flex items-center gap-3 rounded-full bg-black/50 px-3 py-2 backdrop-blur-xl">
            <Film size={17} className="text-cyan-200" />
            <span className="text-xs font-black uppercase tracking-[0.18em] text-white/80">Same mirror</span>
          </div>
        </div>
        <div className="space-y-3 p-4">
          <div className="h-3 w-56 rounded-full bg-white/60" />
          <div className="h-2 w-72 rounded-full bg-white/20" />
          <div className="flex items-center gap-2 rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-3">
            <span className="h-2 w-2 rounded-full bg-cyan-200 shadow-[0_0_14px_rgba(103,232,249,0.9)]" />
            <div className="h-2 flex-1 rounded-full bg-cyan-100/30" />
          </div>
        </div>
      </div>
    </div>
    <div className="absolute bottom-8 right-10 w-72 rotate-[7deg] rounded-[1.7rem] border border-white/10 bg-black/50 p-4 shadow-2xl backdrop-blur-2xl whats-new-float">
      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-white/50">Send to</p>
      <div className="mt-4 flex -space-x-3">
        {['A', 'R', 'M', 'S'].map((avatar, index) => (
          <span
            key={avatar}
            className={clsx('flex h-12 w-12 items-center justify-center rounded-2xl border border-black bg-gradient-to-br text-sm font-black text-slate-950', index % 2 ? 'from-cyan-300 to-blue-400' : 'from-white to-cyan-200')}
          >
            {avatar}
          </span>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-between rounded-2xl bg-white/10 p-3">
        <span className="text-xs font-bold text-white/75">mycinema://source</span>
        <Check size={18} className="text-cyan-200" />
      </div>
    </div>
    <div className="absolute left-0 top-44 flex items-center gap-2 rounded-full border border-cyan-300/25 bg-cyan-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-cyan-100 backdrop-blur-xl whats-new-doodle">
      <ChevronRight size={16} />
      no guessing
    </div>
  </div>
)

const DiscoveryVisual = ({ slide }: { slide: WhatsNewSlide }) => (
  <div className="relative h-[440px] w-full max-w-[680px]" aria-hidden="true">
    <div className="absolute left-4 top-10 flex h-[380px] w-[210px] rotate-[-7deg] flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-black/50 shadow-2xl backdrop-blur-xl">
      <div className={clsx('flex h-44 items-end bg-gradient-to-br p-4', slide.mood.gradient)}>
        <Play size={34} className="text-slate-950" fill="currentColor" />
      </div>
      <div className="flex-1 space-y-3 p-4">
        <div className="h-3 w-28 rounded-full bg-white/60" />
        <div className="h-2 w-36 rounded-full bg-white/20" />
        <div className="grid grid-cols-2 gap-2 pt-3">
          <span className="h-14 rounded-xl bg-white/10" />
          <span className="h-14 rounded-xl bg-white/10" />
        </div>
      </div>
    </div>
    <div className={clsx('absolute left-44 top-0 w-[300px] overflow-hidden rounded-[2rem] border bg-white/[0.06] p-4 backdrop-blur-2xl', slide.mood.border, slide.mood.shadow)}>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[11px] font-black uppercase tracking-[0.2em] text-white/50">Fresh rails</span>
        <Search className={slide.mood.text} size={20} />
      </div>
      <div className="space-y-3">
        {['India Movies', 'Binge Series', 'OTT Now'].map((label, index) => (
          <div key={label} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/25 p-3">
            <span className={clsx('flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br text-slate-950', index === 1 ? 'from-pink-300 to-violet-400' : slide.mood.gradient)}>
              {index === 1 ? <Tv size={18} /> : <Film size={18} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-white">{label}</p>
              <div className="mt-2 h-1.5 rounded-full bg-white/10">
                <div className={clsx('h-full rounded-full bg-gradient-to-r', slide.mood.gradient)} style={{ width: `${52 + index * 18}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
    <div className="absolute bottom-8 right-6 grid w-[270px] rotate-[6deg] grid-cols-2 gap-3 whats-new-float">
      {['Drama', 'Hindi', 'New', 'Vibes'].map((label, index) => (
        <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.055] p-4 backdrop-blur-xl">
          <div className={clsx('mb-5 h-1.5 rounded-full bg-gradient-to-r', index % 2 ? 'from-fuchsia-300 to-pink-300' : slide.mood.gradient)} />
          <p className="text-sm font-black text-white">{label}</p>
        </div>
      ))}
    </div>
    <div className="absolute right-24 top-24 rounded-full border border-fuchsia-300/25 bg-fuchsia-300/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-fuchsia-100 backdrop-blur-xl whats-new-doodle">
      watchlist energy
    </div>
  </div>
)

const DownloadsVisual = ({ slide }: { slide: WhatsNewSlide }) => (
  <div className="relative h-[440px] w-full max-w-[650px]" aria-hidden="true">
    <div className={clsx('absolute left-7 top-8 w-[500px] rounded-[2rem] border bg-white/[0.055] p-5 backdrop-blur-2xl', slide.mood.border, slide.mood.shadow)}>
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={clsx('flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br text-slate-950', slide.mood.gradient)}>
            <DownloadIcon size={21} strokeWidth={2.5} />
          </span>
          <div>
            <div className="h-3 w-28 rounded-full bg-white/60" />
            <div className="mt-2 h-2 w-16 rounded-full bg-white/20" />
          </div>
        </div>
        <EnergyBars slide={slide} />
      </div>
      <div className="space-y-3">
        {[
          ['S02 full pack', '82%'],
          ['Episode 06', 'Ready'],
          ['Hindi source', '12 found']
        ].map(([label, value], index) => (
          <div key={label} className="rounded-[1.4rem] border border-white/10 bg-black/30 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className={clsx('h-11 w-11 rounded-2xl bg-gradient-to-br', index === 1 ? 'from-white/60 to-emerald-300/60' : slide.mood.gradient)} />
                <div>
                  <p className="text-sm font-black text-white">{label}</p>
                  <p className="mt-1 text-xs font-semibold text-white/40">mirror matched</p>
                </div>
              </div>
              <span className={clsx('text-xs font-black uppercase tracking-[0.14em]', slide.mood.text)}>{value}</span>
            </div>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
              <div className={clsx('h-full rounded-full bg-gradient-to-r whats-new-progress-scan', slide.mood.gradient)} style={{ width: index === 0 ? '82%' : index === 1 ? '100%' : '64%' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
    <div className="absolute bottom-12 right-4 rotate-[7deg] rounded-[1.6rem] border border-emerald-300/25 bg-emerald-300/10 p-4 text-emerald-100 shadow-2xl backdrop-blur-xl whats-new-float">
      <div className="flex items-center gap-3">
        <Check size={20} />
        <span className="text-xs font-black uppercase tracking-[0.18em]">less chaos</span>
      </div>
    </div>
  </div>
)

const SecurityVisual = ({ slide }: { slide: WhatsNewSlide }) => (
  <div className="relative mx-auto flex h-[440px] w-full max-w-[640px] items-center justify-center" aria-hidden="true">
    <div className="absolute inset-8 rounded-[3rem] border border-white/10 bg-white/[0.035] backdrop-blur-2xl" />
    <div className="absolute h-[340px] w-[340px] rounded-full border border-lime-200/20 whats-new-orbit" />
    <div className="absolute h-[250px] w-[250px] rounded-full border border-yellow-100/20 whats-new-orbit-reverse" />
    <div className={clsx('relative flex h-44 w-44 items-center justify-center rounded-[3rem] border bg-black/40 backdrop-blur-2xl', slide.mood.border, slide.mood.shadow)}>
      <span className={clsx('absolute inset-5 rounded-[2.2rem] bg-gradient-to-br opacity-20 blur-xl', slide.mood.gradient)} />
      <ShieldCheck size={82} className={clsx('relative', slide.mood.text)} strokeWidth={1.4} />
    </div>
    {['type', 'tmdb', 'source', 'path'].map((label, index) => (
      <div
        key={label}
        className="absolute rounded-full border border-lime-300/20 bg-black/40 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-lime-100 backdrop-blur-xl"
        style={{
          left: ['8%', '72%', '16%', '66%'][index],
          top: ['22%', '30%', '68%', '74%'][index]
        }}
      >
        {label} ok
      </div>
    ))}
    <div className="absolute bottom-10 left-1/2 h-1.5 w-72 -translate-x-1/2 overflow-hidden rounded-full bg-white/10">
      <div className={clsx('h-full w-full rounded-full bg-gradient-to-r whats-new-progress-scan', slide.mood.gradient)} />
    </div>
  </div>
)

const CelebrateVisual = ({ slide }: { slide: WhatsNewSlide }) => (
  <div className="relative h-[440px] w-full max-w-[680px]" aria-hidden="true">
    <div className={clsx('absolute left-12 top-6 w-[520px] overflow-hidden rounded-[2rem] border bg-white/[0.055] backdrop-blur-2xl', slide.mood.border, slide.mood.shadow)}>
      <div className="relative h-64 overflow-hidden bg-black/40">
        <div className={clsx('absolute inset-0 bg-gradient-to-br opacity-80', slide.mood.gradient)} />
        <div className="absolute inset-0 bg-[linear-gradient(115deg,transparent,rgba(255,255,255,0.24),transparent)] whats-new-sweep" />
        <div className="absolute bottom-5 left-5 right-5 flex items-center gap-4 rounded-2xl bg-black/50 p-4 backdrop-blur-2xl">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-black">
            <Play size={22} fill="currentColor" />
          </span>
          <div className="flex-1">
            <div className="h-3 w-44 rounded-full bg-white/70" />
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/20">
              <div className="h-full w-[72%] rounded-full bg-white" />
            </div>
          </div>
          <Zap className="text-white" size={26} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 p-4">
        {['seek', 'sort', 'polish'].map((label, index) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className={clsx('mb-6 h-2 rounded-full bg-gradient-to-r', index === 1 ? 'from-cyan-300 to-violet-400' : slide.mood.gradient)} />
            <p className="text-xs font-black uppercase tracking-[0.16em] text-white/75">{label}</p>
          </div>
        ))}
      </div>
    </div>
    <div className="absolute bottom-10 right-2 rotate-[8deg] rounded-[1.8rem] border border-orange-300/25 bg-orange-300/10 p-5 text-orange-100 shadow-2xl backdrop-blur-xl whats-new-float">
      <Sparkles size={24} />
      <p className="mt-4 max-w-36 text-sm font-black leading-5 text-white">library feels alive</p>
    </div>
  </div>
)

const SlideVisual = ({ slide }: { slide: WhatsNewSlide }) => {
  switch (slide.layout) {
    case 'reveal':
      return <RevealVisual slide={slide} />
    case 'share':
      return <ShareVisual slide={slide} />
    case 'discovery':
      return <DiscoveryVisual slide={slide} />
    case 'downloads':
      return <DownloadsVisual slide={slide} />
    case 'security':
      return <SecurityVisual slide={slide} />
    case 'celebrate':
      return <CelebrateVisual slide={slide} />
    default:
      return null
  }
}

const getLayoutClassName = (layout: WhatsNewSlide['layout']) => {
  if (layout === 'reveal') {
    return 'grid-cols-1 place-items-center text-center'
  }

  if (layout === 'security') {
    return 'grid-cols-[0.78fr_1fr] items-center'
  }

  if (layout === 'celebrate') {
    return 'grid-cols-[0.84fr_1fr] items-center'
  }

  return 'grid-cols-[0.86fr_1fr] items-center'
}

const WhatsNewOnboarding: React.FC<WhatsNewOnboardingProps> = ({
  currentStep,
  onNext,
  onPrevious,
  onStepChange,
  onClose
}) => {
  const [direction, setDirection] = useState(1)
  const [cursor, setCursor] = useState({ x: 50, y: 50 })
  const slides = LATEST_RELEASE.slides
  const safeStep = Math.min(Math.max(currentStep, 0), slides.length - 1)
  const slide = slides[safeStep]
  const isLastStep = safeStep === slides.length - 1

  const gridBackdrop = useMemo(() => ({
    backgroundImage: 'linear-gradient(rgba(255,255,255,0.065) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.065) 1px, transparent 1px)',
    backgroundSize: '48px 48px',
    maskImage: 'linear-gradient(to bottom, transparent, black 20%, black 78%, transparent)'
  }), [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }

      if (event.key === 'ArrowRight' || event.key === 'Enter') {
        setDirection(1)
        onNext()
      }

      if (event.key === 'ArrowLeft') {
        setDirection(-1)
        onPrevious()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, onNext, onPrevious])

  const handleStepChange = (step: number) => {
    setDirection(step > safeStep ? 1 : -1)
    onStepChange(step)
  }

  const handleNextClick = () => {
    setDirection(1)
    onNext()
  }

  const handlePreviousClick = () => {
    setDirection(-1)
    onPrevious()
  }

  return (
    <motion.div
      className="fixed inset-0 z-[200] overflow-hidden bg-[#02040a] text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        setCursor({
          x: ((event.clientX - rect.left) / rect.width) * 100,
          y: ((event.clientY - rect.top) / rect.height) * 100
        })
      }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={slide.id}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45 }}
          style={{ background: slide.mood.backdrop }}
        />
      </AnimatePresence>

      <div className="pointer-events-none absolute inset-0 opacity-45" style={gridBackdrop} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.22)_58%,rgba(0,0,0,0.78)_100%)]" />
      <div
        className="pointer-events-none absolute h-[24rem] w-[24rem] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[76px] transition-[left,top,background] duration-300"
        style={{
          left: `${cursor.x}%`,
          top: `${cursor.y}%`,
          background: `radial-gradient(circle, ${slide.mood.cursor}, transparent 66%)`
        }}
      />

      {particles.map((particle) => (
        <span
          key={particle.id}
          className={clsx('pointer-events-none absolute h-1 w-1 rounded-full bg-white/60 whats-new-particle', particle.id % 3 === 0 && slide.mood.text)}
          style={{
            left: particle.left,
            top: particle.top,
            animationDelay: `${particle.delay}s`,
            animationDuration: `${particle.duration}s`,
            transform: `scale(${particle.scale})`
          }}
        />
      ))}

      <div className="relative z-10 flex h-screen flex-col px-8 py-6">
        <header className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="rounded-full border border-white/10 bg-white/[0.055] px-4 py-2 text-[11px] font-black uppercase tracking-[0.22em] text-white/60 backdrop-blur-2xl">
              {LATEST_RELEASE.eyebrow} / v{LATEST_RELEASE.version}
            </div>
            <SignalPill slide={slide} />
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 lg:flex">
              {slides.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  aria-label={`Go to slide ${index + 1}`}
                  onClick={() => handleStepChange(index)}
                  className="group h-2.5 w-12 overflow-hidden rounded-full bg-white/10 transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/50"
                >
                  <motion.span
                    className={clsx('block h-full rounded-full bg-gradient-to-r', index <= safeStep ? slide.mood.gradient : 'from-white/20 to-white/20')}
                    initial={false}
                    animate={{ width: index < safeStep ? '100%' : index === safeStep ? '100%' : '0%' }}
                    transition={{ duration: index === safeStep ? 0.55 : 0.2 }}
                  />
                </button>
              ))}
            </div>
            <span className="text-xs font-black uppercase tracking-[0.18em] text-white/40">
              {String(safeStep + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/60 backdrop-blur-2xl transition hover:border-white/20 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50"
              aria-label="Close what's new"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <AnimatePresence mode="wait" custom={direction}>
          <motion.section
            key={slide.id}
            custom={direction}
            variants={slideVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ type: 'spring', stiffness: 220, damping: 27, mass: 0.9 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.08}
            onDragEnd={(_, info) => {
              if (info.offset.x < -80) {
                handleNextClick()
              }
              if (info.offset.x > 80) {
                handlePreviousClick()
              }
            }}
            className={clsx('grid min-h-0 flex-1 gap-8 py-8 lg:grid', getLayoutClassName(slide.layout))}
          >
            {slide.layout === 'reveal' ? (
              <div className="flex h-full w-full flex-col items-center justify-center gap-6">
                <HeadlineBlock slide={slide} align="center" />
                <SlideVisual slide={slide} />
              </div>
            ) : slide.layout === 'security' ? (
              <>
                <SlideVisual slide={slide} />
                <div className="justify-self-center">
                  <HeadlineBlock slide={slide} />
                </div>
              </>
            ) : (
              <>
                <div className="justify-self-end">
                  <HeadlineBlock slide={slide} />
                </div>
                <SlideVisual slide={slide} />
              </>
            )}
          </motion.section>
        </AnimatePresence>

        <footer className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePreviousClick}
              disabled={safeStep === 0}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/60 backdrop-blur-2xl transition hover:border-white/20 hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-25 focus:outline-none focus:ring-2 focus:ring-white/50"
              aria-label="Previous slide"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              onClick={handleNextClick}
              disabled={isLastStep}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.055] text-white/60 backdrop-blur-2xl transition hover:border-white/20 hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-25 focus:outline-none focus:ring-2 focus:ring-white/50"
              aria-label="Next slide"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div className="flex items-center gap-2" aria-hidden="true">
            {[0, 1, 2].map((item) => (
              <ChevronRight
                key={item}
                size={18}
                className={clsx('whats-new-swipe-cue', slide.mood.text)}
                style={{ animationDelay: `${item * 0.12}s` }}
              />
            ))}
          </div>

          <CTAButton slide={slide} isLastStep={isLastStep} onClick={handleNextClick} />
        </footer>
      </div>
    </motion.div>
  )
}

export default WhatsNewOnboarding
