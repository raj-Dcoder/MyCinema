import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check, Gauge, Play, RotateCcw, Search, Settings, ShieldCheck, Sparkles, X, Zap } from 'lucide-react'
import { useTheme } from '../../theme/ThemeContext'

const YouTubeIcon: React.FC<{ size?: number; className?: string }> = ({ size = 16, className = '' }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
  </svg>
)

interface FocusTubeSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  searchSuffix: string
  onUpdateSearchSuffix: (suffix: string) => void
  hideShorts: boolean
  onToggleHideShorts: () => void
  autoplayNext: boolean
  onToggleAutoplayNext: () => void
  sortOrder: 'newest' | 'oldest'
  onToggleSortOrder: (order: 'newest' | 'oldest') => void
}

const PRESET_SUFFIXES = [
  { label: 'latest', value: 'latest', hint: 'Default: fresh weekly uploads' },
  { label: 'news this week', value: 'news this week', hint: 'Trending stories this week' },
  { label: 'today', value: 'today', hint: 'Uploads from today' },
  { label: '2026', value: '2026', hint: 'Current year content' },
  { label: 'None', value: '', hint: 'Search exact category name' },
]

const FocusTubeSettingsModal: React.FC<FocusTubeSettingsModalProps> = ({
  isOpen,
  onClose,
  searchSuffix,
  onUpdateSearchSuffix,
  hideShorts,
  onToggleHideShorts,
  autoplayNext,
  onToggleAutoplayNext,
  sortOrder,
  onToggleSortOrder,
}) => {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const [suffixInput, setSuffixInput] = useState(searchSuffix)
  const [savedSuccess, setSavedSuccess] = useState(false)
  const [preferredQuality, setPreferredQuality] = useState(() => {
    try {
      return localStorage.getItem('mycinema_ft_preferred_quality') || 'auto'
    } catch {
      return 'auto'
    }
  })
  const [ambientGlow, setAmbientGlow] = useState(() => {
    try {
      const saved = localStorage.getItem('mycinema_ft_ambient_mode')
      return saved !== null ? saved === 'true' : true
    } catch {
      return true
    }
  })
  const [hwDecode, setHwDecode] = useState(false)
  const [initialHwDecode, setInitialHwDecode] = useState(false)
  const [needsRelaunch, setNeedsRelaunch] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    window.api?.getAppSettings?.().then((settings) => {
      const enabled = Boolean(settings?.hardwareVideoDecoding)
      setHwDecode(enabled)
      setInitialHwDecode(enabled)
    }).catch(() => {})
  }, [isOpen])

  const handleHwDecodeToggle = async () => {
    const next = !hwDecode
    setHwDecode(next)
    setNeedsRelaunch(next !== initialHwDecode)
    try {
      await window.api?.setHardwareVideoDecoding?.(next)
      setSavedSuccess(true)
      setTimeout(() => setSavedSuccess(false), 2000)
    } catch (err) {
      console.error('Failed to update hardware decoding setting:', err)
    }
  }

  const handleQualityChange = (q: string) => {
    setPreferredQuality(q)
    try {
      localStorage.setItem('mycinema_ft_preferred_quality', q)
    } catch {}
  }

  const handleAmbientToggle = () => {
    const next = !ambientGlow
    setAmbientGlow(next)
    try {
      localStorage.setItem('mycinema_ft_ambient_mode', String(next))
    } catch {}
  }

  useEffect(() => {
    setSuffixInput(searchSuffix)
  }, [searchSuffix, isOpen])

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const sampleCategory = 'Artificial Intelligence'
  const previewQuery = suffixInput.trim() ? `${sampleCategory} ${suffixInput.trim()}` : sampleCategory

  const handleSave = () => {
    onUpdateSearchSuffix(suffixInput.trim())
    setSavedSuccess(true)
    setTimeout(() => {
      setSavedSuccess(false)
      onClose()
    }, 400)
  }

  const handleResetDefault = () => {
    setSuffixInput('latest')
    onUpdateSearchSuffix('latest')
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="focustube-settings-title"
      className={`fixed inset-0 z-[1000] flex items-center justify-center p-4 animate-in fade-in duration-150 ${
        isLight ? 'bg-slate-900/40 backdrop-blur-sm' : 'bg-black/80 backdrop-blur-md'
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className={`relative flex max-h-[calc(100vh-4rem)] w-full max-w-xl flex-col overflow-hidden rounded-3xl shadow-2xl transition-all ${
          isLight
            ? 'border border-slate-200/90 bg-white text-slate-800 shadow-slate-900/15'
            : 'border border-white/10 bg-[#0f1118] text-white shadow-black/80'
        }`}
      >
        {/* Header */}
        <div className={`relative shrink-0 flex items-center justify-between border-b px-6 py-5 ${
          isLight ? 'border-slate-100 bg-slate-50/50' : 'border-white/[0.08] bg-white/[0.02]'
        }`}>
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary border border-primary/25 shadow-sm">
              <Settings size={20} strokeWidth={2.2} />
            </div>
            <div>
              <h2 id="focustube-settings-title" className={`text-base font-black tracking-tight ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}>
                FocusTube Settings
              </h2>
              <p className={`text-xs font-medium ${isLight ? 'text-slate-500' : 'text-white/40'}`}>
                Preferences and search customization for your rooms
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className={`rounded-full p-2 transition-colors ${
              isLight
                ? 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                : 'text-white/40 hover:bg-white/10 hover:text-white'
            }`}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Section 1: YouTube Search Behavior */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-red-500/15 text-red-500">
                <YouTubeIcon size={14} />
              </div>
              <h3 className={`text-xs font-bold uppercase tracking-wider ${
                isLight ? 'text-slate-700' : 'text-white/70'
              }`}>
                Category Search Behavior (Right-Click)
              </h3>
            </div>

            <div className={`rounded-2xl p-4 border transition-all ${
              isLight ? 'border-slate-200/80 bg-slate-50/70' : 'border-white/[0.08] bg-white/[0.02]'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Default Search Extension Suffix
                  </h4>
                  <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-white/50'}`}>
                    Automatically added to the query when right-clicking any category pill to search YouTube.
                  </p>
                </div>

                {suffixInput.trim().toLowerCase() !== 'latest' && (
                  <button
                    type="button"
                    onClick={handleResetDefault}
                    title="Reset to default (latest)"
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition-colors ${
                      isLight ? 'text-slate-500 hover:text-primary hover:bg-primary/10' : 'text-white/40 hover:text-primary hover:bg-white/10'
                    }`}
                  >
                    <RotateCcw size={11} />
                    <span>Reset</span>
                  </button>
                )}
              </div>

              {/* Suffix input */}
              <div className="mt-3.5 space-y-3">
                <div className="relative flex items-center">
                  <Search size={14} className={`pointer-events-none absolute left-3.5 ${isLight ? 'text-slate-400' : 'text-white/40'}`} />
                  <input
                    type="text"
                    value={suffixInput}
                    onChange={(e) => setSuffixInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSave()
                    }}
                    placeholder="e.g. latest, news this week, 2026"
                    className={`h-10 w-full rounded-xl pl-9 pr-3 text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary/25 ${
                      isLight
                        ? 'border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-primary'
                        : 'border border-white/15 bg-black/40 text-white placeholder:text-white/30 focus:border-primary focus:bg-black/60'
                    }`}
                  />
                </div>

                {/* Quick preset buttons */}
                <div>
                  <span className={`text-[11px] font-semibold ${isLight ? 'text-slate-500' : 'text-white/40'}`}>
                    Presets:
                  </span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {PRESET_SUFFIXES.map((preset) => {
                      const isSelected = suffixInput.trim().toLowerCase() === preset.value.toLowerCase()
                      return (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => setSuffixInput(preset.value)}
                          title={preset.hint}
                          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                            isSelected
                              ? 'bg-primary text-white shadow-sm'
                              : isLight
                              ? 'border border-slate-200/90 bg-white text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                              : 'border border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          {preset.value ? `+${preset.label}` : preset.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Query preview */}
                <div className={`rounded-xl p-2.5 text-xs border ${
                  isLight ? 'border-slate-200/90 bg-white' : 'border-white/[0.08] bg-black/30'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-medium ${isLight ? 'text-slate-500' : 'text-white/40'}`}>
                      Preview:
                    </span>
                    <span className={`font-semibold ${isLight ? 'text-slate-700' : 'text-white/60'}`}>
                      Right-click &ldquo;{sampleCategory}&rdquo;
                    </span>
                    <span className={isLight ? 'text-slate-300' : 'text-white/30'}>➔</span>
                    <span className="font-bold text-primary truncate bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-md">
                      &ldquo;{previewQuery}&rdquo;
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Feed & Playback Preferences */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Sparkles size={14} />
              </div>
              <h3 className={`text-xs font-bold uppercase tracking-wider ${
                isLight ? 'text-slate-700' : 'text-white/70'
              }`}>
                Feed & Playback Defaults
              </h3>
            </div>

            <div className={`rounded-2xl border divide-y overflow-hidden ${
              isLight
                ? 'border-slate-200/80 bg-slate-50/70 divide-slate-200/70'
                : 'border-white/[0.08] bg-white/[0.02] divide-white/[0.06]'
            }`}>
              {/* Hide Shorts Toggle */}
              <div className="flex items-center justify-between p-4 gap-4">
                <div>
                  <h4 className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Hide YouTube Shorts
                  </h4>
                  <p className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-white/40'}`}>
                    Filter out vertical short videos from your category feeds & search results
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onToggleHideShorts}
                  aria-pressed={hideShorts}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    hideShorts ? 'bg-primary' : isLight ? 'bg-slate-300' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      hideShorts ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Autoplay Next Toggle */}
              <div className="flex items-center justify-between p-4 gap-4">
                <div>
                  <h4 className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Autoplay Next in Queue
                  </h4>
                  <p className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-white/40'}`}>
                    Automatically transition to the next unseen video when current video completes
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onToggleAutoplayNext}
                  aria-pressed={autoplayNext}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    autoplayNext ? 'bg-primary' : isLight ? 'bg-slate-300' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      autoplayNext ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Feed Sort Order */}
              <div className="flex items-center justify-between p-4 gap-4">
                <div>
                  <h4 className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Default Feed Sort
                  </h4>
                  <p className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-white/40'}`}>
                    Display uploads ordered from newest to oldest or reverse
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onToggleSortOrder('newest')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                      sortOrder === 'newest'
                        ? 'bg-primary text-white shadow-sm'
                        : isLight
                        ? 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                    }`}
                  >
                    <ArrowDownWideNarrow size={12} />
                    <span>Newest</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleSortOrder('oldest')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                      sortOrder === 'oldest'
                        ? 'bg-primary text-white shadow-sm'
                        : isLight
                        ? 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                    }`}
                  >
                    <ArrowUpNarrowWide size={12} />
                    <span>Oldest</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Smooth Playback & Video Quality */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-500">
                <Gauge size={14} />
              </div>
              <h3 className={`text-xs font-bold uppercase tracking-wider ${
                isLight ? 'text-slate-700' : 'text-white/70'
              }`}>
                Playback Smoothness & Quality
              </h3>
            </div>

            <div className={`rounded-2xl border divide-y overflow-hidden ${
              isLight
                ? 'border-slate-200/80 bg-slate-50/70 divide-slate-200/70'
                : 'border-white/[0.08] bg-white/[0.02] divide-white/[0.06]'
            }`}>
              {/* Preferred Playback Quality */}
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h4 className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      Target Video Quality
                    </h4>
                    <p className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-white/40'}`}>
                      Select your preferred resolution. Auto adapts to your network for jitter-free 60 FPS playback.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'auto', label: 'Auto (60 FPS)', hint: 'Adaptive & smoothest' },
                    { id: 'hd1080', label: '1080p Full HD', hint: 'Crystal sharp' },
                    { id: 'hd720', label: '720p HD', hint: 'Balanced' },
                    { id: 'medium', label: 'Data Saver', hint: '480p bandwidth saver' }
                  ].map((q) => {
                    const isSelected = preferredQuality === q.id
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => handleQualityChange(q.id)}
                        className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all ${
                          isSelected
                            ? 'border-primary bg-primary/10 text-primary shadow-sm'
                            : isLight
                            ? 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                            : 'border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <span className="text-xs font-bold">{q.label}</span>
                        <span className={`text-[10px] mt-0.5 ${isSelected ? 'text-primary/80 font-medium' : isLight ? 'text-slate-400' : 'text-white/40'}`}>
                          {q.hint}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Ambient Glow Theater Lighting */}
              <div className="flex items-center justify-between p-4 gap-4">
                <div>
                  <h4 className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    Ambient Glow Theater Lighting
                  </h4>
                  <p className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-white/40'}`}>
                    Softly project matching real-time scene colors around the theater backdrop
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAmbientToggle}
                  aria-pressed={ambientGlow}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    ambientGlow ? 'bg-primary' : isLight ? 'bg-slate-300' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      ambientGlow ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Hardware Accelerated Video Decoding Toggle */}
              <div className="flex items-center justify-between p-4 gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      Hardware-Accelerated Video Decoding
                    </h4>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      hwDecode
                        ? (isLight ? 'bg-amber-100 text-amber-800' : 'bg-amber-500/20 text-amber-300')
                        : (isLight ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-500/20 text-emerald-300')
                    }`}>
                      {hwDecode ? 'GPU D3D11 Active' : 'Buffer-Safe (Recommended)'}
                    </span>
                  </div>
                  <p className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-white/40'}`}>
                    {hwDecode
                      ? 'ON: Uses GPU hardware decoder. If you experience buffering on Windows, turn this OFF.'
                      : 'OFF (Recommended): Uses software VP9/AV1 decoding to completely eliminate playback buffering and D3D11 stalls.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleHwDecodeToggle}
                  aria-pressed={hwDecode}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    hwDecode ? 'bg-amber-500' : isLight ? 'bg-slate-300' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                      hwDecode ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Relaunch Banner when HW decode setting is changed */}
              {needsRelaunch && (
                <div className={`mx-4 mb-4 flex items-center justify-between p-3 rounded-xl border ${
                  isLight ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                }`}>
                  <div className="flex items-center gap-2 text-xs">
                    <RotateCcw size={14} className="shrink-0 animate-spin-slow" />
                    <span>Relaunch required to apply decoder changes.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => window.api?.relaunchApp?.()}
                    className="px-3 py-1 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer"
                  >
                    Relaunch Now
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`shrink-0 flex items-center justify-between border-t px-6 py-4 ${
          isLight ? 'border-slate-100 bg-slate-50/50' : 'border-white/[0.08] bg-white/[0.02]'
        }`}>
          <div className="text-[11px] font-medium text-white/40">
            {savedSuccess && (
              <span className="text-emerald-500 font-bold flex items-center gap-1">
                <Check size={13} /> Settings saved!
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
                isLight
                  ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                  : 'border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-[0_0_15px_rgba(var(--c-accent),0.4)] transition-all hover:bg-primary/90"
            >
              <Check size={14} strokeWidth={2.5} />
              <span>Save & Apply</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export default React.memo(FocusTubeSettingsModal)
