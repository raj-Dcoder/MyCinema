import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Check, Download, Loader2, Plus, RotateCcw, Search, Trash2, Users, X } from 'lucide-react'
import type { FtCategory, FtChannel } from '../../types'
import { categoryDot, formatRelativeTime } from '../../utils/focusTube'
import ImportSubscriptions from './ImportSubscriptions'

interface ChannelManagerProps {
  categories: FtCategory[]
  initialCategoryId: number | null
  onClose: () => void
  onChanged: () => void
}

interface FtSearchResult {
  channelId: string
  title: string
  handle: string | null
  avatarUrl: string | null
  subscriberText: string | null
  videoCountText: string | null
  descriptionSnippet: string | null
}

/**
 * Channel avatar with a letter fallback. googleusercontent URLs refuse odd
 * referrers, so no-referrer keeps the logo loading from a file:// page; a
 * dead URL falls back to the channel initial instead of a blank hole.
 */
const ChannelAvatar: React.FC<{ title: string; avatarUrl: string | null; sizeClass?: string }> = ({
  title,
  avatarUrl,
  sizeClass = 'h-11 w-11',
}) => {
  const [failed, setFailed] = useState(false)
  if (avatarUrl && !failed) {
    return (
      <img
        src={avatarUrl}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${sizeClass} shrink-0 rounded-full border border-white/10 bg-white/[0.06] object-cover`}
      />
    )
  }
  return (
    <div
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full border border-primary/25 bg-gradient-to-br from-primary/30 to-primary/5 text-sm font-black uppercase text-white`}
    >
      {(title || '?').trim().charAt(0) || '?'}
    </div>
  )
}

/**
 * Subscription management. Channels are the only thing the user curates
 * directly; categories are how those channels are filed for the stack.
 */
