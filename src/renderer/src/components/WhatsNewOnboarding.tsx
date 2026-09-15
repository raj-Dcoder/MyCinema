import React, { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bookmark, ChevronRight, Layers, MessageCircle, Send, ShieldCheck } from 'lucide-react'

export const LATEST_RELEASE = {
  version: '1.34.0',
  eyebrow: "What's New",
  slides: [
    {
      id: 'collections',
      layout: 'discovery',
      icon: Layers,
      kicker: 'New tab',
      headline: 'Build lists that feel yours.',
      highlight: 'yours',
      support: 'Pin library titles and add any movie or show online, then drag cards anywhere.',
      signal: 'Hand-picked',
      cta: 'Show me',
      mood: {
        name: 'collections',
        gradient: 'from-violet-400 via-purple-500 to-fuchsia-800',
        text: 'text-purple-200',
        border: 'border-purple-300/20',
        shadow: 'shadow-[0_0_80px_rgba(192,132,252,0.25)]',
        backdrop: 'radial-gradient(ellipse at 50% 0%, rgba(192,132,252,0.12), transparent 60%)',
        cursor: 'rgba(192,132,252,0.2)',
      },
    },
    {
      id: 'collection-share',
      layout: 'share',
      icon: Send,
      kicker: 'Sharing',
      headline: 'Save it, then send it.',
      highlight: 'send',
      support: 'Save any collection as a file and forward it in WhatsApp or Telegram.',
      signal: 'File only',
      cta: 'Try it',
      mood: {
        name: 'sharing',
        gradient: 'from-emerald-400 via-teal-500 to-cyan-800',
        text: 'text-teal-200',
        border: 'border-teal-300/20',
        shadow: 'shadow-[0_0_80px_rgba(45,212,191,0.25)]',
        backdrop: 'radial-gradient(ellipse at 50% 0%, rgba(45,212,191,0.12), transparent 60%)',
        cursor: 'rgba(45,212,191,0.2)',
      },
    },
    {
      id: 'whatsapp-direct',
      layout: 'reveal',
      icon: MessageCircle,
      kicker: 'Faster',
      headline: 'WhatsApp opens straight in.',
      highlight: 'straight',
      support: 'No browser detour when the app is installed — pick a chat and attach.',
      signal: 'One tap',
      cta: 'Nice',
      mood: {
        name: 'direct',
        gradient: 'from-lime-400 via-green-500 to-emerald-800',
        text: 'text-green-200',
        border: 'border-green-300/20',
        shadow: 'shadow-[0_0_80px_rgba(74,222,128,0.25)]',
        backdrop: 'radial-gradient(ellipse at 50% 0%, rgba(74,222,128,0.12), transparent 60%)',
        cursor: 'rgba(74,222,128,0.2)',
      },
    },
    {
      id: 'watchlist-inbox',
      layout: 'discovery',
      icon: Bookmark,
      kicker: 'Simpler',
      headline: 'Watchlist is one inbox.',
      highlight: 'one',
      support: 'Old custom categories moved into Collections automatically — nothing you saved is lost.',
      signal: 'Kept safe',
      cta: 'Cool',
      mood: {
        name: 'inbox',
        gradient: 'from-sky-400 via-blue-500 to-indigo-800',
        text: 'text-sky-200',
        border: 'border-sky-300/20',
        shadow: 'shadow-[0_0_80px_rgba(56,189,248,0.25)]',
        backdrop: 'radial-gradient(ellipse at 50% 0%, rgba(56,189,248,0.12), transparent 60%)',
        cursor: 'rgba(56,189,248,0.2)',
      },
    },
    {
      id: 'share-safety',
      layout: 'security',
      icon: ShieldCheck,
      kicker: 'Privacy',
      headline: 'Shared files stay harmless.',
      highlight: 'harmless',
      support: 'Imports are validated first, and unknown titles arrive as online entries — never surprise downloads.',
      signal: 'Validated',
      cta: 'Got it',
      mood: {
        name: 'safety',
        gradient: 'from-slate-400 via-slate-500 to-zinc-800',
        text: 'text-slate-200',
        border: 'border-slate-300/20',
        shadow: 'shadow-[0_0_80px_rgba(148,163,184,0.25)]',
        backdrop: 'radial-gradient(ellipse at 50% 0%, rgba(148,163,184,0.12), transparent 60%)',
        cursor: 'rgba(148,163,184,0.2)',
      },
    },
  ],
}

type Slide = (typeof LATEST_RELEASE.slides)[number]

