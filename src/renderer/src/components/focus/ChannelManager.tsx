import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Check, Loader2, Plus, RotateCcw, Search, Trash2, Users, X } from 'lucide-react'
import type { FtCategory, FtChannel } from '../../types'
import { formatRelativeTime } from '../../utils/focusTube'

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
  sizeClass = 'h-9 w-9',
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
        className={`${sizeClass} shrink-0 rounded-full bg-white/10 object-cover`}
      />
    )
  }
  return (
    <div className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-black uppercase text-white`}>
      {(title || '?').trim().charAt(0) || '?'}
    </div>
  )
}

/**
 * Subscription management. Channels are the only thing the user curates
 * directly; categories are how those channels are filed for the stack.
 */
const ChannelManager: React.FC<ChannelManagerProps> = ({ categories, initialCategoryId, onClose, onChanged }) => {
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
    <div className="fixed inset-0 z-[65] flex items-start justify-center overflow-y-auto bg-black/80 p-8 pt-20">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <h3 className="text-lg font-black uppercase italic text-white">Your channels</h3>
            <p className="text-xs font-semibold text-white/35">
              {filterCategory
                ? `Viewing ${filterCategory.name} — ${visibleChannels.length} subscribed channel${visibleChannels.length === 1 ? '' : 's'}`
                : 'Focus Tube only shows uploads from channels you subscribe to here'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close channel manager"
            className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="border-b border-white/10 px-6 py-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') void handleAdd() }}
                placeholder="Search channel name, @handle, ID, or paste a URL"
                aria-label="Search YouTube channels"
                className="w-full rounded-lg border border-white/10 bg-white/5 py-2.5 pl-9 pr-9 text-sm font-semibold text-white placeholder:text-white/25 focus:border-primary/50 focus:outline-none"
              />
              {searching && (
                <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-white/40" />
              )}
            </div>
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={adding || subscribingId !== null || searching || !query.trim()}
              title={searching ? 'Resolving your search…' : filterCategory ? `Subscribe into ${filterCategory.name}` : 'Subscribe'}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-xs font-black uppercase tracking-widest text-white disabled:opacity-40"
            >
              {adding || subscribingId !== null || searching ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Subscribe
            </button>
          </div>

          {/* Search options — logo, name, handle/subs, one click to subscribe. */}
          {query.trim().length >= 2 && (
            <div className="mt-2 overflow-hidden rounded-xl border border-white/10 bg-black/40">
              {localMatches.length > 0 && (
                <div className="border-b border-white/5">
                  <p className="px-4 pt-3 text-[10px] font-black uppercase tracking-widest text-white/30">
                    In your library — no search needed
                  </p>
                  <ul className="divide-y divide-white/5">
                    {localMatches.map((channel) => (
                      <li key={channel.channelId} className="flex items-center gap-3 px-3 py-2">
                        <ChannelAvatar title={channel.title} avatarUrl={channel.avatarUrl} sizeClass="h-8 w-8" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-white">{channel.title}</p>
                          <p className="truncate text-[11px] font-semibold text-white/40">
                            {channel.handle || channel.channelId}
                          </p>
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-300">
                          <Check size={11} /> Subscribed
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {searching && results.length === 0 && !searchError ? (
                <p className="px-4 py-5 text-center text-[11px] font-black uppercase tracking-widest text-white/30">
                  Searching YouTube…
                </p>
              ) : searchError ? (
                <div className="px-4 py-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-red-400">
                    <AlertCircle size={13} /> {searchError}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setSearchError(null); setSearchRetry((n) => n + 1) }}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-white/60 hover:bg-white/10 hover:text-white"
                    >
                      <RotateCcw size={11} /> Try again
                    </button>
                    <span className="text-[11px] font-semibold text-white/30">
                      or paste the channel URL above and press Subscribe
                    </span>
                  </div>
                </div>
              ) : results.length === 0 && localMatches.length === 0 ? (
                <p className="px-4 py-5 text-center text-[11px] font-black uppercase tracking-widest text-white/30">
                  No channels found — try the @handle or paste the channel URL
                </p>
              ) : results.length === 0 ? null : (
                <ul className="max-h-64 divide-y divide-white/5 overflow-y-auto">
                  {results.map((result) => {
                    const already = subscribedIds.has(result.channelId)
                    const busy = subscribingId === result.channelId
                    return (
                      <li key={result.channelId}>
                        <div className="flex items-center gap-3 px-3 py-2.5">
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
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-300">
                              <Check size={11} /> Added
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void handleSubscribeResult(result)}
                              disabled={busy}
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40"
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
            <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-red-400">
              <AlertCircle size={13} /> {addError}
            </p>
          )}
        </div>

        {/* Category tabs — how many channels are subscribed in each category. */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 px-6 py-3">
          <button
            type="button"
            onClick={() => selectFilter(null)}
            title="Show every subscription"
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-widest transition-colors ${
              filterId === null
                ? 'border-primary bg-primary/20 text-white'
                : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
            }`}
          >
            All
            <span className="inline-flex items-center gap-0.5 opacity-70">
              <Users size={11} aria-hidden /> {channels.length}
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
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-widest transition-colors ${
                  active
                    ? 'border-primary bg-primary/20 text-white'
                    : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
                }`}
              >
                {category.name}
                <span className="inline-flex items-center gap-0.5 opacity-70">
                  <Users size={11} aria-hidden /> {countFor(category.id)}
                </span>
              </button>
            )
          })}
          {uncategorizedChannels.length > 0 && (
            <button
              type="button"
              onClick={() => selectFilter(filterId === 'uncategorized' ? null : 'uncategorized')}
              title="Channels filed in no category — visible only in the All feed"
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-widest transition-colors ${
                filterId === 'uncategorized'
                  ? 'border-primary bg-primary/20 text-white'
                  : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
              }`}
            >
              No category
              <span className="inline-flex items-center gap-0.5 opacity-70">
                <Users size={11} aria-hidden /> {uncategorizedChannels.length}
              </span>
            </button>
          )}
        </div>

        <div className="max-h-[52vh] overflow-y-auto px-6 py-4">
          {/* Scope line — makes clear whether unfiling acts on one category or everywhere. */}
          {!loading && channels.length > 0 && (
            <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-white/35">
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
            <p className="py-8 text-center text-xs font-bold uppercase tracking-widest text-white/25">Loading</p>
          ) : channels.length === 0 ? (
            <div className="py-10 text-center opacity-30">
              <p className="text-sm font-black uppercase italic">No channels yet</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-widest">Subscribe above to build your stack</p>
            </div>
          ) : visibleChannels.length === 0 && filterCategory ? (
            <div className="py-10 text-center">
              <p className="text-sm font-black uppercase italic text-white/60">No channels in {filterCategory.name}</p>
              <p className="mx-auto mt-1 max-w-sm text-xs font-semibold text-white/30">
                Subscribe above and it lands in {filterCategory.name}, or file an existing channel here via its Categories button under All.
              </p>
              <button
                type="button"
                onClick={() => selectFilter(null)}
                className="mt-3 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-black uppercase tracking-widest text-white/60 hover:bg-white/10 hover:text-white"
              >
                Show all channels
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleChannels.map((channel) => {
                const isEditing = editingId === channel.channelId
                const memberNames = channel.categoryIds
                  .map((id) => categories.find((c) => c.id === id)?.name)
                  .filter((name): name is string => !!name)
                return (
                  <div key={channel.channelId} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex items-center gap-3">
                      <ChannelAvatar title={channel.title} avatarUrl={channel.avatarUrl} />

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-white">{channel.title}</p>
                        <p className="text-[11px] font-semibold text-white/30">
                          {channel.handle || channel.channelId}
                          {channel.lastFetched && ` · updated ${formatRelativeTime(channel.lastFetched)}`}
                          {channel.lastError && ' · feed error'}
                        </p>
                        {memberNames.length > 0 ? (
                          <p className="mt-0.5 truncate text-[10px] font-bold uppercase tracking-widest text-white/25">
                            in {memberNames.join(' · ')}
                          </p>
                        ) : (
                          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-amber-500/60">
                            no category — All feed only
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setEditingId(isEditing ? null : channel.channelId)}
                        className="rounded-lg px-2.5 py-1.5 text-[11px] font-black uppercase tracking-widest text-white/40 hover:bg-white/10 hover:text-white"
                      >
                        {isEditing ? 'Done' : 'Categories'}
                      </button>
                      {confirmUnsubId === channel.channelId ? (
                        <div className="flex items-center gap-1 rounded-lg border border-red-500/50 bg-red-500/10 px-1.5 py-1">
                          <span className="text-[10px] font-black uppercase tracking-widest text-red-300">Everywhere?</span>
                          <button
                            type="button"
                            onClick={() => void handleUnsubscribe(channel.channelId)}
                            aria-label={`Confirm unsubscribe from ${channel.title} everywhere`}
                            title={`Unsubscribe from ${channel.title} everywhere`}
                            className="rounded p-1 text-red-300 hover:bg-red-500/20"
                          >
                            <Check size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmUnsubId(null)}
                            aria-label={`Keep ${channel.title}`}
                            className="rounded p-1 text-white/50 hover:bg-white/10 hover:text-white"
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
                          className="rounded-lg p-2 text-white/25 hover:bg-red-500/15 hover:text-red-400"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>

                    {channel.lastError && (
                      <p className="mt-2 text-[11px] font-semibold text-amber-500/80">
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
                              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide transition-colors ${
                                active
                                  ? 'border-primary bg-primary/20 text-white'
                                  : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
                              }`}
                            >
                              {active && <Check size={11} />}
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
    </div>
  )
}

export default ChannelManager
