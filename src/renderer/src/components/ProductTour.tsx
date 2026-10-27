import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'

// ─── Product tour (spotlight coachmarks) ────────────────────────────────────
// Industry-standard guided tour: dim the app, cut a spotlight hole around the
// real control, and explain it in one plain sentence. One idea per step, max
// 5 steps, last step ends at the off-switch / Settings so the user knows how
// to undo. See RELEASE_GUIDE.md Step 5B for when and how to add a tour.
//
// Anchors are plain DOM attributes: data-tour="some-id" on the target
// element. The tour resolves them at runtime, so pages stay clean.

export interface TourStep {
  id: string
  /** App tab (AppTab in App.tsx) where the target lives. Tour navigates there. */
  tab: string
  /** data-tour attribute value of the target element. */
  target: string
  /** 6 words or fewer. */
  title: string
  /** One plain sentence: what this is + what to do. */
  body: string
  /** Next-button label. Defaults to "Next", last step defaults to "Done". */
  cta?: string
}

export interface ProductTourDef {
  id: string
  steps: TourStep[]
}

export const getTourStorageKey = (tourId: string) => `mycinema_tour_seen_${tourId}`

export const isTourSeen = (tourId: string): boolean => {
  try {
    return localStorage.getItem(getTourStorageKey(tourId)) === 'true'
  } catch {
    return false
  }
}

export const markTourSeen = (tourId: string): void => {
  try {
    localStorage.setItem(getTourStorageKey(tourId), 'true')
  } catch {
    /* ignore */
  }
}

// ─── Tour registry ──────────────────────────────────────────────────────────
// Release process: add a tour here only for releases that introduce a new
// tab, screen, or workflow the user must be walked to. Then set
// LATEST_RELEASE.tourId to the tour id. Single static hints still belong in
// FeatureGuides.tsx (InlineFeatureGuide).

export const TOURS: Record<string, ProductTourDef> = {
  'focus-tube': {
    id: 'focus-tube',
    steps: [
      {
        id: 'tab',
        tab: 'home',
        target: 'sidebar-focustube',
        title: 'Meet Focus Tube',
        body: 'A new tab for YouTube, built around channels you pick. No algorithmic feed.',
        cta: 'Open it',
      },
      {
        id: 'channels',
        tab: 'focustube',
        target: 'focustube-channels',
        title: 'Add your channels',
        body: 'Tap Channels and subscribe. New uploads from them land in your stack.',
      },
      {
        id: 'categories',
        tab: 'focustube',
        target: 'focustube-categories',
        title: 'File them in categories',
        body: 'Make rooms like Tech or Music. Double-click to rename, drag to reorder.',
      },
      {
        id: 'feed',
        tab: 'focustube',
        target: 'focustube-feed',
        title: 'Watch your stack',
        body: 'Newest first, unseen only. Click any card to start watching.',
      },
      {
        id: 'settings',
        tab: 'settings',
        target: 'settings-focustube',
        title: 'You control it',
        body: 'This switch hides the tab and stops refresh. Your channels stay saved.',
      },
    ],
  },
}

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

interface ProductTourProps {
  tour: ProductTourDef
  onNavigate: (tab: string) => void
  onDone: () => void
}

const TOOLTIP_WIDTH = 300
const TOOLTIP_GAP = 12
const RESOLVE_TIMEOUT_MS = 1200
// Breathing room: after the target settles on screen, wait a beat before the
// spotlight + card fade in, so each step lands softly instead of flashing.
const STEP_SETTLE_PAUSE_MS = 600

