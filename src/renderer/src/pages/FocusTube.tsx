import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, CheckCheck, Compass, Eye, EyeOff, GripVertical, Layers, Plus, RefreshCw, Search, SlidersHorizontal, Sparkles, Users, X } from 'lucide-react'
import type { FtCategory, FtVideo } from '../types'
import FocusTubeCard from '../components/focus/FocusTubeCard'
import FocusTubePlayer from '../components/focus/FocusTubePlayer'
import ChannelManager from '../components/focus/ChannelManager'
import { categoryDot, formatAgo, formatPublishedExact } from '../utils/focusTube'

const HIDE_SHORTS_KEY = 'mycinema_ft_hide_shorts'
const AUTOPLAY_NEXT_KEY = 'mycinema_ft_autoplay_next'

const FocusTube: React.FC = () => {
  const [categories, setCategories] = useState<FtCategory[]>([])
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null)
  const [videos, setVideos] = useState<FtVideo[]>([])
  const [latestPublished, setLatestPublished] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [hideShorts, setHideShorts] = useState(() => {
    try {
      return localStorage.getItem(HIDE_SHORTS_KEY) === '1'
    } catch {
      return false
    }
  })
  const [includeSeen, setIncludeSeen] = useState(false)
  const [search, setSearch] = useState('')
  // Player-only autoplay: when ON, finishing a video auto-plays the next
  // unseen video in the current stack instead of closing. Toggled only from
  // inside FocusTubePlayer; persisted here so the queue can advance.
  const [autoplayNext, setAutoplayNext] = useState(() => {
    try {
      return localStorage.getItem(AUTOPLAY_NEXT_KEY) === '1'
    } catch {
      return false
    }
  })

  const [newCategoryName, setNewCategoryName] = useState<string | null>(null)
  // Which pill is awaiting delete confirmation (first click arms, second confirms).
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  // Which pill is being renamed via double-click.
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [managing, setManaging] = useState(false)
  const [totalChannels, setTotalChannels] = useState(0)
  const [playing, setPlaying] = useState<{ video: FtVideo; startSeconds: number } | null>(null)

  // ── Press-and-hold drag-to-reorder for category pills ───────────────────
  // Touch: hold ~450ms (scroll still works until then), then drag left/right.
  // Mouse: drag starts after a small move. Mirrors the Collections pattern.
  const pillRefs = useRef(new Map<number, HTMLDivElement>())
  const [dragId, setDragId] = useState<number | null>(null)
  const ghostRef = useRef<HTMLDivElement | null>(null)
  const latestPoint = useRef<{ x: number; y: number } | null>(null)
  const rafRef = useRef<number | null>(null)
  const rectCache = useRef(new Map<number, { cx: number; cy: number; w: number; h: number }>())
  const rectsDirty = useRef(true)
  const pressRef = useRef<{ id: number; x: number; y: number; pointerId: number; element: HTMLDivElement } | null>(null)
  const pressTimer = useRef<number | null>(null)
  const dragIdRef = useRef<number | null>(null)
  const categoriesRef = useRef<FtCategory[]>(categories)
  categoriesRef.current = categories
  const orderChangedRef = useRef(false)
  const suppressClick = useRef(false)

  const clearPillPressTimer = () => {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  const cancelPillReorderRaf = () => {
    if (rafRef.current != null) {
      window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }

  const positionPillGhost = (x: number, y: number) => {
    const ghost = ghostRef.current
    if (ghost) {
      ghost.style.transform = `translate(${x - 60}px, ${y - 20}px) rotate(2deg) scale(1.05)`
    }
  }

  const refreshPillRectCache = () => {
    rectCache.current.clear()
    pillRefs.current.forEach((el, id) => {
      const rect = el.getBoundingClientRect()
      rectCache.current.set(id, {
        cx: rect.left + rect.width / 2,
        cy: rect.top + rect.height / 2,
        w: rect.width,
        h: rect.height,
      })
    })
  }

  const activatePillDrag = (pointerId: number) => {
    const press = pressRef.current
    if (!press || dragIdRef.current != null) return
    dragIdRef.current = press.id
    orderChangedRef.current = false
    try {
      press.element.setPointerCapture(pointerId)
    } catch { /* noop */ }
    try {
      ;(navigator as any).vibrate?.(25)
    } catch { /* noop */ }
    rectsDirty.current = true
    latestPoint.current = { x: press.x, y: press.y }
    setDragId(press.id)
  }

  const computePillInsertionIndex = (x: number, y: number, excludeId: number): number => {
    const order = categoriesRef.current.map((c) => c.id).filter((id) => id !== excludeId)
    let index = 0
    for (const id of order) {
      const cached = rectCache.current.get(id)
      if (!cached) {
        index += 1
        continue
      }
      const sameRow = Math.abs(y - cached.cy) <= cached.h / 2
      if (y > cached.cy + cached.h * 0.2 || (sameRow && x > cached.cx)) {
        index += 1
      } else {
        break
      }
    }
    return Math.max(0, Math.min(order.length, index))
  }

  const runPillReorderPass = () => {
    rafRef.current = null
    const pt = latestPoint.current
    const draggedId = dragIdRef.current
    if (!pt || draggedId == null) return
    if (rectsDirty.current) {
      refreshPillRectCache()
      rectsDirty.current = false
    }
    const others = categoriesRef.current.map((c) => c.id).filter((id) => id !== draggedId)
    const index = computePillInsertionIndex(pt.x, pt.y, draggedId)
    const next = [...others.slice(0, index), draggedId, ...others.slice(index)]
    const prev = categoriesRef.current.map((c) => c.id)
    if (next.some((id, i) => id !== prev[i])) {
      orderChangedRef.current = true
      const byId = new Map(categoriesRef.current.map((c) => [c.id, c]))
      setCategories(next.map((id) => byId.get(id)!).filter(Boolean))
      rectsDirty.current = true
    }
  }

  const schedulePillReorderPass = () => {
    if (rafRef.current != null) return
    rafRef.current = window.requestAnimationFrame(runPillReorderPass)
  }

  const onPillPointerDown = (e: React.PointerEvent<HTMLDivElement>, id: number) => {
    if (!e.isPrimary) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    pressRef.current = { id, x: e.clientX, y: e.clientY, pointerId: e.pointerId, element: e.currentTarget }
    if (e.pointerType !== 'mouse') {
      clearPillPressTimer()
      pressTimer.current = window.setTimeout(() => activatePillDrag(e.pointerId), 450)
    }
  }

  const onPillPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const press = pressRef.current
    if (!press || e.pointerId !== press.pointerId) return
    const dx = e.clientX - press.x
    const dy = e.clientY - press.y
    const dist = Math.hypot(dx, dy)

    if (dragIdRef.current == null) {
      if (e.pointerType === 'mouse') {
        if (dist < 8) return
        activatePillDrag(e.pointerId)
      } else {
        // Touch moving before hold completes = scrolling, abort the pickup.
        if (dist > 12) {
          clearPillPressTimer()
          pressRef.current = null
        }
        return
      }
    }

    if (dragIdRef.current == null) return
    if (dist > 10) suppressClick.current = true
    latestPoint.current = { x: e.clientX, y: e.clientY }
    positionPillGhost(e.clientX, e.clientY)
    schedulePillReorderPass()
  }

  const endPillDrag = (persist: boolean) => {
    clearPillPressTimer()
    cancelPillReorderRaf()
    const wasDragging = dragIdRef.current != null
    pressRef.current = null
    dragIdRef.current = null
    latestPoint.current = null
    setDragId(null)
    if (wasDragging && persist && orderChangedRef.current) {
      const ids = categoriesRef.current.map((c) => c.id)
      window.api.ftReorderCategories(ids).catch((err) => {
        console.error('[FocusTube] Reorder failed:', err)
        void loadCategories()
      })
    }
    orderChangedRef.current = false
    window.setTimeout(() => {
      suppressClick.current = false
    }, 0)
  }

  useEffect(() => {
    if (dragId == null) return
    const finish = () => endPillDrag(true)
    const markRectsDirty = () => {
      rectsDirty.current = true
    }
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    window.addEventListener('scroll', markRectsDirty, true)
    return () => {
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      window.removeEventListener('scroll', markRectsDirty, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId])

  useEffect(() => {
    if (dragId == null) return
    const press = pressRef.current
    if (press) positionPillGhost(press.x, press.y)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId])

  // Progress is read on play rather than fetched for the whole feed.
  const progressCacheRef = useRef(new Map<string, number>())
  // Mirror of the current stack for queue lookups that must not go stale
  // inside async advance handlers.
  const videosRef = useRef<FtVideo[]>([])
  useEffect(() => { videosRef.current = videos }, [videos])

  const loadCategories = useCallback(async () => {
    const list = (await window.api.ftListCategories()) || []
    setCategories(list)
    try {
      const allChannels = await window.api.ftListChannels(null)
      setTotalChannels((allChannels || []).length)
    } catch {
      // Total is a nicety for badges; per-category counts already came with list.
    }
    return list
  }, [])

  const loadFeed = useCallback(async (categoryId: number | null, opts?: { hideShorts?: boolean; includeSeen?: boolean; search?: string }) => {
    const next = await window.api.ftGetFeed({
      categoryId,
      includeSeen: opts?.includeSeen ?? includeSeen,
      hideShorts: opts?.hideShorts ?? hideShorts,
      search: opts?.search ?? null,
      limit: 60,
    })
    setVideos(next || [])

    const summary = await window.api.ftGetCategorySummary(categoryId)
    setLatestPublished(summary?.latestPublished ?? null)
  }, [hideShorts, includeSeen])

  // Initial load: default to the first category so the tab never opens empty
  // when the user already has rooms set up.
  useEffect(() => {
    let cancelled = false
    const boot = async () => {
      setLoading(true)
      try {
        const list = await loadCategories()
        if (cancelled) return
        const initialId = list.length ? list[0].id : null
        setActiveCategoryId(initialId)
        if (!cancelled) await loadFeed(initialId)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void boot()
    return () => { cancelled = true }
  }, [])

  useEffect(() => window.api.onFeedUpdated(() => {
    void loadCategories()
    void loadFeed(activeCategoryId)
  }), [activeCategoryId, loadCategories, loadFeed])

  const selectCategory = useCallback(async (categoryId: number | null) => {
    // Any pill interaction disarms a pending delete confirmation elsewhere.
    setConfirmDeleteId(null)
    // Re-clicking the active pill (including the two clicks that precede a
    // double-click to rename) must not reload and flash the skeleton.
    if (categoryId === activeCategoryId) return
    setActiveCategoryId(categoryId)
    setVideos([])
    setLoading(true)
    try {
      await loadFeed(categoryId)
    } finally {
      setLoading(false)
    }
  }, [activeCategoryId, loadFeed])

  const toggleShorts = useCallback(() => {
    const next = !hideShorts
    setHideShorts(next)
    try {
      localStorage.setItem(HIDE_SHORTS_KEY, next ? '1' : '0')
    } catch {
      // Persistence is a nicety; the toggle itself must never fail.
    }
    void loadFeed(activeCategoryId, { hideShorts: next })
  }, [hideShorts, activeCategoryId, loadFeed])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await window.api.ftRefreshFeeds({ force: true })
      await loadCategories()
      await loadFeed(activeCategoryId)
    } catch (err) {
      console.error('[FocusTube] Refresh failed:', err)
    } finally {
      setRefreshing(false)
    }
  }, [activeCategoryId, loadCategories, loadFeed])

  const activeCategory = useMemo(
    () => categories.find((category) => category.id === activeCategoryId) || null,
    [categories, activeCategoryId],
  )

  const unseenTotal = useMemo(
    () => categories.reduce((sum, category) => sum + (category.unseenCount || 0), 0),
    [categories],
  )

  // Split out so a live stream is never buried in the middle of the stack.
  const liveVideos = useMemo(() => videos.filter((video) => video.isLive), [videos])
  const restVideos = useMemo(() => videos.filter((video) => !video.isLive), [videos])
  // Playback queue = display order (live first, then newest-first rest).
  const playQueue = useMemo(() => [...liveVideos, ...restVideos], [liveVideos, restVideos])

  const toggleAutoplayNext = useCallback(() => {
    setAutoplayNext((was) => {
      const next = !was
      try {
        localStorage.setItem(AUTOPLAY_NEXT_KEY, next ? '1' : '0')
      } catch {
        // Persistence is a nicety; the toggle itself must never fail.
      }
      return next
    })
  }, [])

  const getNextInQueue = useCallback((currentVideoId: string): FtVideo | null => {
    const queue = videosRef.current.length
      ? [...videosRef.current.filter((v) => v.isLive), ...videosRef.current.filter((v) => !v.isLive)]
      : playQueue
    const index = queue.findIndex((video) => video.videoId === currentVideoId)
    if (index === -1) return queue[0] ?? null
    return queue[index + 1] ?? null
  }, [playQueue])

  const resolveStartSeconds = useCallback(async (video: FtVideo): Promise<number> => {
    const cached = progressCacheRef.current.get(video.videoId)
    if (cached !== undefined) return cached
    try {
      const progress = await window.api.ftGetProgress(video.videoId)
      const startSeconds = Number(progress?.position || 0)
      progressCacheRef.current.set(video.videoId, startSeconds)
      return startSeconds
    } catch {
      return 0
    }
  }, [])

  const handleCreateCategory = useCallback(async () => {
    const name = (newCategoryName || '').trim()
    if (!name) return
    setNewCategoryName(null)
    const created = await window.api.ftCreateCategory(name)
    await loadCategories()
    if (created?.id) await selectCategory(created.id)
  }, [newCategoryName, loadCategories, selectCategory])

  const handleDeleteCategory = useCallback(async (category: FtCategory) => {
    await window.api.ftDeleteCategory(category.id)
    setConfirmDeleteId(null)
    setEditingId(null)
    const list = await loadCategories()
    const nextId = list.length ? list[0].id : null
    setActiveCategoryId(nextId)
    await loadFeed(nextId)
  }, [loadCategories, loadFeed])

  const handleRenameCategory = useCallback(async (id: number, name: string) => {
    setEditingId(null)
    const trimmed = name.trim()
    const current = categories.find((category) => category.id === id)
    // Empty or unchanged: just close the editor, no IPC needed.
    if (!trimmed || !current || trimmed === current.name) return
    await window.api.ftUpdateCategory(id, trimmed)
    await loadCategories()
  }, [categories, loadCategories])

  const handleMarkAllSeen = useCallback(async () => {
    await window.api.ftMarkAllSeen(activeCategoryId)
    await loadCategories()
    await loadFeed(activeCategoryId)
  }, [activeCategoryId, loadCategories, loadFeed])

  const handlePlay = useCallback(async (video: FtVideo) => {
    let startSeconds = progressCacheRef.current.get(video.videoId) ?? 0
    if (startSeconds === 0) {
      const progress = await window.api.ftGetProgress(video.videoId)
      startSeconds = Number(progress?.position || 0)
      progressCacheRef.current.set(video.videoId, startSeconds)
    }
    setPlaying({ video, startSeconds })
  }, [])

  const handleMarkSeen = useCallback(async (videoId: string) => {
    progressCacheRef.current.delete(videoId)
    await window.api.ftSetVideoSeen(videoId, true)
    await loadCategories()
    await loadFeed(activeCategoryId)
  }, [activeCategoryId, loadCategories, loadFeed])

  // Autoplay path: the finished video counts as watched, then playback
  // continues with the next unseen video in the same stack. The switch
  // happens first (snappy), the seen-mark + feed refresh follow in the
  // background so the finished card disappears underneath.
  const handleAutoAdvance = useCallback(async (finishedVideoId: string) => {
    const next = getNextInQueue(finishedVideoId)
    if (!next) {
      await handleMarkSeen(finishedVideoId)
      setPlaying(null)
      return
    }
    const startSeconds = await resolveStartSeconds(next)
    setPlaying({ video: next, startSeconds })
    progressCacheRef.current.delete(finishedVideoId)
    try {
      await window.api.ftSetVideoSeen(finishedVideoId, true)
      await loadCategories()
      await loadFeed(activeCategoryId)
    } catch (err) {
      console.error('[FocusTube] Auto-advance refresh failed:', err)
    }
  }, [activeCategoryId, getNextInQueue, handleMarkSeen, loadCategories, loadFeed, resolveStartSeconds])

  // Manual "Next" path: skip without marking the current video seen.
  // The player saves the current position before calling this.
  const handleManualNext = useCallback(async (currentVideoId: string) => {
    const next = getNextInQueue(currentVideoId)
    if (!next) return
    const startSeconds = await resolveStartSeconds(next)
    setPlaying({ video: next, startSeconds })
  }, [getNextInQueue, resolveStartSeconds])

  const nextUpVideo = useMemo(
    () => (playing ? getNextInQueue(playing.video.videoId) : null),
    // getNextInQueue already reads the live ref; depend on queue + playing
    // so the label refreshes when the feed reloads underneath.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playing, playQueue],
  )

  const handleSaveProgress = useCallback((videoId: string, position: number) => {
    progressCacheRef.current.set(videoId, position)
    void window.api.ftUpdateProgress(videoId, position)
  }, [])

  const handleToggleSeen = useCallback(async (video: FtVideo) => {
    progressCacheRef.current.delete(video.videoId)
    await window.api.ftSetVideoSeen(video.videoId, !video.seen)
    await loadCategories()
    await loadFeed(activeCategoryId)
  }, [activeCategoryId, loadCategories, loadFeed])

  const handleObserved = useCallback((videoId: string, observation: { duration?: number | null; ended?: boolean }) => {
    void window.api.ftRecordPlayback(videoId, observation).catch(() => {})
  }, [])

  const handleNotEmbeddable = useCallback((videoId: string) => {
    void window.api.ftMarkNotEmbeddable(videoId)
      .then(() => loadFeed(activeCategoryId))
      .catch(() => {})
  }, [activeCategoryId, loadFeed])

  const runSearch = useCallback(async () => {
    setLoading(true)
    try {
      await loadFeed(activeCategoryId, { search: search.trim() || undefined })
    } finally {
      setLoading(false)
    }
  }, [activeCategoryId, loadFeed, search])

  return (
    <div className="space-y-5">
      <header className="relative isolate overflow-hidden rounded-[26px] border border-white/[0.09] bg-gradient-to-br from-[#171820] via-[#0e0f14] to-[#0a0a0d] px-5 py-5 shadow-[0_24px_70px_-44px_rgba(0,0,0,0.95)] sm:px-6 sm:py-5">
        <div aria-hidden className="absolute -right-16 -top-32 h-72 w-72 rounded-full bg-primary/15 blur-[100px]" />
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-primary/55 via-white/[0.08] to-transparent" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/30 to-primary/[0.04] text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_10px_30px_-16px_rgba(229,9,20,0.9)]">
              <Compass size={25} strokeWidth={1.9} />
            </div>
            <div className="min-w-0">
              <p className="mb-1.5 text-[9px] font-black uppercase tracking-[0.24em] text-primary/90">Your personal video club</p>
              <h2 className="flex flex-wrap items-center gap-2.5 text-3xl font-black leading-none tracking-tight text-white sm:text-[2.1rem]">
                Focus Tube
                <span
                  title="Focus Tube is in beta — some things may still change"
                  className="inline-flex items-center rounded-md border border-amber-300/20 bg-amber-400/10 px-2 py-1 text-[9px] font-bold uppercase leading-none tracking-[0.14em] text-amber-200/90"
                >
                  Beta
                </span>
              </h2>
              <p className="mt-2 text-[13px] font-medium text-white/50">
                {unseenTotal > 0 ? (
                  <><span className="font-bold text-white/90">{unseenTotal}</span> new {unseenTotal === 1 ? 'video' : 'videos'} ready when you are</>
                ) : 'A quieter place to catch up with the channels you love'}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center lg:pl-5">
            <div className="relative flex-1 sm:flex-none">
              <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') void runSearch() }}
                placeholder="Search your channels"
                aria-label="Search videos in your subscriptions"
                className="h-10 w-full rounded-xl border border-white/10 bg-black/30 pl-10 pr-9 text-sm font-medium text-white placeholder:text-white/25 transition-colors hover:border-white/20 focus:border-primary/60 focus:bg-black/40 focus:outline-none focus:ring-4 focus:ring-primary/10 sm:w-52"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); void runSearch() }}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/30 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                data-tour="focustube-channels"
                onClick={() => setManaging(true)}
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-[11px] font-bold uppercase tracking-wider text-white/70 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white sm:flex-none"
              >
                <SlidersHorizontal size={14} /> Channels
                {totalChannels > 0 && (
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] tabular-nums text-white/70">
                    {totalChannels}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => void refresh()}
                disabled={refreshing}
                aria-label="Refresh subscriptions"
                title="Pull the latest uploads"
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-[11px] font-bold uppercase tracking-wider text-white/70 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-40 sm:flex-none"
              >
                <RefreshCw size={14} className={refreshing ? 'animate-spin' : undefined} />
                {refreshing ? 'Syncing' : 'Refresh'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Controls — categories + stack filters in one card. */}
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02]">
        <div
          data-tour="focustube-categories"
          className="flex flex-wrap items-center gap-2 p-2.5"
        >
        <button
          type="button"
          onClick={() => void selectCategory(null)}
          className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-black uppercase tracking-widest transition-all ${
            activeCategoryId === null
              ? 'border-primary/60 bg-primary/20 text-white shadow-[0_6px_20px_-8px_rgba(229,9,20,0.9)]'
              : 'border-transparent bg-transparent text-white/45 hover:bg-white/[0.06] hover:text-white'
          }`}
        >
          <Layers size={14} /> All
        </button>

        {categories.map((category) => {
          const isActive = activeCategoryId === category.id
          const channelCount = category.channelCount ?? 0
          const unseen = category.unseenCount || 0

          // Rename mode (double-clicked): inline editor commits on Enter/blur.
          if (editingId === category.id) {
            return (
              <div
                key={category.id}
                className="inline-flex items-center gap-1 rounded-xl border border-primary/60 bg-primary/15 py-1.5 pl-3 pr-1.5"
              >
                <input
                  autoFocus
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void handleRenameCategory(category.id, editName)
                    if (event.key === 'Escape') setEditingId(null)
                  }}
                  onBlur={() => {
                    if (editingId === category.id) void handleRenameCategory(category.id, editName)
                  }}
                  onClick={(event) => event.stopPropagation()}
                  className="w-32 bg-transparent text-xs font-black uppercase tracking-widest text-white focus:outline-none"
                  aria-label={`Rename ${category.name}`}
                />
                <button
                  type="button"
                  // Prevents the input's blur from firing first and unmounting
                  // this button before the click registers.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => void handleRenameCategory(category.id, editName)}
                  className="rounded-full bg-primary p-1 text-white"
                  aria-label="Confirm rename"
                >
                  <Check size={12} />
                </button>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => setEditingId(null)}
                  className="rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white"
                  aria-label="Cancel rename"
                >
                  <X size={12} />
                </button>
              </div>
            )
          }

          // Delete-confirm mode: first click on the badge armed this, a second
          // explicit click is required. Accidental hover-clicks delete nothing.
          if (confirmDeleteId === category.id) {
            return (
              <div
                key={category.id}
                className="inline-flex items-center gap-2 rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-2"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setConfirmDeleteId(null)
                }}
              >
                <span className="text-xs font-black uppercase tracking-widest text-red-300">
                  Delete “{category.name}”?
                </span>
                <button
                  type="button"
                  onClick={() => void handleDeleteCategory(category)}
                  className="rounded-full bg-red-500 p-1 text-white"
                  aria-label={`Confirm deletion of ${category.name}`}
                >
                  <Check size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(null)}
                  className="rounded-full p-1 text-white/50 hover:bg-white/10 hover:text-white"
                  aria-label={`Keep ${category.name}`}
                >
                  <X size={12} />
                </button>
              </div>
            )
          }

          return (
            <div
              key={category.id}
              ref={(el) => {
                if (el) pillRefs.current.set(category.id, el)
                else pillRefs.current.delete(category.id)
              }}
              onPointerDown={(e) => onPillPointerDown(e, category.id)}
              onPointerMove={onPillPointerMove}
              onPointerUp={() => endPillDrag(true)}
              onPointerCancel={() => endPillDrag(false)}
              onContextMenu={(e) => { if (pressRef.current || dragIdRef.current != null) e.preventDefault() }}
              onKeyDown={(e) => {
                if ((e.altKey || e.ctrlKey) && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                  e.preventDefault()
                  const ids = categoriesRef.current.map((c) => c.id)
                  const idx = ids.indexOf(category.id)
                  const swapWith = e.key === 'ArrowLeft' ? idx - 1 : idx + 1
                  if (idx < 0 || swapWith < 0 || swapWith >= ids.length) return
                  const next = [...ids]
                  const [moved] = next.splice(idx, 1)
                  next.splice(swapWith, 0, moved)
                  const byId = new Map(categoriesRef.current.map((c) => [c.id, c]))
                  setCategories(next.map((id) => byId.get(id)!).filter(Boolean))
                  window.api.ftReorderCategories(next).catch((err) => {
                    console.error('[FocusTube] Reorder failed:', err)
                    void loadCategories()
                  })
                }
              }}
              className={`group/cat relative select-none touch-pan-y ${dragId === category.id ? 'invisible' : 'cursor-grab'}`}
            >
              <button
                type="button"
                onClick={() => {
                  if (suppressClick.current) {
                    suppressClick.current = false
                    return
                  }
                  void selectCategory(category.id)
                }}
                onDoubleClick={() => {
                  if (suppressClick.current) return
                  setEditingId(category.id)
                  setEditName(category.name)
                  setConfirmDeleteId(null)
                }}
                title={`${category.name} — ${channelCount} channel${channelCount === 1 ? '' : 's'}, ${unseen} unseen. Click to open · double-click to rename · drag to reorder (Alt+←/→ also moves)`}
                className={`group/pill inline-flex items-center gap-2 rounded-xl border py-2 pl-2.5 pr-3.5 text-xs font-black uppercase tracking-widest transition-all ${
                  isActive
                    ? 'border-primary/60 bg-primary/20 text-white shadow-[0_6px_20px_-8px_rgba(229,9,20,0.9)]'
                    : 'border-transparent text-white/50 hover:bg-white/[0.06] hover:text-white'
                } ${dragId != null ? 'pointer-events-none' : ''}`}
              >
                <GripVertical
                  size={13}
                  className="shrink-0 text-white/20 transition-colors group-hover/pill:text-white/40"
                  aria-hidden
                />
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ring-4 ring-white/[0.04] ${
                    isActive ? 'scale-110' : ''
                  } ${categoryDot(category.color)}`}
                />
                <span className="max-w-[10rem] truncate">{category.name}</span>
                <span
                  className="inline-flex items-center gap-1 rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-bold normal-case tabular-nums tracking-normal text-white/40 transition-colors group-hover/pill:bg-white/10"
                  title={`${channelCount} subscribed channel${channelCount === 1 ? '' : 's'} in ${category.name}`}
                >
                  <Users size={10} className="opacity-70" aria-hidden />
                  {channelCount}
                </span>
                {unseen > 0 && (
                  <span className="rounded-md bg-primary px-1.5 py-0.5 text-[10px] font-black tabular-nums text-white shadow-[0_2px_10px_-2px_rgba(229,9,20,0.9)]">
                    {unseen}
                  </span>
                )}
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation()
                  setConfirmDeleteId(category.id)
                }}
                title={`Delete ${category.name}`}
                aria-label={`Delete ${category.name}`}
                className="absolute -right-1 -top-1 hidden rounded-full border border-white/10 bg-surface p-0.5 text-white/40 shadow-lg transition-colors hover:border-red-500/40 hover:bg-red-500/15 hover:text-red-400 group-hover/cat:block"
              >
                <X size={11} />
              </button>
            </div>
          )
        })}

        {newCategoryName === null ? (
          <button
            type="button"
            onClick={() => setNewCategoryName('')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-white/15 px-3.5 py-2 text-xs font-black uppercase tracking-widest text-white/40 transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-white"
          >
            <Plus size={14} /> Category
          </button>
        ) : (
          <div className="inline-flex items-center gap-1 rounded-xl border border-primary/50 bg-primary/10 py-1.5 pl-3 pr-1.5">
            <input
              autoFocus
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleCreateCategory()
                if (event.key === 'Escape') setNewCategoryName(null)
              }}
              placeholder="Name"
              aria-label="New category name"
              className="w-36 bg-transparent text-xs font-bold text-white placeholder:text-white/30 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void handleCreateCategory()}
              className="rounded-lg bg-primary p-1.5 text-white transition-colors hover:bg-primary/80"
              aria-label="Create category"
            >
              <Plus size={12} />
            </button>
          </div>
        )}
        </div>

        {/* Stack filters — second row of the same card. */}
        <div
          data-tour="focustube-feed"
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-white/[0.06] px-3 py-2.5"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-white">
              <Sparkles size={14} className="text-primary" />
              {videos.length} in the stack
            </span>
            <span className="hidden h-4 w-px bg-white/10 sm:block" aria-hidden />
            <span className="text-xs font-medium text-white/40">
              newest first
              {activeCategory
                ? ` · ${activeCategory.channelCount ?? 0} channel${(activeCategory.channelCount ?? 0) === 1 ? '' : 's'} in ${activeCategory.name}`
                : totalChannels > 0 ? ` · ${totalChannels} channel${totalChannels === 1 ? '' : 's'}` : ''}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={toggleShorts}
            title={hideShorts ? 'Show Shorts' : 'Hide Shorts'}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors ${
              hideShorts
                ? 'border-primary/50 bg-primary/15 text-white'
                : 'border-transparent text-white/40 hover:bg-white/[0.06] hover:text-white'
            }`}
          >
            {hideShorts ? <EyeOff size={14} /> : <Eye size={14} />}
            Shorts {hideShorts ? 'hidden' : 'shown'}
          </button>
          <button
            type="button"
            onClick={() => { setIncludeSeen((value) => !value); void loadFeed(activeCategoryId, { includeSeen: !includeSeen }) }}
            title="Include videos you have already watched"
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] font-bold uppercase tracking-wider transition-colors ${
              includeSeen
                ? 'border-white/20 bg-white/10 text-white'
                : 'border-transparent text-white/40 hover:bg-white/[0.06] hover:text-white'
            }`}
          >
            <CheckCheck size={14} />
            {includeSeen ? 'Including watched' : 'Unseen only'}
          </button>
          <button
            type="button"
            onClick={() => void handleMarkAllSeen()}
            title="Mark every video in this view as watched"
            className="inline-flex items-center gap-1.5 rounded-lg border border-transparent px-2.5 py-2 text-[11px] font-bold uppercase tracking-wider text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <CheckCheck size={14} className="opacity-70" />
            Mark all seen
          </button>
          </div>
        </div>
      </div>

      {dragId != null && (() => {
        const dragged = categories.find((c) => c.id === dragId)
        if (!dragged) return null
        return (
          <div
            ref={ghostRef}
            className="pointer-events-none fixed left-0 top-0 z-[90] inline-flex cursor-grabbing items-center gap-2 rounded-xl border border-primary/50 bg-[#141a26]/95 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-[0_18px_40px_-12px_rgba(0,0,0,0.9)] backdrop-blur will-change-transform"
          >
            <GripVertical size={12} className="text-white/40" />
            <span className={`h-2 w-2 rounded-full ${categoryDot(dragged.color)}`} />
            {dragged.name}
          </div>
        )
      })()}

      {loading ? (
        <div className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index}>
              <div className="skeleton aspect-video w-full rounded-xl" />
              <div className="skeleton mt-3 h-3.5 w-4/5 rounded" />
              <div className="skeleton mt-2 h-3 w-1/3 rounded" />
            </div>
          ))}
        </div>
      ) : videos.length > 0 ? (
        <div className="space-y-10">
          {liveVideos.length > 0 && (
            <section className="space-y-5">
              <div className="flex items-center gap-2.5">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </span>
                <h3 className="text-sm font-black uppercase italic tracking-wider text-white">Live now</h3>
                <span className="rounded-md bg-red-500/15 px-2 py-0.5 text-[10px] font-black tabular-nums tracking-widest text-red-300">
                  {liveVideos.length}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
                {liveVideos.map((video) => (
                  <FocusTubeCard
                    key={video.videoId}
                    video={video}
                    onPlay={(item) => void handlePlay(item)}
                    onToggleSeen={(item) => void handleToggleSeen(item)}
                  />
                ))}
              </div>
            </section>
          )}

          <div className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
            {restVideos.map((video) => (
              <FocusTubeCard
                key={video.videoId}
                video={video}
                onPlay={(item) => void handlePlay(item)}
                onToggleSeen={(item) => void handleToggleSeen(item)}
              />
            ))}
          </div>
        </div>
      ) : search.trim() ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-white/10 py-24 text-center">
          <Search size={52} strokeWidth={1} className="text-white/20" />
          <h3 className="text-xl font-black uppercase italic text-white">No matches</h3>
          <p className="max-w-md text-xs font-bold uppercase tracking-widest text-white/35">
            Nothing in your subscriptions matches “{search}”
          </p>
          <button
            type="button"
            onClick={() => { setSearch(''); void runSearch() }}
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-black uppercase tracking-widest text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={13} /> Clear search
          </button>
        </div>
      ) : activeCategory && (activeCategory.channelCount ?? 0) === 0 ? (
        <div className="flex flex-col items-center justify-center gap-5 rounded-3xl border border-dashed border-white/10 py-24 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.03] text-white/25">
            <Users size={34} strokeWidth={1.5} />
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-black uppercase italic tracking-tight text-white">
              No channels in {activeCategory.name} yet
            </h3>
            <p className="mx-auto max-w-md text-xs font-bold uppercase tracking-widest text-white/40">
              Subscribe to channels to fill this category
            </p>
            <button
              type="button"
              onClick={() => setManaging(true)}
              className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-[0_10px_30px_-12px_rgba(229,9,20,0.9)] transition-colors hover:bg-primary/85"
            >
              <Plus size={14} /> Add channels to {activeCategory.name}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-5 rounded-3xl border border-dashed border-white/10 py-24 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-400/70">
            <CheckCheck size={34} strokeWidth={1.5} />
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-black uppercase italic tracking-tight text-white">
              {activeCategory ? `${activeCategory.name} is clear` : 'Nothing new'}
            </h3>
            <p className="mx-auto max-w-md text-xs font-bold uppercase tracking-widest text-white/35">
              You have watched everything from your channels here
              {latestPublished ? `. Last upload ${formatAgo(latestPublished)} ago, on ${formatPublishedExact(latestPublished)}` : ''}
            </p>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : undefined} />
              {refreshing ? 'Checking' : 'Check for new'}
            </button>
          </div>
        </div>
      )}

      {managing && (
        <ChannelManager
          categories={categories}
          initialCategoryId={activeCategoryId}
          onClose={() => setManaging(false)}
          onChanged={() => { void loadCategories(); void loadFeed(activeCategoryId) }}
        />
      )}

      {playing && (
        <FocusTubePlayer
          // No key on videoId on purpose: the player shell (the element we
          // put into fullscreen) must stay the SAME DOM node across Next /
          // auto-advance. Keying by videoId unmounted the shell, which makes
          // the browser exit fullscreen and the next video starts windowed.
          // The player already resets all per-video state on video.videoId.
          key="focustube-player"
          video={playing.video}
          startSeconds={playing.startSeconds}
          onClose={() => setPlaying(null)}
          onMarkSeen={(videoId) => void handleMarkSeen(videoId)}
          onSaveProgress={handleSaveProgress}
          onObserved={handleObserved}
          onNotEmbeddable={handleNotEmbeddable}
          autoplayNext={autoplayNext}
          onToggleAutoplayNext={toggleAutoplayNext}
          hasNext={!!nextUpVideo}
          nextTitle={nextUpVideo?.title ?? null}
          onAutoAdvance={(videoId) => void handleAutoAdvance(videoId)}
          onManualNext={(videoId) => void handleManualNext(videoId)}
        />
      )}
    </div>
  )
}

export default FocusTube
