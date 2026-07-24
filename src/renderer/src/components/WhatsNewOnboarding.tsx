import React, { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Bug, Sparkles, PlusCircle } from 'lucide-react'

export const LATEST_RELEASE = {
  version: '1.29.2',
}

const releaseNotes: { type: NoteType; icon: React.ReactNode; text: string }[] = [
  { type: 'improved', icon: <Sparkles size={16} />, text: 'Compact update button in sidebar shows text labels — Update / 45% / Install — no more guessing' },
  { type: 'new', icon: <PlusCircle size={16} />, text: 'Status dot indicators: red for available, green when update is ready to install' },
  { type: 'improved', icon: <Sparkles size={16} />, text: 'Redesigned update cards in expanded sidebar: clean borders, version info, dedicated action buttons per state' },
  { type: 'improved', icon: <Sparkles size={16} />, text: 'What\'s New dialog simplified to compact modal with color-coded Fixed / Improved / New badges' },
]

const typeConfig: Record<NoteType, { label: string; dot: string; border: string; bg: string; text: string }> = {
  fixed: { label: 'Fixed', dot: 'bg-red-500', border: 'border-red-500/20', bg: 'bg-red-500/10', text: 'text-red-400' },
  improved: { label: 'Improved', dot: 'bg-blue-500', border: 'border-blue-500/20', bg: 'bg-blue-500/10', text: 'text-blue-400' },
  new: { label: 'New', dot: 'bg-emerald-500', border: 'border-emerald-500/20', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
}

type NoteType = 'fixed' | 'improved' | 'new'

type WhatsNewOnboardingProps = {
  currentStep: number
  onNext: () => void
  onPrevious: () => void
  onStepChange: (step: number) => void
  onClose: () => void
}

const WhatsNewOnboarding: React.FC<WhatsNewOnboardingProps> = ({ onClose }) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Enter') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="relative w-full max-w-[420px] rounded-xl bg-[#0e1419] p-6 text-white shadow-2xl border border-white/5"
        >
          <button
            onClick={onClose}
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-lg text-white/30 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>

          <div className="mb-6">
            <h2 className="text-lg font-bold text-white">What's new</h2>
            <p className="text-sm text-white/40 mt-0.5">v{LATEST_RELEASE.version}</p>
          </div>

          <div className="space-y-2.5 mb-6">
            {releaseNotes.map((note, idx) => {
              const cfg = typeConfig[note.type]
              return (
                <div key={idx} className={`flex items-start gap-3 rounded-lg border ${cfg.border} ${cfg.bg} p-3`}>
                  <span className={`mt-0.5 shrink-0 ${cfg.text}`}>{note.icon}</span>
                  <div className="flex-1 min-w-0">
                    <span className={`text-xs font-semibold uppercase tracking-wide ${cfg.text}`}>{cfg.label}</span>
                    <p className="text-sm text-white/80 mt-0.5 leading-snug">{note.text}</p>
                  </div>
                </div>
              )
            })}
          </div>

          <button
            onClick={onClose}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-white hover:bg-[#c40812] transition-colors"
          >
            Got it
          </button>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

export default WhatsNewOnboarding
