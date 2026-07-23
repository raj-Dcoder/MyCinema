import React, { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Film } from 'lucide-react'

export const LATEST_RELEASE = {
  version: '1.29.1',
}

const newFeatures = [
  {
    icon: <Film size={24} className="text-gray-400" />,
    text: "Cleaner player controls with the Next Episode button removed for a focused, streamlined playback experience."
  }
]

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
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-[480px] rounded-2xl bg-[#111b21] p-8 text-white shadow-2xl"
        >
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-gray-400 hover:text-white"
            aria-label="Close"
          >
            <X size={24} />
          </button>

          <div className="mb-8 flex flex-col items-center">
            <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-primary/10">
              <Film size={48} className="text-primary" />
            </div>
            <h2 className="text-2xl font-normal text-white">What's new in MyCinema</h2>
          </div>

          <div className="mb-10 space-y-6">
            {newFeatures.map((feature, idx) => (
              <div key={idx} className="flex items-start gap-4">
                <div className="mt-0.5 shrink-0 text-primary">{feature.icon}</div>
                <p className="text-[15px] leading-relaxed text-gray-300">
                  {feature.text}
                </p>
              </div>
            ))}
          </div>

          <div className="flex justify-center">
            <button
              onClick={onClose}
              className="rounded-full bg-primary px-8 py-2.5 text-[15px] font-medium text-white hover:bg-[#c40812] transition-colors"
            >
              Continue
            </button>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

export default WhatsNewOnboarding
