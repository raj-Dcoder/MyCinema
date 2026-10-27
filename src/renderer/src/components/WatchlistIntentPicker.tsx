import React, { useEffect, useState } from 'react'
import { Bookmark, CalendarDays, Check, Hourglass, Loader2, Trash2, X, Zap } from 'lucide-react'
import type { WatchlistIntent } from '../types'
import { WATCHLIST_INTENT_META } from '../utils/watchlistIntent'

interface WatchlistIntentPickerProps {
  open: boolean
  currentIntent?: WatchlistIntent | null
  title?: string
  subtitle?: string
  posterUrl?: string | null
  busyIntent?: WatchlistIntent | null
  busy?: boolean
  removing?: boolean
  onSelect: (intent: WatchlistIntent) => void
  onRemove?: () => void
  onClose: () => void
}

const INTENT_ICON: Record<WatchlistIntent, React.ReactNode> = {
  asap: <Zap size={20} fill="currentColor" />,
  weekend: <CalendarDays size={20} />,
  someday: <Hourglass size={20} />
}

const INTENT_TILE: Record<WatchlistIntent, string> = {
  asap: 'bg-gradient-to-br from-red-500 to-orange-500 text-white shadow-[0_8px_24px_rgba(239,68,68,0.45)]',
  weekend: 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-[0_8px_24px_rgba(139,92,246,0.45)]',
  someday: 'bg-gradient-to-br from-teal-400 to-emerald-600 text-white shadow-[0_8px_24px_rgba(20,184,166,0.4)]'
}

const INTENT_ROW_ACTIVE: Record<WatchlistIntent, string> = {
  asap: 'border-red-500/60 bg-red-500/[0.09] shadow-[0_12px_36px_rgba(239,68,68,0.18)]',
  weekend: 'border-violet-400/60 bg-violet-500/[0.09] shadow-[0_12px_36px_rgba(139,92,246,0.2)]',
  someday: 'border-teal-300/50 bg-teal-400/[0.08] shadow-[0_12px_36px_rgba(20,184,166,0.16)]'
}

const INTENT_COPY: Record<WatchlistIntent, { headline: string; detail: string }> = {
  asap: {
    headline: 'Watch as soon as possible',
    detail: 'Tonight or tomorrow — jumps to the very top of your queue.'
  },
  weekend: {
    headline: 'Save for the upcoming weekend',
    detail: 'Friday-night fuel. Binge it when the week finally ends.'
  },
  someday: {
    headline: 'Someday, when nothing else calls',
    detail: 'No date, no pressure — the rainy-day stash.'
  }
}

const SHORTCUTS: Record<WatchlistIntent, string> = { asap: '1', weekend: '2', someday: '3' }
const ORDER: WatchlistIntent[] = ['asap', 'weekend', 'someday']

