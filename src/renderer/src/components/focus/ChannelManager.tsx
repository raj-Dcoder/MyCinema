import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, Check, Download, ListVideo, Loader2, Plus, RotateCcw, Search, Sparkles, Trash2, Users, X } from 'lucide-react'
import type { FtCategory, FtChannel, FtPlaylist } from '../../types'
import { categoryDot, formatRelativeTime } from '../../utils/focusTube'
import ImportSubscriptions from './ImportSubscriptions'
import { RequestTestUserModal } from './RequestTestUserModal'

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
  sizeClass = 'h-10 w-10',
}) => {
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setFailed(false)
  }, [avatarUrl])
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
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-xs font-semibold text-primary`}
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
  const [showRegisterModal, setShowRegisterModal] = useState(false)
  const [activeTab, setActiveTab] = useState<'channels' | 'playlists'>('channels')
  const [channels, setChannels] = useState<FtChannel[]>([])
  const [playlists, setPlaylists] = useState<FtPlaylist[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingPlaylistId, setEditingPlaylistId] = useState<string | null>(null)
  // Live search options for the query above (name, @handle, ID or pasted URL).
  const [results, setResults] = useState<FtSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [subscribingId, setSubscribingId] = useState<string | null>(null)
  const searchSeqRef = useRef(0)
  // Which category tab the subscribed list is filtered to. null = All,
  // 'uncategorized' = channels filed nowhere (visible only in the All feed).
  const [filterId, setFilterId] = useState<number | null | 'uncategorized'>(initialCategoryId)
  // Two-step unsubscribe guard: first trash click arms, second confirms.
  const [confirmUnsubId, setConfirmUnsubId] = useState<string | null>(null)
  const [confirmUnsubPlaylistId, setConfirmUnsubPlaylistId] = useState<string | null>(null)

  const isPlaylistInput = useMemo(() => {
    const t = query.trim()
    return /[?&]list=([A-Za-z0-9_-]+)/.test(t) || /^(PL|UU|FL|RD|OLAK5uy_)[\w-]{10,}$/.test(t)
  }, [query])

  const load = useCallback(async () => {
    try {
      const [cList, pList] = await Promise.all([
        window.api.ftListChannels(null),
        typeof (window.api as any).ftListPlaylists === 'function' ? window.api.ftListPlaylists(null) : Promise.resolve([]),
      ])
      setChannels(cList || [])
      setPlaylists(pList || [])
    } finally {
      setLoading(false)
    }

    if (channels.some((c) => !c.avatarUrl) && typeof (window.api as any).ftRefreshChannelAvatars === 'function') {
      try {
        const done: any = await (window.api as any).ftRefreshChannelAvatars()
        if (done && typeof done.updated === 'number' && done.updated > 0) {
          setChannels((await window.api.ftListChannels(null)) || [])
        }
      } catch {
        // Logo refresh is cosmetic; the list is already shown.
      }
    }
  }, [channels])

  useEffect(() => { void load() }, [load])

  const subscribedIds = new Set(channels.map((c) => c.channelId))

  // Live per-category counts derived from channel & playlist lists
  const counts = useMemo(() => {
    const map = new Map<number, number>()
    for (const channel of channels) {
      for (const id of channel.categoryIds) map.set(id, (map.get(id) ?? 0) + 1)
    }
    return map
  }, [channels])

  const playlistCounts = useMemo(() => {
    const map = new Map<number, number>()
    for (const pl of playlists) {
      for (const id of pl.categoryIds) map.set(id, (map.get(id) ?? 0) + 1)
    }
    return map
  }, [playlists])

  const uncategorizedChannels = useMemo(
    () => channels.filter((c) => c.categoryIds.length === 0),
    [channels],
  )
  const uncategorizedPlaylists = useMemo(
    () => playlists.filter((p) => p.categoryIds.length === 0),
    [playlists],
  )

  const filterCategory = typeof filterId === 'number'
    ? categories.find((c) => c.id === filterId) ?? null
    : null

  const visibleChannels = useMemo(() => {
    if (filterId === null) return channels
    if (filterId === 'uncategorized') return uncategorizedChannels
    return channels.filter((c) => c.categoryIds.includes(filterId))
  }, [channels, filterId, uncategorizedChannels])

  const visiblePlaylists = useMemo(() => {
    if (filterId === null) return playlists
    if (filterId === 'uncategorized') return uncategorizedPlaylists
    return playlists.filter((p) => p.categoryIds.includes(filterId))
  }, [playlists, filterId, uncategorizedPlaylists])

  const countFor = (id: number) => {
    if (activeTab === 'playlists') return playlistCounts.get(id) ?? 0
    return counts.get(id) ?? 0
  }

  const selectFilter = (next: number | null | 'uncategorized') => {
    setConfirmUnsubId(null)
    setConfirmUnsubPlaylistId(null)
    setFilterId(next)
  }

  // Category target state for new subscriptions. Default to current filter or initial category.
  const [selectedAddCategoryId, setSelectedAddCategoryId] = useState<number | null>(() => {
    return typeof initialCategoryId === 'number' ? initialCategoryId : (categories[0]?.id ?? null)
  })

  // When viewing a category tab, sync the target category selector
  useEffect(() => {
    if (typeof filterId === 'number') {
      setSelectedAddCategoryId(filterId)
    }
  }, [filterId])

  // Debounced search-as-you-type. Stale responses are dropped by sequence so
  // fast typing never flashes another query's options. Guards the bridge
  // function so a stale preload (pre-search build) simply skips live options
  // instead of throwing "not a function". Bumping searchRetry re-runs the
  // current query (the error panel's Retry button).
  const [searchRetry, setSearchRetry] = useState(0)
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2 || isPlaylistInput || typeof (window.api as any).ftSearchChannels !== 'function') {
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
    if (isPlaylistInput) return []
    const needle = query.trim().toLowerCase()
    if (needle.length < 2) return []
    return channels.filter((channel) =>
      channel.title.toLowerCase().includes(needle)
      || (channel.handle || '').toLowerCase().includes(needle)
      || channel.channelId.toLowerCase().includes(needle),
    ).slice(0, 5)
  }, [channels, query, isPlaylistInput])

  const handleSubscribeResult = useCallback(async (result: FtSearchResult, overrideCategoryId?: number | null) => {
    if (subscribedIds.has(result.channelId)) return
    setSubscribingId(result.channelId)
    setAddError(null)
    try {
      const targetCategoryId = overrideCategoryId !== undefined ? overrideCategoryId : selectedAddCategoryId
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
  }, [subscribedIds, selectedAddCategoryId, load, onChanged])

  const handleAdd = useCallback(async () => {
    const trimmed = query.trim()
    if (!trimmed) return

    if (isPlaylistInput) {
      setAdding(true)
      setAddError(null)
      try {
        const targetCategoryId = selectedAddCategoryId
        const result: any = await window.api.ftAddPlaylist(trimmed, targetCategoryId ? [targetCategoryId] : [])
        if (result?.error) {
          setAddError(result.error)
          return
        }
        setQuery('')
        setActiveTab('playlists')
        await load()
        onChanged()
      } catch (err: any) {
        setAddError(err?.message || 'Could not add that playlist')
      } finally {
        setAdding(false)
      }
      return
    }

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
      const targetCategoryId = selectedAddCategoryId
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
  }, [query, isPlaylistInput, results, searching, subscribedIds, handleSubscribeResult, selectedAddCategoryId, load, onChanged])

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

  const handleUnsubscribePlaylist = useCallback(async (playlistId: string) => {
    await window.api.ftDeletePlaylist(playlistId)
    setConfirmUnsubPlaylistId(null)
    await load()
    onChanged()
  }, [load, onChanged])

  const togglePlaylistCategory = useCallback(async (playlistId: string, categoryId: number, currentlyIn: boolean) => {
    const pl = playlists.find((p) => p.playlistId === playlistId)
    if (!pl) return
    const next = currentlyIn
      ? pl.categoryIds.filter((id) => id !== categoryId)
      : [...pl.categoryIds, categoryId]
    await window.api.ftSetPlaylistCategories(playlistId, next)
    await load()
    onChanged()
  }, [playlists, load, onChanged])

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/80 p-6 pt-16 backdrop-blur-md">
      <div className="flex max-h-[calc(100vh-6rem)] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-surface shadow-[0_40px_120px_-30px_rgba(0,0,0,1)]">
        <div className="relative shrink-0 overflow-hidden border-b border-white/[0.08] px-6 py-4">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-[70px]"
          />
          <div className="relative flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-primary">
                {activeTab === 'playlists' ? <ListVideo size={19} /> : <Users size={19} />}
              </div>
              <div>
                <h3 className="text-base font-semibold tracking-tight text-white">Subscriptions</h3>
                <p className="text-[11px] text-white/40">Manage your channels and playlists</p>
              </div>
            </div>

            {/* Segmented Tab Switcher */}
            <div className="flex items-center rounded-xl border border-white/10 bg-black/40 p-1">
              <button
                type="button"
                onClick={() => { setActiveTab('channels'); setConfirmUnsubId(null) }}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  activeTab === 'channels'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-white/50 hover:text-white'
                }`}
              >
                <Users size={13} />
                <span>Channels ({channels.length})</span>
              </button>
              <button
                type="button"
                onClick={() => { setActiveTab('playlists'); setConfirmUnsubPlaylistId(null) }}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  activeTab === 'playlists'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-white/50 hover:text-white'
                }`}
              >
                <ListVideo size={13} />
                <span>Playlists ({playlists.length})</span>
              </button>
            </div>

            {/* Header Actions */}
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setShowRegisterModal(true)}
                title="Register your Google account for YouTube import access"
                className="hidden sm:inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-400/20 bg-amber-400/10 px-2.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-400/20"
              >
                <Sparkles size={13} />
                <span>Test Access</span>
              </button>
              <button
                type="button"
                onClick={() => setShowYouTubeImport(true)}
                title="Import YouTube subscriptions"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 text-xs font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                <Download size={13} />
                <span className="hidden sm:inline">Import</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close channel manager"
                className="shrink-0 rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Search & Add UI ── */}
        <div className="shrink-0 border-b border-white/[0.07] px-6 py-3.5">
          {/* Main Search Input Group */}
          <div className="flex gap-2">
            <div className="relative flex-1 group">
              {isPlaylistInput ? (
                <ListVideo size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-primary" />
              ) : (
                <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/35 transition-colors group-focus-within:text-primary" />
              )}
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') void handleAdd() }}
                placeholder={
                  activeTab === 'playlists' || isPlaylistInput
                    ? 'Paste YouTube playlist URL...'
                    : 'Search channels by name, @handle, or paste URL...'
                }
                aria-label="Search YouTube channels or playlists"
                className="h-10 w-full rounded-xl border border-white/10 bg-black/40 pl-10 pr-9 text-xs sm:text-sm text-white placeholder:text-white/30 transition-all hover:border-white/20 focus:border-primary/60 focus:bg-black/60 focus:outline-none"
              />
              {searching ? (
                <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-white/40" />
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

            {/* Target Category Selector */}
            {categories.length > 0 && (
              <select
                value={selectedAddCategoryId ?? ''}
                onChange={(e) => setSelectedAddCategoryId(e.target.value ? Number(e.target.value) : null)}
                title="Category for new subscription"
                className="h-10 rounded-xl border border-white/10 bg-black/40 px-3 text-xs font-medium text-white/70 outline-none hover:border-white/20 focus:border-primary transition-colors cursor-pointer"
              >
                <option value="" className="bg-[#14161f] text-white">No Category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id} className="bg-[#14161f] text-white">
                    {cat.name}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={adding || subscribingId !== null || (searching && !isPlaylistInput) || !query.trim()}
              title={isPlaylistInput ? 'Add playlist' : searching ? 'Resolving your search…' : 'Subscribe to channel'}
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-xs font-semibold text-white shadow-sm transition-all hover:bg-primary/85 active:scale-95 disabled:opacity-40 disabled:shadow-none"
            >
              {adding || subscribingId !== null || (searching && !isPlaylistInput) ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={15} />
              )}
              <span>{adding ? 'Adding…' : isPlaylistInput ? 'Add Playlist' : 'Subscribe'}</span>
            </button>
          </div>

          {/* Playlist Detected Callout */}
          {isPlaylistInput && (
            <div className="mt-2.5 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs">
              <div className="flex items-center gap-2 text-white">
                <ListVideo size={15} className="text-primary shrink-0" />
                <span className="font-semibold text-white/90">YouTube Playlist detected</span>
                <span className="text-white/40">·</span>
                <span className="text-white/60">
                  Target:{' '}
                  <span className="font-medium text-white">
                    {selectedAddCategoryId
                      ? categories.find((c) => c.id === selectedAddCategoryId)?.name || 'selected category'
                      : 'Uncategorized'}
                  </span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => void handleAdd()}
                disabled={adding}
                className="shrink-0 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-white hover:bg-primary/80 transition-colors"
              >
                {adding ? 'Adding…' : 'Add Now'}
              </button>
            </div>
          )}

          {/* Search options / Results */}
          {query.trim().length >= 2 && (
            <div className="mt-2.5 overflow-hidden rounded-xl border border-white/10 bg-black/80 shadow-2xl backdrop-blur-md">
              {localMatches.length > 0 && (
                <div className="border-b border-white/[0.06]">
                  <p className="px-3.5 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                    Already in your library
                  </p>
                  <ul className="divide-y divide-white/[0.05]">
                    {localMatches.map((channel) => (
                      <li key={channel.channelId} className="flex items-center gap-3 px-3.5 py-2">
                        <ChannelAvatar title={channel.title} avatarUrl={channel.avatarUrl} sizeClass="h-8 w-8" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-white">{channel.title}</p>
                          {channel.handle && !/^UC[\w-]{21,24}$/i.test(channel.handle.replace(/^@/, '')) && (
                            <p className="truncate text-[11px] text-white/40">
                              {channel.handle.startsWith('@') ? channel.handle : `@${channel.handle}`}
                            </p>
                          )}
                        </div>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                          <Check size={11} /> Subscribed
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {searching && results.length === 0 && !searchError ? (
                <div className="flex flex-col items-center justify-center py-6">
                  <Loader2 size={18} className="animate-spin text-primary mb-1.5" />
                  <p className="text-xs text-white/50">Searching YouTube channels…</p>
                </div>
              ) : searchError ? (
                <div className="px-3.5 py-3">
                  <p className="flex items-center gap-1.5 text-xs text-red-400">
                    <AlertCircle size={13} /> {searchError}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { setSearchError(null); setSearchRetry((n) => n + 1) }}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <RotateCcw size={11} /> Try again
                    </button>
                    <span className="text-[11px] text-white/40">
                      or paste the channel URL above and press Subscribe
                    </span>
                  </div>
                </div>
              ) : results.length === 0 && localMatches.length === 0 ? (
                <div className="px-4 py-5 text-center">
                  <p className="text-xs text-white/50">
                    No channels found matching "{query}"
                  </p>
                  <p className="mt-0.5 text-[11px] text-white/30">
                    Tip: Enter exact handle (e.g. <span className="font-mono text-white/50">@mkbhd</span>) or channel link.
                  </p>
                </div>
              ) : results.length === 0 ? null : (
                <ul className="max-h-72 divide-y divide-white/[0.05] overflow-y-auto">
                  {results.map((result) => {
                    const already = subscribedIds.has(result.channelId)
                    const busy = subscribingId === result.channelId
                    return (
                      <li key={result.channelId}>
                        <div className="group/result flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-white/[0.04]">
                          <ChannelAvatar title={result.title} avatarUrl={result.avatarUrl} sizeClass="h-9 w-9" />
                          <button
                            type="button"
                            onClick={() => void handleSubscribeResult(result)}
                            disabled={already || busy}
                            className="min-w-0 flex-1 text-left"
                            title={already ? 'Already subscribed' : `Subscribe to ${result.title}`}
                          >
                            <p className="truncate text-xs font-semibold text-white group-hover/result:text-primary transition-colors">
                              {result.title}
                            </p>
                            <p className="truncate text-[11px] text-white/40">
                              {[result.handle, result.subscriberText, result.videoCountText].filter(Boolean).join(' • ')}
                            </p>
                            {result.descriptionSnippet && (
                              <p className="truncate text-[10px] text-white/30 mt-0.5">{result.descriptionSnippet}</p>
                            )}
                          </button>
                          {already ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-0.5 text-[10px] font-medium text-emerald-300">
                              <Check size={11} /> Added
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void handleSubscribeResult(result)}
                              disabled={busy}
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-all hover:bg-primary/85 active:scale-95 disabled:opacity-40"
                            >
                              {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                              <span>{busy ? 'Adding…' : 'Add'}</span>
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
            <p className="mt-2.5 flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
              <AlertCircle size={13} /> {addError}
            </p>
          )}
        </div>

        {/* Category filter tabs */}
        <div className="scrollbar-hide flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-white/[0.07] px-6 py-2.5">
          <button
            type="button"
            onClick={() => selectFilter(null)}
            title="Show every subscription"
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              filterId === null
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'text-white/50 hover:bg-white/[0.06] hover:text-white border border-transparent'
            }`}
          >
            <span>All</span>
            <span className="rounded-full bg-white/10 px-1.5 py-0.2 text-[10px] tabular-nums">
              {activeTab === 'channels' ? channels.length : playlists.length}
            </span>
          </button>
          {categories.map((category) => {
            const active = filterId === category.id
            const count = countFor(category.id)
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => selectFilter(active ? null : category.id)}
                title={`${count} subscribed in ${category.name}`}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'text-white/50 hover:bg-white/[0.06] hover:text-white border border-transparent'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${categoryDot(category.color)}`} />
                <span>{category.name}</span>
                <span className="rounded-full bg-white/10 px-1.5 py-0.2 text-[10px] tabular-nums">
                  {count}
                </span>
              </button>
            )
          })}
          {(activeTab === 'channels' ? uncategorizedChannels.length : uncategorizedPlaylists.length) > 0 && (
            <button
              type="button"
              onClick={() => selectFilter(filterId === 'uncategorized' ? null : 'uncategorized')}
              title="Items filed in no category — visible only in the All feed"
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filterId === 'uncategorized'
                  ? 'border border-amber-400/40 bg-amber-400/10 text-amber-200'
                  : 'border border-transparent text-amber-200/50 hover:bg-white/[0.06] hover:text-amber-200'
              }`}
            >
              <span>Uncategorized</span>
              <span className="rounded-full bg-white/10 px-1.5 py-0.2 text-[10px] tabular-nums">
                {activeTab === 'channels' ? uncategorizedChannels.length : uncategorizedPlaylists.length}
              </span>
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {activeTab === 'playlists' ? (
            <>
              {/* Playlists view */}
              {!loading && playlists.length > 0 && (
                <div className="mb-3 flex items-center justify-between text-xs text-white/40">
                  <span>
                    {filterCategory ? (
                      <>{visiblePlaylists.length} playlist{visiblePlaylists.length === 1 ? '' : 's'} in {filterCategory.name}</>
                    ) : filterId === 'uncategorized' ? (
                      <>{visiblePlaylists.length} uncategorized playlist{visiblePlaylists.length === 1 ? '' : 's'}</>
                    ) : (
                      <>{playlists.length} playlist{playlists.length === 1 ? '' : 's'} total</>
                    )}
                  </span>
                  {filterCategory && (
                    <span className="text-[11px] text-white/30 hidden sm:inline">
                      Uncheck category to remove from this tab
                    </span>
                  )}
                </div>
              )}

              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((index) => (
                    <div key={index} className="flex items-center gap-3 rounded-xl border border-white/[0.06] p-3">
                      <div className="skeleton h-10 w-16 shrink-0 rounded-lg" />
                      <div className="flex-1 space-y-2">
                        <div className="skeleton h-3.5 w-1/3 rounded" />
                        <div className="skeleton h-3 w-1/4 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : playlists.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-primary">
                    <ListVideo size={22} strokeWidth={1.5} />
                  </div>
                  <p className="text-sm font-semibold text-white">No playlists yet</p>
                  <p className="max-w-xs text-xs text-white/40">
                    Paste a YouTube playlist URL above to add videos to your categories.
                  </p>
                </div>
              ) : visiblePlaylists.length === 0 && filterCategory ? (
                <div className="flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
                  <p className="text-sm font-semibold text-white/70">
                    No playlists in {filterCategory.name}
                  </p>
                  <p className="max-w-sm text-xs text-white/40">
                    Paste a playlist URL above and file it into {filterCategory.name}, or assign an existing playlist via its Categories button.
                  </p>
                  <button
                    type="button"
                    onClick={() => selectFilter(null)}
                    className="mt-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    Show all playlists
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {visiblePlaylists.map((pl) => {
                    const isEditing = editingPlaylistId === pl.playlistId
                    const memberCategories = pl.categoryIds
                      .map((id) => categories.find((c) => c.id === id))
                      .filter((c): c is FtCategory => !!c)
                    return (
                      <div
                        key={pl.playlistId}
                        className={`rounded-xl border p-3 transition-all ${
                          isEditing
                            ? 'border-primary/40 bg-primary/[0.04]'
                            : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.03]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {pl.thumbnailUrl ? (
                            <img
                              src={pl.thumbnailUrl}
                              alt=""
                              className="h-10 w-16 shrink-0 rounded-lg border border-white/10 bg-white/[0.06] object-cover"
                            />
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-primary">
                              <ListVideo size={18} />
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-semibold text-white">{pl.title}</p>
                              {pl.videoCount !== undefined && pl.videoCount > 0 && (
                                <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/70">
                                  {pl.videoCount} {pl.videoCount === 1 ? 'video' : 'videos'}
                                </span>
                              )}
                            </div>
                            <p className="truncate text-xs text-white/40 mt-0.5">
                              {pl.channelTitle ? `by ${pl.channelTitle}` : 'Playlist'}
                              {pl.lastFetched && ` · ${formatRelativeTime(pl.lastFetched)}`}
                              {pl.lastError && ' · feed error'}
                            </p>
                            {memberCategories.length > 0 ? (
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                {memberCategories.map((category) => (
                                  <span
                                    key={category.id}
                                    className="inline-flex items-center gap-1 rounded-md bg-white/[0.05] px-2 py-0.5 text-[11px] font-medium text-white/60"
                                  >
                                    <span className={`h-1.5 w-1.5 rounded-full ${categoryDot(category.color)}`} />
                                    {category.name}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-400/[0.07] px-2 py-0.5 text-[11px] font-medium text-amber-300/80">
                                No category
                              </span>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => setEditingPlaylistId(isEditing ? null : pl.playlistId)}
                            title={isEditing ? 'Close category editor' : 'Manage categories'}
                            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                              isEditing
                                ? 'bg-primary text-white shadow-sm'
                                : 'border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            {isEditing ? 'Done' : 'Categories'}
                          </button>

                          {confirmUnsubPlaylistId === pl.playlistId ? (
                            <div className="flex shrink-0 items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1">
                              <span className="text-[11px] font-medium text-red-300">Remove?</span>
                              <button
                                type="button"
                                onClick={() => void handleUnsubscribePlaylist(pl.playlistId)}
                                aria-label={`Confirm remove ${pl.title}`}
                                title={`Remove ${pl.title} everywhere`}
                                className="rounded p-1 text-red-300 transition-colors hover:bg-red-500/20"
                              >
                                <Check size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmUnsubPlaylistId(null)}
                                className="rounded p-1 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmUnsubPlaylistId(pl.playlistId)}
                              aria-label={`Remove ${pl.title}`}
                              title={`Remove ${pl.title}`}
                              className="shrink-0 rounded-lg p-2 text-white/30 transition-colors hover:bg-red-500/15 hover:text-red-400"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>

                        {pl.lastError && (
                          <p className="mt-2.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-2.5 py-1.5 text-xs text-amber-300/80">
                            Last refresh failed ({pl.lastError})
                          </p>
                        )}

                        {isEditing && (
                          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-3">
                            {categories.map((category) => {
                              const active = pl.categoryIds.includes(category.id)
                              return (
                                <button
                                  key={category.id}
                                  type="button"
                                  onClick={() => void togglePlaylistCategory(pl.playlistId, category.id, active)}
                                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                                    active
                                      ? 'border border-primary/50 bg-primary/20 text-white'
                                      : 'border border-white/10 bg-white/[0.03] text-white/50 hover:bg-white/[0.08] hover:text-white'
                                  }`}
                                >
                                  {active ? (
                                    <Check size={12} className="text-primary" />
                                  ) : (
                                    <span className={`h-1.5 w-1.5 rounded-full ${categoryDot(category.color)}`} />
                                  )}
                                  {category.name}
                                </button>
                              )
                            })}
                            {categories.length === 0 && (
                              <span className="text-xs text-white/40">Create a category first</span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Channels view */}
              {!loading && channels.length > 0 && (
                <div className="mb-3 flex items-center justify-between text-xs text-white/40">
                  <span>
                    {filterCategory ? (
                      <>{visibleChannels.length} channel{visibleChannels.length === 1 ? '' : 's'} in {filterCategory.name}</>
                    ) : filterId === 'uncategorized' ? (
                      <>{visibleChannels.length} uncategorized channel{visibleChannels.length === 1 ? '' : 's'}</>
                    ) : (
                      <>{channels.length} channel{channels.length === 1 ? '' : 's'} subscribed</>
                    )}
                  </span>
                  {filterCategory && (
                    <span className="text-[11px] text-white/30 hidden sm:inline">
                      Uncheck category to remove from this tab
                    </span>
                  )}
                </div>
              )}
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((index) => (
                    <div key={index} className="flex items-center gap-3 rounded-xl border border-white/[0.06] p-3">
                      <div className="skeleton h-10 w-10 shrink-0 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <div className="skeleton h-3.5 w-1/3 rounded" />
                        <div className="skeleton h-3 w-1/4 rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : channels.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/30">
                    <Users size={22} strokeWidth={1.5} />
                  </div>
                  <p className="text-sm font-semibold text-white">No channels yet</p>
                  <p className="max-w-xs text-xs text-white/40">
                    Search above or paste a channel URL to subscribe.
                  </p>
                </div>
              ) : visibleChannels.length === 0 && filterCategory ? (
                <div className="flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
                  <p className="text-sm font-semibold text-white/70">
                    No channels in {filterCategory.name}
                  </p>
                  <p className="max-w-sm text-xs text-white/40">
                    Subscribe above to add to {filterCategory.name}, or assign an existing channel via its Categories button.
                  </p>
                  <button
                    type="button"
                    onClick={() => selectFilter(null)}
                    className="mt-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
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
                    className={`rounded-xl border p-3 transition-all ${
                      isEditing
                        ? 'border-primary/40 bg-primary/[0.04]'
                        : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <ChannelAvatar title={channel.title} avatarUrl={channel.avatarUrl} sizeClass="h-10 w-10" />

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">{channel.title}</p>
                        <p className="truncate text-xs text-white/40 mt-0.5">
                          {channel.handle && !/^UC[\w-]{21,24}$/i.test(channel.handle.replace(/^@/, '')) && (
                            <span>{channel.handle.startsWith('@') ? channel.handle : `@${channel.handle}`}</span>
                          )}
                          {channel.lastFetched && ` · ${formatRelativeTime(channel.lastFetched)}`}
                          {channel.lastError && ' · feed error'}
                        </p>
                        {memberCategories.length > 0 ? (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {memberCategories.map((category) => (
                              <span
                                key={category.id}
                                className="inline-flex items-center gap-1 rounded-md bg-white/[0.05] px-2 py-0.5 text-[11px] font-medium text-white/60"
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${categoryDot(category.color)}`} />
                                {category.name}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-amber-400/[0.07] px-2 py-0.5 text-[11px] font-medium text-amber-300/80">
                            No category
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setEditingId(isEditing ? null : channel.channelId)}
                        title={isEditing ? 'Close category editor' : 'Manage categories'}
                        className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          isEditing
                            ? 'bg-primary text-white shadow-sm'
                            : 'border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {isEditing ? 'Done' : 'Categories'}
                      </button>

                      {confirmUnsubId === channel.channelId ? (
                        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1">
                          <span className="text-[11px] font-medium text-red-300">Unsubscribe?</span>
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
                          className="shrink-0 rounded-lg p-2 text-white/30 transition-colors hover:bg-red-500/15 hover:text-red-400"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>

                    {channel.lastError && (
                      <p className="mt-2.5 rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-2.5 py-1.5 text-xs text-amber-300/80">
                        Last refresh failed ({channel.lastError}) — showing the last good copy
                      </p>
                    )}

                    {isEditing && (
                      <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/[0.06] pt-3">
                        {categories.map((category) => {
                          const active = channel.categoryIds.includes(category.id)
                          return (
                            <button
                              key={category.id}
                              type="button"
                              onClick={() => void toggleCategory(channel.channelId, category.id, active)}
                              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                                active
                                  ? 'border border-primary/50 bg-primary/20 text-white'
                                  : 'border border-white/10 bg-white/[0.03] text-white/50 hover:bg-white/[0.08] hover:text-white'
                              }`}
                            >
                              {active ? (
                                <Check size={12} className="text-primary" />
                              ) : (
                                <span className={`h-1.5 w-1.5 rounded-full ${categoryDot(category.color)}`} />
                              )}
                              {category.name}
                            </button>
                          )
                        })}
                        {categories.length === 0 && (
                          <span className="text-xs text-white/40">Create a category first</span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
            </>
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
      {showRegisterModal && (
        <RequestTestUserModal
          isOpen={showRegisterModal}
          onClose={() => setShowRegisterModal(false)}
        />
      )}
    </div>,
    document.body
  )
}

export default ChannelManager
