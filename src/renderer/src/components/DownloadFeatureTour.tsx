import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Shield, PlayCircle, Lock, ChevronRight, Check } from 'lucide-react'
import clsx from 'clsx'

const TOUR_STORAGE_KEY = 'mycinema_tour_seen_v1.6.0'

const TOUR_STEPS = [
  {
    icon: Search,
    title: 'Search & Discover',
    description: 'Find any movie or series effortlessly. MyCinema aggregates the highest quality P2P sources instantly for your convenience.',
    color: 'from-blue-500 to-cyan-400',
    iconColor: 'text-cyan-400'
  },
  {
    icon: Shield,
    title: 'Fast & Private',
    description: 'Powered by highly optimized WebTorrent trackers. Your privacy is paramount: DHT and LSD are disabled by default to keep your IP hidden.',
    color: 'from-purple-500 to-pink-500',
    iconColor: 'text-purple-400'
  },
  {
    icon: PlayCircle,
    title: 'Seamless Playback',
    description: 'No need to wait. Start watching in pristine quality while the file downloads in the background. Your offline library syncs automatically.',
    color: 'from-emerald-400 to-teal-500',
    iconColor: 'text-emerald-400'
  },
  {
    icon: Lock,
    title: 'Good Practices',
    description: 'For maximum privacy and security, we highly recommend using a reputable VPN whenever exploring P2P networks and downloading content.',
    color: 'from-amber-400 to-orange-500',
    iconColor: 'text-amber-400'
  }
]

export function DownloadFeatureTour() {
  const [isVisible, setIsVisible] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    // Only show the tour if it hasn't been seen yet
    const hasSeen = localStorage.getItem(TOUR_STORAGE_KEY)
    if (!hasSeen) {
      // Add a slight delay for dramatic effect
      const timer = setTimeout(() => setIsVisible(true), 500)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1)
    } else {
      finishTour()
    }
  }

  const finishTour = () => {
    localStorage.setItem(TOUR_STORAGE_KEY, 'true')
    setIsVisible(false)
  }

  if (!isVisible) return null

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      >
        {/* Backdrop blur */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={finishTour} />

        <motion.div 
          initial={{ scale: 0.9, y: 20, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.95, y: 10, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="relative w-full max-w-2xl overflow-hidden rounded-3xl bg-zinc-900/90 shadow-2xl border border-white/10"
        >
          {/* Subtle noise texture */}
          <div className="absolute inset-0 opacity-[0.03] mix-blend-overlay pointer-events-none" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")' }} />

          {/* Decorative glows based on current step */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 0.15, scale: 1.5 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1 }}
                className={clsx(
                  "absolute top-0 right-0 w-96 h-96 -translate-y-1/2 translate-x-1/3 rounded-full blur-[100px] bg-gradient-to-br",
                  TOUR_STEPS[currentStep].color
                )}
              />
            </AnimatePresence>
          </div>

          <div className="relative p-8 sm:p-12">
            <div className="flex justify-between items-center mb-8">
              <div className="flex gap-2">
                {TOUR_STEPS.map((_, idx) => (
                  <div 
                    key={idx}
                    className="w-12 h-1.5 rounded-full bg-white/10 overflow-hidden"
                  >
                    {idx <= currentStep && (
                      <motion.div
                        layoutId="progressIndicator"
                        className={clsx(
                          "h-full bg-gradient-to-r",
                          TOUR_STEPS[currentStep].color
                        )}
                        initial={{ width: idx < currentStep ? "100%" : "0%" }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 0.4 }}
                      />
                    )}
                  </div>
                ))}
              </div>
              <button 
                onClick={finishTour}
                className="text-xs uppercase tracking-wider text-zinc-500 hover:text-white transition-colors"
              >
                Skip
              </button>
            </div>

            <div className="min-h-[220px]">
              <AnimatePresence mode="wait">
                <motion.div 
                  key={currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col items-start gap-6"
                >
                  <div className={clsx(
                    "p-4 rounded-2xl bg-white/5 border border-white/5 shadow-inner",
                    TOUR_STEPS[currentStep].iconColor
                  )}>
                    {React.createElement(TOUR_STEPS[currentStep].icon, { size: 36, strokeWidth: 1.5 })}
                  </div>
                  <div>
                    <h2 className="text-3xl font-light tracking-tight text-white mb-4">
                      {TOUR_STEPS[currentStep].title}
                    </h2>
                    <p className="text-lg text-zinc-400 leading-relaxed font-light max-w-lg">
                      {TOUR_STEPS[currentStep].description}
                    </p>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="mt-12 flex justify-between items-center">
              <div className="text-sm text-zinc-500">
                Step {currentStep + 1} of {TOUR_STEPS.length}
              </div>
              <button
                onClick={handleNext}
                className={clsx(
                  "group relative inline-flex items-center gap-2 px-6 py-3 rounded-full overflow-hidden transition-all duration-300",
                  currentStep === TOUR_STEPS.length - 1
                    ? "bg-white text-black hover:bg-zinc-200 shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                    : "bg-white/10 text-white hover:bg-white/20 border border-white/10 hover:border-white/30"
                )}
              >
                <span className="font-medium">
                  {currentStep === TOUR_STEPS.length - 1 ? 'Get Started' : 'Next'}
                </span>
                {currentStep === TOUR_STEPS.length - 1 ? (
                   <Check size={18} className="transition-transform group-hover:scale-110" />
                ) : (
                   <ChevronRight size={18} className="transition-transform group-hover:translate-x-1" />
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
