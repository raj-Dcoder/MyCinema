import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Layers,
  Play,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react'
import type { FtCategory, FtChannel, FtVideo } from '../types'
import QuickSubscribeModal from '../components/focus/QuickSubscribeModal'
import FocusTubeCard from '../components/focus/FocusTubeCard'
import FocusTubePlayer from '../components/focus/FocusTubePlayer'
import ChannelManager from '../components/focus/ChannelManager'
import { categoryDot, formatAgo, formatPublishedExact } from '../utils/focusTube'
import { useTheme } from '../theme/ThemeContext'

const HIDE_SHORTS_KEY = 'mycinema_ft_hide_shorts'
const AUTOPLAY_NEXT_KEY = 'mycinema_ft_autoplay_next'
const SORT_ORDER_KEY = 'mycinema_ft_sort_order'

interface FocusTubeProps {
  activeTab?: string
}

const FocusTube: React.FC<FocusTubeProps> = ({ activeTab = 'focustube' }) => {
  const [categories, setCategories] = useState<FtCategory[]>([])
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null)
  const [videos, setVideos] = useState<FtVideo[]>([])
  const [latestPublished, setLatestPublished] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>(() => {
    try {
      return localStorage.getItem(SORT_ORDER_KEY) === 'oldest' ? 'oldest' : 'newest'
    } catch {
      return 'newest'
    }
  })

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
  const [channels, setChannels] = useState<FtChannel[]>([])
  const [youtubeSearchQuery, setYoutubeSearchQuery] = useState<string | null>(null)
  const [youtubeSearchResults, setYoutubeSearchResults] = useState<FtVideo[]>([])
  const [isSearchingYouTube, setIsSearchingYouTube] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false)
  const [playingFromSearch, setPlayingFromSearch] = useState(false)
  const [subscribeModalChannel, setSubscribeModalChannel] = useState<{
    channelId: string
    title: string
    handle?: string | null
    avatarUrl?: string | null
  } | null>(null)

  const subscribedChannelIds = useMemo(() => new Set(channels.map((c) => c.channelId)), [channels])

  const loadChannels = useCallback(async () => {
    try {
      const list = await window.api.ftListChannels()
      setChannels(list || [])
    } catch {
      // Ignore
    }
  }, [])

  useEffect(() => {
    void loadChannels()
  }, [loadChannels])

  const [playing, setPlaying] = useState<{ video: FtVideo; startSeconds: number } | null>(null)

  // ── Carousel scroll controls for categories ──────────────────────────────
  const carouselRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkCarouselScroll = useCallback(() => {
    const el = carouselRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
  }, [])

  const scrollCarousel = useCallback((direction: 'left' | 'right') => {
    const el = carouselRef.current
    if (!el) return
    const offset = direction === 'left' ? -260 : 260
    el.scrollBy({ left: offset, behavior: 'smooth' })
    window.setTimeout(checkCarouselScroll, 300)
  }, [checkCarouselScroll])

  const handleCarouselWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    const el = carouselRef.current
    if (!el) return
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY
      checkCarouselScroll()
    }
  }, [checkCarouselScroll])

  useEffect(() => {
    checkCarouselScroll()
    const onResize = () => checkCarouselScroll()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [checkCarouselScroll, categories])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Progress is read on play rather than fetched for the whole feed.
  const progressCacheRef = useRef(new Map<string, number>())
  // Mirror of the current stack for queue lookups that must not go stale
  // inside async advance handlers.
  const videosRef = useRef<FtVideo[]>([])
  useEffect(() => { videosRef.current = videos }, [videos])

  const loadFeed = useCallback(async (categoryId: number | null, opts?: { hideShorts?: boolean; includeSeen?: boolean; search?: string; sortOrder?: 'newest' | 'oldest' }) => {
    const next = await window.api.ftGetFeed({
      categoryId,
      includeSeen: opts?.includeSeen ?? includeSeen,
      hideShorts: opts?.hideShorts ?? hideShorts,
      search: opts?.search ?? null,
      sortOrder: opts?.sortOrder ?? sortOrder,
      limit: 60,
    })
    setVideos(next || [])

    const summary = await window.api.ftGetCategorySummary(categoryId)
    setLatestPublished(summary?.latestPublished ?? null)
  }, [hideShorts, includeSeen, sortOrder])

  const handleSortChange = useCallback((next: 'newest' | 'oldest') => {
    if (next === sortOrder) return
    setSortOrder(next)
    try {
      localStorage.setItem(SORT_ORDER_KEY, next)
    } catch {}
    void loadFeed(activeCategoryId, { sortOrder: next })
  }, [sortOrder, activeCategoryId, loadFeed])

  const loadCategories = useCallback(async () => {
    const list = (await window.api.ftListCategories()) || []
    setCategories(list)
    try {
      const allChannels = await window.api.ftListChannels(null)
      setTotalChannels((allChannels || []).length)
      if (allChannels?.some((c) => !c.avatarUrl) && typeof (window.api as any).ftRefreshChannelAvatars === 'function') {
        void (window.api as any).ftRefreshChannelAvatars().then((done: any) => {
          if (done?.updated > 0) {
            void loadFeed(activeCategoryId)
          }
        }).catch(() => {})
      }
    } catch {
      // Total is a nicety for badges; per-category counts already came with list.
    }
    return list
  }, [activeCategoryId, loadFeed])

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

  // Filter out shorts when hideShorts is enabled so queues and grids strictly honor the preference.
  const eligibleVideos = useMemo(() => {
    return videos.filter((video) => (!hideShorts || !video.isShort))
  }, [videos, hideShorts])

  // Split out so a live stream is never buried in the middle of the stack.
  const liveVideos = useMemo(() => eligibleVideos.filter((video) => video.isLive), [eligibleVideos])
  const restVideos = useMemo(() => {
    const list = eligibleVideos.filter((video) => !video.isLive)
    return [...list].sort((a, b) => {
      const diff = new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()
      return sortOrder === 'oldest' ? diff : -diff
    })
  }, [eligibleVideos, sortOrder])
  // Playback queue = display order (live first, then sorted rest).
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
    if (playingFromSearch) {
      const list = youtubeSearchResults.filter((v) => (!hideShorts || !v.isShort))
      const currentIndex = list.findIndex((video) => video.videoId === currentVideoId)
      if (currentIndex !== -1 && currentIndex + 1 < list.length) {
        return list[currentIndex + 1]
      }
      return null
    }
    const source = videosRef.current.length ? videosRef.current : videos
    const eligible = source.filter((v) => (!hideShorts || !v.isShort))
    const live = eligible.filter((v) => v.isLive)
    const rest = eligible.filter((v) => !v.isLive).sort((a, b) => {
      const diff = new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime()
      return sortOrder === 'oldest' ? diff : -diff
    })
    const queue = [...live, ...rest]
    const currentIndex = queue.findIndex((video) => video.videoId === currentVideoId)
    if (currentIndex !== -1) {
      for (let i = currentIndex + 1; i < queue.length; i++) {
        const candidate = queue[i]
        if (candidate && (!candidate.seen || includeSeen)) {
          return candidate
        }
      }
      return null
    }
    return queue.find((v) => (!v.seen || includeSeen) && v.videoId !== currentVideoId) ?? queue[0] ?? null
  }, [videos, hideShorts, includeSeen, sortOrder])

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

  const handleExecuteYouTubeSearch = useCallback(async (query: string) => {
    const trimmed = query.trim()
    if (!trimmed) return
    setSearchDropdownOpen(false)
    setYoutubeSearchQuery(trimmed)
    setIsSearchingYouTube(true)
    setSearchError(null)
    try {
      const results = await window.api.ftSearchVideos(trimmed, 30)
      setYoutubeSearchResults(results || [])
      if (!results || results.length === 0) {
        setSearchError(`No YouTube videos found matching "${trimmed}"`)
      }
    } catch (err: any) {
      setSearchError(err?.message || 'Failed to search YouTube')
      setYoutubeSearchResults([])
    } finally {
      setIsSearchingYouTube(false)
    }
  }, [])

  const handleOpenSubscribeModal = useCallback((video: FtVideo) => {
    setSubscribeModalChannel({
      channelId: video.channelId,
      title: video.channelTitle,
      handle: video.channelHandle,
      avatarUrl: video.channelAvatarUrl,
    })
  }, [])

  const handleClearYouTubeSearch = useCallback(() => {
    setYoutubeSearchQuery(null)
    setYoutubeSearchResults([])
    setSearchError(null)
    setSearch('')
    void loadFeed(activeCategoryId, { search: undefined })
  }, [activeCategoryId, loadFeed])

  const handlePlayFromSearch = useCallback(async (video: FtVideo) => {
    setPlayingFromSearch(true)
    window.dispatchEvent(new CustomEvent('focustube-tab-changed', { detail: { activeTab: 'focustube' } }))
    let startSeconds = progressCacheRef.current.get(video.videoId) ?? 0
    if (startSeconds === 0) {
      try {
        const progress = await window.api.ftGetProgress(video.videoId)
        startSeconds = Number(progress?.position || 0)
        progressCacheRef.current.set(video.videoId, startSeconds)
      } catch {
        // Ignore
      }
    }
    setPlaying({ video, startSeconds })
  }, [])

  const handlePlay = useCallback(async (video: FtVideo) => {
    if (hideShorts && video.isShort) return
    setPlayingFromSearch(false)
    window.dispatchEvent(new CustomEvent('focustube-tab-changed', { detail: { activeTab: 'focustube' } }))
    let startSeconds = progressCacheRef.current.get(video.videoId) ?? 0
    if (startSeconds === 0) {
      const progress = await window.api.ftGetProgress(video.videoId)
      startSeconds = Number(progress?.position || 0)
      progressCacheRef.current.set(video.videoId, startSeconds)
    }
    setPlaying({ video, startSeconds })
  }, [hideShorts])

  const handleMarkSeen = useCallback(async (videoId: string) => {
    progressCacheRef.current.delete(videoId)
    await window.api.ftSetVideoSeen(videoId, true)
    setPlaying((prev) => (prev && prev.video.videoId === videoId ? { ...prev, video: { ...prev.video, seen: true } } : prev))
    await loadCategories()
    await loadFeed(activeCategoryId)
  }, [activeCategoryId, loadCategories, loadFeed])

  // Autoplay path: the finished video counts as watched, then playback
  // continues with the next unseen video in the same stack. The switch
  // happens first (snappy), the seen-mark + feed refresh follow in the
  // background so the finished card disappears underneath.
  const handleAutoAdvance = useCallback(async (finishedVideoId: string) => {
    const next = getNextInQueue(finishedVideoId)
    progressCacheRef.current.delete(finishedVideoId)

    // Switch video immediately (snappy UX)
    if (next && (!hideShorts || !next.isShort)) {
      const startSeconds = await resolveStartSeconds(next)
      setPlaying({ video: next, startSeconds })
    } else {
      setPlaying((prev) => (prev && prev.video.videoId === finishedVideoId ? { ...prev, video: { ...prev.video, seen: true } } : prev))
    }

    // Persist seen status and refresh categories/feed in the background
    try {
      await window.api.ftSetVideoSeen(finishedVideoId, true)
      await loadCategories()
      await loadFeed(activeCategoryId)
    } catch (err) {
      console.error('[FocusTube] Auto-advance refresh failed:', err)
    }
  }, [activeCategoryId, getNextInQueue, hideShorts, loadCategories, loadFeed, resolveStartSeconds])

  // Manual "Next" path: skip without marking the current video seen.
  // The player saves the current position before calling this.
  const handleManualNext = useCallback(async (currentVideoId: string) => {
    const next = getNextInQueue(currentVideoId)
    if (!next || (hideShorts && next.isShort)) return
    const startSeconds = await resolveStartSeconds(next)
    setPlaying({ video: next, startSeconds })
  }, [getNextInQueue, hideShorts, resolveStartSeconds])

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
    const nextSeen = !video.seen
    await window.api.ftSetVideoSeen(video.videoId, nextSeen)
    setPlaying((prev) => (prev && prev.video.videoId === video.videoId ? { ...prev, video: { ...prev.video, seen: nextSeen } } : prev))
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

  const { ftBrandLock } = useTheme()

  return (
    <div className={`space-y-5 ${ftBrandLock ? 'ft-brand-locked' : ''}`}>
      {/* ── TOP HEADER (Clean, single-tier 54px header) ── */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-[#0c0d14]/90 px-4 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.8)] backdrop-blur-md sm:px-5">
        {/* Left: Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-primary to-primary/80 text-white shadow-[0_0_20px_rgba(var(--c-accent),0.5)]">
            <Play size={15} fill="currentColor" className="ml-0.5" />
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-black tracking-tight text-white sm:text-lg">
              FocusTube
            </h1>
            <span
              title="Focus Tube — distraction-free subscriptions"
              className="rounded-md border border-amber-300/20 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-200/90"
            >
              Beta
            </span>
          </div>
        </div>

        {/* Center: Search with ⌘K / Ctrl+K and Hybrid Suggestions */}
        <div className="cinema-search-box relative max-w-md flex-1">
          <Search size={14} className="cinema-search-icon pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35" />
          <input
            ref={searchInputRef}
            value={search}
            onFocus={() => { if (search.trim()) setSearchDropdownOpen(true) }}
            onChange={(event) => {
              const val = event.target.value
              setSearch(val)
              setSearchDropdownOpen(Boolean(val.trim()))
              if (!val.trim() && youtubeSearchQuery) {
                handleClearYouTubeSearch()
              } else if (!youtubeSearchQuery) {
                void loadFeed(activeCategoryId, { search: val.trim() || undefined })
              }
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                if (search.trim()) {
                  void handleExecuteYouTubeSearch(search.trim())
                }
              } else if (event.key === 'Escape') {
                setSearchDropdownOpen(false)
                if (youtubeSearchQuery) {
                  handleClearYouTubeSearch()
                }
              }
            }}
            placeholder="Search subscriptions or YouTube..."
            aria-label="Search subscriptions or YouTube"
            className="cinema-search-input h-9 w-full rounded-xl border border-white/20 bg-black/40 pl-9 pr-14 text-xs font-medium text-white placeholder:text-white/40 backdrop-blur-xl transition-all focus:border-primary focus:bg-black/60 focus:outline-none focus:ring-2 focus:ring-primary/25"
          />
          {search ? (
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setSearchDropdownOpen(false)
                if (youtubeSearchQuery) {
                  handleClearYouTubeSearch()
                } else {
                  void runSearch()
                }
              }}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-white/30 hover:text-white"
            >
              <X size={12} />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-white/30">
              ⌘K
            </kbd>
          )}

          {/* Hybrid Suggestions Dropdown */}
          {searchDropdownOpen && search.trim() && (
            <div className="absolute left-0 right-0 top-full mt-1.5 z-50 overflow-hidden rounded-2xl border border-white/10 bg-[#0d0f17]/95 p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
              {/* Option 1: YouTube Live Search */}
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  void handleExecuteYouTubeSearch(search.trim())
                }}
                className="w-full flex items-center justify-between rounded-xl p-2.5 text-left transition-colors bg-primary/15 hover:bg-primary/25 border border-primary/30 text-white group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-white shadow-sm">
                    <Search size={13} strokeWidth={2.5} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate">
                      Search YouTube for <span className="text-primary font-black">&ldquo;{search.trim()}&rdquo;</span>
                    </p>
                    <p className="text-[10px] text-white/40">Watch with side-panel queue & playlist</p>
                  </div>
                </div>
                <span className="hidden sm:inline-flex items-center rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-white/50 group-hover:text-white">
                  ↵ Enter
                </span>
              </button>

              {/* Option 2: Subscription Results count indicator */}
              <div className="mt-1 flex items-center justify-between px-3 py-1.5 text-[11px] font-medium text-white/40">
                <span>In your subscriptions</span>
                <span>{videos.length} matching</span>
              </div>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-tour="focustube-channels"
            onClick={() => setManaging(true)}
            title="Manage Subscribed Channels"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-white/70 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
          >
            <SlidersHorizontal size={13} />
            <span className="hidden sm:inline">Channels</span>
          </button>

          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            aria-label="Sync latest videos"
            title="Sync latest uploads from YouTube"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-bold text-white/70 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin text-primary' : undefined} />
            <span className="hidden sm:inline">{refreshing ? 'Syncing…' : 'Sync'}</span>
          </button>
        </div>
      </header>

      {/* ── YOUTUBE SEARCH ACTIVE BAR OR CATEGORY CAROUSEL ── */}
      {youtubeSearchQuery ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/15 via-[#0e1018] to-[#0e1018] px-4 py-3 shadow-lg">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-[0_0_18px_rgba(var(--c-accent),0.55)]">
              <Search size={16} strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-black text-white truncate">
                  YouTube Results for &ldquo;{youtubeSearchQuery}&rdquo;
                </h2>
                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
                  {isSearchingYouTube ? 'Searching…' : `${youtubeSearchResults.length} videos`}
                </span>
              </div>
              <p className="text-[11px] text-white/40 truncate">
                Click any video to play; the remaining videos will load in the player side panel playlist
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClearYouTubeSearch}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-white/80 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X size={13} />
            <span>Back to Subscriptions</span>
          </button>
        </div>
      ) : (
      <div className="flex flex-col gap-3 py-1 lg:flex-row lg:items-center lg:justify-between">
        {/* Left / Center: Category Carousel with chevrons and overflow */}
        <div data-tour="focustube-categories" className="relative flex min-w-0 flex-1 items-center">
          {/* Scroll Left Button & Gradient Fade */}
          {canScrollLeft && (
            <>
              <div className="ft-carousel-fade ft-carousel-fade--left pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-r from-[#0c0d14] via-[#0c0d14]/80 to-transparent" />
              <button
                type="button"
                onClick={() => scrollCarousel('left')}
                aria-label="Scroll categories left"
                className="absolute left-0 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-[#14161f]/95 text-white shadow-xl backdrop-blur transition-all hover:scale-105 hover:bg-white/20 active:scale-95"
              >
                <ChevronLeft size={15} />
              </button>
            </>
          )}

          {/* Carousel Scroll Container */}
          <div
            ref={carouselRef}
            onScroll={checkCarouselScroll}
            onWheel={handleCarouselWheel}
            className={`flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth py-1.5 ${
              canScrollLeft ? 'pl-8' : ''
            } ${canScrollRight ? 'pr-8' : ''}`}
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {/* "All" category pill with notification dot */}
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => void selectCategory(null)}
                className={`inline-flex shrink-0 items-center rounded-xl px-4 py-1.5 text-xs font-bold transition-all ${
                  activeCategoryId === null
                    ? 'bg-primary text-white shadow-[0_0_15px_rgba(var(--c-accent),0.45)]'
                    : 'border border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10 hover:text-white'
                }`}
              >
                All
              </button>

            </div>

            {/* Category pills */}
            {categories.map((category) => {
              const isActive = activeCategoryId === category.id

              if (editingId === category.id) {
                return (
                  <div
                    key={category.id}
                    className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-primary/60 bg-primary/20 py-1 pl-3 pr-1.5"
                  >
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleRenameCategory(category.id, editName)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onBlur={() => {
                        if (editingId === category.id) void handleRenameCategory(category.id, editName)
                      }}
                      className="w-28 bg-transparent text-xs font-bold text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => void handleRenameCategory(category.id, editName)}
                      className="rounded p-1 text-white hover:bg-white/20"
                    >
                      <Check size={12} />
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => setEditingId(null)}
                      className="rounded p-1 text-white/40 hover:text-white"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )
              }

              if (confirmDeleteId === category.id) {
                return (
                  <div
                    key={category.id}
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-red-500/50 bg-red-500/20 px-3 py-1.5 text-xs font-bold text-red-200"
                  >
                    <span>Delete {category.name}?</span>
                    <button
                      type="button"
                      onClick={() => void handleDeleteCategory(category)}
                      className="rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
                    >
                      <Check size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="rounded-full p-1 text-white/50 hover:text-white"
                    >
                      <X size={12} />
                    </button>
                  </div>
                )
              }

              const hasUnseen = Boolean(category.unseenCount && category.unseenCount > 0)

              return (
                <div key={category.id} className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => void selectCategory(category.id)}
                    onDoubleClick={() => {
                      setEditingId(category.id)
                      setEditName(category.name)
                      setConfirmDeleteId(null)
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setConfirmDeleteId(category.id)
                    }}
                    title={`${category.name}${hasUnseen ? ` (${category.unseenCount} new)` : ''} · Double-click to rename · Right-click to delete`}
                    className={`inline-flex items-center rounded-xl px-4 py-1.5 text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-primary text-white shadow-[0_0_15px_rgba(var(--c-accent),0.45)]'
                        : 'border border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <span className="truncate">{category.name}</span>
                  </button>


                </div>
              )
            })}

            {/* + Add Category Pill */}
            {newCategoryName === null ? (
              <button
                type="button"
                onClick={() => setNewCategoryName('')}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-white/20 px-3 py-1.5 text-xs font-bold text-white/40 transition-colors hover:border-primary/60 hover:bg-primary/10 hover:text-white"
              >
                <Plus size={13} />
                <span>Add</span>
              </button>
            ) : (
              <div className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-primary/50 bg-primary/10 py-1 pl-2.5 pr-1">
                <input
                  autoFocus
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleCreateCategory()
                    if (e.key === 'Escape') setNewCategoryName(null)
                  }}
                  placeholder="Category name"
                  aria-label="New category name"
                  className="w-28 bg-transparent text-xs font-bold text-white placeholder:text-white/30 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleCreateCategory()}
                  className="rounded p-1 text-white hover:bg-white/20"
                  aria-label="Create category"
                >
                  <Check size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => setNewCategoryName(null)}
                  className="rounded p-1 text-white/40 hover:text-white"
                  aria-label="Cancel"
                >
                  <X size={12} />
                </button>
              </div>
            )}
          </div>

          {/* Scroll Right Button & Gradient Fade */}
          {canScrollRight && (
            <>
              <div className="ft-carousel-fade ft-carousel-fade--right pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-l from-[#0c0d14] via-[#0c0d14]/80 to-transparent" />
              <button
                type="button"
                onClick={() => scrollCarousel('right')}
                aria-label="Scroll categories right"
                className="absolute right-0 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-[#14161f]/95 text-white shadow-xl backdrop-blur transition-all hover:scale-105 hover:bg-white/20 active:scale-95"
              >
                <ChevronRight size={15} />
              </button>
            </>
          )}
        </div>

        {/* Right side: Modern Controls (Sort Order, Hide Shorts, Hide Watched, Mark all seen) */}
        <div data-tour="focustube-feed" className="flex shrink-0 items-center gap-3 self-end pt-1 sm:pt-0">
          {/* Upload Date Sort Order Pill */}
          <div className="flex items-center gap-0.5 rounded-xl border border-white/10 bg-white/5 p-0.5" title="Sort videos by upload date">
            <button
              type="button"
              onClick={() => handleSortChange('newest')}
              title="Newest uploads first (latest)"
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                sortOrder === 'newest'
                  ? 'bg-primary text-white shadow-sm shadow-primary/40'
                  : 'text-white/50 hover:bg-white/5 hover:text-white'
              }`}
            >
              <ArrowDownWideNarrow size={13} />
              <span>Newest</span>
            </button>
            <button
              type="button"
              onClick={() => handleSortChange('oldest')}
              title="Oldest uploads first (chronological order)"
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                sortOrder === 'oldest'
                  ? 'bg-primary text-white shadow-sm shadow-primary/40'
                  : 'text-white/50 hover:bg-white/5 hover:text-white'
              }`}
            >
              <ArrowUpNarrowWide size={13} />
              <span>Oldest</span>
            </button>
          </div>

          <div className="h-4 w-px bg-white/10" />

          {/* Hide Shorts Switch */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-white/60">Hide Shorts</span>
            <button
              type="button"
              role="switch"
              aria-checked={hideShorts}
              onClick={toggleShorts}
              title={hideShorts ? 'Shorts are hidden (click to show)' : 'Shorts are visible (click to hide)'}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                hideShorts ? 'bg-primary shadow-[0_0_10px_rgba(var(--c-accent),0.4)]' : 'bg-white/20'
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                  hideShorts ? 'left-[18px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          <div className="h-4 w-px bg-white/10" />

          {/* Hide Watched Switch */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-white/60">Hide Watched</span>
            <button
              type="button"
              role="switch"
              aria-checked={!includeSeen}
              onClick={() => {
                const next = !includeSeen
                setIncludeSeen(next)
                void loadFeed(activeCategoryId, { includeSeen: next })
              }}
              title={!includeSeen ? 'Watched videos are hidden (click to show)' : 'Watched videos are included (click to hide)'}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                !includeSeen ? 'bg-primary shadow-[0_0_10px_rgba(var(--c-accent),0.4)]' : 'bg-white/20'
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                  !includeSeen ? 'left-[18px]' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          <div className="h-4 w-px bg-white/10" />

          {/* Mark All Seen Button */}
          <button
            type="button"
            onClick={() => void handleMarkAllSeen()}
            title="Mark all videos in this category as seen"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-white/70 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white"
          >
            <CheckCheck size={13} />
            <span className="hidden sm:inline">Mark All Seen</span>
          </button>
        </div>
      </div>
      )}

      {youtubeSearchQuery ? (
        isSearchingYouTube ? (
          <div className="flex flex-col items-center justify-center gap-4 py-28 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-600/10 text-red-500 shadow-xl border border-red-500/20">
              <RefreshCw size={28} className="animate-spin" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white">Searching YouTube…</h3>
              <p className="text-xs text-white/40">
                Finding videos for &ldquo;{youtubeSearchQuery}&rdquo;
              </p>
            </div>
          </div>
        ) : searchError && youtubeSearchResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-3xl border border-dashed border-white/10 py-24 text-center">
            <Search size={52} strokeWidth={1} className="text-white/20" />
            <h3 className="text-xl font-black text-white">No videos found</h3>
            <p className="max-w-md text-xs font-medium text-white/40">
              {searchError}
            </p>
            <button
              type="button"
              onClick={handleClearYouTubeSearch}
              className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-bold text-white/60 hover:bg-white/10 hover:text-white"
            >
              <X size={13} /> Back to Subscriptions
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
              {youtubeSearchResults.map((video) => (
                <FocusTubeCard
                  key={video.videoId}
                  video={video}
                  onPlay={(item) => void handlePlayFromSearch(item)}
                  onToggleSeen={(item) => void handleToggleSeen(item)}
                />
              ))}
            </div>
          </div>
        )
      ) : loading ? (
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
          <div className="flex flex-wrap items-center justify-center gap-2.5 mt-2">
            <button
              type="button"
              onClick={() => void handleExecuteYouTubeSearch(search.trim())}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-lg hover:bg-red-500 transition-colors"
            >
              <Search size={13} strokeWidth={2.5} /> Search YouTube for &ldquo;{search.trim()}&rdquo;
            </button>
            <button
              type="button"
              onClick={() => { setSearch(''); void runSearch() }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-bold text-white/60 hover:bg-white/10 hover:text-white"
            >
              <X size={13} /> Clear search
            </button>
          </div>
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
              className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white shadow-[0_10px_30px_-12px_rgba(var(--c-accent),0.9)] transition-colors hover:bg-primary/85"
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

      {subscribeModalChannel && (
        <QuickSubscribeModal
          channel={subscribeModalChannel}
          categories={categories}
          onClose={() => setSubscribeModalChannel(null)}
          onSubscribed={(channelId) => {
            setChannels((prev) => [...prev, {
              channelId,
              title: subscribeModalChannel?.title || '',
              handle: subscribeModalChannel?.handle || null,
              avatarUrl: subscribeModalChannel?.avatarUrl || null,
              position: 0
            } as any])
            void loadChannels()
            void loadCategories()
            if (activeCategoryId) void loadFeed(activeCategoryId)
          }}
          onCreateCategory={async (name) => {
            const cat = await window.api.ftCreateCategory(name)
            await loadCategories()
            return cat
          }}
        />
      )}

      {playing && (
        <FocusTubePlayer
          activeTab={activeTab}
          // No key on videoId on purpose: the player shell (the element we
          // put into fullscreen) must stay the SAME DOM node across Next /
          // auto-advance. Keying by videoId unmounted the shell, which makes
          // the browser exit fullscreen and the next video starts windowed.
          // The player already resets all per-video state on video.videoId.
          key="focustube-player"
          video={playing.video}
          startSeconds={playing.startSeconds}
          categoryName={playingFromSearch ? 'YouTube Search' : (activeCategory ? activeCategory.name : 'All')}
          categories={categories}
          onSelectCategory={(id) => {
            setPlayingFromSearch(false)
            void selectCategory(id)
          }}
          queue={playingFromSearch ? youtubeSearchResults : playQueue}
          isSearchQueue={playingFromSearch}
          isChannelSubscribed={subscribedChannelIds.has(playing.video.channelId)}
          onSubscribeChannel={async (ch, categoryId) => {
            if (typeof categoryId === 'number') {
              await window.api.ftSubscribeChannel(
                {
                  channelId: ch.channelId,
                  title: ch.title,
                  handle: ch.handle ?? null,
                  avatarUrl: ch.avatarUrl ?? null,
                },
                [categoryId],
              )
              setChannels((prev) => [...prev, {
                channelId: ch.channelId,
                title: ch.title,
                handle: ch.handle ?? null,
                avatarUrl: ch.avatarUrl ?? null,
                position: 0,
              } as any])
              void loadChannels()
              void loadCategories()
              if (activeCategoryId) void loadFeed(activeCategoryId)
            } else {
              setSubscribeModalChannel(ch)
            }
          }}
          onSelectVideo={(item) => {
            if (playingFromSearch) {
              void handlePlayFromSearch(item)
            } else {
              void handlePlay(item)
            }
          }}
          onToggleSeen={(item) => void handleToggleSeen(item)}
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
          hideShorts={hideShorts}
          sortOrder={sortOrder}
          onToggleSortOrder={handleSortChange}
        />
      )}
    </div>
  )
}

export default React.memo(FocusTube)
