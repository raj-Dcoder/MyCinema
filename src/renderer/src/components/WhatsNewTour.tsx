import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, PlayCircle, Zap, Sparkles, ChevronRight, Check, X } from 'lucide-react'
import clsx from 'clsx'

const WHATS_NEW_STORAGE_KEY = 'mycinema_whats_new_seen_v1.7.0'

const STEPS = [
  {
    icon: Users,
    title: 'Watch Together',
    description: 'Binge-watch with friends in real-time. Sync playback, pause, and seek across different devices seamlessly.',
    color: 'from-indigo-500 to-purple-500',
    iconColor: 'text-indigo-400'
  },
  {
    icon: PlayCircle,
    title: 'Smart Series Queue',
    description: 'Never miss a beat. MyCinema now automatically prepares the next episode in your "Continue Watching" row for a seamless experience.',
    color: 'from-emerald-400 to-teal-500',
    iconColor: 'text-emerald-400'
  },
  {
    icon: Zap,
    title: 'Enhanced P2P Engine',
    description: 'We\'ve optimized our download logic for even faster speeds while maintaining strict privacy and security standards.',
    color: 'from-amber-400 to-orange-500',
    iconColor: 'text-amber-400'
  },
  {
    icon: Sparkles,
    title: 'Refined Experience',
    description: 'Dozens of UI polishings, faster metadata loading, and improved artwork handling for a truly cinematic feel.',
    color: 'from-pink-500 to-rose-500',
    iconColor: 'text-pink-400'
  }
]

export function WhatsNewTour() {
  const [isVisible, setIsVisible] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    // Only show if it hasn't been seen yet for this version
    const hasSeen = localStorage.getItem(WHATS_NEW_STORAGE_KEY)
    if (!hasSeen) {
      const timer = setTimeout(() => setIsVisible(true), 1000)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1)
    } else {
      finishTour()
    }
  }

  const finishTour = () => {
    localStorage.setItem(WHATS_NEW_STORAGE_KEY, 'true')
    setIsVisible(false)
  }

  if (!isVisible) return null

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6"
      >
        {/* Backdrop blur */}
        <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={finishTour} />

        <motion.div 
          initial={{ scale: 0.9, y: 20, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          exit={{ scale: 0.95, y: 10, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="relative w-full max-w-2xl overflow-hidden rounded-[2.5rem] bg-zinc-900/90 shadow-2xl border border-white/10"
        >
          {/* Decorative glows */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 0.2, scale: 1.5 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1 }}
                className={clsx(
                  "absolute -top-24 -right-24 w-96 h-96 rounded-full blur-[100px] bg-gradient-to-br",
                  STEPS[currentStep].color
                )}
              />
            </AnimatePresence>
          </div>

          <div className="relative p-8 sm:p-12">
            <div className="flex justify-between items-start mb-12">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-bold uppercase tracking-wider">New Update</span>
                  <span className="text-white/30 text-[10px] font-medium uppercase tracking-wider">Version 1.7.0</span>
                </div>
                <h1 className="text-4xl font-bold text-white tracking-tight">What's New</h1>
              </div>
              <button 
                onClick={finishTour}
                className="p-2 rounded-full bg-white/5 text-white/40 hover:text-white hover:bg-white/10 transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="min-h-[280px]">
              <AnimatePresence mode="wait">
                <motion.div 
                  key={currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.2}
                  onDragEnd={(_, info) => {
                    if (info.offset.x < -50) {
                      handleNext()
                    } else if (info.offset.x > 50 && currentStep > 0) {
                      setCurrentStep(prev => prev - 1)
                    }
                  }}
                  className="flex flex-col gap-8 cursor-grab active:cursor-grabbing"
                >
                  <div className={clsx(
                    "w-20 h-20 rounded-[2rem] bg-white/5 border border-white/10 flex items-center justify-center shadow-2xl",
                    STEPS[currentStep].iconColor
                  )}>
                    {React.createElement(STEPS[currentStep].icon, { size: 40, strokeWidth: 1.5 })}
                  </div>
                  <div className="space-y-4">
                    <h2 className="text-3xl font-semibold text-white">
                      {STEPS[currentStep].title}
                    </h2>
                    <p className="text-xl text-zinc-400 leading-relaxed font-light max-w-lg">
                      {STEPS[currentStep].description}
                    </p>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="mt-12 flex justify-between items-center">
              <div className="flex gap-1.5">
                {STEPS.map((_, idx) => (
                  <button 
                    key={idx}
                    onClick={() => setCurrentStep(idx)}
                    className={clsx(
                      "h-1.5 rounded-full transition-all duration-300",
                      idx === currentStep ? "w-8 bg-white" : "w-1.5 bg-white/20 hover:bg-white/40"
                    )}
                  />
                ))}
              </div>
              
              <div className="flex items-center gap-4">
                {currentStep < STEPS.length - 1 && (
                  <button 
                    onClick={finishTour}
                    className="text-sm font-medium text-zinc-500 hover:text-white transition-colors"
                  >
                    Skip
                  </button>
                )}
                <button
                  onClick={handleNext}
                  className={clsx(
                    "group relative inline-flex items-center gap-2 px-8 py-4 rounded-2xl overflow-hidden transition-all duration-500 font-bold",
                    currentStep === STEPS.length - 1
                      ? "bg-primary text-white shadow-[0_0_30px_rgba(var(--primary-rgb),0.3)] hover:scale-105 active:scale-95"
                      : "bg-white/10 text-white hover:bg-white/20 border border-white/10 hover:border-white/30"
                  )}
                >
                  <span>
                    {currentStep === STEPS.length - 1 ? 'Start Exploring' : 'Next Feature'}
                  </span>
                  {currentStep === STEPS.length - 1 ? (
                    <Sparkles size={18} className="animate-pulse" />
                  ) : (
                    <ChevronRight size={18} className="transition-transform group-hover:translate-x-1" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