const ProductTour: React.FC<ProductTourProps> = ({ tour, onNavigate, onDone }) => {
  const [stepIdx, setStepIdx] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const step = tour.steps[stepIdx]
  const isLast = stepIdx === tour.steps.length - 1
  const stepRef = useRef(step)
  stepRef.current = step

  const finish = useCallback(
    (persist: boolean) => {
      if (persist) markTourSeen(tour.id)
      onDone()
    },
    [tour.id, onDone],
  )

  const goToStep = useCallback(
    (idx: number) => {
      if (idx >= tour.steps.length) {
        finish(true)
        return
      }
      if (idx < 0) return
      const next = tour.steps[idx]
      onNavigate(next.tab)
      setRect(null)
      setStepIdx(idx)
    },
    [tour.steps, onNavigate, finish],
  )

  // Resolve the target element, wait briefly for tab switches to render, then
  // measure it. If the target never appears (e.g. feature switched off),
  // skip the step instead of stranding the user.
  useLayoutEffect(() => {
    let raf = 0
    let timer = 0
    let disposed = false
    const startedAt = performance.now()

    // Soft reveal: hold the dim for a beat so the tab settles first.
    const show = (top: number, left: number, width: number, height: number) => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (!disposed) setRect({ top, left, width, height })
      }, STEP_SETTLE_PAUSE_MS)
    }

    const resolve = () => {
      if (disposed) return
      const el = document.querySelector(`[data-tour="${stepRef.current.target}"]`) as HTMLElement | null
      if (!el) {
        if (performance.now() - startedAt > RESOLVE_TIMEOUT_MS) {
          goToStep(stepIdx + 1)
          return
        }
        raf = requestAnimationFrame(resolve)
        return
      }
      // Center instantly (no smooth race), then poll until the rect settles
      // inside the viewport. The old 120ms-fixed measure fired mid-scroll,
      // which left deep targets (e.g. Settings toggle) below the fold while
      // the tooltip already showed.
      try {
        el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' })
      } catch {
        /* ignore */
      }
      const settleStart = performance.now()
      let lastTop = Number.POSITIVE_INFINITY
      const settle = () => {
        if (disposed) return
        const r = el.getBoundingClientRect()
        if (r.width <= 0 || r.height <= 0) {
          goToStep(stepIdx + 1)
          return
        }
        const inView = r.bottom > 0 && r.top < window.innerHeight
        const moved = Math.abs(r.top - lastTop)
        lastTop = r.top
        if (inView && moved < 2) {
          show(r.top, r.left, r.width, r.height)
          return
        }
        // Still scrolling or still off-screen (tab just mounted) — nudge again.
        try {
          el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' })
        } catch {
          /* ignore */
        }
        if (performance.now() - settleStart > 1500) {
          // Give up waiting but still spotlight where it actually is.
          show(r.top, r.left, r.width, r.height)
          return
        }
        raf = requestAnimationFrame(settle)
      }
      raf = requestAnimationFrame(settle)
    }

    raf = requestAnimationFrame(resolve)
    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      window.clearTimeout(timer)
    }
  }, [stepIdx, goToStep])

  // Keep the spotlight glued to the target: scroll/resize plus live tracking
  // for async layout (e.g. the Channels button widening when its count loads
  // in after we first measured it).
  useEffect(() => {
    if (!rect) return
    const target = step.target
    const remeasure = () => {
      const el = document.querySelector(`[data-tour="${target}"]`) as HTMLElement | null
      if (!el) return
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) return
      setRect((prev) => {
        if (
          prev &&
          Math.abs(prev.top - r.top) < 1 &&
          Math.abs(prev.left - r.left) < 1 &&
          Math.abs(prev.width - r.width) < 1 &&
          Math.abs(prev.height - r.height) < 1
        ) {
          return prev
        }
        return { top: r.top, left: r.left, width: r.width, height: r.height }
      })
    }
    let ro: ResizeObserver | null = null
    try {
      const el = document.querySelector(`[data-tour="${target}"]`) as HTMLElement | null
      if (el && typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(remeasure)
        ro.observe(el)
      }
    } catch {
      /* ignore */
    }
    const iv = window.setInterval(remeasure, 400)
    window.addEventListener('resize', remeasure)
    window.addEventListener('scroll', remeasure, true)
    remeasure()
    return () => {
      window.clearInterval(iv)
      window.removeEventListener('resize', remeasure)
      window.removeEventListener('scroll', remeasure, true)
      try {
        ro?.disconnect()
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rect !== null, step.target])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(true)
      if (e.key === 'ArrowRight') goToStep(stepIdx + 1)
      if (e.key === 'ArrowLeft') goToStep(stepIdx - 1)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [stepIdx, goToStep, finish])

  if (!step) return null

  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1024
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 768

  // While resolving, show a light dim layer so the app doesn't flash.
  if (!rect) {
    return <div className="fixed inset-0 z-[300] bg-black/45 animate-in fade-in duration-200" aria-hidden="true" />
  }

  const pad = 6
  const hl = {
    top: Math.max(4, rect.top - pad),
    left: Math.max(4, rect.left - pad),
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  }

  const preferBelow = hl.top + hl.height + TOOLTIP_GAP + 220 <= viewportH
  const tooltipTop = preferBelow ? hl.top + hl.height + TOOLTIP_GAP : hl.top - TOOLTIP_GAP - 190
  const tooltipLeft = Math.max(12, Math.min(hl.left + hl.width / 2 - TOOLTIP_WIDTH / 2, viewportW - TOOLTIP_WIDTH - 12))

  return (
    <div
      className="fixed inset-0 z-[300] animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label={`Tour: ${step.title}`}
      onClick={() => finish(true)}
    >
      {/* Single-layer spotlight: the hole stays fully clear so the real
          control shines, everything else gets one soft dim — never double. */}
      <div
        className="pointer-events-none absolute rounded-xl border border-white/30 bg-transparent"
        style={{
          top: hl.top,
          left: hl.left,
          width: hl.width,
          height: hl.height,
          boxShadow:
            '0 0 0 9999px rgba(0,0,0,0.45), 0 0 32px rgba(255,255,255,0.10)',
        }}
        aria-hidden="true"
      />

      {/* Tooltip card — remounts per step so it cleanly fades in each time */}
      <div
        key={step.id}
        onClick={(e) => e.stopPropagation()}
        className="absolute rounded-xl border border-white/10 bg-[#0d141d] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.6)] animate-in fade-in duration-200"
        style={{ top: Math.max(12, tooltipTop), left: tooltipLeft, width: TOOLTIP_WIDTH }}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">
            Step {stepIdx + 1} of {tour.steps.length}
          </p>
          <button
            onClick={() => finish(true)}
            className="rounded-md p-1 text-white/35 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Skip tour"
            title="Skip tour"
          >
            <X size={13} />
          </button>
        </div>
        <h3 className="mt-1.5 text-[14px] font-bold tracking-tight text-white">{step.title}</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-white/55">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            onClick={() => goToStep(stepIdx - 1)}
            disabled={stepIdx === 0}
            className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-[12px] font-semibold text-white/50 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-30"
          >
            <ArrowLeft size={13} />
            Back
          </button>
          <div className="flex items-center gap-2">
            {!isLast && (
              <button
                onClick={() => finish(true)}
                className="rounded-lg px-3 py-2 text-[12px] font-semibold text-white/45 transition-colors hover:text-white"
              >
                Skip
              </button>
            )}
            <button
              onClick={() => goToStep(stepIdx + 1)}
              className="inline-flex items-center gap-1 rounded-lg bg-white px-4 py-2 text-[12px] font-bold text-black transition-colors hover:bg-white/85"
            >
              {isLast ? 'Done' : step.cta || 'Next'}
              {!isLast && <ArrowRight size={13} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ProductTour