const ChannelManager: React.FC<ChannelManagerProps> = ({ categories, initialCategoryId, onClose, onChanged }) => {
  const [showYouTubeImport, setShowYouTubeImport] = useState(false)
  const [channels, setChannels] = useState<FtChannel[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Live search options for the query above (name, @handle, ID or pasted URL).
  const [results, setResults] = useState<FtSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [subscribingId, setSubscribingId] = useState<string | null>(null)
  const searchSeqRef = useRef(0)
  // Which category tab the subscribed list is filtered to. null = All,
  // 'uncategorized' = channels filed nowhere (visible only in the All feed).
  // Initialized from the category the manager was opened from, so opening
  // "View Tech channels" lands directly on Tech's subscriptions.
  const [filterId, setFilterId] = useState<number | null | 'uncategorized'>(initialCategoryId)
  // Two-step unsubscribe guard: first trash click arms, second confirms.
  const [confirmUnsubId, setConfirmUnsubId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const list = (await window.api.ftListChannels(null)) || []
    setChannels(list)
    setLoading(false)
    // Logos for channels subscribed before avatars existed are NULL in the
    // DB — backfill them once, then reload so the real logo replaces the
    // letter placeholder. Guarded so stale preloads simply skip it.
    if (list.some((c) => !c.avatarUrl) && typeof (window.api as any).ftRefreshChannelAvatars === 'function') {
      try {
        const done: any = await (window.api as any).ftRefreshChannelAvatars()
        if (done && typeof done.updated === 'number' && done.updated > 0) {
          setChannels((await window.api.ftListChannels(null)) || [])
        }
      } catch {
        // Logo refresh is cosmetic; the list is already shown.
      }
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const subscribedIds = new Set(channels.map((c) => c.channelId))

  // Live per-category counts derived from the channel list itself, so the
  // tabs stay truthful immediately after a remove/re-file, before the parent
  // has reloaded its own category rows.
  const counts = useMemo(() => {
    const map = new Map<number, number>()
    for (const channel of channels) {
      for (const id of channel.categoryIds) map.set(id, (map.get(id) ?? 0) + 1)
    }
    return map
  }, [channels])
  const uncategorizedChannels = useMemo(
    () => channels.filter((c) => c.categoryIds.length === 0),
    [channels],
  )
  const filterCategory = typeof filterId === 'number'
    ? categories.find((c) => c.id === filterId) ?? null
    : null
  const visibleChannels = useMemo(() => {
    if (filterId === null) return channels
    if (filterId === 'uncategorized') return uncategorizedChannels
    return channels.filter((c) => c.categoryIds.includes(filterId))
  }, [channels, filterId, uncategorizedChannels])
  const countFor = (id: number) => counts.get(id) ?? 0
  const selectFilter = (next: number | null | 'uncategorized') => {
    // Switching tabs disarms a pending unsubscribe confirmation elsewhere.
    setConfirmUnsubId(null)
    setFilterId(next)
  }
  // New subscriptions land in the tab being viewed when it is a category,
  // otherwise in the category the manager was opened from.
  const subscribeTargetId = typeof filterId === 'number'
    ? filterId
    : initialCategoryId ?? categories[0]?.id ?? null

  // Debounced search-as-you-type. Stale responses are dropped by sequence so
  // fast typing never flashes another query's options. Guards the bridge
  // function so a stale preload (pre-search build) simply skips live options
  // instead of throwing "not a function". Bumping searchRetry re-runs the
  // current query (the error panel's Retry button).
  const [searchRetry, setSearchRetry] = useState(0)
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2 || typeof (window.api as any).ftSearchChannels !== 'function') {
      setResults([])
      setSearchError(null)
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = window.setTimeout(async () => {
      const seq = searchSeqRef.current + 1
      searchSeqRef.current = seq
      try {
        const found: any = await window.api.ftSearchChannels(trimmed)
        if (searchSeqRef.current !== seq) return
        if (found?.error) {
          setResults([])
          setSearchError(found.error)
        } else if (Array.isArray(found)) {
          setResults(found)
          setSearchError(null)
        }
      } catch (err: any) {
        if (searchSeqRef.current !== seq) return
        setResults([])
        setSearchError(err?.message || 'Search failed — try again, or paste the channel URL.')
      } finally {
        if (searchSeqRef.current === seq) setSearching(false)
      }
    }, 500)
    return () => window.clearTimeout(timer)
  }, [query, searchRetry])

  // Instant local matches from existing subscriptions. Served from the local
  // DB, so this layer works offline and never fails — remote results join in
  // below when they arrive.
  const localMatches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle.length < 2) return []
    return channels.filter((channel) =>
      channel.title.toLowerCase().includes(needle)
      || (channel.handle || '').toLowerCase().includes(needle)
      || channel.channelId.toLowerCase().includes(needle),
    ).slice(0, 5)
  }, [channels, query])

  const handleSubscribeResult = useCallback(async (result: FtSearchResult) => {
    if (subscribedIds.has(result.channelId)) return
    setSubscribingId(result.channelId)
    setAddError(null)
    try {
      const targetCategoryId = subscribeTargetId
      const categoryIds = targetCategoryId ? [targetCategoryId] : []
      const channelUrl = `https://www.youtube.com/channel/${result.channelId}`
      // Stale preload without the direct-subscribe bridge falls back to the
      // classic query path (resolves the channel URL, same result).
      const done: any = typeof (window.api as any).ftSubscribeChannel === 'function'
        ? await window.api.ftSubscribeChannel(
            {
              channelId: result.channelId,
              title: result.title,
              handle: result.handle,
              avatarUrl: result.avatarUrl,
              url: channelUrl,
            },
            categoryIds,
          )
        : await window.api.ftAddChannel(channelUrl, categoryIds)
      if (done?.error) {
        setAddError(done.error)
        return
      }
      setResults((prev) => prev.filter((r) => r.channelId !== result.channelId))
      await load()
      onChanged()
    } catch (err: any) {
      setAddError(err?.message || 'Could not subscribe to that channel')
    } finally {
      setSubscribingId(null)
    }
  }, [subscribedIds, subscribeTargetId, load, onChanged])

  const handleAdd = useCallback(async () => {
    const trimmed = query.trim()
    if (!trimmed) return
    // Prefer the top search option when there is one; pasted URLs/IDs that
    // never produced options fall back to the direct resolve path.
    const top = results.find((r) => !subscribedIds.has(r.channelId))
    if (top && !searching) {
      await handleSubscribeResult(top)
      return
    }
    if (searching) return
    setAdding(true)
    setAddError(null)
    try {
      const targetCategoryId = subscribeTargetId
      const result: any = await window.api.ftAddChannel(trimmed, targetCategoryId ? [targetCategoryId] : [])
      if (result?.error) {
        setAddError(result.error)
        return
      }
      setQuery('')
      await load()
      onChanged()
    } catch (err: any) {
      setAddError(err?.message || 'Could not add that channel')
    } finally {
      setAdding(false)
    }
  }, [query, results, searching, subscribedIds, handleSubscribeResult, subscribeTargetId, load, onChanged])

  // Full unsubscribe: deletes the channel (and its videos) everywhere.
  const handleUnsubscribe = useCallback(async (channelId: string) => {
    await window.api.ftDeleteChannel(channelId)
    setConfirmUnsubId(null)
    await load()
    onChanged()
  }, [load, onChanged])

  const toggleCategory = useCallback(async (channelId: string, categoryId: number, currentlyIn: boolean) => {
    const channel = channels.find((c) => c.channelId === channelId)
    if (!channel) return
    const next = currentlyIn
      ? channel.categoryIds.filter((id) => id !== categoryId)
      : [...channel.categoryIds, categoryId]
    await window.api.ftSetChannelCategories(channelId, next)
    await load()
    onChanged()
  }, [channels, load, onChanged])

  return (
    <div className="fixed inset-0 z-[65] flex items-start justify-center overflow-y-auto bg-black/70 p-6 pt-16 backdrop-blur-sm">
      <div className="flex max-h-[calc(100vh-6rem)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-surface shadow-[0_40px_120px_-30px_rgba(0,0,0,1)]">
        <div className="relative shrink-0 overflow-hidden border-b border-white/[0.07] px-6 py-5">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-[70px]"
          />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-gradient-to-br from-primary/25 to-primary/5 text-primary">
                <Users size={20} strokeWidth={2.25} />
              </div>
              <div className="min-w-0">
                <h3 className="text-xl font-black uppercase italic tracking-tight text-white">Your channels</h3>
                <p className="mt-0.5 text-xs font-semibold text-white/35">
                  {filterCategory
                    ? `Viewing ${filterCategory.name} — ${visibleChannels.length} subscribed channel${visibleChannels.length === 1 ? '' : 's'}`
                    : 'Focus Tube only shows uploads from channels you subscribe to here'}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowYouTubeImport(true)}
                title="Import YouTube subscriptions"
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-3 text-[10px] font-black uppercase tracking-widest text-white/80 transition-colors hover:border-primary/40 hover:bg-primary/20 hover:text-white sm:h-10 sm:px-3.5"
              >
                <Download size={14} />
                <span className="hidden sm:inline">Import YouTube</span>
                <span className="sm:hidden">Import</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close channel manager"
                className="shrink-0 rounded-lg p-2 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-b border-white/[0.07] px-6 py-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') void handleAdd() }}
                placeholder="Search channel name, @handle, ID, or paste a URL"
                aria-label="Search YouTube channels"
                className="h-11 w-full rounded-xl border border-white/10 bg-black/30 pl-10 pr-10 text-sm font-semibold text-white placeholder:text-white/25 transition-colors hover:border-white/20 focus:border-primary/60 focus:bg-black/40 focus:outline-none focus:ring-4 focus:ring-primary/10"
              />
              {searching ? (
                <Loader2 size={15} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-white/40" />
              ) : query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-white/30 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={adding || subscribingId !== null || searching || !query.trim()}
              title={searching ? 'Resolving your search…' : filterCategory ? `Subscribe into ${filterCategory.name}` : 'Subscribe'}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-primary px-5 text-xs font-black uppercase tracking-widest text-white shadow-[0_10px_30px_-12px_rgba(229,9,20,0.9)] transition-colors hover:bg-primary/85 disabled:opacity-40 disabled:shadow-none"
            >
              {adding || subscribingId !== null || searching ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Subscribe
            </button>
          </div>

          {/* Search options — logo, name, handle/subs, one click to subscribe. */}
          {query.trim().length >= 2 && (
            <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/50 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]">
              {localMatches.length > 0 && (
                <div className="border-b border-white/[0.06]">
                  <p className="px-4 pt-3.5 pb-1 text-[10px] font-black uppercase tracking-[0.14em] text-white/30">
                    In your library — no search needed
                  </p>
                  <ul className="divide-y divide-white/[0.05]">
                    {localMatches.map((channel) => (
                      <li key={channel.channelId} className="flex items-center gap-3 px-4 py-2.5">
                        <ChannelAvatar title={channel.title} avatarUrl={channel.avatarUrl} sizeClass="h-8 w-8" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-white">{channel.title}</p>
                          <p className="truncate text-[11px] font-semibold text-white/40">
                            {channel.handle || channel.channelId}
                          </p>
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-300">
                          <Check size={11} /> Subscribed
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {searching && results.length === 0 && !searchError ? (
                <p className="px-4 py-6 text-center text-[11px] font-black uppercase tracking-widest text-white/30">
                  Searching YouTube…
                </p>
              ) : searchError ? (
                <div className="px-4 py-4">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
                    <AlertCircle size={13} /> {searchError}
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setSearchError(null); setSearchRetry((n) => n + 1) }}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <RotateCcw size={11} /> Try again
                    </button>
                    <span className="text-[11px] font-semibold text-white/30">
                      or paste the channel URL above and press Subscribe
                    </span>
                  </div>
                </div>
              ) : results.length === 0 && localMatches.length === 0 ? (
                <p className="px-4 py-6 text-center text-[11px] font-black uppercase tracking-widest text-white/30">
                  No channels found — try the @handle or paste the channel URL
                </p>
              ) : results.length === 0 ? null : (
                <ul className="max-h-72 divide-y divide-white/[0.05] overflow-y-auto">
                  {results.map((result) => {
                    const already = subscribedIds.has(result.channelId)
                    const busy = subscribingId === result.channelId
                    return (
                      <li key={result.channelId}>
                        <div className="group/result flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.04]">
                          <ChannelAvatar title={result.title} avatarUrl={result.avatarUrl} sizeClass="h-10 w-10" />
                          <button
                            type="button"
                            onClick={() => void handleSubscribeResult(result)}
                            disabled={already || busy}
                            className="min-w-0 flex-1 text-left"
                            title={already ? 'Already subscribed' : `Subscribe to ${result.title}`}
                          >
                            <p className="truncate text-sm font-bold text-white">{result.title}</p>
                            <p className="truncate text-[11px] font-semibold text-white/40">
                              {[result.handle, result.subscriberText, result.videoCountText].filter(Boolean).join(' · ')}
                            </p>
                            {result.descriptionSnippet && (
                              <p className="truncate text-[11px] text-white/25">{result.descriptionSnippet}</p>
                            )}
                          </button>
                          {already ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-300">
                              <Check size={11} /> Added
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void handleSubscribeResult(result)}
                              disabled={busy}
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-primary/85 disabled:opacity-40"
                            >
                              {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                              {busy ? '' : 'Add'}
                            </button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          {addError && (
            <p className="mt-3 flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300">
              <AlertCircle size={13} /> {addError}
            </p>
          )}
        </div>

        {/* Category tabs — how many channels are subscribed in each category. */}
        <div className="scrollbar-hide flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-white/[0.07] px-6 py-3">
          <button
            type="button"
            onClick={() => selectFilter(null)}
            title="Show every subscription"
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-black uppercase tracking-widest transition-colors ${
              filterId === null
                ? 'border-primary/50 bg-primary/15 text-white'
                : 'border-transparent text-white/40 hover:bg-white/[0.06] hover:text-white'
            }`}
          >
            All
            <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] tabular-nums tracking-normal opacity-80">
              {channels.length}
            </span>
          </button>
          {categories.map((category) => {
            const active = filterId === category.id
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => selectFilter(active ? null : category.id)}
                title={`${countFor(category.id)} subscribed channel${countFor(category.id) === 1 ? '' : 's'} in ${category.name} — click to view`}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-black uppercase tracking-widest transition-colors ${
                  active
                    ? 'border-primary/50 bg-primary/15 text-white'
                    : 'border-transparent text-white/40 hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                {category.name}
                <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] tabular-nums tracking-normal opacity-80">
                  {countFor(category.id)}
                </span>
              </button>
            )
          })}
          {uncategorizedChannels.length > 0 && (
            <button
              type="button"
              onClick={() => selectFilter(filterId === 'uncategorized' ? null : 'uncategorized')}
              title="Channels filed in no category — visible only in the All feed"
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-black uppercase tracking-widest transition-colors ${
                filterId === 'uncategorized'
                  ? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
                  : 'border-transparent text-amber-200/50 hover:bg-white/[0.06] hover:text-amber-200'
              }`}
            >
              No category
              <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[10px] tabular-nums tracking-normal opacity-80">
                {uncategorizedChannels.length}
              </span>
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {/* Scope line — makes clear whether unfiling acts on one category or everywhere. */}
          {!loading && channels.length > 0 && (
            <p className="mb-3.5 text-[11px] font-bold uppercase tracking-widest text-white/30">
              {filterCategory ? (
                <>{visibleChannels.length} channel{visibleChannels.length === 1 ? '' : 's'} in {filterCategory.name} · uncheck {filterCategory.name} under Categories to unfile {visibleChannels.length === 1 ? 'it' : 'them'} (stays subscribed elsewhere)</>
              ) : filterId === 'uncategorized' ? (
                <>{visibleChannels.length} channel{visibleChannels.length === 1 ? '' : 's'} with no category · shown only in All</>
              ) : (
                <>{channels.length} channel{channels.length === 1 ? '' : 's'} total · trash unsubscribes everywhere</>
              )}
            </p>
          )}
          {loading ? (
            <div className="space-y-2.5">
              {[1, 2, 3, 4].map((index) => (
                <div key={index} className="flex items-center gap-3 rounded-2xl border border-white/[0.06] p-3">
                  <div className="skeleton h-11 w-11 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-3.5 w-1/3 rounded" />
                    <div className="skeleton h-3 w-1/4 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : channels.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.03] text-white/25">
                <Users size={26} strokeWidth={1.5} />
              </div>
              <p className="text-sm font-black uppercase italic tracking-wide text-white">No channels yet</p>
              <p className="max-w-xs text-xs font-bold uppercase tracking-widest text-white/35">
                Search above and press Subscribe to build your stack
              </p>
            </div>
          ) : visibleChannels.length === 0 && filterCategory ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
              <p className="text-sm font-black uppercase italic tracking-wide text-white/60">
                No channels in {filterCategory.name}
              </p>
              <p className="max-w-sm text-xs font-semibold text-white/30">
                Subscribe above and it lands in {filterCategory.name}, or file an existing channel here via its Categories button under All.
              </p>
              <button
                type="button"
                onClick={() => selectFilter(null)}
                className="mt-1 rounded-lg border border-white/10 bg-white/5 px-3.5 py-2 text-[11px] font-black uppercase tracking-widest text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              >
                Show all channels
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {visibleChannels.map((channel) => {
                const isEditing = editingId === channel.channelId
                const memberCategories = channel.categoryIds
                  .map((id) => categories.find((c) => c.id === id))
                  .filter((c): c is FtCategory => !!c)
                return (
                  <div
                    key={channel.channelId}
                    className={`rounded-2xl border p-3 transition-colors ${
                      isEditing
                        ? 'border-primary/30 bg-primary/[0.06]'
                        : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <ChannelAvatar title={channel.title} avatarUrl={channel.avatarUrl} />

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-white">{channel.title}</p>
                        <p className="truncate text-[11px] font-semibold text-white/30">
                          {channel.handle || channel.channelId}
                          {channel.lastFetched && ` · updated ${formatRelativeTime(channel.lastFetched)}`}
                          {channel.lastError && ' · feed error'}
                        </p>
                        {memberCategories.length > 0 ? (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            {memberCategories.map((category) => (
                              <span
                                key={category.id}
                                className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/50"
                              >
<span className={`h-1.5 w-1.5 rounded-full ${categoryDot(category.color)}`} />
                                {category.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-amber-400/20 bg-amber-400/[0.07] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300/70">
                            No category — All feed only
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setEditingId(isEditing ? null : channel.channelId)}
                        title={isEditing ? 'Close category editor' : 'File this channel into categories'}
                        className={`shrink-0 rounded-lg border px-3 py-2 text-[11px] font-black uppercase tracking-widest transition-colors ${
                          isEditing
                            ? 'border-primary/50 bg-primary/15 text-white'
                            : 'border-transparent text-white/40 hover:bg-white/[0.07] hover:text-white'
                        }`}
                      >
                        {isEditing ? 'Done' : 'Categories'}
                      </button>

                      {confirmUnsubId === channel.channelId ? (
                        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-red-500/40 bg-red-500/10 px-1.5 py-1">
                          <span className="text-[10px] font-black uppercase tracking-widest text-red-300">Everywhere?</span>
                          <button
                            type="button"
                            onClick={() => void handleUnsubscribe(channel.channelId)}
                            aria-label={`Confirm unsubscribe from ${channel.title} everywhere`}
                            title={`Unsubscribe from ${channel.title} everywhere`}
                            className="rounded p-1 text-red-300 transition-colors hover:bg-red-500/20"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmUnsubId(null)}
                            aria-label={`Keep ${channel.title}`}
                            className="rounded p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmUnsubId(channel.channelId)}
                          aria-label={`Unsubscribe from ${channel.title}`}
                          title={filterCategory
                            ? `Unsubscribe from ${channel.title} everywhere (not just ${filterCategory.name})`
                            : `Unsubscribe from ${channel.title}`}
                          className="shrink-0 rounded-lg p-2 text-white/20 transition-colors hover:bg-red-500/15 hover:text-red-400"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>

                    {channel.lastError && (
                      <p className="mt-2.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-2.5 py-1.5 text-[11px] font-semibold text-amber-300/80">
                        Last refresh failed ({channel.lastError}) — showing the last good copy
                      </p>
                    )}

                    {isEditing && (
                      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/10 pt-3">
                        {categories.map((category) => {
                          const active = channel.categoryIds.includes(category.id)
                          return (
                            <button
                              key={category.id}
                              type="button"
                              onClick={() => void toggleCategory(channel.channelId, category.id, active)}
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                                active
                                  ? 'border-primary/50 bg-primary/15 text-white'
                                  : 'border-white/10 bg-white/[0.03] text-white/40 hover:bg-white/[0.08] hover:text-white'
                              }`}
                            >
                              {active
                                ? <Check size={11} />
                                : <span className={`h-1.5 w-1.5 rounded-full ${categoryDot(category.color)}`} />}
                              {category.name}
                            </button>
                          )
                        })}
                        {categories.length === 0 && (
                          <span className="text-[11px] font-semibold text-white/30">Create a category first</span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      {showYouTubeImport && (
        <ImportSubscriptions
          categories={categories}
          initialCategoryId={initialCategoryId}
          onClose={() => setShowYouTubeImport(false)}
          onImported={() => { void load(); onChanged() }}
        />
      )}
    </div>
  )
}

export default ChannelManager