const WhatsNewOnboarding: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [slideIdx, setSlideIdx] = useState(0)
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 })
  const [particles, setParticles] = useState<React.ReactNode[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const slide = LATEST_RELEASE.slides[slideIdx] as Slide
  const isLast = slideIdx === LATEST_RELEASE.slides.length - 1
  const Icon = slide.icon

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'Enter' || e.key === 'ArrowRight') {
        isLast ? onClose() : setSlideIdx((i) => i + 1)
        return
      }
      if (e.key === 'ArrowLeft') {
        setSlideIdx((i) => Math.max(0, i - 1))
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isLast, onClose])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }, [])

  useEffect(() => {
    setParticles(
      Array.from({ length: 18 }, (_, i) => (
        <motion.div
          key={i}
          className="pointer-events-none absolute h-1 w-1 rounded-full bg-white/10"
          initial={{ opacity: 0, x: 0, y: 0 }}
          animate={{
            opacity: [0, 0.6, 0],
            x: Math.sin(i * 1.2) * 60 + 20,
            y: Math.cos(i * 0.9) * 60 - 30,
          }}
          transition={{
            duration: 3 + (i % 3),
            repeat: Infinity,
            delay: i * 0.15,
            ease: 'easeInOut',
          }}
          style={{ left: '50%', top: '50%' }}
        />
      )),
    )
  }, [slideIdx])

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="fixed inset-0 z-[200] flex items-center justify-center overflow-hidden bg-black/60 backdrop-blur-xl"
      style={{ background: slide.mood.backdrop }}
    >
      {/* Cursor glow */}
      <motion.div
        className="pointer-events-none absolute rounded-full blur-3xl"
        style={{
          width: 320,
          height: 320,
          background: slide.mood.cursor,
          left: cursorPos.x - 160,
          top: cursorPos.y - 160,
        }}
        transition={{ type: 'tween', ease: 'linear', duration: 0.08 }}
      />

      {/* Particles */}
      {particles}

      {/* Top gradient bar */}
      <div
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: `linear-gradient(90deg, ${slide.mood.cursor}, transparent)` }}
      />

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute right-5 top-5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/30 backdrop-blur-sm transition-all hover:bg-white/10 hover:text-white/60"
        aria-label="Close"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      </button>

      {/* Progress dots */}
      <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-10">
        {LATEST_RELEASE.slides.map((_, i) => (
          <button
            key={i}
            onClick={() => setSlideIdx(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === slideIdx ? 'w-4 bg-white/60' : 'w-1.5 bg-white/20 hover:bg-white/35'
            }`}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={slide.id}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -24 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="relative z-10 mx-auto flex w-full max-w-sm flex-col items-center px-6 text-center"
        >
          {/* Icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
            className={`mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border ${slide.mood.border} ${slide.mood.text} bg-white/5 backdrop-blur-xl ${slide.mood.shadow}`}
          >
            <Icon size={28} strokeWidth={1.5} />
          </motion.div>

          {/* Kicker */}
          <span className={`mb-2 text-[10px] font-bold uppercase tracking-[0.2em] ${slide.mood.text}`}>
            {slide.kicker}
          </span>

          {/* Headline with highlight */}
          <h2 className="text-[28px] font-black leading-tight tracking-tight text-white">
            {slide.headline.split(slide.highlight).length === 2 ? (
              <>
                {slide.headline.split(slide.highlight)[0]}
                <span className="bg-gradient-to-r bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(135deg, ${slide.mood.cursor.replace('0.2', '0.9')}, ${slide.mood.cursor.replace('0.2', '0.5')})` }}>
                  {slide.highlight}
                </span>
                {slide.headline.split(slide.highlight)[1]}
              </>
            ) : (
              slide.headline
            )}
          </h2>

          {/* Support */}
          <p className="mt-3 text-sm leading-relaxed text-white/50 max-w-[280px]">
            {slide.support}
          </p>

          {/* Signal */}
          <span className={`mt-5 rounded-full border ${slide.mood.border} ${slide.mood.text} bg-white/[0.03] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]`}>
            {slide.signal}
          </span>

          {/* CTA */}
          <motion.button
            onClick={isLast ? onClose : () => setSlideIdx((i) => i + 1)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className={`mt-6 flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold text-white shadow-xl transition-all brightness-110 hover:brightness-125`}
            style={{
              background: `linear-gradient(135deg, ${slide.mood.cursor.replace('0.2', '0.8')}, ${slide.mood.cursor.replace('0.2', '0.3')})`,
            }}
          >
            {slide.cta}
            <ChevronRight size={16} strokeWidth={2.5} />
          </motion.button>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

export default WhatsNewOnboarding
