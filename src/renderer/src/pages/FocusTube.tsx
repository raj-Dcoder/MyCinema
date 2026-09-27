import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, CheckCheck, Compass, Eye, EyeOff, Layers, Plus, Radio, Search, SlidersHorizontal, Sparkles, X } from 'lucide-react'
import type { FtCategory, FtVideo } from '../types'
import FocusTubeCard from '../components/focus/FocusTubeCard'
import FocusTubePlayer from '../components/focus/FocusTubePlayer'
import ChannelManager from '../components/focus/ChannelManager'
import { formatAgo, formatPublishedExact } from '../utils/focusTube'

const CATEGORY_DOT: Record<string, string> = {
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  violet: 'bg-violet-500',
  cyan: 'bg-cyan-500',
  rose: 'bg-rose-500',
  lime: 'bg-lime-500',
}

const HIDE_SHORTS_KEY = 'mycinema_ft_hide_shorts'

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

  const [newCategoryName, setNewCategoryName] = useState<string | null>(null)
  // Which pill is awaiting delete confirmation (first click arms, second confirms).
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null)
  // Which pill is being renamed via double-click.
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [managing, setManaging] = useState(false)
  const [playing, setPlaying] = useState<{ video: FtVideo; startSeconds: number } | null>(null)

  // Progress is read on play rather than fetched for the whole feed.
  const progressCacheRef = useRef(new Map<string, number>())

  const loadCategories = useCallback(async () => {
    const list = (await window.api.ftListCategories()) || []
    setCategories(list)
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

  const handleSaveProgress = useCallback((videoId: string, position: number) => {
    progressCacheRef.current.set(videoId, position)
    void window.api.ftUpdateProgress(videoId, position)
  }, [])

  const handleToggleSaved = useCallback(async (video: FtVideo) => {
    await window.api.ftToggleSaved(video.videoId, !video.saved)
    await loadFeed(activeCategoryId)
  }, [activeCategoryId, loadFeed])

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
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-primary/10 rounded-2xl text-primary">
            <Compass size={32} />
          </div>
          <div>
            <h2 className="text-4xl font-black text-white tracking-tighter uppercase italic">Focus Tube</h2>
            <p className="text-white/30 font-bold text-sm tracking-wide">
              {unseenTotal > 0
                ? `${unseenTotal} new video${unseenTotal === 1 ? '' : 's'} from your channels`
                : 'You are all caught up'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void runSearch() }}
              placeholder="Search your channels"
              className="w-52 rounded-lg border border-white/10 bg-white/5 py-2 pl-8 pr-3 text-xs font-semibold text-white placeholder:text-white/25 focus:border-primary/50 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => setManaging(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-black uppercase tracking-widest text-white/60 hover:bg-white/10 hover:text-white"
          >
            <SlidersHorizontal size={13} /> Channels
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-black uppercase tracking-widest text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-40"
          >
            {refreshing ? '...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Category pills — the core control. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void selectCategory(null)}
          className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-black uppercase tracking-widest transition-colors ${
            activeCategoryId === null
              ? 'border-primary bg-primary/15 text-white'
              : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
          }`}
        >
          <Layers size={13} /> All
        </button>

        {categories.map((category) => {
          const isActive = activeCategoryId === category.id

          // Rename mode (double-clicked): inline editor commits on Enter/blur.
          if (editingId === category.id) {
            return (
              <div
                key={category.id}
                className="inline-flex items-center gap-1 rounded-full border border-primary/60 bg-primary/10 py-1.5 pl-3 pr-1.5"
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
                  className="w-28 bg-transparent text-xs font-black uppercase tracking-widest text-white focus:outline-none"
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
                className="inline-flex items-center gap-2 rounded-full border border-red-500/70 bg-red-500/10 px-3 py-2"
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
            <div key={category.id} className="group/cat relative">
              <button
                type="button"
                onClick={() => void selectCategory(category.id)}
                onDoubleClick={() => {
                  setEditingId(category.id)
                  setEditName(category.name)
                  setConfirmDeleteId(null)
                }}
                title="Click to open · double-click to rename"
                className={`inline-flex items-center gap-2 rounded-full border py-2 pl-3 pr-4 text-xs font-black uppercase tracking-widest transition-colors ${
                  isActive
                    ? 'border-primary bg-primary/15 text-white'
                    : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${CATEGORY_DOT[category.color] || 'bg-red-500'}`} />
                {category.name}
                {(category.unseenCount || 0) > 0 && (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-white">
                    {category.unseenCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  setConfirmDeleteId(category.id)
                }}
                title={`Delete ${category.name}`}
                aria-label={`Delete ${category.name}`}
                className="absolute -right-1 -top-1 hidden rounded-full border border-white/10 bg-surface p-0.5 text-white/40 hover:text-red-400 group-hover/cat:block"
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
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-white/15 px-4 py-2 text-xs font-black uppercase tracking-widest text-white/40 hover:border-primary/50 hover:text-white"
          >
            <Plus size={13} /> Category
          </button>
        ) : (
          <div className="inline-flex items-center gap-1 rounded-full border border-primary/50 bg-primary/10 py-1 pl-3 pr-1">
            <input
              autoFocus
              value={newCategoryName}
              onChange={(event) => setNewCategoryName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleCreateCategory()
                if (event.key === 'Escape') setNewCategoryName(null)
              }}
              placeholder="Name"
              className="w-32 bg-transparent text-xs font-bold text-white placeholder:text-white/30 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void handleCreateCategory()}
              className="rounded-full bg-primary p-1 text-white"
              aria-label="Create category"
            >
              <Plus size={12} />
            </button>
          </div>
        )}
      </div>

      {/* Stack header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
        <div className="flex items-center gap-3">
          <Sparkles size={16} className="text-primary" />
          <span className="text-sm font-black uppercase italic tracking-wider text-white">
            {videos.length} in the stack
          </span>
          <span className="text-xs font-semibold text-white/35">newest first</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleShorts}
            title={hideShorts ? 'Show Shorts' : 'Hide Shorts'}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-black uppercase tracking-widest transition-colors ${
              hideShorts ? 'bg-primary/20 text-white' : 'text-white/40 hover:bg-white/5 hover:text-white'
            }`}
          >
            {hideShorts ? <EyeOff size={13} /> : <Eye size={13} />}
            Shorts {hideShorts ? 'hidden' : 'shown'}
          </button>
          <button
            type="button"
            onClick={() => { setIncludeSeen((value) => !value); void loadFeed(activeCategoryId, { includeSeen: !includeSeen }) }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-black uppercase tracking-widest transition-colors ${
              includeSeen ? 'bg-white/10 text-white' : 'text-white/40 hover:bg-white/5 hover:text-white'
            }`}
          >
            <CheckCheck size={13} />
            {includeSeen ? 'Including watched' : 'Unseen only'}
          </button>
          <button
            type="button"
            onClick={() => void handleMarkAllSeen()}
            className="rounded-lg px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-white/40 hover:bg-white/5 hover:text-white"
          >
            Mark all seen
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((index) => (
            <div key={index}>
              <div className="aspect-video w-full rounded-xl bg-white/5 animate-pulse" />
              <div className="mt-2.5 h-3 w-4/5 rounded bg-white/5 animate-pulse" />
              <div className="mt-2 h-3 w-1/3 rounded bg-white/5 animate-pulse" />
            </div>
          ))}
        </div>
      ) : videos.length > 0 ? (
        <div className="space-y-10">
          {liveVideos.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Radio size={16} className="text-red-500" />
                <h3 className="text-sm font-black uppercase italic tracking-wider text-white">Live now</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {liveVideos.map((video) => (
                  <FocusTubeCard
                    key={video.videoId}
                    video={video}
                    onPlay={(item) => void handlePlay(item)}
                    onToggleSaved={(item) => void handleToggleSaved(item)}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {restVideos.map((video) => (
              <FocusTubeCard
                key={video.videoId}
                video={video}
                onPlay={(item) => void handlePlay(item)}
                onToggleSaved={(item) => void handleToggleSaved(item)}
              />
            ))}
          </div>
        </div>
      ) : search.trim() ? (
        <div className="flex flex-col items-center justify-center py-32 text-center space-y-4 opacity-30">
          <Search size={64} strokeWidth={1} />
          <h3 className="text-xl font-black uppercase italic">No matches</h3>
          <p className="text-xs font-bold uppercase tracking-widest">
            Nothing in your subscriptions matches “{search}”
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-32 text-center space-y-5 opacity-30">
          <CheckCheck size={72} strokeWidth={1} />
          <div className="space-y-2">
            <h3 className="text-2xl font-black uppercase italic">
              {activeCategory ? `${activeCategory.name} is clear` : 'Nothing new'}
            </h3>
            <p className="text-xs font-bold uppercase tracking-widest max-w-md">
              You have watched everything from your channels here
              {latestPublished ? `. Last upload ${formatAgo(latestPublished)} ago, on ${formatPublishedExact(latestPublished)}` : ''}
            </p>
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
          video={playing.video}
          startSeconds={playing.startSeconds}
          onClose={() => setPlaying(null)}
          onMarkSeen={(videoId) => void handleMarkSeen(videoId)}
          onSaveProgress={handleSaveProgress}
          onObserved={handleObserved}
          onNotEmbeddable={handleNotEmbeddable}
        />
      )}
    </div>
  )
}

export default FocusTube