const WatchlistIntentPicker: React.FC<WatchlistIntentPickerProps> = ({
  open,
  currentIntent,
  title,
  subtitle,
  posterUrl,
  busyIntent,
  busy,
  removing,
  onSelect,
  onRemove,
  onClose
}) => {
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    if (!open) {
      setEntered(false)
      return
    }
    const frame = window.requestAnimationFrame(() => setEntered(true))
    return () => window.cancelAnimationFrame(frame)
  }, [open ])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
        return
      }
      if (busy || removing) return
      const lower = e.key.toLowerCase()
      if (lower === '1') onSelect('asap')
      else if (lower === '2') onSelect('weekend')
      else if (lower === '3') onSelect('someday')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, removing, onSelect, onClose])

  if (!open) return null

  const isBusy = Boolean(busy)
  const showRemove = Boolean(currentIntent && onRemove)

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Save to watchlist"
    >
      <button
        aria-label="Close watchlist picker"
        onClick={onClose}
        className={`absolute inset-0 bg-black/70 backdrop-blur-md transition-opacity duration-200 ${entered ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        className={`relative w-full max-w-[448px] overflow-hidden rounded-[28px] border border-white/10 bg-[#0d121c]/95 shadow-[0_32px_96px_rgba(0,0,0,0.7)] backdrop-blur-2xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          entered ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-6 scale-[0.96] opacity-0'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Ambient glows */}
        <div className="pointer-events-none absolute -left-20 -top-24 h-56 w-56 rounded-full bg-red-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 top-10 h-56 w-56 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-teal-500/10 blur-3xl" />

        {/* Header */}
        <div className="relative flex items-start gap-3.5 border-b border-white/[0.07] bg-white/[0.02] px-5 pb-4 pt-5">
          {posterUrl ? (
            <img
              src={posterUrl}
              alt=""
              className="h-[68px] w-[48px] shrink-0 rounded-xl object-cover ring-1 ring-white/15"
            />
          ) : (
            <div className="flex h-[68px] w-[48px] shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/25">
              <Bookmark size={20} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-[0.24em] text-white/40">
              {currentIntent ? 'In your watchlist' : 'Save to watchlist'}
            </p>
            <h3 className="mt-1 truncate text-[16px] font-black tracking-tight text-white">
              {title || 'This title'}
            </h3>
            <p className="mt-0.5 truncate text-[11px] font-semibold text-white/40">
              {subtitle || 'Pick when you want to watch it'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-full bg-white/5 p-2 text-white/55 ring-1 ring-white/10 transition-all hover:bg-white/10 hover:text-white active:scale-95"
            title="Close"
          >
            <X size={15} />
          </button>
        </div>

        {/* Options */}
        <div className="relative space-y-2.5 p-4 sm:p-5">
          {ORDER.map((intent, index) => {
            const meta = WATCHLIST_INTENT_META[intent]
            const copy = INTENT_COPY[intent]
            const isCurrent = currentIntent === intent
            const isLoading = busyIntent === intent && isBusy
            return (
              <button
                key={intent}
                onClick={() => onSelect(intent)}
                disabled={isBusy || removing}
                aria-pressed={isCurrent}
                style={{ transitionDelay: entered ? `${60 + index * 55}ms` : '0ms' }}
                className={`group flex w-full items-center gap-3.5 rounded-2xl border p-3.5 text-left transition-all duration-300 active:scale-[0.985] disabled:cursor-wait ${
                  entered ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
                } ${
                  isCurrent
                    ? INTENT_ROW_ACTIVE[intent]
                    : 'border-white/[0.08] bg-white/[0.03] hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.06]'
                } disabled:hover:translate-y-0`}
              >
                <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-105 ${INTENT_TILE[intent]}`}>
                  {isLoading ? <Loader2 size={20} className="animate-spin" /> : INTENT_ICON[intent]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[13px] font-black uppercase tracking-[0.12em] text-white">
                      {meta.label}
                    </span>
                    {isCurrent && (
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.18em] text-white/70 ring-1 ring-white/15">
                        Current
                      </span>
                    )}
                    <span className="ml-auto hidden rounded-md border border-white/10 bg-black/30 px-1.5 py-0.5 text-[9px] font-black text-white/35 sm:block">
                      {SHORTCUTS[intent]}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] font-bold text-white/75">
                    {copy.headline}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-[11px] font-medium leading-snug text-white/40">
                    {copy.detail}
                  </span>
                </span>
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all ${
                    isCurrent
                      ? 'border-transparent bg-white text-black'
                      : 'border-white/15 text-transparent group-hover:border-white/30'
                  }`}
                >
                  <Check size={14} strokeWidth={3.5} />
                </span>
              </button>
            )
          })}

          <p className="px-1 pt-1 text-center text-[10px] font-semibold text-white/30">
            Press <span className="font-black text-white/50">1 · 2 · 3</span> to file instantly — change it anytime from the title or the Watchlist tab.
          </p>
        </div>

        {/* Footer */}
        {showRemove && (
          <div className="relative border-t border-white/[0.07] bg-black/20 px-4 py-3 sm:px-5">
            <button
              onClick={onRemove}
              disabled={isBusy || removing}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-red-300/90 transition-all hover:bg-red-500/[0.12] hover:text-red-200 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
            >
              {removing ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Remove from watchlist
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default WatchlistIntentPicker
